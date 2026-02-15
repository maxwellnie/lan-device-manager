import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { Host, ConnectResult } from '../types';
import { 
  IconServer, 
  IconSearch, 
  IconAdd, 
  IconDelete,
  IconLock,
  IconError,
  IconCheck,
  IconRefresh,
  getDeviceIcon,
  getDeviceIconColor,
  getDeviceIconBgColor
} from '../components/Icons';

interface HostsListProps {
  hosts: Host[];
  onRemove: (id: string) => void;
  onStatusChange: (id: string, status: 'Online' | 'Offline') => void;
}

const HostsList = ({ hosts, onRemove, onStatusChange }: HostsListProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [checkingHosts, setCheckingHosts] = useState<Set<string>>(new Set());
  
  // Auth modal state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedHost, setSelectedHost] = useState<Host | null>(null);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState(false);
  
  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const filteredHosts = hosts.filter(h => 
    h.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    h.ip.includes(searchQuery)
  );

  // 检查单个设备在线状态
  const checkHostStatus = async (host: Host): Promise<boolean> => {
    try {
      // 尝试连接设备（不传密码，只检查是否在线）
      const result = await invoke<ConnectResult>('connect_to_device', {
        device: {
          id: host.id,
          uuid: host.uuid || host.id,  // 如果没有uuid，使用id作为备选
          name: host.name,
          ip_address: host.ip,
          port: host.port,
          custom_name: host.customName || null,
          last_connected: null,
          created_at: new Date().toISOString(),
        },
        password: null
      });
      
      const isOnline = result.success || result.requires_auth;
      
      // 如果状态发生变化，更新状态
      if (host.status !== (isOnline ? 'Online' : 'Offline')) {
        onStatusChange(host.id, isOnline ? 'Online' : 'Offline');
      }
      
      return isOnline;
    } catch (error) {
      // 连接失败，设备离线
      if (host.status !== 'Offline') {
        onStatusChange(host.id, 'Offline');
      }
      return false;
    }
  };

  // 检查所有设备在线状态
  const checkAllHostsStatus = async () => {
    if (hosts.length === 0) return;
    
    setIsRefreshing(true);
    const checking = new Set<string>();
    
    // 并行检查所有设备
    const checkPromises = hosts.map(async (host) => {
      checking.add(host.id);
      setCheckingHosts(new Set(checking));
      
      await checkHostStatus(host);
      
      checking.delete(host.id);
      setCheckingHosts(new Set(checking));
    });
    
    await Promise.all(checkPromises);
    setIsRefreshing(false);
  };

  // 用户回到页面时检查设备状态
  useEffect(() => {
    checkAllHostsStatus();
  }, [location.key]); // 当路由变化时触发

  // 刷新设备信息（从后端重新加载保存的设备信息）
  const refreshHostInfo = async (host: Host): Promise<Host> => {
    try {
      // 重新加载保存的设备列表（后端可能已经更新了IP和端口）
      const savedDevices = await invoke<Array<{ id: string; uuid: string; ip_address: string; port: number; name: string }>>('get_saved_devices');
      
      // 查找相同UUID的设备
      const updated = savedDevices.find(d => d.uuid === host.uuid);
      if (updated) {
        // 检查信息是否有变化
        if (updated.ip_address !== host.ip || updated.port !== host.port) {
          console.log(`Device ${host.name} info updated: ${host.ip}:${host.port} -> ${updated.ip_address}:${updated.port}`);
          return {
            ...host,
            ip: updated.ip_address,
            port: updated.port,
            id: updated.id
          };
        }
      }
      return host;
    } catch (error) {
      console.error('Failed to refresh host info:', error);
      return host;
    }
  };

  // 点击设备时的处理
  const handleHostClick = async (host: Host) => {
    if (isEditing) return;

    setIsLoading(true);
    setCheckingHosts(prev => new Set(prev).add(host.id));

    // 步骤1: 刷新设备信息（获取最新IP和端口）
    const updatedHost = await refreshHostInfo(host);
    
    // 如果信息有更新，通知父组件
    if (updatedHost.ip !== host.ip || updatedHost.port !== host.port) {
      // 更新设备信息
      onStatusChange(host.id, 'Offline'); // 先标记为离线，等连接成功后再更新
    }

    // 步骤2: 检查设备在线状态
    const isOnline = await checkHostStatus(updatedHost);
    setCheckingHosts(prev => {
      const next = new Set(prev);
      next.delete(host.id);
      return next;
    });

    if (!isOnline) {
      setIsLoading(false);
      showToast('Device is offline', 'error');
      return;
    }

    setSelectedHost(updatedHost);

    try {
      // 步骤3: 检查设备是否需要认证
      const requiresAuth = await invoke<boolean>('check_device_auth_required', {
        ip: updatedHost.ip,
        port: updatedHost.port
      });

      if (!requiresAuth) {
        // 不需要认证，直接连接并进入控制界面
        const result = await invoke<ConnectResult>('connect_to_device', {
          device: {
            id: updatedHost.id,
            uuid: updatedHost.uuid || updatedHost.id,
            name: updatedHost.name,
            ip_address: updatedHost.ip,
            port: updatedHost.port,
            custom_name: updatedHost.customName || null,
            last_connected: null,
            created_at: new Date().toISOString(),
          },
          password: null
        });

        if (result.success) {
          navigate(`/host/${updatedHost.id}`);
        } else {
          showToast('Failed to connect to device', 'error');
          onStatusChange(updatedHost.id, 'Offline');
        }
      } else {
        // 需要认证，尝试使用保存的密码
        const savedPassword = await invoke<string | null>('get_device_password', {
          deviceId: updatedHost.id
        });

        if (savedPassword) {
          // 有保存的密码，尝试认证
          const result = await invoke<ConnectResult>('connect_to_device', {
            device: {
              id: updatedHost.id,
              uuid: updatedHost.uuid || updatedHost.id,
              name: updatedHost.name,
              ip_address: updatedHost.ip,
              port: updatedHost.port,
              custom_name: updatedHost.customName || null,
              last_connected: null,
              created_at: new Date().toISOString(),
            },
            password: savedPassword
          });

          if (result.success) {
            // 认证成功，进入控制界面
            navigate(`/host/${updatedHost.id}`);
          } else {
            // 保存的密码失效，清除密码并显示认证弹窗
            await invoke('clear_device_password', { deviceId: updatedHost.id });
            setShowAuthModal(true);
            setPassword('');
            setAuthError('Password expired or changed. Please re-enter.');
            setAuthSuccess(false);
          }
        } else {
          // 没有保存的密码，显示认证弹窗
          setShowAuthModal(true);
          setPassword('');
          setAuthError(null);
          setAuthSuccess(false);
        }
      }
    } catch (error) {
      console.error('Failed to connect to device:', error);
      showToast('Device is unreachable', 'error');
      onStatusChange(updatedHost.id, 'Offline');
    } finally {
      setIsLoading(false);
    }
  };

  // 用户输入密码后的认证处理
  const handleAuthenticate = async () => {
    if (!selectedHost || !password) return;
    
    setIsLoading(true);
    setAuthError(null);
    
    try {
      // 使用输入的密码连接并认证
      const result = await invoke<ConnectResult>('connect_to_device', {
        device: {
          id: selectedHost.id,
          uuid: selectedHost.uuid || selectedHost.id,  // 如果没有uuid，使用id作为备选
          name: selectedHost.name,
          ip_address: selectedHost.ip,
          port: selectedHost.port,
          custom_name: selectedHost.customName || null,
          last_connected: null,
          created_at: new Date().toISOString(),
        },
        password: password
      });
      
      if (result.success) {
        setAuthSuccess(true);
        // 认证成功，保存密码并进入控制界面
        setTimeout(() => {
          setShowAuthModal(false);
          navigate(`/host/${selectedHost.id}`);
        }, 500);
      } else {
        setAuthError(result.error || 'Authentication failed');
        
        // 如果连接失败，标记为离线
        if (result.error && (result.error.includes("Connection failed") || result.error.includes("not responding"))) {
          onStatusChange(selectedHost.id, 'Offline');
        }
      }
    } catch (error) {
      setAuthError(`Authentication error: ${error}`);
      // 标记为离线
      onStatusChange(selectedHost.id, 'Offline');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      style={{
        minHeight: '100vh',
        backgroundColor: '#0f1419',
        color: '#ffffff',
        paddingBottom: '80px'
      }}
    >
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          padding: '12px 20px',
          borderRadius: '12px',
          backgroundColor: toast.type === 'success' ? '#10b981' : '#ef4444',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
        }}>
          {toast.type === 'success' ? (
            <IconCheck style={{ width: '20px', height: '20px' }} />
          ) : (
            <IconError style={{ width: '20px', height: '20px' }} />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Auth Modal */}
      {showAuthModal && selectedHost && (
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
                }}>Entering control panel...</p>
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
                    }}>{selectedHost.customName || selectedHost.name}</h2>
                    <p style={{
                      fontSize: '13px',
                      color: '#8b9aa8',
                      margin: 0
                    }}>{selectedHost.ip}</p>
                  </div>
                </div>
                
                <p style={{
                  fontSize: '14px',
                  color: '#8b9aa8',
                  margin: 0,
                  marginBottom: '16px'
                }}>Authentication required to access this device. Please enter the password:</p>
                
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
                    {isLoading ? 'Verifying...' : 'Connect'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        paddingTop: '48px'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8b9aa8'
        }}>
          <IconServer style={{ width: '24px', height: '24px' }} />
        </div>
        <h1 style={{
          fontSize: '20px',
          fontWeight: 600,
          color: '#ffffff'
        }}>Hosts</h1>
        <button 
          onClick={() => setIsEditing(!isEditing)}
          style={{
            padding: '8px 12px',
            color: '#13a4ec',
            fontSize: '16px',
            fontWeight: 500,
            background: 'none',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          {isEditing ? 'Done' : 'Edit'}
        </button>
      </header>

      {/* Search Bar with Refresh Button */}
      <div style={{ padding: '0 20px 16px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#1a2332',
            borderRadius: '12px',
            padding: '12px 16px',
            gap: '12px'
          }}>
            <IconSearch style={{ width: '20px', height: '20px', color: '#5a6a7a', flexShrink: 0 }} />
            <input 
              type="text"
              placeholder="Search hosts by name or IP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                color: '#ffffff',
                fontSize: '15px',
                outline: 'none'
              }}
            />
          </div>
          <button
            onClick={checkAllHostsStatus}
            disabled={isRefreshing || hosts.length === 0}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              backgroundColor: isRefreshing ? '#2a3342' : '#13a4ec',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isRefreshing || hosts.length === 0 ? 'not-allowed' : 'pointer',
              opacity: isRefreshing || hosts.length === 0 ? 0.5 : 1,
              transition: 'all 0.2s ease'
            }}
          >
            {isRefreshing ? (
              <div style={{
                width: '20px',
                height: '20px',
                border: '2px solid #1a2332',
                borderTopColor: '#13a4ec',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
            ) : (
              <IconRefresh style={{ width: '20px', height: '20px', color: '#ffffff' }} />
            )}
          </button>
        </div>
        
        {/* 刷新状态提示 */}
        {isRefreshing && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginTop: '12px',
            padding: '8px 16px',
            backgroundColor: 'rgba(19, 164, 236, 0.1)',
            borderRadius: '8px',
            color: '#13a4ec',
            fontSize: '13px'
          }}>
            <div style={{
              width: '14px',
              height: '14px',
              border: '2px solid #1a2332',
              borderTopColor: '#13a4ec',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            <span>Checking device status...</span>
          </div>
        )}
      </div>

      {/* Host List */}
      <div style={{ padding: '0 20px' }}>
        {filteredHosts.map((host) => {
          const DeviceIcon = getDeviceIcon(host.name);
          const iconColor = getDeviceIconColor(host.name);
          const iconBgColor = getDeviceIconBgColor(host.name);
          const isChecking = checkingHosts.has(host.id);
          
          return (
            <div
              key={host.id}
              onClick={() => handleHostClick(host)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 0',
                cursor: isEditing ? 'default' : host.status === 'Offline' ? 'not-allowed' : 'pointer',
                borderBottom: '1px solid #1a2332',
                opacity: isChecking && !isEditing ? 0.5 : host.status === 'Offline' ? 0.6 : 1
              }}
            >
              {/* Icon */}
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                backgroundColor: iconBgColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '16px',
                flexShrink: 0
              }}>
                <DeviceIcon style={{ width: '24px', height: '24px', color: iconColor }} />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: 500,
                  color: '#ffffff',
                  margin: 0,
                  marginBottom: '4px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>{host.customName || host.name}</h3>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  {isChecking ? (
                    <>
                      <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        border: '2px solid #13a4ec',
                        borderTopColor: 'transparent',
                        animation: 'spin 1s linear infinite'
                      }}></div>
                      <span style={{ fontSize: '13px', color: '#8b9aa8' }}>Checking...</span>
                    </>
                  ) : (
                    <>
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: host.status === 'Online' ? '#10b981' : '#ef4444'
                      }}></span>
                      <span style={{
                        fontSize: '13px',
                        color: host.status === 'Online' ? '#10b981' : '#ef4444'
                      }}>{host.status}</span>
                    </>
                  )}
                  <span style={{ color: '#5a6a7a' }}>•</span>
                  <span style={{
                    fontSize: '13px',
                    color: '#8b9aa8',
                    fontFamily: 'monospace'
                  }}>{host.ip}</span>
                  {host.requiresAuth && (
                    <>
                      <span style={{ color: '#5a6a7a' }}>•</span>
                      <IconLock style={{ width: '12px', height: '12px', color: '#f59e0b' }} />
                    </>
                  )}
                </div>
              </div>

              {/* Delete Button */}
              {isEditing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onRemove(host.id);
                  }}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    marginLeft: '12px',
                    flexShrink: 0,
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.25)';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  <IconDelete style={{ width: '20px', height: '20px', color: '#ef4444' }} />
                </button>
              )}
            </div>
          );
        })}

        {filteredHosts.length === 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            color: '#5a6a7a'
          }}>
            <IconServer style={{ width: '48px', height: '48px', marginBottom: '16px', opacity: 0.5 }} />
            <p>No devices found</p>
          </div>
        )}
      </div>

      {/* FAB */}
      <button 
        onClick={() => navigate('/discover')}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          backgroundColor: '#13a4ec',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(19, 164, 236, 0.4)'
        }}
      >
        <IconAdd style={{ width: '28px', height: '28px', color: '#ffffff' }} />
      </button>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default HostsList;
