param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $SchemaArgs
)

$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$CliPath = Join-Path $ScriptRoot "ensure-recruiting-base-schema.mjs"

if (-not (Test-Path -LiteralPath $CliPath)) {
  throw "Schema helper not found: $CliPath"
}

& node $CliPath @SchemaArgs
exit $LASTEXITCODE
