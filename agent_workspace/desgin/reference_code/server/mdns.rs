use mdns_sd::{ServiceDaemon, ServiceInfo};
use std::net::IpAddr;
use std::net::Ipv4Addr;
use log::info;
use std::collections::HashMap;

pub struct MdnsService {
    daemon: ServiceDaemon,
    port: u16,
}

impl MdnsService {
    pub fn new(port: u16) -> Result<Self, Box<dyn std::error::Error>> {
        let daemon = ServiceDaemon::new()?;
        
        Ok(Self {
            daemon,
            port,
        })
    }
    
    pub fn start(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        info!("Starting mDNS service discovery on port {}", self.port);
        
        // Try to create service info with different configurations
        let service_type = "_pc-remote._tcp.local.";
        let service_name = "pc-remote-server";
        
        // 获取主机名
        let hostname = hostname::get()?
            .into_string()
            .unwrap_or_else(|_| "unknown-host".to_string());
        let host_name = format!("{}.local.", hostname);
        
        info!("Using hostname: {}", host_name);
        
        // Get local IP addresses
        let mut addrs: Vec<IpAddr> = Vec::new();
        
        // Add loopback address
        addrs.push(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)));
        
        // Try to get actual network interfaces
        if let Ok(interfaces) = if_addrs::get_if_addrs() {
            for iface in interfaces {
                // 使用正确的类型
                match iface.addr {
                    if_addrs::IfAddr::V4(ref v4_addr) => {
                        // 跳过loopback
                        if !v4_addr.ip.is_loopback() {
                            addrs.push(IpAddr::V4(v4_addr.ip));
                        }
                    },
                    if_addrs::IfAddr::V6(_) => {
                        // 可选：也可以添加IPv6地址
                        // addrs.push(IpAddr::V6(v6_addr.ip));
                    }
                }
            }
        }
        
        let port = self.port;
        
        // 创建属性HashMap
        let mut properties = HashMap::new();
        properties.insert("version".to_string(), "1.0".to_string());
        properties.insert("protocol".to_string(), "tcp".to_string());
        
        // 创建ServiceInfo - 修复参数类型
        let service_info = ServiceInfo::new(
            service_type,
            service_name,
            &host_name,  // 使用正确的主机名
            addrs.as_slice(),  // 转换为切片，不是引用Vec
            port,
            Some(properties),  // 使用Option<HashMap>
        )?;
        
        // Register the service
        self.daemon.register(service_info)?;
        
        info!("mDNS service registered successfully");
        info!("Service type: {}", service_type);
        info!("Service name: {}", service_name);
        info!("Port: {}", port);
        info!("Host: {}", host_name);
        
        Ok(())
    }
    
    pub fn stop(&self) -> Result<(), Box<dyn std::error::Error>> {
        info!("Stopping mDNS service discovery");
        Ok(())
    }
}