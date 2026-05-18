# Sobe backend (daemon) + frontend a partir da raiz do repositório.
# Uso: .\scripts\dev\start-stack.ps1
#      .\scripts\dev\start-stack.ps1 -SkipInstall
#      .\scripts\dev\start-stack.ps1 -FrontendOnly

param(
  [switch]$SkipInstall,
  [switch]$NoRestartDaemon,
  [switch]$DaemonOnly,
  [switch]$FrontendOnly,
  [switch]$ForegroundDaemon
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repoRoot

$argsList = @("scripts/dev/start-stack.js")
if ($SkipInstall) { $argsList += "--skip-install" }
if ($NoRestartDaemon) { $argsList += "--no-restart-daemon" }
if ($DaemonOnly) { $argsList += "--daemon-only" }
if ($FrontendOnly) { $argsList += "--frontend-only" }
if ($ForegroundDaemon) { $argsList += "--foreground-daemon" }

& node @argsList
