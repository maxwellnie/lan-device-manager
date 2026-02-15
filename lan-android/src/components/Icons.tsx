// SVG Icons Component
import React from 'react';

interface IconProps {
  className?: string;
  style?: React.CSSProperties;
}

export const IconServer = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 3C2.89543 3 2 3.89543 2 5V9C2 10.1046 2.89543 11 4 11H20C21.1046 11 22 10.1046 22 9V5C22 3.89543 21.1046 3 20 3H4ZM4 13C2.89543 13 2 13.8954 2 15V19C2 20.1046 2.89543 21 4 21H20C21.1046 21 22 20.1046 22 19V15C22 13.8954 21.1046 13 20 13H4ZM5 6H7V8H5V6ZM5 16H7V18H5V16Z"/>
  </svg>
);

export const IconComputer = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 18C21.1 18 21.99 17.1 21.99 16L22 6C22 4.9 21.1 4 20 4H4C2.9 4 2 4.9 2 6V16C2 17.1 2.9 18 4 18H0V20H24V18H20ZM4 6H20V16H4V6Z"/>
  </svg>
);

export const IconDesktop = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 2H3C1.9 2 1 2.9 1 4V16C1 17.1 1.9 18 3 18H10V20H8V22H16V20H14V18H21C22.1 18 23 17.1 23 16V4C23 2.9 22.1 2 21 2ZM21 14H3V4H21V14Z"/>
  </svg>
);

export const IconTerminal = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4ZM20 18H4V6H20V18ZM7.5 15L10.5 12L7.5 9L6.5 10.1L8.4 12L6.5 13.9L7.5 15ZM12.5 13H16.5V15H12.5V13Z"/>
  </svg>
);

export const IconDeveloperBoard = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M22 9V7H20V5C20 3.9 19.1 3 18 3H4C2.9 3 2 3.9 2 5V19C2 20.1 2.9 21 4 21H18C19.1 21 20 20.1 20 19V17H22V15H20V13H22V11H20V9H22ZM18 19H4V5H18V19ZM6 13H11V17H6V13ZM12 7H16V10H12V7ZM6 7H11V12H6V7ZM12 12H16V17H12V12Z"/>
  </svg>
);

export const IconRouter = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20ZM12 6C8.69 6 6 8.69 6 12C6 15.31 8.69 18 12 18C15.31 18 18 15.31 18 12C18 8.69 15.31 6 12 6ZM12 16C9.79 16 8 14.21 8 12C8 9.79 9.79 8 12 8C14.21 8 16 9.79 16 12C16 14.21 14.21 16 12 16Z"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>
);

export const IconStorage = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M2 20H22V22H2V20ZM4 12H6V18H4V12ZM8 12H10V18H8V12ZM12 12H14V18H12V12ZM16 12H18V18H16V12ZM20 12H22V18H20V12ZM2 4H22V10H2V4ZM4 6V8H6V6H4ZM8 6V8H10V6H8ZM12 6V8H14V6H12ZM16 6V8H18V6H16ZM20 6V8H22V6H20Z"/>
  </svg>
);

export const IconTV = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 3H3C1.9 3 1 3.9 1 5V17C1 18.1 1.9 19 3 19H8V21H16V19H21C22.1 19 23 18.1 23 17V5C23 3.9 22.1 3 21 3ZM21 17H3V5H21V17Z"/>
  </svg>
);

export const IconSpeaker = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17 2H7C5.9 2 5 2.9 5 4V20C5 21.1 5.9 22 7 22H17C18.1 22 19 21.1 19 20V4C19 2.9 18.1 2 17 2ZM12 20C10.9 20 10 19.1 10 18C10 16.9 10.9 16 12 16C13.1 16 14 16.9 14 18C14 19.1 13.1 20 12 20ZM17 14H7V6H17V14Z"/>
  </svg>
);

export const IconLightbulb = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 21C9 21.55 9.45 22 10 22H14C14.55 22 15 21.55 15 21V20H9V21ZM12 2C8.14 2 5 5.14 5 9C5 11.38 6.19 13.47 8 14.74V17C8 17.55 8.45 18 9 18H15C15.55 18 16 17.55 16 17V14.74C17.81 13.47 19 11.38 19 9C19 5.14 15.86 2 12 2ZM14.85 13.1L14 13.7V16H10V13.7L9.15 13.1C7.8 12.16 7 10.63 7 9C7 6.24 9.24 4 12 4C14.76 4 17 6.24 17 9C17 10.63 16.2 12.16 14.85 13.1Z"/>
  </svg>
);

export const IconPlug = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 1V4H8V1H6V4H5C3.34 4 2 5.34 2 7V13C2 14.1 2.9 15 4 15V19C4 20.1 4.9 21 6 21H18C19.1 21 20 20.1 20 19V15C21.1 15 22 14.1 22 13V7C22 5.34 20.66 4 19 4H18V1H16ZM18 15V19H6V15H18ZM5 13V7H19V13H5Z"/>
  </svg>
);

export const IconThermostat = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M15 13V5C15 3.34 13.66 2 12 2C10.34 2 9 3.34 9 5V13C6.79 14.36 5.5 16.93 6.08 19.53C6.67 22.12 9.08 24 11.75 24H12.25C14.92 24 17.33 22.12 17.92 19.53C18.5 16.93 17.21 14.36 15 13ZM13 15.28V7H11V15.28C9.28 15.86 8.14 17.56 8.41 19.36C8.68 21.16 10.25 22.5 12.06 22.5H11.94C13.75 22.5 15.32 21.16 15.59 19.36C15.86 17.56 14.72 15.86 13 15.28Z"/>
  </svg>
);

export const IconSearch = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3C5.91 3 3 5.91 3 9.5C3 13.09 5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5C5 7.01 7.01 5 9.5 5C11.99 5 14 7.01 14 9.5C14 11.99 11.99 14 9.5 14Z"/>
  </svg>
);

export const IconAdd = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z"/>
  </svg>
);

export const IconDelete = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM19 4H15.5L14.5 3H9.5L8.5 4H5V6H19V4Z"/>
  </svg>
);

export const IconArrowBack = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 11H7.83L13.42 5.41L12 4L4 12L12 20L13.41 18.59L7.83 13H20V11Z"/>
  </svg>
);

export const IconPower = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z"/>
  </svg>
);

export const IconRestart = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 4V1L8 5L12 9V6C15.31 6 18 8.69 18 12C18 15.31 15.31 18 12 18C8.69 18 6 15.31 6 12H4C4 16.42 7.58 20 12 20C16.42 20 20 16.42 20 12C20 7.58 16.42 4 12 4Z"/>
  </svg>
);

export const IconBedtime = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6A5.002 5.002 0 0 1 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z"/>
  </svg>
);

export const IconLock = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18 8H17V6C17 3.24 14.76 1 12 1C9.24 1 7 3.24 7 6V8H6C4.9 8 4 8.9 4 10V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V10C20 8.9 19.1 8 18 8ZM12 17C10.9 17 10 16.1 10 15C10 13.9 10.9 13 12 13C13.1 13 14 13.9 14 15C14 16.1 13.1 17 12 17ZM9 8V6C9 4.34 10.34 3 12 3C13.66 3 15 4.34 15 6V8H9Z"/>
  </svg>
);

export const IconCheck = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 16.17L4.83 12L3.41 13.41L9 19L21 7L19.59 5.59L9 16.17Z"/>
  </svg>
);

export const IconClose = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
  <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"/>
  </svg>
);

export const IconError = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z"/>
  </svg>
);

export const IconRefresh = ({ className = "", style }: IconProps) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4C7.58 4 4.01 7.58 4.01 12C4.01 16.42 7.58 20 12 20C15.73 20 18.84 17.45 19.73 14H17.65C16.83 16.33 14.61 18 12 18C8.69 18 6 15.31 6 12C6 8.69 8.69 6 12 6C13.66 6 15.14 6.69 16.22 7.78L13 11H20V4L17.65 6.35Z"/>
  </svg>
);

// Get icon by device name
export const getDeviceIcon = (name: string) => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('tv')) return IconTV;
  if (lowerName.includes('speaker')) return IconSpeaker;
  if (lowerName.includes('lamp') || lowerName.includes('light')) return IconLightbulb;
  if (lowerName.includes('plug')) return IconPlug;
  if (lowerName.includes('thermostat') || lowerName.includes('nest')) return IconThermostat;
  if (lowerName.includes('windows') || lowerName.includes('pc')) return IconDesktop;
  if (lowerName.includes('ubuntu') || lowerName.includes('linux')) return IconTerminal;
  if (lowerName.includes('pi') || lowerName.includes('raspberry')) return IconDeveloperBoard;
  if (lowerName.includes('router')) return IconRouter;
  if (lowerName.includes('nas') || lowerName.includes('storage')) return IconStorage;
  return IconServer;
};

// Get icon color by device name
export const getDeviceIconColor = (name: string): string => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('tv')) return '#3b82f6'; // blue
  if (lowerName.includes('speaker')) return '#8b5cf6'; // violet
  if (lowerName.includes('lamp') || lowerName.includes('light')) return '#fbbf24'; // amber
  if (lowerName.includes('plug')) return '#10b981'; // emerald
  if (lowerName.includes('thermostat') || lowerName.includes('nest')) return '#f97316'; // orange
  if (lowerName.includes('windows')) return '#6366f1'; // indigo
  if (lowerName.includes('ubuntu') || lowerName.includes('linux')) return '#f97316'; // orange
  if (lowerName.includes('pi') || lowerName.includes('raspberry')) return '#ec4899'; // pink
  if (lowerName.includes('router')) return '#f59e0b'; // amber
  if (lowerName.includes('nas')) return '#06b6d4'; // cyan
  return '#13a4ec'; // primary
};

export const getDeviceIconBgColor = (name: string): string => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('tv')) return 'rgba(59, 130, 246, 0.15)';
  if (lowerName.includes('speaker')) return 'rgba(139, 92, 246, 0.15)';
  if (lowerName.includes('lamp') || lowerName.includes('light')) return 'rgba(251, 191, 36, 0.15)';
  if (lowerName.includes('plug')) return 'rgba(16, 185, 129, 0.15)';
  if (lowerName.includes('thermostat') || lowerName.includes('nest')) return 'rgba(249, 115, 22, 0.15)';
  if (lowerName.includes('windows')) return 'rgba(99, 102, 241, 0.15)';
  if (lowerName.includes('ubuntu') || lowerName.includes('linux')) return 'rgba(249, 115, 22, 0.15)';
  if (lowerName.includes('pi') || lowerName.includes('raspberry')) return 'rgba(236, 72, 153, 0.15)';
  if (lowerName.includes('router')) return 'rgba(245, 158, 11, 0.15)';
  if (lowerName.includes('nas')) return 'rgba(6, 182, 212, 0.15)';
  return 'rgba(19, 164, 236, 0.15)';
};
