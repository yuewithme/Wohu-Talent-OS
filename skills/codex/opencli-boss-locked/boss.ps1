param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $BossArgs
)

$ErrorActionPreference = "Stop"

function Fail($message) {
  Write-Host $message -ForegroundColor Red
  exit 1
}

if ($BossArgs.Count -eq 0) {
  Fail "Usage: powershell -ExecutionPolicy Bypass -File .\boss.ps1 <boss-command> [args...]"
}

$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$installedWrapper = Join-Path $HOME ".codex\skills\opencli-boss-locked\scripts\opencli-boss-locked.ps1"
$bundledWrapper = Join-Path $packageRoot "skill\scripts\opencli-boss-locked.ps1"

if (Test-Path -LiteralPath $installedWrapper) {
  $wrapper = $installedWrapper
}
elseif (Test-Path -LiteralPath $bundledWrapper) {
  $wrapper = $bundledWrapper
}
else {
  Fail "Locked wrapper was not found. Run install.ps1 first, or check skill\scripts\opencli-boss-locked.ps1."
}

& $wrapper @BossArgs
exit $LASTEXITCODE
