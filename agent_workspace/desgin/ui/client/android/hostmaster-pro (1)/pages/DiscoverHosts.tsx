
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Host, NewHost } from '../types';

interface DiscoverHostsProps {
  onAdd: (host: Host) => void;
  existingIps: string[];
}

const DISCOVERABLE_POOL: NewHost[] = [
  { id: '101', name: 'Living Room TV', ip: '192.168.1.15', icon: 'tv' },
  { id: '102', name: 'Kitchen Speaker', ip: '192.168.1.22', icon: 'speaker' },
  { id: '103', name: 'Office PC', ip: '192.168.1.10', icon: 'computer' },
  { id: '104', name: 'Bedroom Lamp', ip: '192.168.1.45', icon: 'lightbulb' },
  { id: '105', name: 'Smart Plug 1', ip: '192.168.1.53', icon: 'power' },
  { id: '106', name: 'Nest Hallway', ip: '192.168.1.19', icon: 'thermostat' },
];

const DiscoverHosts: React.FC<DiscoverHostsProps> = ({ onAdd, existingIps }) => {
  const navigate = useNavigate();
  const [discovered, setDiscovered] = useState<NewHost[]>([]);
  const [isScanning, setIsScanning] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDiscovered(DISCOVERABLE_POOL.filter(h => !existingIps.includes(h.ip)));
      setIsScanning(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, [existingIps]);

  const handleAdd = (host: NewHost) => {
    onAdd({
      ...host,
      status: 'Online',
      uptime: '0m',
      os: 'Auto-detected Device'
    });
    setDiscovered(prev => prev.filter(h => h.id !== host.id));
  };

  return (
    <div className="mx-auto w-full max-w-md min-h-screen flex flex-col bg-background-dark font-display">
      <div className="sticky top-0 z-50 w-full bg-background-dark pt-2 pb-4 px-0">
        <div className="px-5 mt-6 flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-2">
             <button onClick={() => navigate('/')} className="text-text-secondary hover:text-white transition-colors">
                <span className="material-symbols-outlined">arrow_back</span>
             </button>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Discover New Hosts</h1>
          <div className="flex items-center gap-2 mt-2">
            <div className={`w-2 h-2 rounded-full bg-primary ${isScanning ? 'animate-pulse' : ''}`}></div>
            <p className="text-sm font-medium text-text-secondary uppercase tracking-wide">
              {isScanning ? 'Scanning network...' : 'Scan Complete'}
            </p>
          </div>
        </div>
      </div>

      <main className="flex-1 flex flex-col px-4 pb-8 space-y-2 mt-4">
        {isScanning ? (
           <div className="flex flex-col items-center justify-center pt-20 space-y-4">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="text-text-secondary">Detecting network devices...</p>
           </div>
        ) : discovered.length > 0 ? (
          discovered.map((host) => (
            <div key={host.id} className="group relative flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors duration-200">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center shrink-0 size-12 rounded-xl bg-surface-dark text-white">
                  <span className="material-symbols-outlined text-[24px]">{host.icon}</span>
                </div>
                <div className="flex flex-col justify-center">
                  <p className="text-white text-base font-medium leading-tight">{host.name}</p>
                  <p className="text-text-secondary text-sm font-normal leading-normal mt-0.5 font-mono">{host.ip}</p>
                </div>
              </div>
              <div className="shrink-0">
                <button 
                  onClick={() => handleAdd(host)}
                  className="flex items-center justify-center h-9 px-5 rounded-lg bg-surface-dark hover:bg-primary text-white transition-all duration-300 shadow-sm"
                >
                  <span className="text-sm font-semibold">Add</span>
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center pt-20 text-text-secondary">
             <span className="material-symbols-outlined text-6xl mb-2">cloud_off</span>
             <p>No new devices discovered</p>
             <button 
              onClick={() => { setIsScanning(true); setDiscovered([]); }}
              className="mt-4 text-primary font-bold"
             >
               Rescan
             </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default DiscoverHosts;
