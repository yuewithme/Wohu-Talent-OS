param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $RerankArgs
)

$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$CliPath = Join-Path $ScriptRoot "rerank-candidates-by-job-table.py"

if (-not (Test-Path -LiteralPath $CliPath)) {
  throw "Rerank helper not found: $CliPath"
}

& python $CliPath @RerankArgs
exit $LASTEXITCODE
