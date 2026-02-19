# LanDevice Manager (Beta)

A cross-platform local area network device management application built with Tauri, React, and Rust.

## Overview

LanDevice Manager is a powerful tool for managing devices on your local network. It provides device discovery, remote command execution, and network monitoring capabilities with a modern, beautiful user interface.

### Supported Platforms

- **Windows**: x64, x86, ARM
- **Android**: ARM, x64, x86 

## Features

- 📱 **Network Device Discovery**: Automatically discover devices on your local network using mDNS
- 🔐 **Secure Authentication**: Password protection for API access
- 💻 **Remote Command Execution**: Execute commands on remote devices securely
- 📊 **Real-time Monitoring**: Live logs and system performance monitoring
- 🎨 **Multiple Themes**: Light, Dark, System, and Glass (Mica) themes
- 🔄 **Auto-start**: Automatic API server startup on boot
- 🛡️ **IP Blacklist**: Block unwanted IP addresses
- 📝 **Command Whitelist**: Restrict allowed commands for security
- 📱 **Tray Integration**: Minimize to system tray for background operation

## Installation

### Prerequisites

#### For Development

- **Rust**: Latest stable version
- **Node.js**: 18.x or higher
- **Tauri CLI**: Latest version

### Development Setup

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd lan-device-manager
   ```

2. **Install dependencies**

   ```bash
   cd lan-windows
   npm install
   ```

3. **Run in development mode**

   ```bash
   npm run tauri dev
   ```

### Building from Source

#### Windows

```bash
cd lan-windows
npm run tauri build
```

#### Android

```bash
cd lan-android
npm run tauri android build
```

## Usage

### Getting Started

1. **Launch the application**
2. **Configure settings**:
   - Set API port (default: 8080)
   - Set access password (optional but recommended)
   - Configure auto-start options
3. **Start the API server**
4. **Discover devices** on your network

### Configuration

The application supports the following configuration options:

- **API Port**: Port number for the REST API
- **Access Password**: Password for API authentication
- **Auto-start API**: Automatically start API server on app launch
- **Auto-start on Boot**: Launch application with system startup
- **Theme**: Choose from Light, Dark, System, or Glass themes
- **Command Whitelist**: List of allowed commands
- **IP Blacklist**: List of blocked IP addresses

### API Endpoints

The REST API provides the following endpoints:

- `GET /api/status`: Get server status
- `POST /api/start`: Start server
- `POST /api/stop`: Stop server
- `POST /api/execute`: Execute a command
- `GET /api/logs`: Get application logs
- `GET /api/config`: Get configuration
- `POST /api/config`: Update configuration

## Project Structure

```
lan-device-manager/
├── lan-windows/          # Windows desktop application
│   ├── src/              # React frontend source
│   ├── src-tauri/        # Rust backend source
│   └── package.json
└── lan-android/          # Android mobile application
    ├── src/              # React frontend source
    ├── src-tauri/        # Rust backend source
    └── package.json
```

## Technology Stack

### Frontend
- **React 19**: Modern UI framework
- **TypeScript**: Type-safe development
- **Vite**: Fast build tool
- **Tauri**: Desktop/mobile app framework

### Backend
- **Rust**: High-performance systems programming
- **Tokio**: Async runtime
- **Tauri**: App framework
- **mDNS**: Network discovery protocol

## Contributing

We welcome contributions to LanDevice Manager! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add some amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Development Guidelines

- Follow Rust and TypeScript best practices
- Write clear, concise commit messages
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Tauri](https://tauri.app/) - The app framework that made this possible
- [React](https://react.dev/) - The UI library
- [Rust](https://www.rust-lang.org/) - The programming language
- [Stitch](https://stitch.withgoogle.com/) - Frontend design
- [Trae](https://www.trae.cn/) - VibeCoding IDE

## AI Statement

This project is 100% AI-coded.

## Support

If you encounter any issues or have questions, please open an issue on GitHub.

---

**Note**: This is a beta release. Some features may be incomplete or subject to change.
