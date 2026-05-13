param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$Branch = "master",
  [string]$WebhookUrl = $env:HOEBO_ALERT_WEBHOOK
)

$ErrorActionPreference = "Stop"

# [KO] 로그를 타임스탬프와 함께 출력해 배치 실행 이력을 추적하기 쉽게 만듭니다.
# [EN] Print timestamped logs to make scheduled run history easy to trace.
function Write-Log {
  param([string]$Message)
  $now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Write-Host "[$now] $Message"
}

# [KO] 웹훅 URL이 있을 때만 상태 메시지를 전송합니다.
# [EN] Send status messages only when a webhook URL is configured.
function Send-Alert {
  param(
    [string]$Text,
    [string]$Level = "info"
  )

  if ([string]::IsNullOrWhiteSpace($WebhookUrl)) {
    return
  }

  # [KO] Discord Webhook은 content 필드를 요구하므로 text 대신 content로 전송합니다.
  # [EN] Discord Webhook expects the content field, so send content instead of text.
  $payload = @{
    content = "[hoebo][$Level] $Text"
  } | ConvertTo-Json

  Invoke-RestMethod -Method Post -Uri $WebhookUrl -ContentType "application/json" -Body $payload | Out-Null
}

# [KO] Node 체크 스크립트를 실행해 신규 회차 여부를 구조화된 JSON으로 반환받습니다.
# [EN] Run the Node check script and return structured JSON indicating whether a new issue exists.
function Get-CheckResult {
  $raw = & node scripts/check-latest-issue.mjs --output data
  if ($LASTEXITCODE -ne 0) {
    throw "check-latest-issue script failed"
  }

  return ($raw | ConvertFrom-Json)
}

# [KO] 자동 갱신 전 작업트리가 깨끗한지 테스트해 예기치 않은 충돌을 방지합니다.
# [EN] Test that the working tree is clean before auto-update to avoid unexpected pull/merge conflicts.
function Test-CleanWorkingTree {
  $status = git status --porcelain
  if ($LASTEXITCODE -ne 0) {
    throw "git status failed"
  }

  if (-not [string]::IsNullOrWhiteSpace(($status -join "`n"))) {
    throw "working tree is not clean; commit or stash local changes before running auto update"
  }
}

# [KO] 데이터 갱신 후 변경된 산출물을 커밋하고 원격 브랜치로 반영합니다.
# [EN] Update the repository with changed artifacts and push to the remote branch.
function Update-RepositoryData {
  param(
    [int]$IssueNo,
    [int]$WebzineId
  )

  git add data/index.json data/issues data/categories
  if ($LASTEXITCODE -ne 0) {
    throw "git add failed"
  }

  git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) {
    Write-Log "No file changes detected after build"
    return $false
  }

  git config user.name "hoebo-bot"
  git config user.email "hoebo-bot@users.noreply.github.com"

  $message = "chore(data): update hoebo issue $IssueNo (webzine $WebzineId)"
  git commit -m $message
  if ($LASTEXITCODE -ne 0) {
    throw "git commit failed"
  }

  git push origin $Branch
  if ($LASTEXITCODE -ne 0) {
    throw "git push failed"
  }

  return $true
}

Push-Location $ProjectRoot
try {
  Write-Log "Starting hoebo data update workflow"
  Test-CleanWorkingTree

  git pull --rebase origin $Branch
  if ($LASTEXITCODE -ne 0) {
    throw "git pull failed"
  }

  $check = Get-CheckResult
  $hasNew = [bool]$check.hasNewIssue
  $remoteIssueNo = [int]$check.remoteLatestIssueNo
  $remoteWebzineId = [int]$check.remoteLatestWebzineId
  $localIssueNo = [int]$check.localLatestIssueNo

  if (-not $hasNew) {
    Write-Log "No new issue. remote=$remoteIssueNo, local=$localIssueNo"
    Send-Alert -Text "No new issue. remote=$remoteIssueNo, local=$localIssueNo" -Level "info"
    exit 0
  }

  Write-Log "New issue detected. remote=$remoteIssueNo, local=$localIssueNo"
  npm run build:data
  if ($LASTEXITCODE -ne 0) {
    throw "npm run build:data failed"
  }

  $pushed = Update-RepositoryData -IssueNo $remoteIssueNo -WebzineId $remoteWebzineId
  if ($pushed) {
    Write-Log "Update completed and pushed for issue $remoteIssueNo"
    Send-Alert -Text "Updated and pushed issue $remoteIssueNo (webzine $remoteWebzineId)." -Level "success"
  } else {
    Write-Log "Update finished but no commit was necessary"
    Send-Alert -Text "New issue check passed, but no commit was created." -Level "info"
  }
}
catch {
  $message = $_.Exception.Message
  Write-Log "Update failed: $message"
  Send-Alert -Text "Update failed: $message" -Level "error"
  exit 1
}
finally {
  Pop-Location
}
