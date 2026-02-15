import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { Host, DeviceStatus, CommandResult } from '../types';
import {
  IconArrowBack,
  IconCheck,
  IconClose,
  IconPower,
  IconRestart,
  IconBedtime,
  IconLock,
  IconError,
  IconTerminal,
  getDeviceIcon,
  getDeviceIconColor,
  getDeviceIconBgColor
} from '../components/Icons';
import { parseError } from '../utils/errorParser';

interface HostDetailProps {
  hosts: Host[];
  onStatusChange: (id: string, status: 'Online' | 'Offline') => void;
}

const HostDetail = ({ hosts, onStatusChange }: HostDetailProps) => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const host = hosts.find(h => h.id === id);

  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Command execution state
  const [commandInput, setCommandInput] = useState('');
  const [commandOutput, setCommandOutput] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  useEffect(() => {
    if (host && host.status === 'Online') {
      fetchDeviceStatus();
    }
  }, [host?.id]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchDeviceStatus = async () => {
    if (!host) return;
    try {
      const status = await invoke<DeviceStatus>('get_device_status', { deviceId: host.id });
      setDeviceStatus(status);
      onStatusChange(host.id, status.online ? 'Online' : 'Offline');
    } catch (error) {
      console.error('Failed to get device status:', error);
      onStatusChange(host.id, 'Offline');
    }
  };

  const handlePowerAction = async (action: 'shutdown' | 'restart' | 'sleep' | 'lock') => {
    if (!host) return;

    const confirmMessages: Record<string, string> = {
      shutdown: t('hostDetail.confirmShutdown', { name: host.name }),
      restart: t('hostDetail.confirmRestart', { name: host.name }),
      sleep: t('hostDetail.confirmSleep', { name: host.name }),
      lock: t('hostDetail.confirmLock', { name: host.name }),
    };

    if (!confirm(confirmMessages[action])) return;

    setIsLoading(true);
    try {
      await invoke('execute_command', {
        deviceId: host.id,
        command: action,
        args: []
      });
      showToast(t('hostDetail.commandSent', { action: t(`hostDetail.${action}`), name: host.name }));
      if (action === 'shutdown' || action === 'restart') {
        setTimeout(() => {
          onStatusChange(host.id, 'Offline');
        }, 2000);
      }
    } catch (error) {
      const parsedError = parseError(error);

      if (parsedError.type === 'auth') {
        showToast(t('auth.reconnectRequired'), 'error');
        setTimeout(() => navigate('/'), 2000);
      } else if (parsedError.type === 'connection' || parsedError.type === 'network') {
        showToast(t('errors.deviceUnreachable'), 'error');
        onStatusChange(host.id, 'Offline');
      } else {
        showToast(parsedError.message, 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteCommand = async () => {
    if (!host || !commandInput.trim()) return;

    setIsExecuting(true);
    setCommandOutput(null);

    try {
      const result = await invoke<CommandResult>('execute_command', {
        deviceId: host.id,
        command: 'custom',
        args: [commandInput.trim()]
      });

      if (result.success) {
        setCommandOutput(result.stdout || t('toast.commandExecuted'));
        showToast(t('toast.commandExecuted'));
      } else {
        setCommandOutput(`${t('toast.error')}: ${result.stderr || t('errors.unknownError')}`);
        showToast(t('toast.commandFailed'), 'error');
      }
    } catch (error) {
      const parsedError = parseError(error);
      setCommandOutput(`${t('toast.error')}: ${parsedError.message}`);

      if (parsedError.type === 'auth') {
        showToast(t('auth.reconnectRequired'), 'error');
        setTimeout(() => navigate('/'), 2000);
      } else if (parsedError.type === 'connection' || parsedError.type === 'network') {
        showToast(t('errors.deviceUnreachable'), 'error');
        onStatusChange(host.id, 'Offline');
      } else {
        showToast(parsedError.message, 'error');
      }
    } finally {
      setIsExecuting(false);
    }
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (!host) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#0f1419',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ffffff'
      }}>
        <p style={{ marginBottom: '16px' }}>{t('hostDetail.deviceNotFound')}</p>
        <button
          onClick={() => navigate('/')}
          style={{
            color: '#13a4ec',
            fontWeight: 600,
            background: 'none',
            border: 'none',
            cursor: 'pointer'
          }}
        >{t('hostDetail.goBack')}</button>
      </div>
    );
  }

  const DeviceIcon = getDeviceIcon(host.name);
  const iconColor = getDeviceIconColor(host.name);
  const iconBgColor = getDeviceIconBgColor(host.name);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f1419',
      color: '#ffffff'
    }}>
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

      {/* Header */}
      <div style={{
        padding: '16px 20px',
        paddingTop: '48px',
        display: 'flex',
        alignItems: 'center'
      }}>
        <button
          onClick={() => navigate('/')}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: '#1a2332',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <IconArrowBack style={{ width: '20px', height: '20px', color: '#ffffff' }} />
        </button>
      </div>

      {/* Host Info */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0 20px 32px'
      }}>
        {/* Icon */}
        <div style={{ position: 'relative', marginBottom: '20px' }}>
          <div style={{
            width: '96px',
            height: '96px',
            borderRadius: '20px',
            backgroundColor: iconBgColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <DeviceIcon style={{ width: '48px', height: '48px', color: iconColor }} />
          </div>
          {/* Status Badge */}
          <div style={{
            position: 'absolute',
            bottom: '-4px',
            right: '-4px',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: host.status === 'Online' ? '#10b981' : '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '4px solid #0f1419'
          }}>
            {host.status === 'Online' ? (
              <IconCheck style={{ width: '14px', height: '14px', color: '#ffffff' }} />
            ) : (
              <IconClose style={{ width: '14px', height: '14px', color: '#ffffff' }} />
            )}
          </div>
        </div>

        {/* Name & Status */}
        <h1 style={{
          fontSize: '24px',
          fontWeight: 700,
          color: '#ffffff',
          margin: 0,
          marginBottom: '8px',
          textAlign: 'center'
        }}>{host.customName || host.name}</h1>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: host.status === 'Online' ? '#10b981' : '#ef4444'
          }}></span>
          <span style={{ color: '#8b9aa8', fontSize: '14px' }}>
            {host.status === 'Online' ? t('app.online') : t('app.offline')} • {host.ip}:{host.port}
          </span>
        </div>

        {host.requiresAuth && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginTop: '8px'
          }}>
            <IconLock style={{ width: '14px', height: '14px', color: '#10b981' }} />
            <span style={{ color: '#10b981', fontSize: '12px' }}>{t('hostDetail.authenticated')}</span>
          </div>
        )}
      </div>

      {/* Stats Card */}
      <div style={{ padding: '0 20px 24px' }}>
        <div style={{
          backgroundColor: '#1a2332',
          borderRadius: '16px',
          overflow: 'hidden'
        }}>
          {[
            { label: t('hostDetail.status'), value: host.status === 'Online' ? t('hostDetail.running') : t('hostDetail.stopped'), color: host.status === 'Online' ? '#10b981' : '#ef4444' },
            { label: t('hostDetail.uptime'), value: deviceStatus?.uptime ? formatUptime(deviceStatus.uptime) : '--', color: '#ffffff' },
            { label: t('hostDetail.os'), value: deviceStatus?.os_version || host.os || t('app.unknown'), color: '#ffffff' },
          ].map((item, index, arr) => (
            <div key={item.label} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              borderBottom: index < arr.length - 1 ? '1px solid #2a3342' : 'none'
            }}>
              <span style={{ color: '#8b9aa8', fontSize: '14px' }}>{item.label}</span>
              <span style={{ color: item.color, fontSize: '14px', fontWeight: 500 }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Power Controls */}
      <div style={{ padding: '0 20px 24px' }}>
        <h2 style={{
          fontSize: '16px',
          fontWeight: 600,
          color: '#ffffff',
          margin: 0,
          marginBottom: '16px'
        }}>{t('hostDetail.powerControls')}</h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px'
        }}>
          {[
            { action: 'shutdown' as const, label: t('hostDetail.shutdown'), Icon: IconPower, color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.1)' },
            { action: 'restart' as const, label: t('hostDetail.restart'), Icon: IconRestart, color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)' },
            { action: 'sleep' as const, label: t('hostDetail.sleep'), Icon: IconBedtime, color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.1)' },
            { action: 'lock' as const, label: t('hostDetail.lock'), Icon: IconLock, color: '#8b5cf6', bgColor: 'rgba(139, 92, 246, 0.1)' },
          ].map(({ action, label, Icon, color, bgColor }) => (
            <button
              key={action}
              disabled={host.status === 'Offline' || isLoading}
              onClick={() => handlePowerAction(action)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                height: '100px',
                borderRadius: '16px',
                backgroundColor: bgColor,
                border: `2px solid ${color}33`,
                cursor: host.status === 'Offline' || isLoading ? 'not-allowed' : 'pointer',
                opacity: host.status === 'Offline' || isLoading ? 0.3 : 1
              }}
            >
              <Icon style={{ width: '32px', height: '32px', color }} />
              <span style={{ color, fontSize: '14px', fontWeight: 600 }}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Command Execution Section */}
      <div style={{ padding: '0 20px 24px' }}>
        <h2 style={{
          fontSize: '16px',
          fontWeight: 600,
          color: '#ffffff',
          margin: 0,
          marginBottom: '16px'
        }}>{t('hostDetail.commandExecution')}</h2>

        <div style={{
          backgroundColor: '#1a2332',
          borderRadius: '16px',
          padding: '16px'
        }}>
          <div style={{
            display: 'flex',
            gap: '12px',
            marginBottom: '16px'
          }}>
            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              placeholder={t('hostDetail.enterCommand')}
              disabled={host.status === 'Offline'}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '12px',
                backgroundColor: '#0f1419',
                color: '#ffffff',
                border: '1px solid #2a3342',
                fontSize: '14px',
                outline: 'none',
                fontFamily: 'monospace'
              }}
            />
            <button
              onClick={handleExecuteCommand}
              disabled={host.status === 'Offline' || isExecuting || !commandInput.trim()}
              style={{
                padding: '12px 20px',
                borderRadius: '12px',
                backgroundColor: '#13a4ec',
                color: '#ffffff',
                border: 'none',
                fontSize: '14px',
                fontWeight: 600,
                cursor: host.status === 'Offline' || isExecuting || !commandInput.trim() ? 'not-allowed' : 'pointer',
                opacity: host.status === 'Offline' || isExecuting || !commandInput.trim() ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <IconTerminal style={{ width: '18px', height: '18px' }} />
              {isExecuting ? t('hostDetail.running') : t('hostDetail.run')}
            </button>
          </div>

          {commandOutput && (
            <div style={{
              backgroundColor: '#0f1419',
              borderRadius: '12px',
              padding: '16px',
              maxHeight: '200px',
              overflow: 'auto'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px',
                color: '#8b9aa8',
                fontSize: '12px'
              }}>
                <IconTerminal style={{ width: '14px', height: '14px' }} />
                <span>{t('hostDetail.output')}</span>
              </div>
              <pre style={{
                margin: 0,
                color: '#ffffff',
                fontSize: '13px',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>{commandOutput}</pre>
            </div>
          )}
        </div>
      </div>

      {/* Refresh Button */}
      <div style={{ padding: '0 20px 40px' }}>
        <button
          onClick={fetchDeviceStatus}
          disabled={host.status === 'Offline'}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '12px',
            backgroundColor: '#1a2332',
            color: '#ffffff',
            border: 'none',
            fontSize: '16px',
            fontWeight: 500,
            cursor: host.status === 'Offline' ? 'not-allowed' : 'pointer',
            opacity: host.status === 'Offline' ? 0.5 : 1
          }}
        >
          {t('hostDetail.refreshStatus')}
        </button>
      </div>
    </div>
  );
};

export default HostDetail;
