use mdns_sd::{ServiceDaemon, ServiceEvent};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::models::DeviceInfo;

pub struct MdnsDiscovery {
    daemon: ServiceDaemon,
    service_type: String,
    devices: Arc<Mutex<HashMap<String, DeviceInfo>>>,
    /// 设备UUID到设备ID的映射（用于快速查找已知设备）
    uuid_to_id: Arc<Mutex<HashMap<String, String>>>,
}

impl MdnsDiscovery {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let daemon = ServiceDaemon::new()?;

        Ok(Self {
            daemon,
            service_type: "_lanmanager._tcp.local.".to_string(),
            devices: Arc::new(Mutex::new(HashMap::new())),
            uuid_to_id: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub fn start(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        log::info!("Starting mDNS discovery for service type: {}", self.service_type);

        let receiver = self.daemon.browse(&self.service_type)?;

        // 启动监听任务
        let devices = self.devices.clone();
        let uuid_to_id = self.uuid_to_id.clone();

        std::thread::spawn(move || {
            log::info!("mDNS listener thread started");

            while let Ok(event) = receiver.recv() {
                match event {
                    ServiceEvent::ServiceResolved(info) => {
                        log::info!("Found service: {:?}", info);

                        // 提取服务信息
                        let fullname = info.get_fullname().to_string();
                        let hostname = info.get_hostname().to_string();
                        let addresses = info.get_addresses();
                        let port = info.get_port();
                        let txt_records = info.get_properties();

                        log::info!(
                            "Service details - fullname: {}, hostname: {}, addresses: {:?}, port: {}",
                            fullname, hostname, addresses, port
                        );

                        // 优先选择非回环的 IPv4 地址
                        let selected_ip = addresses.iter()
                            .filter(|ip| ip.is_ipv4() && !ip.is_loopback())
                            .next()
                            .or_else(|| {
                                // 如果没有 IPv4，尝试 IPv6
                                addresses.iter()
                                    .filter(|ip| !ip.is_loopback())
                                    .next()
                            })
                            .or_else(|| {
                                // 最后尝试回环地址（用于测试）
                                addresses.iter().next()
                            });

                        if let Some(ip) = selected_ip {
                            // 去掉 .local. 后缀
                            let clean_hostname = hostname
                                .trim_end_matches(".local.")
                                .trim_end_matches(".local")
                                .to_string();

                            // 从 TXT 记录中提取信息
                            // 打印所有TXT记录用于调试
                            log::info!("TXT records for {}: {:?}", fullname, 
                                txt_records.iter().map(|p| format!("{}={}", p.key(), p.val_str())).collect::<Vec<_>>());
                            
                            let uuid = txt_records.get("uuid")
                                .or_else(|| txt_records.get("UUID"))
                                .map(|v| v.val_str().to_string())
                                .unwrap_or_else(|| {
                                    // 如果没有UUID，使用 fullname 作为备选
                                    log::warn!("No UUID found in TXT records for {}, using fullname as fallback", fullname);
                                    fullname.clone()
                                });

                            let version = txt_records.get("version")
                                .or_else(|| txt_records.get("VERSION"))
                                .map(|v| v.val_str().to_string())
                                .unwrap_or_else(|| "1.0.0".to_string());

                            let requires_auth = txt_records.get("auth")
                                .or_else(|| txt_records.get("AUTH"))
                                .map(|v| v.val_str() == "required")
                                .unwrap_or(false);

                            let rt = tokio::runtime::Runtime::new().unwrap();
                            rt.block_on(async {
                                let mut devices_guard = devices.lock().await;
                                let mut uuid_map_guard = uuid_to_id.lock().await;

                                // 检查是否已存在相同 UUID 的设备
                                if let Some(existing_id) = uuid_map_guard.get(&uuid) {
                                    if existing_id != &fullname {
                                        // 同一设备，但服务名不同（可能是端口号变化）
                                        log::info!(
                                            "Device UUID {} already exists with ID {}, updating IP/port from {} to {}",
                                            uuid, existing_id, existing_id, fullname
                                        );
                                        // 移除旧条目
                                        devices_guard.remove(existing_id);
                                    }
                                }

                                // 创建设备信息
                                let device = DeviceInfo {
                                    id: fullname.clone(),
                                    uuid: uuid.clone(),
                                    name: clean_hostname,
                                    ip_address: ip.to_string(),
                                    port: port,
                                    version,
                                    requires_auth,
                                    discovered_at: chrono::Utc::now(),
                                };

                                // 更新映射关系
                                uuid_map_guard.insert(uuid.clone(), fullname.clone());
                                devices_guard.insert(fullname.clone(), device);

                                log::info!(
                                    "Device added/updated - UUID: {}, ID: {}, IP: {}, Port: {}",
                                    uuid, fullname, ip, port
                                );
                            });
                        } else {
                            log::warn!("No valid IP address found for service: {}", fullname);
                        }
                    }
                    ServiceEvent::ServiceRemoved(_, fullname) => {
                        log::info!("Service removed: {}", fullname);

                        // 从HashMap中移除
                        let rt = tokio::runtime::Runtime::new().unwrap();
                        rt.block_on(async {
                            let mut devices_guard = devices.lock().await;
                            let mut uuid_map_guard = uuid_to_id.lock().await;

                            // 如果设备存在，也清理UUID映射
                            if let Some(device) = devices_guard.get(&fullname) {
                                uuid_map_guard.remove(&device.uuid);
                                log::info!("Removed UUID mapping for device: {}", device.uuid);
                            }

                            devices_guard.remove(&fullname);
                            log::info!("Device removed from discovery list: {}", fullname);
                        });
                    }
                    ServiceEvent::SearchStarted(service_type) => {
                        log::info!("mDNS search started for: {}", service_type);
                    }
                    ServiceEvent::SearchStopped(service_type) => {
                        log::info!("mDNS search stopped for: {}", service_type);
                    }
                    _ => {
                        log::debug!("Other mDNS event: {:?}", event);
                    }
                }
            }

            log::info!("mDNS listener thread ended");
        });

        log::info!("mDNS discovery started");
        Ok(())
    }

    pub fn stop(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        log::info!("Stopping mDNS discovery");
        self.daemon.shutdown()?;
        Ok(())
    }

    pub async fn get_devices(&self) -> Vec<DeviceInfo> {
        let devices = self.devices.lock().await;
        devices.values().cloned().collect()
    }

    /// 根据UUID查找设备
    pub async fn get_device_by_uuid(&self, uuid: &str) -> Option<DeviceInfo> {
        let uuid_map = self.uuid_to_id.lock().await;
        if let Some(id) = uuid_map.get(uuid) {
            let devices = self.devices.lock().await;
            devices.get(id).cloned()
        } else {
            None
        }
    }

    /// 强制刷新 mDNS 搜索
    pub fn refresh(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        log::info!("Refreshing mDNS discovery");

        // 停止当前的浏览
        self.stop()?;

        // 重新创建 daemon 并开始新的浏览
        self.daemon = ServiceDaemon::new()?;
        self.start()?;

        Ok(())
    }
}

impl Clone for MdnsDiscovery {
    fn clone(&self) -> Self {
        // 创建新的 daemon
        let daemon = ServiceDaemon::new().unwrap_or_else(|e| {
            log::error!("Failed to create daemon in clone: {}", e);
            panic!("Failed to create daemon in clone: {}", e);
        });

        Self {
            daemon,
            service_type: self.service_type.clone(),
            devices: self.devices.clone(),
            uuid_to_id: self.uuid_to_id.clone(),
        }
    }
}
