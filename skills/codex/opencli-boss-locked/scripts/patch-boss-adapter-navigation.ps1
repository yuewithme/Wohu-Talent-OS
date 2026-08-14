param(
  [switch] $Check
)

$ErrorActionPreference = "Stop"

$utilsPath = Join-Path $env:APPDATA "npm\node_modules\@jackwener\opencli\clis\boss\utils.js"

function Fail($message) {
  Write-Host $message -ForegroundColor Red
  exit 1
}

function Read-TextFile($path) {
  return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}

function Write-TextFile($path, $content) {
  [System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))
}

function Test-NodeSyntax($path) {
  $output = & node --check $path 2>&1
  [pscustomobject]@{
    Success = ($LASTEXITCODE -eq 0)
    Output = ($output -join [Environment]::NewLine)
  }
}

if (-not (Test-Path -LiteralPath $utilsPath)) {
  Fail "Could not find OpenCLI Boss adapter utils.js at: $utilsPath"
}

function Test-NavigationPatch($content) {
  return $content -match "function\s+sameHost\s*\(\s*url\s*,\s*host\s*\)" `
    -and $content -match "function\s+samePath\s*\(\s*url\s*,\s*targetUrl\s*\)" `
    -and $content -match "async\s+function\s+currentUrl\s*\(\s*page\s*\)" `
    -and $content -match "const\s+url\s*=\s*await\s+currentUrl\s*\(\s*page\s*\)\s*;\s*if\s*\(\s*!\s*samePath\s*\(\s*url\s*,\s*CHAT_URL\s*\)\s*\)" `
    -and $content -match "const\s+current\s*=\s*await\s+currentUrl\s*\(\s*page\s*\)\s*;\s*if\s*\(\s*samePath\s*\(\s*current\s*,\s*url\s*\)\s*\)" `
    -and $content -match "sameHost\s*\(\s*current\s*,\s*BOSS_DOMAIN\s*\)"
}

$content = Read-TextFile $utilsPath
$syntax = Test-NodeSyntax $utilsPath
$hasPatch = Test-NavigationPatch $content

if ($Check) {
  if ($hasPatch -and $syntax.Success) {
    Write-Host "Boss adapter navigation patch is present."
    exit 0
  }
  if (-not $syntax.Success) {
    Fail "Boss adapter navigation patch is not healthy because utils.js has invalid JavaScript syntax.`n$($syntax.Output)"
  }
  Fail "Boss adapter navigation patch is missing."
}

if ($hasPatch) {
  if ($syntax.Success) {
    Write-Host "Boss adapter navigation patch is already present."
    exit 0
  }
  Fail "Boss adapter navigation patch markers are present, but utils.js has invalid JavaScript syntax.`n$($syntax.Output)"
}

$backupPath = "$utilsPath.bak-opencli-boss-locked-$(Get-Date -Format yyyyMMddHHmmss)"
Copy-Item -LiteralPath $utilsPath -Destination $backupPath -Force

if ($content -notmatch "async\s+function\s+currentUrl\s*\(\s*page\s*\)") {
  $helper = @'
const DEFAULT_TIMEOUT = 15_000;
function sameHost(url, host) {
    if (!url)
        return false;
    try {
        const parsed = new URL(url);
        return parsed.hostname === host || parsed.hostname.endsWith(`.${host}`);
    }
    catch {
        return false;
    }
}
function samePath(url, targetUrl) {
    if (!url)
        return false;
    try {
        const current = new URL(url);
        const target = new URL(targetUrl);
        return current.hostname === target.hostname && current.pathname === target.pathname;
    }
    catch {
        return false;
    }
}
async function currentUrl(page) {
    try {
        return await page.evaluate('window.location.href');
    }
    catch {
        return null;
    }
}
'@
  $content = [regex]::Replace(
    $content,
    "const\s+DEFAULT_TIMEOUT\s*=\s*15_000\s*;",
    [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $helper },
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )
}

$chatPattern = "export\s+async\s+function\s+navigateToChat\s*\(\s*page\s*,\s*waitSeconds\s*=\s*2\s*\)\s*\{\s*await\s+page\.goto\s*\(\s*CHAT_URL\s*\)\s*;\s*await\s+page\.wait\s*\(\s*\{\s*time:\s*waitSeconds\s*\}\s*\)\s*;\s*\}"
$chatReplacement = @'
export async function navigateToChat(page, waitSeconds = 2) {
    const url = await currentUrl(page);
    if (!samePath(url, CHAT_URL)) {
        await page.goto(CHAT_URL);
        await page.wait({ time: waitSeconds });
    }
}
'@
$content = [regex]::Replace(
  $content,
  $chatPattern,
  [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $chatReplacement },
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

$navigatePattern = "export\s+async\s+function\s+navigateTo\s*\(\s*page\s*,\s*url\s*,\s*waitSeconds\s*=\s*1\s*\)\s*\{\s*await\s+page\.goto\s*\(\s*url\s*\)\s*;\s*await\s+page\.wait\s*\(\s*\{\s*time:\s*waitSeconds\s*\}\s*\)\s*;\s*\}"
$navigateReplacement = @'
export async function navigateTo(page, url, waitSeconds = 1) {
    const current = await currentUrl(page);
    if (samePath(current, url)) {
        return;
    }
    if (url.startsWith(`https://${BOSS_DOMAIN}/`) && sameHost(current, BOSS_DOMAIN)) {
        return;
    }
    await page.goto(url);
    await page.wait({ time: waitSeconds });
}
'@
$content = [regex]::Replace(
  $content,
  $navigatePattern,
  [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $navigateReplacement },
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

if (-not (Test-NavigationPatch $content)) {
  Copy-Item -LiteralPath $backupPath -Destination $utilsPath -Force
  Fail "Could not apply Boss adapter navigation patch. Restored backup: $backupPath"
}

Write-TextFile $utilsPath $content
$syntax = Test-NodeSyntax $utilsPath
if (-not $syntax.Success) {
  Copy-Item -LiteralPath $backupPath -Destination $utilsPath -Force
  Fail "Applied patch produced invalid JavaScript, so utils.js was restored from backup: $backupPath`n$($syntax.Output)"
}

Write-Host "Applied Boss adapter navigation patch. Backup: $backupPath"
