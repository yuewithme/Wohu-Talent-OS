param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $BossArgs
)

$ErrorActionPreference = "Stop"

$session = "site:boss"
$mutexName = "Global\opencli-boss-locked-site-boss"

function Fail($message) {
  Write-Host $message -ForegroundColor Red
  exit 1
}

function Invoke-OpenCliCapture {
  param(
    [Parameter(Mandatory = $true)]
    [string[]] $Args
  )

  $output = & opencli @Args 2>&1
  $exitCode = $LASTEXITCODE

  [pscustomobject]@{
    Output = $output
    ExitCode = $exitCode
  }
}

function ConvertFrom-FirstJsonPayload {
  param(
    [Parameter(Mandatory = $true)]
    [object[]] $Output
  )

  $text = ($Output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
  $trimmed = $text.Trim()
  if (-not $trimmed) {
    throw "empty output"
  }

  $startCandidates = @()
  $arrayStart = $trimmed.IndexOf("[")
  $objectStart = $trimmed.IndexOf("{")
  if ($arrayStart -ge 0) {
    $startCandidates += $arrayStart
  }
  if ($objectStart -ge 0) {
    $startCandidates += $objectStart
  }
  if ($startCandidates.Count -eq 0) {
    throw "no JSON payload found"
  }

  $start = ($startCandidates | Measure-Object -Minimum).Minimum
  $jsonText = $trimmed.Substring($start)
  return $jsonText | ConvertFrom-Json
}

function Get-BoundTabs {
  $listResult = Invoke-OpenCliCapture -Args @("browser", $session, "tab", "list")
  if ($listResult.ExitCode -ne 0) {
    Fail "Could not inspect OpenCLI browser session '$session': $($listResult.Output)"
  }

  try {
    $tabs = ConvertFrom-FirstJsonPayload -Output $listResult.Output
  }
  catch {
    Fail "Could not parse tab list for '$session': $($listResult.Output)"
  }

  return @($tabs)
}

function Safe-UnbindSession {
  $unbindResult = Invoke-OpenCliCapture -Args @("browser", $session, "unbind")
  [pscustomobject]@{
    Success = ($unbindResult.ExitCode -eq 0)
    Message = ($unbindResult.Output -join [Environment]::NewLine)
  }
}

if (-not (Get-Command opencli -ErrorAction SilentlyContinue)) {
  Fail "opencli was not found on PATH."
}

if ($BossArgs.Count -eq 0) {
  Fail "Usage: .\scripts\opencli-boss-locked.ps1 <boss-command> [args...]"
}

for ($i = 0; $i -lt $BossArgs.Count; $i++) {
  $arg = $BossArgs[$i]
  if ($arg -eq "--site-session") {
    if (($i + 1) -ge $BossArgs.Count -or $BossArgs[$i + 1] -ne "persistent") {
      Fail "Refusing to run: this wrapper requires --site-session persistent."
    }
  }
  if ($arg -like "--site-session=*" -and $arg -ne "--site-session=persistent") {
    Fail "Refusing to run: this wrapper requires --site-session persistent."
  }
  if ($arg -eq "--keep-tab") {
    if (($i + 1) -ge $BossArgs.Count -or $BossArgs[$i + 1] -ne "true") {
      Fail "Refusing to run: this wrapper requires --keep-tab true."
    }
  }
  if ($arg -like "--keep-tab=*" -and $arg -ne "--keep-tab=true") {
    Fail "Refusing to run: this wrapper requires --keep-tab true."
  }
}

$tabList = Get-BoundTabs
if ($tabList.Count -eq 0) {
  $bindResult = Invoke-OpenCliCapture -Args @("browser", $session, "bind")
  if ($bindResult.ExitCode -ne 0) {
    Fail @"
No tab is bound to '$session', and automatic bind did not succeed. Refusing to run so OpenCLI cannot create a new BOSS tab.

Focus your existing BOSS zhipin.com tab, then retry this wrapper or run:
  opencli browser site:boss bind

Bind output:
$($bindResult.Output)
"@
  }

  $tabList = Get-BoundTabs
  if ($tabList.Count -eq 0) {
    Fail @"
Automatic bind completed but '$session' still has no tab. Refusing to run.

Focus your existing BOSS zhipin.com tab, then retry this wrapper or run:
  opencli browser site:boss bind
"@
  }
}

function TabUrl($tab) {
  if ($null -eq $tab -or $null -eq $tab.url) {
    return "<no url>"
  }
  return [string]$tab.url
}

$bossTabs = @($tabList | Where-Object {
  $url = TabUrl $_
  $url -match "^https?://([^/]+\.)?zhipin\.com(/|$)"
})

if ($bossTabs.Count -eq 0) {
  $urls = ($tabList | ForEach-Object { "  - " + (TabUrl $_) }) -join "`n"
  $unbindResult = Safe-UnbindSession
  if (-not $unbindResult.Success) {
    Write-Warning "Could not unbind '$session' after detecting a non-BOSS tab: $($unbindResult.Message)"
  }
  Fail @"
The '$session' session is bound, but not to a BOSS zhipin.com tab. Refusing to run.

Current bound tab(s):
$urls

Focus your existing BOSS tab and retry this wrapper, or run:
  opencli browser site:boss bind
"@
}

if ($bossTabs.Count -gt 1) {
  $urls = ($bossTabs | ForEach-Object { "  - " + (TabUrl $_) }) -join "`n"
  Fail @"
More than one BOSS tab is visible in '$session'. Refusing to run because the lock would be ambiguous.

$urls
"@
}

$finalArgs = @($BossArgs)
if (-not ($finalArgs -contains "--site-session") -and -not ($finalArgs | Where-Object { $_ -like "--site-session=*" })) {
  $finalArgs += @("--site-session", "persistent")
}
if (-not ($finalArgs -contains "--keep-tab") -and -not ($finalArgs | Where-Object { $_ -like "--keep-tab=*" })) {
  $finalArgs += @("--keep-tab", "true")
}

$mutex = New-Object System.Threading.Mutex($false, $mutexName)
$hasLock = $false
$commandExitCode = 1
$unbindWarning = $null
try {
  $hasLock = $mutex.WaitOne([TimeSpan]::FromMinutes(10))
  if (-not $hasLock) {
    Fail "Timed out waiting for the BOSS OpenCLI lock. Another BOSS command may still be running."
  }

  & opencli boss @finalArgs
  $commandExitCode = $LASTEXITCODE
}
finally {
  $unbindResult = Safe-UnbindSession
  if (-not $unbindResult.Success) {
    $unbindWarning = "Could not unbind '$session' after the BOSS command: $($unbindResult.Message)"
  }

  if ($hasLock) {
    $mutex.ReleaseMutex()
  }
  $mutex.Dispose()
}

if ($unbindWarning) {
  Write-Warning $unbindWarning
}

exit $commandExitCode
