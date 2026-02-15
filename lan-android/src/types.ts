export type Status = 'Online' | 'Offline';

export interface Host {
  id: string;
  uuid?: string;           // 设备唯一标识符（从mDNS获取）
  name: string;
  ip: string;
  port: number;
  status: Status;
  icon: string;
  iconColor?: string;
  uptime?: string;
  os?: string;
  version?: string;
  requiresAuth?: boolean;
  customName?: string;
}

export interface NewHost {
  id: string;
  name: string;
  ip: string;
  port: number;
  icon: string;
}

export interface DeviceStatus {
  online: boolean;
  cpu_usage: number;
  memory_usage: number;
  uptime: number;
  os_type: string;
  os_version: string;
}

export interface AuthResult {
  success: boolean;
  token?: string;
  expires_in?: number;
  error?: string;
}

export interface ConnectResult {
  success: boolean;
  requires_auth: boolean;
  error?: string;
}

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exit_code?: number;
  execution_time_ms: number;
}
