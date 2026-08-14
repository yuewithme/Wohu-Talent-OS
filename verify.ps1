param(
  [switch]$SkipExternal,
  [switch]$SkipBossPatch
)

$ErrorActionPreference = "Stop"
$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$CodexTarget = Join-Path $HOME ".codex\skills"
$AgentsTarget = Join-Path $HOME ".agents\skills"
$Failures = New-Object System.Collections.Generic.List[string]

function Pass([string]$Message) { Write-Host "[PASS] $Message" }
function Warn([string]$Message) { Write-Host "[WARN] $Message" }
function Fail([string]$Message) { Write-Host "[FAIL] $Message"; $Failures.Add($Message) | Out-Null }

function Check-Directory([string]$Path, [string]$Label) {
  if (Test-Path -LiteralPath $Path) { Pass $Label } else { Fail "$Label missing: $Path" }
}

Check-Directory (Join-Path $CodexTarget "hr-recruiting-orchestrator") "hr-recruiting-orchestrator installed"
Check-Directory (Join-Path $CodexTarget "opencli-boss-locked") "opencli-boss-locked installed"
Check-Directory (Join-Path $CodexTarget "pdf") "pdf skill installed"
Check-Directory (Join-Path $CodexTarget "kimi-webbridge") "kimi-webbridge skill installed"
Check-Directory (Join-Path $CodexTarget "job-description-writer") "job-description-writer installed"
Check-Directory (Join-Path $CodexTarget "interview-kit-builder") "interview-kit-builder installed"
Check-Directory (Join-Path $AgentsTarget "lark-base") "lark-base installed"
Check-Directory (Join-Path $AgentsTarget "lark-doc") "lark-doc installed"
Check-Directory (Join-Path $AgentsTarget "lark-drive") "lark-drive installed"
Check-Directory (Join-Path $AgentsTarget "lark-shared") "lark-shared installed"

if (-not $SkipExternal) {
  foreach ($commandName in @("opencli", "lark-cli")) {
    $command = Get-Command $commandName -ErrorAction SilentlyContinue
    if ($command) {
      Pass "$commandName command available"
    }
    else {
      Warn "$commandName not found in PATH"
    }
  }

  $kimiCommand = Get-Command "kimi-webbridge" -ErrorAction SilentlyContinue
  $kimiDefault = Join-Path $HOME ".kimi-webbridge\bin\kimi-webbridge.exe"
  if ($kimiCommand -or (Test-Path -LiteralPath $kimiDefault)) {
    Pass "kimi-webbridge command or default binary available"
  }
  else {
    Warn "kimi-webbridge not found in PATH or default install path"
  }
}

$PatchScript = Join-Path $CodexTarget "opencli-boss-locked\scripts\patch-boss-adapter-navigation.ps1"
if (-not $SkipBossPatch -and (Test-Path -LiteralPath $PatchScript)) {
  $result = & powershell -ExecutionPolicy Bypass -File $PatchScript -Check 2>&1
  if ($LASTEXITCODE -eq 0) {
    Pass "BOSS adapter navigation patch check"
  }
  else {
    Warn ('BOSS patch check did not pass yet. Run: powershell -ExecutionPolicy Bypass -File "' + $PatchScript + '"')
    Write-Host $result
  }
}

$HrTest = Join-Path $CodexTarget "hr-recruiting-orchestrator\scripts\test-hr-recruiting-orchestrator.ps1"
if (Test-Path -LiteralPath $HrTest) {
  $args = @("-ExecutionPolicy", "Bypass", "-File", $HrTest, "-SkipBaseCheck")
  if ($SkipExternal) { $args += "-SkipCommandChecks" }
  $result = & powershell @args 2>&1
  if ($LASTEXITCODE -eq 0) {
    Pass "hr-recruiting-orchestrator self-test"
  }
  else {
    Fail "hr-recruiting-orchestrator self-test failed"
    Write-Host $result
  }
}

if ($Failures.Count -gt 0) {
  throw "Verify failed with $($Failures.Count) failure(s)."
}

Write-Host ""
Write-Host "Verify complete."
