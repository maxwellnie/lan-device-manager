use mdns_sd::{ServiceDaemon, ServiceInfo};
use std::collections::HashMap;
use std::net::IpAddr;
use std::net::Ipv4Addr;

use crate::device_id::DeviceId;

pub struct MdnsService {
    daemon: ServiceDaemon,
    port: u16,
    service_type: String,
    device_uuid: String,
    service_name: String,
    host_name: String,
}

impl MdnsService {
    pub fn new(port: u16) -> Result<Self, Box<dyn std::error::Error>> {
        let daemon = ServiceDaemon::new()?;
        
        // 获取或创建设备UUID
        let device_uuid = DeviceId::get_or_create()
            .unwrap_or_else(|e| {
                log::warn!("Failed to get device UUID: {}, using fallback", e);
                // 如果获取失败，使用一个基于主机名的临时UUID
                let hostname = hostname::get()
                    .ok()
                    .and_then(|h| h.into_string().ok())
                    .unwrap_or_else(|| "unknown".to_string());
                format!("fallback-{}", hostname)
            });

        // 获取主机名
        let hostname = hostname::get()
            .ok()
            .and_then(|h| h.into_string().ok())
            .unwrap_or_else(|| "unknown-host".to_string());
        let host_name = format!("{}.local.", hostname);
        
        // 使用设备UUID作为服务名称的一部分，确保唯一性
        let service_name = format!("LanDevice-{}", &device_uuid[..8]);

        Ok(Self {
            daemon,
            port,
            service_type: "_lanmanager._tcp.local.".to_string(),
            device_uuid,
            service_name,
            host_name,
        })
    }

    pub fn start(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        log::info!("Starting mDNS service discovery on port {}", self.port);
        log::info!("Device UUID: {}", self.device_uuid);
        log::info!("Service name: {}", self.service_name);
        log::info!("Using hostname: {}", self.host_name);

        // Get local IP addresses
        let mut addrs: Vec<IpAddr> = Vec::new();

        // Add loopback address
        addrs.push(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)));

        // Try to get actual network interfaces
        log::info!("Getting network interfaces...");
        match if_addrs::get_if_addrs() {
            Ok(interfaces) => {
                log::info!("Found {} network interfaces", interfaces.len());
                for iface in interfaces {
                    log::info!("Interface: {}, Address: {:?}", iface.name, iface.addr);
                    match iface.addr {
                        if_addrs::IfAddr::V4(ref v4_addr) => {
                            // 跳过loopback
                            if !v4_addr.ip.is_loopback() {
                                log::info!("Adding IPv4 address: {}", v4_addr.ip);
                                addrs.push(IpAddr::V4(v4_addr.ip));
                            } else {
                                log::info!("Skipping loopback address: {}", v4_addr.ip);
                            }
                        }
                        if_addrs::IfAddr::V6(ref v6_addr) => {
                            if !v6_addr.ip.is_loopback() {
                                log::info!("Adding IPv6 address: {}", v6_addr.ip);
                                addrs.push(IpAddr::V6(v6_addr.ip));
                            }
                        }
                    }
                }
            }
            Err(e) => {
                log::error!("Failed to get network interfaces: {}", e);
            }
        }
        
        log::info!("Total addresses to register: {:?}", addrs);

        // 创建属性HashMap
        let mut properties = HashMap::new();
        properties.insert("version".to_string(), env!("CARGO_PKG_VERSION").to_string());
        properties.insert("protocol".to_string(), "tcp".to_string());
        properties.insert("auth".to_string(), "required".to_string());
        properties.insert("device".to_string(), self.host_name.trim_end_matches(".local.").to_string());
        properties.insert("uuid".to_string(), self.device_uuid.clone());  // 添加UUID
        properties.insert("port".to_string(), self.port.to_string());  // 添加端口信息

        // 创建ServiceInfo
        let service_info = ServiceInfo::new(
            &self.service_type,
            &self.service_name,
            &self.host_name,
            addrs.as_slice(),
            self.port,
            Some(properties),
        )?;

        // Register the service
        self.daemon.register(service_info)?;

        log::info!("mDNS service registered successfully");
        log::info!("Service type: {}", self.service_type);
        log::info!("Service name: {}", self.service_name);
        log::info!("Port: {}", self.port);
        log::info!("Host: {}", self.host_name);
        log::info!("UUID: {}", self.device_uuid);

        Ok(())
    }

    pub fn stop(&self) -> Result<(), Box<dyn std::error::Error>> {
        log::info!("Stopping mDNS service discovery");
        
        // 先注销服务，通知网络中的其他设备
        let full_service_name = format!("{}.{}", self.service_name, self.service_type);
        log::info!("Unregistering mDNS service: {}", full_service_name);
        self.daemon.unregister(&full_service_name)?;
        
        // 给注销消息一些时间传播
        std::thread::sleep(std::time::Duration::from_millis(100));
        
        // 然后关闭daemon
        self.daemon.shutdown()?;
        log::info!("mDNS service stopped successfully");
        Ok(())
    }
    
    /// 获取设备UUID
    pub fn get_device_uuid(&self) -> &str {
        &self.device_uuid
    }
}
