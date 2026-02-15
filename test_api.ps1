# LanDevice Manager API 测试脚本

$baseUrl = "http://localhost:8080"

Write-Host "=== LanDevice Manager API 测试 ===" -ForegroundColor Cyan
Write-Host ""

# 1. 健康检查
Write-Host "1. 测试健康检查..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/health" -Method GET
    Write-Host "   健康检查成功: $($response | ConvertTo-Json)" -ForegroundColor Green
} catch {
    Write-Host "   健康检查失败: $_" -ForegroundColor Red
}
Write-Host ""

# 2. 获取认证挑战
Write-Host "2. 测试获取认证挑战..." -ForegroundColor Yellow
try {
    $challengeResponse = Invoke-