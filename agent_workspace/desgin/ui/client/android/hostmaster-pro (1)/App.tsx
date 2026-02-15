
import React, { useState, useMemo } from 'react';
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom';
import HostsList from './pages/HostsList';
import DiscoverHosts from './pages/DiscoverHosts';
import HostDetail from './pages/HostDetail';
import { Host } from './types';

const INITIAL_HOSTS: Host[] = [
  {
    id: '1',
    name: 'Ubuntu Server Primary',
    ip: '192.168.1.10',
    status: 'Online',
    icon: 'dns',
    iconColor: 'text-primary',
    uptime: '14d 2h 15m',
    os: 'Ubuntu 22.04 LTS',
    lastTerminalOutput: 'root@alpha-01:~# systemctl status nginx\n● nginx.service - A high performance web server\n   Active: active (running) since Mon 2023-10-23'
  },
  {
    id: '2',
    name: 'Windows Dev Machine',
    ip: '192.168.1.15',
    status: 'Offline',
    icon: 'desktop_windows',
    iconColor: 'text-indigo-400',
    uptime: '0m',
    os: 'Windows 11 Pro'
  },
  {
    id: '3',
    name: 'Raspberry Pi Home',
    ip: '192.168.1.22',
    status: 'Online',
    icon: 'developer_board',
    iconColor: 'text-pink-400',
    uptime: '5d 12h 40m',
    os: 'Raspbian Bookworm'
  },
  {
    id: '4',
    name: 'Gateway Router',
    ip: '192.168.1.1',
    status: 'Online',
    icon: 'router',
    iconColor: 'text-orange-400',
    uptime: '200d 4h 12m',
    os: 'OpenWrt 23.05'
  },
  {
    id: '5',
    name: 'NAS Backup',
    ip: '192.168.1.200',
    status: 'Online',
    icon: 'storage',
    iconColor: 'text-cyan-400',
    uptime: '88d 1h 5m',
    os: 'TrueNAS Core'
  }
];

const App: React.FC = () => {
  const [hosts, setHosts] = useState<Host[]>(INITIAL_HOSTS);

  const addHost = (newHost: Host) => {
    setHosts(prev => [...prev, newHost]);
  };

  const removeHost = (id: string) => {
    setHosts(prev => prev.filter(h => h.id !== id));
  };

  const updateHostStatus = (id: string, status: 'Online' | 'Offline') => {
    setHosts(prev => prev.map(h => h.id === id ? { ...h, status } : h));
  };

  return (
    <HashRouter>
      <Routes>
        <Route 
          path="/" 
          element={<HostsList hosts={hosts} onRemove={removeHost} />} 
        />
        <Route 
          path="/discover" 
          element={<DiscoverHosts onAdd={addHost} existingIps={hosts.map(h => h.ip)} />} 
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
