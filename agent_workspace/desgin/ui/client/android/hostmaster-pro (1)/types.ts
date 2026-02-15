
export type Status = 'Online' | 'Offline';

export interface Host {
  id: string;
  name: string;
  ip: string;
  status: Status;
  icon: string;
  iconColor?: string;
  uptime?: string;
  os?: string;
  lastTerminalOutput?: string;
}

export interface NewHost {
  id: string;
  name: string;
  ip: string;
  icon: string;
}
