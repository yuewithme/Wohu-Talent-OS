param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $AdapterArgs
)

$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$CliPath = Join-Path $ScriptRoot "kimi-boss-adapter\cli.mjs"

if (-not (Test-Path -LiteralPath $CliPath)) {
  throw "Kimi BOSS adapter entrypoint not found: $CliPath"
}

& node $CliPath @AdapterArgs
exit $LASTEXITCODE
