param(
  [int]$Port = 3000,
  [string]$Start = "node server.js",
  [string]$Health = "http://localhost:3000/healthz",
  [int]$TimeoutSec = 60,
  [string]$LogDir = "logs"
)

$ErrorActionPreference = "Stop"
$deadline = (Get-Date).AddSeconds($TimeoutSec)

function Write-Info { param($m) Write-Host "ℹ️  $m" -ForegroundColor Cyan }
function Write-OK { param($m) Write-Host "✅ $m" -ForegroundColor Green }
function Write-Warn { param($m) Write-Host "⚠️  $m" -ForegroundColor Yellow }
function Write-Err { param($m) Write-Host "❌ $m" -ForegroundColor Red }

function Get-PIDs-ByPort {
  param([int]$p)
  try {
    $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique
    return $conns
  } catch {
    $lines = netstat -ano | findstr ":$p" | findstr LISTENING
    if (-not $lines) { return @() }
    $pids = @()
    foreach ($ln in $lines) {
      $parts = ($ln -split '\s+') | Where-Object { $_ -ne "" }
      $pid = $parts[-1]
      if ($pid -match '^\d+$') { $pids += [int]$pid }
    }
    return $pids | Select-Object -Unique
  }
}

function Kill-PID {
  param([int]$pid)
  try {
    Stop-Process -Id $pid -Force -ErrorAction Stop
    return $true
  } catch {
    Write-Warn "Stop-Process 실패(PID=$pid). taskkill로 재시도"
    Start-Process -FilePath "taskkill.exe" -ArgumentList "/PID $pid /F" -NoNewWindow -Wait
    return $true
  }
}

function Wait-Port-Free {
  param([int]$p)
  while ((Get-Date) -lt $deadline) {
    $pids = Get-PIDs-ByPort -p $p
    if ($pids.Count -eq 0) { return $true }
    Start-Sleep -Milliseconds 300
  }
  return $false
}

function Test-Health {
  param([string]$url)
  try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -Method GET -TimeoutSec 5
    return $resp.StatusCode -eq 200
  } catch { return $false }
}

# 로그 디렉터리 준비
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$stamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
$logPath = Join-Path $LogDir "server-$stamp.log"

Write-Info "포트 $Port 점유 프로세스 조회…"
$pids = Get-PIDs-ByPort -p $Port
if ($pids.Count -gt 0) {
  Write-Info ("종료 대상 PID: " + ($pids -join ", "))
  foreach ($pid in $pids) { Kill-PID -pid $pid | Out-Null }
  if (-not (Wait-Port-Free -p $Port)) {
    Write-Err "포트 $Port 해제가 제한 시간 내에 완료되지 않았습니다."
    exit 2
  }
  Write-OK "포트 $Port 해제 완료"
} else {
  Write-Info "포트 $Port 점유 프로세스 없음"
}

# 서버 기동
Write-Info "서버 시작: $Start"
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "cmd.exe"
$psi.Arguments = "/c $Start"
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
$null = $proc.Start()

# 헬스체크 대기
Write-Info "헬스체크 대기: $Health"
while ((Get-Date) -lt $deadline) {
  if (Test-Health -url $Health) { 
    Write-OK "서버 기동 확인(healthz 200)"
    break 
  }
  Start-Sleep -Milliseconds 400
}

if (-not (Test-Health -url $Health)) {
  Write-Err "서버 헬스체크 실패"
  exit 3
}

Write-OK "재시작 완료"
