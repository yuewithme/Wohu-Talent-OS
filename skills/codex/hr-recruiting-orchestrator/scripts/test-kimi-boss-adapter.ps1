param(
  [switch] $SkipLive,
  [switch] $RequireCandidate
)

$ErrorActionPreference = "Stop"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Adapter = Join-Path $ScriptRoot "kimi-boss.ps1"
$Results = New-Object System.Collections.Generic.List[object]

function New-UnicodeString {
  param([int[]] $CodePoints)
  return (-join ($CodePoints | ForEach-Object { [char] $_ }))
}

$fieldElectronicResumeName = New-UnicodeString @(30005, 23376, 31616, 21382, 22995, 21517)
$fieldElectronicResumeProject = New-UnicodeString @(30005, 23376, 31616, 21382, 39033, 30446, 32463, 21382)
$fieldAttachmentResumeText = New-UnicodeString @(38468, 20214, 31616, 21382, 25991, 26412)
$testMessage = New-UnicodeString @(27979, 35797, 28040, 24687)
$testGreeting = New-UnicodeString @(27979, 35797, 25307, 21628)

function Add-Result([string] $Name, [string] $Status, [string] $Details) {
  $Results.Add([pscustomobject]@{
    name = $Name
    status = $Status
    details = $Details
  }) | Out-Null
}

function Invoke-Adapter([string[]] $CommandArgs) {
  $raw = & powershell -ExecutionPolicy Bypass -File $Adapter @CommandArgs -f object 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ($raw -join "`n")
  }
  return ($raw | ConvertFrom-Json)
}

function Assert-Stable($Result, [string] $Name) {
  if ($Result.stable -ne $true) {
    throw "$Name changed BOSS page timeOrigin"
  }
}

if (-not (Test-Path -LiteralPath $Adapter)) {
  Add-Result "adapter-file" "fail" "Missing: $Adapter"
}
else {
  Add-Result "adapter-file" "pass" $Adapter
}

$moduleDir = Join-Path $ScriptRoot "kimi-boss-adapter"
foreach ($file in @(
    "cli.mjs",
    "kimi-client.mjs",
    "boss-page-script.mjs",
    "boss-page-core.mjs",
    "boss-page-read-commands.mjs",
    "boss-page-write-commands.mjs",
    "boss-page-router.mjs"
  )) {
  $path = Join-Path $moduleDir $file
  if (Test-Path -LiteralPath $path) {
    Add-Result "module-$file" "pass" "present"
  }
  else {
    Add-Result "module-$file" "fail" "missing"
  }
}

foreach ($file in Get-ChildItem -LiteralPath $moduleDir -Filter "*.mjs" -File) {
  $check = & node --check $file.FullName 2>&1
  if ($LASTEXITCODE -eq 0) {
    Add-Result "syntax-$($file.Name)" "pass" "node --check"
  }
  else {
    Add-Result "syntax-$($file.Name)" "fail" ($check -join "`n")
  }
}

if (-not $SkipLive) {
  try {
    $status = Invoke-Adapter @("status")
    Assert-Stable $status "status"
    Add-Result "live-status" "pass" "url=$($status.rows[0].url)"
  }
  catch {
    Add-Result "live-status" "fail" $_.Exception.Message
  }

  $uid = ""
  try {
    $chatlist = Invoke-Adapter @("chatlist", "--limit", "1")
    Assert-Stable $chatlist "chatlist"
    $uid = [string] $chatlist.rows[0].uid
    $hasUid = -not [string]::IsNullOrWhiteSpace($uid)
    if (-not $hasUid -and $RequireCandidate) {
      throw "chatlist returned no candidate uid"
    }
    Add-Result "live-chatlist" "pass" "rows=$($chatlist.rows.Count); hasUid=$hasUid"
  }
  catch {
    Add-Result "live-chatlist" "fail" $_.Exception.Message
  }

  foreach ($command in @("recommend", "joblist", "stats", "label-list")) {
    try {
      $result = if ($command -eq "recommend") {
        Invoke-Adapter @($command, "--limit", "1")
      }
      else {
        Invoke-Adapter @($command)
      }
      Assert-Stable $result $command
      Add-Result "live-$command" "pass" "rows=$($result.rows.Count)"
    }
    catch {
      Add-Result "live-$command" "fail" $_.Exception.Message
    }
  }

  if (-not [string]::IsNullOrWhiteSpace($uid)) {
    foreach ($commandArgs in @(
        @("chatmsg", $uid, "--page", "1"),
        @("resume", $uid),
        @("send", $uid, $testMessage),
        @("greet", $uid, "--text", $testGreeting),
        @("batchgreet", "--limit", "1", "--text", $testGreeting),
        @("mark", $uid, "11"),
        @("exchange", $uid, "--type", "phone"),
        @("invite", $uid, "--time", "2026-06-01 14:00")
      )) {
      $name = $commandArgs[0]
      try {
        $result = Invoke-Adapter $commandArgs
        Assert-Stable $result $name
        $dryRun = [bool] $result.dryRun
        if ($name -eq "resume") {
          $resumeRow = $result.rows[0]
          if (-not ($resumeRow.PSObject.Properties.Name -contains $fieldElectronicResumeName)) {
            throw "resume output missing $fieldElectronicResumeName"
          }
          if (-not ($resumeRow.PSObject.Properties.Name -contains $fieldElectronicResumeProject)) {
            throw "resume output missing $fieldElectronicResumeProject"
          }
          if ([string]::IsNullOrWhiteSpace([string]$resumeRow.$fieldElectronicResumeProject)) {
            throw "resume output has blank $fieldElectronicResumeProject"
          }
          if ($resumeRow.PSObject.Properties.Name -contains $fieldAttachmentResumeText) {
            throw "resume output mixed attachment resume fields"
          }
        }
        Add-Result "live-$name" "pass" "rows=$($result.rows.Count); dryRun=$dryRun"
      }
      catch {
        Add-Result "live-$name" "fail" $_.Exception.Message
      }
    }
  }
  elseif ($RequireCandidate) {
    Add-Result "live-candidate-dependent" "fail" "No candidate uid available"
  }
  else {
    Add-Result "live-candidate-dependent" "skip" "No candidate uid available"
  }
}
else {
  Add-Result "live-tests" "skip" "SkipLive provided"
}

$failures = @($Results | Where-Object { $_.status -eq "fail" })
$Results | ConvertTo-Json -Depth 5
if ($failures.Count -gt 0) {
  exit 1
}
