param(
  [switch]$SkipLarkSkills,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$CodexSource = Join-Path $PackageRoot "skills\codex"
$AgentsSource = Join-Path $PackageRoot "skills\agents"
$CodexTarget = Join-Path $HOME ".codex\skills"
$AgentsTarget = Join-Path $HOME ".agents\skills"

function Copy-SkillGroup {
  param(
    [string]$SourceRoot,
    [string]$TargetRoot,
    [string]$Label
  )

  if (-not (Test-Path -LiteralPath $SourceRoot)) {
    Write-Host ("Skip {0}: source not found {1}" -f $Label, $SourceRoot)
    return
  }

  New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null
  Get-ChildItem -Directory -LiteralPath $SourceRoot | ForEach-Object {
    $target = Join-Path $TargetRoot $_.Name
    if ((Test-Path -LiteralPath $target) -and -not $Force) {
      $backup = "$target.backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
      Move-Item -LiteralPath $target -Destination $backup
      Write-Host "Backed up existing $Label skill: $backup"
    }
    elseif (Test-Path -LiteralPath $target) {
      Remove-Item -LiteralPath $target -Recurse -Force
    }

    Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse -Force
    Write-Host "Installed $Label skill: $($_.Name)"
  }
}

Copy-SkillGroup -SourceRoot $CodexSource -TargetRoot $CodexTarget -Label "Codex"

if (-not $SkipLarkSkills) {
  Copy-SkillGroup -SourceRoot $AgentsSource -TargetRoot $AgentsTarget -Label "Agents/Lark"
}

Write-Host ""
Write-Host "Install complete. Run:"
Write-Host ('powershell -ExecutionPolicy Bypass -File "' + $PackageRoot + '\verify.ps1"')
