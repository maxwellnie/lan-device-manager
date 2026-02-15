@echo off
REM 设置日志立即刷新
set RUST_LOG=info
set RUST_BACKTRACE=1
set RUST_LOG_STYLE=always

REM 使用无缓冲输出运行应用
lan-device-manager.exe 2>&1
