param(
  [string] $SkillPath = (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)),
  [string] $BaseToken,
  [string] $TableId,
  [string] $RecordId,
  [switch] $SkipBaseCheck,
  [switch] $SkipCommandChecks,
  [switch] $SkipBossPatch,
  [switch] $RunBossSmoke
)

$ErrorActionPreference = "Stop"

$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Name,
    [Parameter(Mandatory = $true)]
    [string] $Status,
    [string] $Details = ""
  )

  $script:results.Add([pscustomobject]@{
    name = $Name
    status = $Status
    details = $Details
  }) | Out-Null
}

function Run-Capture {
  param(
    [Parameter(Mandatory = $true)]
    [string] $FilePath,
    [string[]] $Arguments = @()
  )

  $output = & $FilePath @Arguments 2>&1
  [pscustomobject]@{
    exitCode = $LASTEXITCODE
    output = ($output -join [Environment]::NewLine)
  }
}

function Run-Native {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Command,
    [string[]] $Arguments = @()
  )

  $output = & $Command @Arguments 2>&1
  [pscustomobject]@{
    exitCode = $LASTEXITCODE
    output = ($output -join [Environment]::NewLine)
  }
}

function Assert-Contains {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Text,
    [Parameter(Mandatory = $true)]
    [string] $Pattern,
    [Parameter(Mandatory = $true)]
    [string] $Label
  )

  if ($Text -notmatch $Pattern) {
    throw "$Label missing pattern: $Pattern"
  }
}

function New-UnicodeString {
  param([int[]] $CodePoints)
  return (-join ($CodePoints | ForEach-Object { [char] $_ }))
}

$fieldNameName = New-UnicodeString @(22995, 21517)
$fieldScore = New-UnicodeString @(23703, 20301, 21305, 37197, 35780, 20998)
$fieldComment = New-UnicodeString @(23703, 20301, 21305, 37197, 28857, 35780)
$fieldInterviewPlan = New-UnicodeString @(19987, 23646, 38754, 35797, 38382, 39064, 34920)
$fieldInterviewPlanLink = New-UnicodeString @(19987, 23646, 38754, 35797, 38382, 39064, 34920, 38142, 25509)
$resumeElectronic = New-UnicodeString @(30005, 23376, 31616, 21382)
$resumeAttachment = New-UnicodeString @(38468, 20214, 31616, 21382)
$fieldElectronicName = New-UnicodeString @(30005, 23376, 31616, 21382, 22995, 21517)
$fieldAttachmentText = New-UnicodeString @(38468, 20214, 31616, 21382, 25991, 26412)

$requiredFiles = @(
  "SKILL.md",
  "agents\openai.yaml",
  "references\workflow.md",
  "references\base-schema.md",
  "references\boss-rules.md",
  "references\kimi-boss-adapter.md",
  "references\kimi-boss-benchmark.md",
  "references\scoring-rubric.md",
  "references\interview-plan.md",
  "scripts\README.md",
  "scripts\kimi-boss.ps1",
  "scripts\test-kimi-boss-adapter.ps1",
  "scripts\ensure-recruiting-base-schema.ps1",
  "scripts\ensure-recruiting-base-schema.mjs",
  "scripts\sync-boss-electronic-resumes-to-base.ps1",
  "scripts\sync-boss-electronic-resumes-to-base.mjs"
)

try {
  foreach ($relative in $requiredFiles) {
    $path = Join-Path $SkillPath $relative
    if (-not (Test-Path -LiteralPath $path)) {
      throw "Missing required file: $relative"
    }
  }
  Add-Result "required-files" "pass" "$($requiredFiles.Count) files present"
}
catch {
  Add-Result "required-files" "fail" $_.Exception.Message
}

try {
  $validator = Join-Path $HOME ".codex\skills\.system\skill-creator\scripts\quick_validate.py"
  $python = Get-Command python -ErrorAction Stop
  $env:PYTHONUTF8 = "1"
  $output = & $python.Source $validator $SkillPath 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ($output -join [Environment]::NewLine)
  }
  Add-Result "skill-quick-validate" "pass" ($output -join [Environment]::NewLine)
}
catch {
  Add-Result "skill-quick-validate" "fail" $_.Exception.Message
}

try {
  $skill = [System.IO.File]::ReadAllText((Join-Path $SkillPath "SKILL.md"), [System.Text.Encoding]::UTF8)
  foreach ($reference in @("workflow.md", "base-schema.md", "boss-rules.md", "kimi-boss-adapter.md", "kimi-boss-benchmark.md", "scoring-rubric.md", "interview-plan.md")) {
    Assert-Contains $skill ([regex]::Escape("references/$reference")) "SKILL.md"
  }
  foreach ($pattern in @(
      "opencli-boss-locked",
      "send.*greet.*batchgreet.*invite.*mark.*exchange|send.*greet.*batchgreet.*invite.*mark|BOSS write actions",
      "Feishu Base",
      "MOBILE_ONLY",
      "kimi-webbridge",
      "scripts/kimi-boss.ps1",
      $resumeElectronic,
      $resumeAttachment,
      "PDF",
      "Resume attachment rules"
    )) {
    Assert-Contains $skill $pattern "SKILL.md"
  }
  Add-Result "skill-content-rules" "pass" "routing and safety rules present"
}
catch {
  Add-Result "skill-content-rules" "fail" $_.Exception.Message
}

try {
  $bossRules = [System.IO.File]::ReadAllText((Join-Path $SkillPath "references\boss-rules.md"), [System.Text.Encoding]::UTF8)
  foreach ($pattern in @(
      "patch-boss-adapter-navigation\.ps1",
      "ADAPTER_LOAD",
      "Invalid or unexpected token",
      "node --check",
      "kimi-webbridge",
      "kimi-boss.ps1",
      "observation",
      "Batch candidate collection",
      "unbind",
      "send",
      "greet",
      "batchgreet",
      "invite",
      "mark",
      "exchange"
    )) {
    Assert-Contains $bossRules $pattern "boss-rules.md"
  }
  Add-Result "boss-reference-rules" "pass" "BOSS preflight and side-effect rules present"
}
catch {
  Add-Result "boss-reference-rules" "fail" $_.Exception.Message
}

try {
  $adapterRef = [System.IO.File]::ReadAllText((Join-Path $SkillPath "references\kimi-boss-adapter.md"), [System.Text.Encoding]::UTF8)
  foreach ($pattern in @(
      "chatlist",
      "chatmsg",
      "resume",
      "recommend",
      "joblist",
      "stats",
      "label-list",
      "send",
      "greet",
      "batchgreet",
      "invite",
      "mark",
      "exchange",
      "stable=true",
      "test-kimi-boss-adapter\.ps1"
    )) {
    Assert-Contains $adapterRef $pattern "kimi-boss-adapter.md"
  }
  Add-Result "kimi-boss-adapter-reference" "pass" "adapter commands and tests documented"
}
catch {
  Add-Result "kimi-boss-adapter-reference" "fail" $_.Exception.Message
}

try {
  $scoring = [System.IO.File]::ReadAllText((Join-Path $SkillPath "references\scoring-rubric.md"), [System.Text.Encoding]::UTF8)
  foreach ($pattern in @("100-point", "role-specific", "85-100", "75-84", "Parameterization checklist")) {
    Assert-Contains $scoring $pattern "scoring-rubric.md"
  }
  Add-Result "scoring-reference-rules" "pass" "parameterized score bands present"
}
catch {
  Add-Result "scoring-reference-rules" "fail" $_.Exception.Message
}

if ($SkipCommandChecks) {
  Add-Result "lark-cli-version" "skip" "SkipCommandChecks provided"
}
else {
  try {
    $lark = Run-Native -Command "lark-cli" -Arguments @("--version")
    if ($lark.exitCode -ne 0) {
      throw $lark.output
    }
    Add-Result "lark-cli-version" "pass" $lark.output
  }
  catch {
    Add-Result "lark-cli-version" "fail" $_.Exception.Message
  }
}

if ($SkipCommandChecks) {
  Add-Result "kimi-webbridge-status" "skip" "SkipCommandChecks provided"
}
else {
  try {
    $kimiPath = Join-Path $HOME ".kimi-webbridge\bin\kimi-webbridge.exe"
    if (-not (Test-Path -LiteralPath $kimiPath)) {
      throw "kimi-webbridge.exe not found at $kimiPath"
    }
    $kimi = Run-Native -Command $kimiPath -Arguments @("status")
    if ($kimi.exitCode -ne 0) {
      throw $kimi.output
    }
    Assert-Contains $kimi.output '"running"\s*:\s*true' "kimi-webbridge status"
    Assert-Contains $kimi.output '"extension_connected"\s*:\s*true' "kimi-webbridge status"
    Add-Result "kimi-webbridge-status" "pass" $kimi.output
  }
  catch {
    Add-Result "kimi-webbridge-status" "fail" $_.Exception.Message
  }
}

if ($SkipCommandChecks) {
  Add-Result "opencli-version" "skip" "SkipCommandChecks provided"
}
else {
  try {
    $opencli = Run-Native -Command "opencli" -Arguments @("--version")
    if ($opencli.exitCode -ne 0) {
      throw $opencli.output
    }
    Add-Result "opencli-version" "pass" $opencli.output
  }
  catch {
    Add-Result "opencli-version" "fail" $_.Exception.Message
  }
}

if ($SkipCommandChecks) {
  Add-Result "pdf-python-dependencies" "skip" "SkipCommandChecks provided"
}
else {
  try {
    $pdfCheckCode = "import importlib.util,sys; missing=[m for m in ['pdfplumber','pypdf','reportlab'] if importlib.util.find_spec(m) is None]; print('missing=' + ','.join(missing)); sys.exit(1 if missing else 0)"
    $pdfDeps = Run-Native -Command "python" -Arguments @("-c", $pdfCheckCode)
    if ($pdfDeps.exitCode -ne 0) {
      throw $pdfDeps.output
    }
    Add-Result "pdf-python-dependencies" "pass" "pdfplumber, pypdf, reportlab available"
  }
  catch {
    Add-Result "pdf-python-dependencies" "fail" $_.Exception.Message
  }
}

if ($SkipBossPatch -or $SkipCommandChecks) {
  Add-Result "boss-navigation-patch" "skip" "SkipBossPatch or SkipCommandChecks provided"
}
else {
  try {
    $patchScript = Join-Path $HOME ".codex\skills\opencli-boss-locked\scripts\patch-boss-adapter-navigation.ps1"
    $patch = Run-Native -Command "powershell" -Arguments @("-ExecutionPolicy", "Bypass", "-File", $patchScript, "-Check")
    if ($patch.exitCode -ne 0) {
      throw $patch.output
    }
    Add-Result "boss-navigation-patch" "pass" $patch.output
  }
  catch {
    Add-Result "boss-navigation-patch" "fail" $_.Exception.Message
  }
}

if ($SkipCommandChecks) {
  Add-Result "boss-adapter-syntax" "skip" "SkipCommandChecks provided"
}
else {
  try {
    $bossDir = Join-Path $env:APPDATA "npm\node_modules\@jackwener\opencli\clis\boss"
    if (-not (Test-Path -LiteralPath $bossDir)) {
      throw "BOSS adapter directory not found: $bossDir"
    }
    $badFiles = New-Object System.Collections.Generic.List[string]
    Get-ChildItem -LiteralPath $bossDir -Filter "*.js" | Where-Object { $_.Name -notlike "*.test.js" } | ForEach-Object {
      $check = Run-Native -Command "node" -Arguments @("--check", $_.FullName)
      if ($check.exitCode -ne 0) {
        $badFiles.Add($_.Name) | Out-Null
      }
    }
    if ($badFiles.Count -gt 0) {
      throw "Syntax failed: $($badFiles -join ', ')"
    }
    Add-Result "boss-adapter-syntax" "pass" "all non-test boss adapter JS files passed node --check"
  }
  catch {
    Add-Result "boss-adapter-syntax" "fail" $_.Exception.Message
  }
}

try {
  $kimiAdapterDir = Join-Path $SkillPath "scripts\kimi-boss-adapter"
  if (-not (Test-Path -LiteralPath $kimiAdapterDir)) {
    throw "Kimi BOSS adapter directory not found: $kimiAdapterDir"
  }
  $badFiles = New-Object System.Collections.Generic.List[string]
  Get-ChildItem -LiteralPath $kimiAdapterDir -Filter "*.mjs" | ForEach-Object {
    $check = Run-Native -Command "node" -Arguments @("--check", $_.FullName)
    if ($check.exitCode -ne 0) {
      $badFiles.Add($_.Name) | Out-Null
    }
  }
  if ($badFiles.Count -gt 0) {
    throw "Syntax failed: $($badFiles -join ', ')"
  }
  Add-Result "kimi-boss-adapter-syntax" "pass" "all Kimi adapter modules passed node --check"
}
catch {
  Add-Result "kimi-boss-adapter-syntax" "fail" $_.Exception.Message
}

if ($SkipCommandChecks) {
  Add-Result "boss-tab-list" "skip" "SkipCommandChecks provided"
}
else {
  try {
    $tabList = Run-Native -Command "opencli" -Arguments @("browser", "site:boss", "tab", "list")
    if ($tabList.exitCode -ne 0) {
      throw $tabList.output
    }
    $text = $tabList.output.Trim()
    if ($text -notmatch "(\[|\{)") {
      throw "tab list did not contain JSON"
    }
    Add-Result "boss-tab-list" "pass" $text
  }
  catch {
    Add-Result "boss-tab-list" "fail" $_.Exception.Message
  }
}

if ($SkipBaseCheck) {
  Add-Result "base-field-list-readonly" "skip" "SkipBaseCheck provided"
}
elseif ($BaseToken -and $TableId) {
  try {
    $fieldList = Run-Native -Command "lark-cli" -Arguments @("base", "+field-list", "--base-token", $BaseToken, "--table-id", $TableId, "--limit", "100", "--as", "user")
    if ($fieldList.exitCode -ne 0) {
      throw $fieldList.output
    }
    foreach ($fieldName in @($fieldScore, $fieldComment, $fieldInterviewPlanLink, $fieldInterviewPlan, $fieldElectronicName, $fieldAttachmentText)) {
      Assert-Contains $fieldList.output ([regex]::Escape($fieldName)) "field-list"
    }
    Add-Result "base-field-list-readonly" "pass" "required recruiting fields present"
  }
  catch {
    Add-Result "base-field-list-readonly" "fail" $_.Exception.Message
  }
}
else {
  Add-Result "base-field-list-readonly" "skip" "BaseToken/TableId not provided"
}

if ($SkipBaseCheck) {
  Add-Result "base-record-readonly" "skip" "SkipBaseCheck provided"
}
elseif ($BaseToken -and $TableId -and $RecordId) {
  try {
    $record = Run-Native -Command "lark-cli" -Arguments @(
      "base", "+record-get",
      "--base-token", $BaseToken,
      "--table-id", $TableId,
      "--record-id", $RecordId,
      "--field-id", $fieldNameName,
      "--field-id", $fieldScore,
      "--field-id", $fieldComment,
      "--field-id", $fieldInterviewPlanLink,
      "--format", "json",
      "--as", "user"
    )
    if ($record.exitCode -ne 0) {
      throw $record.output
    }
    foreach ($pattern in @($fieldNameName, $fieldScore, $fieldInterviewPlanLink)) {
      Assert-Contains $record.output $pattern "record-get"
    }
    Add-Result "base-record-readonly" "pass" "projected candidate record read succeeded"
  }
  catch {
    Add-Result "base-record-readonly" "fail" $_.Exception.Message
  }
}
else {
  Add-Result "base-record-readonly" "skip" "BaseToken/TableId/RecordId not provided"
}

if ($RunBossSmoke) {
  try {
    $wrapper = Join-Path $HOME ".codex\skills\opencli-boss-locked\scripts\opencli-boss-locked.ps1"
    $smoke = Run-Native -Command "powershell" -Arguments @("-ExecutionPolicy", "Bypass", "-File", $wrapper, "chatlist", "--limit", "1", "-f", "json")
    if ($smoke.exitCode -ne 0) {
      throw $smoke.output
    }
    Assert-Contains $smoke.output "\[|\{" "boss smoke"
    Add-Result "boss-readonly-smoke" "pass" "chatlist limit 1 succeeded through locked wrapper"
  }
  catch {
    Add-Result "boss-readonly-smoke" "fail" $_.Exception.Message
  }
}
else {
  Add-Result "boss-readonly-smoke" "skip" "RunBossSmoke not provided"
}

$failed = @($results | Where-Object { $_.status -eq "fail" })
$results | ConvertTo-Json -Depth 5

if ($failed.Count -gt 0) {
  exit 1
}

exit 0
