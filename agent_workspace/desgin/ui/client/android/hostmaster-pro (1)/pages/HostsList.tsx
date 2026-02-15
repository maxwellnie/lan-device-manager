
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Host } from '../types';

interface HostsListProps {
  hosts: Host[];
  onRemove: (id: string) => void;
}

const HostsList: React.FC<HostsListProps> = ({ hosts, onRemove }) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const filteredHosts = hosts.filter(h => 
    h.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    h.ip.includes(searchQuery)
  );

  return (
    <div className="mx-auto w-full max-w-md min-h-screen flex flex-col relative pb-24 bg-background-dark">
      <header className="flex items-center justify-between px-5 pt-6 pb-2 sticky top-0 z-10 bg-background-dark/95 backdrop-blur-sm">
        <div className="size-10 flex items-center justify-center rounded-full active:bg-surface-dark/50 transition-colors cursor-pointer text-text-secondary">
          <span className="material-symbols-outlined !text-[28px]">dns</span>
        </div>
        <h1 className="text-xl font-bold tracking-tight flex-1 text-center">Hosts</h1>
        <button 
          onClick={() => setIsEditing(!isEditing)}
          className="h-10 px-3 flex items-center justify-center text-primary font-bold text-base tracking-wide active:opacity-70 transition-opacity"
        >
          {isEditing ? 'Done' : 'Edit'}
        </button>
      </header>

      <div className="px-5 py-2 mb-2">
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="material-symbols-outlined text-text-secondary">search</span>
          </div>
          <input 
            className="block w-full pl-10 pr-3 py-3 rounded-xl border-none bg-surface-dark text-white placeholder-text-secondary focus:ring-2 focus:ring-primary/50 focus:bg-[#233c48] transition-all shadow-sm" 
            placeholder="Search hosts by name or IP..." 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col space-y-1 px-3">
        {filteredHosts.map((host) => (
          <div 
            key={host.id}
            onClick={() => !isEditing && navigate(`/host/${host.id}`)}
            className="group flex items-center justify-between p-3 rounded-2xl hover:bg-surface-dark/50 active:bg-surface-dark transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className={`flex items-center justify-center size-12 rounded-xl bg-surface-dark ${host.iconColor || 'text-primary'} shrink-0 group-hover:bg-[#233c48] transition-colors`}>
                <span className="material-symbols-outlined !text-[24px]">{host.icon}</span>
              </div>
              <div className="flex flex-col justify-center truncate">
                <h3 className="text-base font-semibold leading-tight truncate text-white">{host.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="relative flex h-2 w-2">
                    {host.status === 'Online' && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    )}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${host.status === 'Online' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                  </span>
                  <span className={`text-xs font-medium ${host.status === 'Online' ? 'text-emerald-500' : 'text-rose-500'}`}>{host.status}</span>
                  <span className="text-text-secondary text-xs">•</span>
                  <span className="text-text-secondary text-xs truncate font-mono">{host.ip}</span>
                </div>
              </div>
            </div>
            {isEditing && (
              <button 
                onClick={(e) => { e.stopPropagation(); onRemove(host.id); }}
                className="size-10 flex items-center justify-center text-rose-500 hover:bg-rose-400/10 rounded-full transition-all shrink-0 ml-2"
              >
                <span className="material-symbols-outlined !text-[20px]">delete</span>
              </button>
            )}
          </div>
        ))}

        {filteredHosts.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-20 text-text-secondary opacity-50">
            <span className="material-symbols-outlined text-6xl mb-2">sentiment_dissatisfied</span>
            <p>No hosts found</p>
          </div>
        )}
      </div>

      <div className="fixed bottom-6 right-6 z-50">
        <button 
          onClick={() => navigate('/discover')}
          className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-white shadow-lg hover:scale-105 active:scale-95 transition-all duration-300"
        >
          <span className="material-symbols-outlined !text-[28px]">add</span>
        </button>
      </div>
    </div>
  );
};

export default HostsList;
