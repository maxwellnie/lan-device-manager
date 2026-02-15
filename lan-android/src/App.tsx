import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import HostsList from './pages/HostsList';
import DiscoverHosts from './pages/DiscoverHosts';
import HostDetail from './pages/HostDetail';
import { Host } from './types';

interface SavedDevice {
  id: string;
  uuid?: string;           // 设备唯一标识符
  name: string;
  ip_address: string;
  port: number;
  custom_name?: string;
}

function App() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSavedDevices();
  }, []);

  const loadSavedDevices = async () => {
    try {
      let savedDevices: SavedDevice[] = [];
      try {
        savedDevices = await invoke<SavedDevice[]>('get_saved_devices');
      } catch (invokeError) {
        console.error('get_saved_devices failed:', invokeError);
        savedDevices = [];
      }
      
      const loadedHosts: Host[] = savedDevices.map(device => ({
        id: device.id,
        uuid: device.uuid,      // 加载 UUID
        name: device.name,
        ip: device.ip_address,
        port: device.port,
        status: 'Offline',
        icon: '',
        iconColor: '',
        uptime: '0m',
        os: 'Unknown',
        customName: device.custom_name,
      }));
      
      setHosts(loadedHosts);
      
      loadedHosts.forEach(host => checkHostStatus(host));
    } catch (error) {
      console.error('Failed to load:', error);
      setError(`${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const checkHostStatus = async (host: Host) => {
    try {
      await invoke('connect_to_device', {
        device: {
          id: host.id,
          uuid: host.uuid || host.id,
          name: host.name,
          ip_address: host.ip,
          port: host.port,
          custom_name: host.customName || null,
          last_connected: null,
          created_at: new Date().toISOString(),
        },
        password: null
      });
      updateHostStatus(host.id, 'Online');
    } catch (error) {
      updateHostStatus(host.id, 'Offline');
    }
  };

  const addHost = (newHost: Host) => {
    setHosts(prev => {
      console.log('Adding host:', newHost);
      console.log('Existing hosts:', prev);
      
      // 检查是否已存在相同UUID的设备
      const existingIndex = prev.findIndex(h => {
        const match = h.uuid && newHost.uuid && h.uuid === newHost.uuid;
        console.log(`Checking host ${h.name} (uuid: ${h.uuid}) against new host (uuid: ${newHost.uuid}): match=${match}`);
        return match;
      });
      
      if (existingIndex >= 0) {
        // 更新现有设备的信息（IP、端口可能变化）
        console.log(`Updating existing device at index ${existingIndex}: ${prev[existingIndex].name}`);
        const updated = [...prev];
        updated[existingIndex] = { ...newHost, status: 'Online' };
        return updated;
      }
      
      // 添加新设备
      console.log('Adding new device');
      return [...prev, newHost];
    });
  };

  const removeHost = async (id: string) => {
    try {
      await invoke('delete_device', { deviceId: id });
      setHosts(prev => prev.filter(h => h.id !== id));
    } catch (error) {
      console.error('Failed to delete device:', error);
    }
  };

  const updateHostStatus = (id: string, status: 'Online' | 'Offline') => {
    setHosts(prev => prev.map(h => h.id === id ? { ...h, status } : h));
  };

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#0f1419',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column'
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '3px solid #1a2332',
          borderTopColor: '#13a4ec',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p style={{ color: '#8b9aa8', marginTop: '16px', fontSize: '14px' }}>Loading...</p>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#0f1419',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        padding: '20px'
      }}>
        <p style={{ color: '#ef4444', marginBottom: '8px', fontSize: '18px' }}>Error</p>
        <p style={{ color: '#8b9aa8', fontSize: '14px', marginBottom: '24px', textAlign: 'center' }}>{error}</p>
        <button 
          onClick={() => { setError(null); setIsLoading(true); loadSavedDevices(); }}
          style={{
            padding: '12px 24px',
            backgroundColor: '#13a4ec',
            color: '#ffffff',
            border: 'none',
            borderRadius: '12px',
            fontSize: '16px',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <HashRouter>
      <Routes>
        <Route 
          path="/" 
          element={<HostsList hosts={hosts} onRemove={removeHost} onStatusChange={updateHostStatus} />} 
        />
        <Route
          path="/discover"
          element={<DiscoverHosts onAdd={addHost} existingHosts={hosts} />}
        />
        <Route 
          path="/host/:id" 
          element={<HostDetail hosts={hosts} onStatusChange={updateHostStatus} />} 
        />
      </Routes>
    </HashRouter>
  );
}

export default App;
