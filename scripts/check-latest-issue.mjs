#!/usr/bin/env node
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

const BASE_URL = "https://webzine.daesoon.org";

const args = parseArgs(process.argv.slice(2));
const outputDir = path.resolve(args.output || "data");

main().catch((error) => {
  console.error(`[check-latest-issue] failed: ${error.message}`);
  process.exit(1);
});

// [KO] 원격 최신 호수와 로컬 최신 호수를 비교해 신규 회차 존재 여부를 계산합니다.
// [EN] Compare remote and local latest issue numbers and determine if a new issue exists.
async function main() {
  const homeHtml = await fetchHtml(`${BASE_URL}/index.asp`);
  const remoteIssues = parseIssueOptions(homeHtml);

  if (remoteIssues.length === 0) {
    throw new Error("No issue options found on remote site");
  }

  const remoteLatestIssueNo = remoteIssues[0].issueNo;
  const remoteLatestWebzineId = remoteIssues[0].webzineId;
  const localLatestIssueNo = await readLocalLatestIssueNo(path.join(outputDir, "index.json"));
  const hasNewIssue = remoteLatestIssueNo > localLatestIssueNo;

  const result = {
    hasNewIssue,
    remoteLatestIssueNo,
    remoteLatestWebzineId,
    localLatestIssueNo,
    checkedAt: new Date().toISOString()
  };

  writeGithubOutput("has_new_issue", String(hasNewIssue));
  writeGithubOutput("remote_latest_issue_no", String(remoteLatestIssueNo));
  writeGithubOutput("remote_latest_webzine_id", String(remoteLatestWebzineId));
  writeGithubOutput("local_latest_issue_no", String(localLatestIssueNo));

  console.log(JSON.stringify(result, null, 2));
}

// [KO] CLI 인자를 --key value 또는 --flag 형태로 파싱합니다.
// [EN] Parse CLI arguments in --key value or --flag form.
function parseArgs(argv) {
  const output = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      output[key] = true;
      continue;
    }

    output[key] = next;
    index += 1;
  }

  return output;
}

// [KO] 웹진 메인 페이지의 option 목록에서 회차 번호와 웹진 ID를 추출합니다.
// [EN] Extract issue number and webzine ID pairs from option elements on the webzine homepage.
function parseIssueOptions(html) {
  const issues = [];

  for (const match of html.matchAll(/<option value="(\d+)"[^>]*>(\d+)호<\/option>/gi)) {
    issues.push({
      webzineId: Number(match[1]),
      issueNo: Number(match[2])
    });
  }

  return issues.sort((left, right) => right.issueNo - left.issueNo);
}

// [KO] 로컬 index.json에서 가장 큰 issueNo를 읽고, 없으면 0을 반환합니다.
// [EN] Read the largest issueNo from local index.json and return 0 when unavailable.
async function readLocalLatestIssueNo(indexPath) {
  try {
    const raw = await fs.readFile(indexPath, "utf-8");
    const payload = JSON.parse(raw);
    const issues = Array.isArray(payload.issues) ? payload.issues : [];

    if (issues.length === 0) {
      return 0;
    }

    return issues.reduce((maxIssueNo, issue) => {
      const issueNo = Number(issue.issueNo || 0);
      return Math.max(maxIssueNo, issueNo);
    }, 0);
  } catch {
    return 0;
  }
}

// [KO] 사용자 에이전트를 포함해 HTML을 가져오고, 실패 시 예외를 발생시킵니다.
// [EN] Fetch HTML with a browser-like user agent and throw on non-OK responses.
async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.text();
}

// [KO] GitHub Actions 환경에서 후속 스텝이 참조할 출력 변수를 기록합니다.
// [EN] Write output variables for later GitHub Actions steps when available.
function writeGithubOutput(key, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) {
    return;
  }

  const safeValue = String(value ?? "").replace(/\r?\n/g, " ");
  fsSync.appendFileSync(outputFile, `${key}=${safeValue}\n`, "utf-8");
}
