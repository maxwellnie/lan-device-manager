import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { Host, ConnectResult } from '../types';
import { 
  IconArrowBack,
  IconLock,
  IconError,
  IconCheck,
  getDeviceIcon,
  getDeviceIconColor,
  getDeviceIconBgColor
} from '../components/Icons';

interface DiscoverHostsProps {
  onAdd: (host: Host) => void;
  existingHosts: Host[];  // 传递完整的设备列表，用于检测端口变化
}

interface DiscoveredDevice {
  id: string;
  uuid: string;           // 设备唯一标识符
  name: string;
  ip_address: string;
  port: number;
  version: string;
  requires_auth: boolean;
}

const DiscoverHosts = ({ onAdd, existingHosts }: DiscoverHostsProps) => {
  const navigate = useNavigate();
  const [discovered, setDiscovered] = useState<DiscoveredDevice[]>([]);
  const [isScanning, setIsScanning] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DiscoveredDevice | null>(null);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(false);

  useEffect(() => {
    startDiscovery();
    return () => {
      stopDiscovery();
    };
  }, []);

  const startDiscovery = async () => {
    setIsScanning(true);
    setDiscovered([]);
    try {
      await invoke('start_discovery');
      const interval = setInterval(async () => {
        try {
          const devices = await invoke<DiscoveredDevice[]>('get_discovered_devices');
          
          // 过滤逻辑：
          // 1. 如果设备UUID已存在，但IP或端口不同，显示为"可更新"（允许重新添加以更新信息）
          // 2. 如果设备UUID已存在且信息匹配，完全过滤（不显示）
          // 3. 如果设备没有UUID，使用IP+端口匹配
          const filtered = devices.filter(d => {
            // 查找已存在的设备（优先使用UUID匹配，如果没有UUID则使用ID匹配）
            const existing = existingHosts.find(h => {
              if (h.uuid && d.uuid) {
                return h.uuid === d.uuid;
              }
              // 没有UUID时使用ID（fullname）匹配
              return h.id === d.id;
            });
            
            if (!existing) {
              // 新设备，显示
              return true;
            }
            // 已存在，检查信息是否变化
            if (existing.ip !== d.ip_address || existing.port !== d.port) {
              // 信息有变化（IP或端口变了），显示以便更新
              return true;
            }
            // 信息完全匹配，过滤掉
            return false;
          });
          
          setDiscovered(filtered);
          if (filtered.length > 0) {
            setIsScanning(false);
            clearInterval(interval);
          }
        } catch (error) {
          console.error('Failed to get discovered devices:', error);
        }
      }, 1000);

      setTimeout(() => {
        clearInterval(interval);
        setIsScanning(false);
      }, 10000);
    } catch (error) {
      console.error('Failed to start discovery:', error);
      setIsScanning(false);
    }
  };

  const stopDiscovery = async () => {
    try {
      await invoke('stop_discovery');
    } catch (error) {
      console.error('Failed to stop discovery:', error);
    }
  };

  // 点击Add按钮时的处理流程
  const handleAddClick = async (device: DiscoveredDevice) => {
    setIsLoading(true);
    setSelectedDevice(device);
    
    try {
      // 步骤1: 询问设备是否需要认证
      setCheckingAuth(true);
      const requiresAuth = await invoke<boolean>('check_device_auth_required', {
        ip: device.ip_address,
        port: device.port
      });
      setCheckingAuth(false);

      if (requiresAuth) {
        // 步骤2: 如果需要认证，弹出密码输入框
        setShowAuthModal(true);
        setPassword('');
        setAuthError(null);
        setAuthSuccess(false);
      } else {
        // 不需要认证，直接连接并添加
        await connectAndAddDevice(device, null);
      }
    } catch (error) {
      console.error('Failed to check auth requirement:', error);
      setAuthError(`Failed to check device: ${error}`);
      setShowAuthModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  // 连接并添加设备
  const connectAndAddDevice = async (device: DiscoveredDevice, password: string | null) => {
    setIsLoading(true);
    try {
      // 步骤3: 连接设备（如果需要会同时进行认证）
      const result = await invoke<ConnectResult>('connect_to_device', {
        device: {
          id: device.id,
          uuid: device.uuid,
          name: device.name,
          ip_address: device.ip_address,
          port: device.port,
          custom_name: null,
          last_connected: null,
          created_at: new Date().toISOString(),
        },
        password: password
      });

      if (result.success) {
        // 步骤4: 认证成功，添加设备到列表
        await addDeviceToList(device, password);
      } else {
        // 连接或认证失败
        if (result.requires_auth) {
          setAuthError(result.error || 'Authentication failed');
          setShowAuthModal(true);
        } else {
          setAuthError(result.error || 'Connection failed');
          setShowAuthModal(true);
        }
      }
    } catch (error) {
      console.error('Failed to connect to device:', error);
      setAuthError(`Connection failed: ${error}`);
      setShowAuthModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  // 用户输入密码后的认证处理
  const handleAuthenticate = async () => {
    if (!selectedDevice || !password) return;
    
    setIsLoading(true);
    setAuthError(null);
    
    try {
      // 使用输入的密码连接并认证
      const result = await invoke<ConnectResult>('connect_to_device', {
        device: {
          id: selectedDevice.id,
          uuid: selectedDevice.uuid,
          name: selectedDevice.name,
          ip_address: selectedDevice.ip_address,
          port: selectedDevice.port,
          custom_name: null,
          last_connected: null,
          created_at: new Date().toISOString(),
        },
        password: password
      });
      
      if (result.success) {
        setAuthSuccess(true);
        // 认证成功，添加设备
        setTimeout(async () => {
          setShowAuthModal(false);
          await addDeviceToList(selectedDevice, password);
        }, 500);
      } else {
        setAuthError(result.error || 'Authentication failed');
      }
    } catch (error) {
      setAuthError(`Authentication error: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 添加设备到列表
  const addDeviceToList = async (device: DiscoveredDevice, password: string | null) => {
    const newHost: Host = {
      id: device.id,
      uuid: device.uuid,      // 保存 UUID
      name: device.name,
      ip: device.ip_address,
      port: device.port,
      status: 'Online',
      icon: '',
      iconColor: '',
      uptime: '0m',
      os: 'Auto-detected Device',
      version: device.version,
      requiresAuth: device.requires_auth,
    };

    try {
      // 保存设备和密码（包含 UUID）
      await invoke('save_device', {
        device: {
          id: device.id,
          uuid: device.uuid,    // 传递 UUID 到后端
          name: device.name,
          ip_address: device.ip_address,
          port: device.port,
          custom_name: null,
          last_connected: null,
          created_at: new Date().toISOString(),
        },
        password: password
      });
      onAdd(newHost);
      setDiscovered(prev => prev.filter(h => h.id !== device.id));
      navigate('/');
    } catch (error) {
      console.error('Failed to save device:', error);
      setAuthError(`Failed to save device: ${error}`);
      setShowAuthModal(true);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f1419',
      color: '#ffffff'
    }}>
      {/* Auth Modal */}
      {showAuthModal && selectedDevice && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#1a2332',
            borderRadius: '16px',
            padding: '24px',
            width: '100%',
            maxWidth: '320px'
          }}>
            {authSuccess ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '20px 0'
              }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(16, 185, 129, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px'
                }}>
                  <IconCheck style={{ width: '32px', height: '32px', color: '#10b981' }} />
                </div>
                <h2 style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  color: '#ffffff',
                  margin: 0,
                  marginBottom: '8px'
                }}>Authentication Successful</h2>
                <p style={{
                  fontSize: '14px',
                  color: '#8b9aa8',
                  margin: 0
                }}>Adding device...</p>
              </div>
            ) : (
              <>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '16px'
                }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <IconLock style={{ width: '24px', height: '24px', color: '#f59e0b' }} />
                  </div>
                  <div>
                    <h2 style={{
                      fontSize: '18px',
                      fontWeight: 600,
                      color: '#ffffff',
                      margin: 0
                    }}>{selectedDevice.name}</h2>
                    <p style={{
                      fontSize: '13px',
                      color: '#8b9aa8',
                      margin: 0
                    }}>{selectedDevice.ip_address}</p>
                  </div>
                </div>
                
                <p style={{
                  fontSize: '14px',
                  color: '#8b9aa8',
                  margin: 0,
                  marginBottom: '16px'
                }}>This device requires authentication. Please enter the access password:</p>
                
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  disabled={isLoading}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    backgroundColor: '#0f1419',
                    color: '#ffffff',
                    border: authError ? '1px solid #ef4444' : '1px solid #2a3342',
                    fontSize: '16px',
                    marginBottom: authError ? '8px' : '20px',
                    outline: 'none'
                  }}
                />
                
                {authError && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '16px',
                    color: '#ef4444',
                    fontSize: '13px'
                  }}>
                    <IconError style={{ width: '16px', height: '16px' }} />
                    <span>{authError}</span>
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => setShowAuthModal(false)}
                    disabled={isLoading}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: '12px',
                      backgroundColor: '#2a3342',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '16px',
                      fontWeight: 500,
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      opacity: isLoading ? 0.5 : 1
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAuthenticate}
                    disabled={isLoading || !password}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: '12px',
                      backgroundColor: '#13a4ec',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '16px',
                      fontWeight: 500,
                      cursor: isLoading || !password ? 'not-allowed' : 'pointer',
                      opacity: isLoading || !password ? 0.5 : 1
                    }}
                  >
                    {isLoading ? 'Verifying...' : 'Verify & Add'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{
        padding: '16px 20px',
        paddingTop: '48px'
      }}>
        <button 
          onClick={() => navigate('/')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'none',
            border: 'none',
            color: '#13a4ec',
            fontSize: '16px',
            cursor: 'pointer',
            marginBottom: '16px',
            padding: '8px 0'
          }}
        >
          <IconArrowBack style={{ width: '20px', height: '20px' }} />
          <span>Back</span>
        </button>
        
        <h1 style={{
          fontSize: '28px',
          fontWeight: 700,
          color: '#ffffff',
          margin: 0,
          marginBottom: '12px'
        }}>Discover New Hosts</h1>
        
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#13a4ec',
            animation: isScanning ? 'pulse 2s infinite' : 'none'
          }}></div>
          <span style={{
            fontSize: '13px',
            color: '#8b9aa8',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            {isScanning ? 'Scanning network...' : checkingAuth ? 'Checking device...' : 'Scan Complete'}
          </span>
        </div>
        
        {/* 刷新按钮 */}
        <button
          onClick={async () => {
            setIsScanning(true);
            setDiscovered([]);
            try {
              await invoke('restart_discovery');
            } catch (error) {
              console.error('Failed to restart discovery:', error);
            }
          }}
          disabled={isScanning}
          style={{
            marginTop: '12px',
            padding: '8px 16px',
            borderRadius: '8px',
            backgroundColor: 'rgba(19, 164, 236, 0.1)',
            color: '#13a4ec',
            border: '1px solid rgba(19, 164, 236, 0.3)',
            fontSize: '14px',
            cursor: isScanning ? 'not-allowed' : 'pointer',
            opacity: isScanning ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Refresh Network
        </button>
      </div>

      {/* Device List */}
      <div style={{ padding: '0 20px' }}>
        {isScanning || checkingAuth ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '3px solid #1a2332',
              borderTopColor: '#13a4ec',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '16px'
            }}></div>
            <p style={{ color: '#8b9aa8' }}>{checkingAuth ? 'Checking authentication...' : 'Detecting network devices...'}</p>
            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
              @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
              }
            `}</style>
          </div>
        ) : discovered.length > 0 ? (
          discovered.map((device) => {
            const DeviceIcon = getDeviceIcon(device.name);
            const iconColor = getDeviceIconColor(device.name);
            const iconBgColor = getDeviceIconBgColor(device.name);
            
            return (
              <div 
                key={device.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 0',
                  borderBottom: '1px solid #1a2332'
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px'
                }}>
                  {/* Icon */}
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    backgroundColor: iconBgColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <DeviceIcon style={{ width: '24px', height: '24px', color: iconColor }} />
                  </div>

                  {/* Info */}
                  <div>
                    <h3 style={{
                      fontSize: '16px',
                      fontWeight: 500,
                      color: '#ffffff',
                      margin: 0,
                      marginBottom: '4px'
                    }}>{device.name}</h3>
                    <p style={{
                      fontSize: '13px',
                      color: '#8b9aa8',
                      fontFamily: 'monospace',
                      margin: 0
                    }}>{device.ip_address}</p>
                    {device.requires_auth && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        marginTop: '4px'
                      }}>
                        <IconLock style={{ width: '12px', height: '12px', color: '#f59e0b' }} />
                        <span style={{ fontSize: '12px', color: '#f59e0b' }}>Requires password</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Add Button */}
                <button 
                  onClick={() => handleAddClick(device)}
                  disabled={isLoading}
                  style={{
                    padding: '8px 20px',
                    backgroundColor: '#13a4ec',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    opacity: isLoading ? 0.5 : 1,
                    flexShrink: 0
                  }}
                >
                  {isLoading ? '...' : 'Add'}
                </button>
              </div>
            );
          })
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            color: '#8b9aa8'
          }}>
            <p>No new devices discovered</p>
            <button 
              onClick={() => { setIsScanning(true); startDiscovery(); }}
              style={{
                marginTop: '16px',
                padding: '10px 20px',
                backgroundColor: 'transparent',
                color: '#13a4ec',
                border: '1px solid #13a4ec',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              Rescan
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DiscoverHosts;
