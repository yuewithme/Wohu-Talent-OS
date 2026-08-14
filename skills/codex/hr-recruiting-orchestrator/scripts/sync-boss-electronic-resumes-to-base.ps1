param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $SyncArgs
)

$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$CliPath = Join-Path $ScriptRoot "sync-boss-electronic-resumes-to-base.mjs"

if (-not (Test-Path -LiteralPath $CliPath)) {
  throw "Sync helper not found: $CliPath"
}

& node $CliPath @SyncArgs
exit $LASTEXITCODE
