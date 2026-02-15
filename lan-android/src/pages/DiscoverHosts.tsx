import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
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
import { parseError, getErrorMessage } from '../utils/errorParser';

interface DiscoverHostsProps {
  onAdd: (host: Host) => void;
  existingHosts: Host[];
}

interface DiscoveredDevice {
  id: string;
  uuid: string;
  name: string;
  ip_address: string;
  port: number;
  version: string;
  requires_auth: boolean;
}

const DiscoverHosts = ({ onAdd, existingHosts }: DiscoverHostsProps) => {
  const { t } = useTranslation();
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

          const filtered = devices.filter(d => {
            const existing = existingHosts.find(h => {
              if (h.uuid && d.uuid) {
                return h.uuid === d.uuid;
              }
              return h.id === d.id;
            });

            if (!existing) {
              return true;
            }
            if (existing.ip !== d.ip_address || existing.port !== d.port) {
              return true;
            }
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

  // Handle Add button click
  const handleAddClick = async (device: DiscoveredDevice) => {
    setIsLoading(true);
    setSelectedDevice(device);

    try {
      setCheckingAuth(true);
      const requiresAuth = await invoke<boolean>('check_device_auth_required', {
        ip: device.ip_address,
        port: device.port
      });
      setCheckingAuth(false);

      if (requiresAuth) {
        setShowAuthModal(true);
        setPassword('');
        setAuthError(null);
        setAuthSuccess(false);
      } else {
        await connectAndAddDevice(device, null);
      }
    } catch (error) {
      console.error('Failed to check auth requirement:', error);
      setAuthError(getErrorMessage(error));
      setShowAuthModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Connect and add device
  const connectAndAddDevice = async (device: DiscoveredDevice, password: string | null) => {
    setIsLoading(true);
    try {
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
        await addDeviceToList(device, password);
      } else {
        if (result.requires_auth) {
          const parsedError = parseError(result.error || t('auth.failed'));
          setAuthError(parsedError.message);
          setShowAuthModal(true);
        } else {
          const parsedError = parseError(result.error || t('errors.connectionFailed'));
          setAuthError(parsedError.message);
          setShowAuthModal(true);
        }
      }
    } catch (error) {
      console.error('Failed to connect to device:', error);
      setAuthError(getErrorMessage(error));
      setShowAuthModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle authentication
  const handleAuthenticate = async () => {
    if (!selectedDevice || !password) return;

    setIsLoading(true);
    setAuthError(null);

    try {
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
        setTimeout(async () => {
          setShowAuthModal(false);
          await addDeviceToList(selectedDevice, password);
        }, 500);
      } else {
        const parsedError = parseError(result.error || t('auth.failed'));
        setAuthError(parsedError.message);
      }
    } catch (error) {
      setAuthError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  // Add device to list
  const addDeviceToList = async (device: DiscoveredDevice, password: string | null) => {
    const newHost: Host = {
      id: device.id,
      uuid: device.uuid,
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
      await invoke('save_device', {
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
      onAdd(newHost);
      setDiscovered(prev => prev.filter(h => h.id !== device.id));
      navigate('/');
    } catch (error) {
      console.error('Failed to save device:', error);
      setAuthError(getErrorMessage(error));
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
                }}>{t('auth.success')}</h2>
                <p style={{
                  fontSize: '14px',
                  color: '#8b9aa8',
                  margin: 0
                }}>{t('auth.addingDevice')}</p>
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
                }}>{t('auth.enterPassword')}</p>

                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.passwordPlaceholder')}
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
                    {t('app.cancel')}
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
                    {isLoading ? t('auth.verifying') : t('discoverHosts.verifyAndAdd')}
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
          <span>{t('app.back')}</span>
        </button>

        <h1 style={{
          fontSize: '28px',
          fontWeight: 700,
          color: '#ffffff',
          margin: 0,
          marginBottom: '12px'
        }}>{t('discoverHosts.title')}</h1>

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
            {isScanning ? t('discoverHosts.scanning') : checkingAuth ? t('discoverHosts.checkingDevice') : t('discoverHosts.scanComplete')}
          </span>
        </div>

        {/* Refresh button */}
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
          {t('discoverHosts.refreshNetwork')}
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
            <p style={{ color: '#8b9aa8' }}>{checkingAuth ? t('discoverHosts.checkingAuth') : t('discoverHosts.detectingDevices')}</p>
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
                        <span style={{ fontSize: '12px', color: '#f59e0b' }}>{t('discoverHosts.requiresPassword')}</span>
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
                  {isLoading ? '...' : t('discoverHosts.add')}
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
            <p>{t('discoverHosts.noDevices')}</p>
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
              {t('discoverHosts.rescan')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DiscoverHosts;
