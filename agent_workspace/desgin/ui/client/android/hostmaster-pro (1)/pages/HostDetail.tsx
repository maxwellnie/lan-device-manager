
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Host } from '../types';
import { GoogleGenAI } from '@google/genai';

interface HostDetailProps {
  hosts: Host[];
  onStatusChange: (id: string, status: 'Online' | 'Offline') => void;
}

const HostDetail: React.FC<HostDetailProps> = ({ hosts, onStatusChange }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const host = hosts.find(h => h.id === id);

  const [command, setCommand] = useState('');
  const [terminalOutput, setTerminalOutput] = useState<string>(host?.lastTerminalOutput || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const terminalRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  if (!host) {
    return (
      <div className="flex items-center justify-center h-screen bg-background-dark text-white">
        <p>Host not found</p>
        <button onClick={() => navigate('/')} className="ml-4 text-primary">Go Back</button>
      </div>
    );
  }

  const handlePower = (action: 'Shutdown' | 'Restart') => {
    if (confirm(`Are you sure you want to ${action.toLowerCase()} ${host.name}?`)) {
      setIsProcessing(true);
      const output = `\n[System]: Initiating ${action}...\nBroadcast message from root@${host.name.replace(/\s+/g, '-').toLowerCase()}...\nThe system is going down for ${action.toLowerCase()} NOW!\n`;
      setTerminalOutput(prev => prev + output);
      
      setTimeout(() => {
        onStatusChange(host.id, 'Offline');
        setIsProcessing(false);
        setTerminalOutput(prev => prev + `\n[System]: Connection lost. Host is offline.\n`);
      }, 2000);
    }
  };

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || host.status === 'Offline') return;

    const currentCommand = command;
    setCommand('');
    setTerminalOutput(prev => prev + `\nroot@${host.name.replace(/\s+/g, '-').toLowerCase()}:~# ${currentCommand}`);
    
    // Simulate thinking/executing
    setIsProcessing(true);

    // Using Gemini to "simulate" command output if it's an AI helper request
    if (currentCommand.startsWith('ask ')) {
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
            const prompt = `Act as a Linux terminal for a host named ${host.name} running ${host.os}. The user is asking: "${currentCommand.substring(4)}". Provide a realistic short terminal response or explanation as if you were the terminal output. Do not include markdown code blocks, just raw text.`;
            const result = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt
            });
            setTerminalOutput(prev => prev + `\n${result.text?.trim() || 'No output.'}\n`);
        } catch (err) {
            setTerminalOutput(prev => prev + `\nError: AI service unavailable.\n`);
        }
    } else {
        // Mock local commands
        setTimeout(() => {
            let output = '';
            switch(currentCommand.toLowerCase()) {
                case 'ls': output = 'bin  boot  dev  etc  home  lib  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var'; break;
                case 'whoami': output = 'root'; break;
                case 'uptime': output = host.uptime || '0m'; break;
                case 'clear': setTerminalOutput(`root@${host.name.replace(/\s+/g, '-').toLowerCase()}:~# `); setIsProcessing(false); return;
                default: output = `-bash: ${currentCommand}: command not found`;
            }
            setTerminalOutput(prev => prev + `\n${output}\n`);
            setIsProcessing(false);
        }, 500);
    }
    
    setIsProcessing(false);
  };

  return (
    <div className="bg-background-dark min-h-screen flex flex-col items-center font-display overflow-x-hidden antialiased p-0 sm:p-4">
      <div className="relative flex h-full w-full max-w-md flex-col bg-background-dark overflow-hidden shadow-2xl sm:rounded-3xl sm:border sm:border-gray-800">
        
        {/* Header/Back Button */}
        <div className="absolute top-4 left-4 z-20">
            <button onClick={() => navigate('/')} className="size-10 flex items-center justify-center bg-surface-dark rounded-full text-white hover:bg-surface-accent transition-colors">
                <span className="material-symbols-outlined">arrow_back</span>
            </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Host Info Section */}
          <div className="flex p-6 flex-col items-center gap-6 pt-12">
            <div className="relative group">
              <div 
                className="bg-center bg-no-repeat bg-cover rounded-2xl h-32 w-32 shadow-lg ring-4 ring-white/10" 
                style={{ backgroundImage: 'url("https://picsum.photos/seed/server1/200/200")' }}
              ></div>
              <div className={`absolute -bottom-2 -right-2 ${host.status === 'Online' ? 'bg-green-500' : 'bg-rose-500'} rounded-full p-1.5 border-4 border-background-dark`}>
                <span className="material-symbols-outlined text-white text-[16px] font-bold">
                    {host.status === 'Online' ? 'check' : 'close'}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-1">
              <h1 className="text-white text-2xl font-bold leading-tight tracking-tight text-center">{host.name}</h1>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${host.status === 'Online' ? 'bg-green-500 animate-pulse' : 'bg-rose-500'}`}></span>
                <p className="text-text-secondary text-sm font-medium leading-normal text-center">
                  {host.status} • {host.ip}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="px-6 pb-2">
            <div className="bg-surface-dark/40 rounded-xl overflow-hidden shadow-sm border border-gray-800">
              <div className="grid grid-cols-[30%_1fr] border-b border-gray-800 p-4 items-center">
                <p className="text-text-secondary text-sm font-normal">Status</p>
                <p className={`text-sm font-medium text-right ${host.status === 'Online' ? 'text-green-400' : 'text-rose-400'}`}>
                    {host.status === 'Online' ? 'Running' : 'Stopped'}
                </p>
              </div>
              <div className="grid grid-cols-[30%_1fr] border-b border-gray-800 p-4 items-center">
                <p className="text-text-secondary text-sm font-normal">Uptime</p>
                <p className="text-white text-sm font-medium text-right">{host.status === 'Online' ? host.uptime : '--'}</p>
              </div>
              <div className="grid grid-cols-[30%_1fr] p-4 items-center">
                <p className="text-text-secondary text-sm font-normal">OS</p>
                <div className="flex items-center justify-end gap-2">
                  <span className="material-symbols-outlined text-gray-500 text-[18px]">terminal</span>
                  <p className="text-white text-sm font-medium">{host.os}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="p-6">
            <p className="text-white text-base font-bold mb-3 px-1">Power Controls</p>
            <div className="grid grid-cols-2 gap-4">
              <button 
                disabled={host.status === 'Offline'}
                onClick={() => handlePower('Shutdown')}
                className="flex flex-col items-center justify-center gap-2 cursor-pointer overflow-hidden rounded-xl h-24 px-5 bg-rose-500/10 hover:bg-rose-500/20 border-2 border-rose-500/30 hover:border-rose-500 group transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-rose-500 text-3xl group-hover:scale-110 transition-transform">power_settings_new</span>
                <span className="text-rose-400 text-sm font-bold">Shutdown</span>
              </button>
              <button 
                disabled={host.status === 'Offline'}
                onClick={() => handlePower('Restart')}
                className="flex flex-col items-center justify-center gap-2 cursor-pointer overflow-hidden rounded-xl h-24 px-5 bg-amber-500/10 hover:bg-amber-500/20 border-2 border-amber-500/30 hover:border-amber-500 group transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-amber-500 text-3xl group-hover:rotate-180 transition-transform duration-500">restart_alt</span>
                <span className="text-amber-400 text-sm font-bold">Restart</span>
              </button>
            </div>
          </div>

          {/* Remote Shell */}
          <div className="px-6 pb-2">
            <p className="text-white text-base font-bold mb-3 px-1">Remote Shell</p>
            <div className="flex items-center gap-3">
              <div className="bg-center bg-no-repeat bg-cover rounded-full h-10 w-10 shrink-0 shadow-sm border border-gray-800" style={{ backgroundImage: 'url("https://picsum.photos/seed/user1/40/40")' }}></div>
              <form onSubmit={handleCommand} className="flex h-12 flex-1 relative group">
                <div className="flex w-full flex-1 items-stretch rounded-lg h-full shadow-sm">
                  <input 
                    disabled={host.status === 'Offline'}
                    className="flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-l-lg text-white focus:outline-0 focus:ring-2 focus:ring-primary/50 border border-gray-700 bg-surface-dark h-full placeholder:text-text-secondary px-4 text-base font-normal leading-normal transition-all disabled:opacity-50" 
                    placeholder={host.status === 'Online' ? "Enter command (prefix 'ask ' for AI helper)..." : "Host is offline"}
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                  />
                  <button 
                    type="submit"
                    disabled={host.status === 'Offline' || isProcessing}
                    className="cursor-pointer flex items-center justify-center rounded-r-lg px-4 bg-primary hover:bg-sky-400 text-white border border-primary transition-colors disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[20px]">{isProcessing ? 'sync' : 'send'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Terminal Output */}
          <div className="p-6 pb-12">
            <div className="flex flex-col w-full">
              <div className="flex justify-between items-end pb-2 px-1">
                <p className="text-text-secondary text-sm font-medium">Terminal Output</p>
                <span className="text-xs text-slate-500 bg-[#192b33] px-2 py-1 rounded">Last update: Just now</span>
              </div>
              <div className="relative w-full rounded-xl overflow-hidden bg-[#0d1117] border border-gray-700 shadow-inner group">
                <div className="absolute top-0 left-0 right-0 h-6 bg-[#161b22] flex items-center px-3 gap-1.5 border-b border-[#30363d]">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]"></div>
                </div>
                <textarea 
                  ref={terminalRef}
                  className="flex w-full resize-none bg-transparent text-green-400 focus:outline-none min-h-[250px] p-4 pt-10 font-mono text-[11px] leading-relaxed selection:bg-green-900 selection:text-white" 
                  readonly 
                  spellcheck="false"
                  value={terminalOutput}
                ></textarea>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HostDetail;
