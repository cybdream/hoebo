#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = "https://webzine.daesoon.org";
const DEFAULT_DELAY_MS = 120;

const args = parseArgs(process.argv.slice(2));
const latestCount = Number(args.latest || 1);
const outputDir = path.resolve(args.output || "data");
const explicitIds = String(args["webzine-ids"] || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const delayMs = Number(args.delay || DEFAULT_DELAY_MS);
const checkOnly = Boolean(args["check-only"]);

main().catch((error) => {
  console.error(`[scrape-webzine] 실패: ${error.message}`);
  process.exit(1);
});

// KR: 스크래핑 전체 흐름을 실행하고 호별 데이터/인덱스를 저장한다.
// EN: Runs the full scraping flow and writes per-issue data plus merged index.
async function main() {
  const homeHtml = await fetchHtml(`${BASE_URL}/index.asp`);
  const availableIssues = parseIssueOptions(homeHtml);

  if (availableIssues.length === 0) {
    throw new Error("회보 호수 목록을 찾지 못했습니다.");
  }

  const targetIssues = explicitIds.length > 0
    ? availableIssues.filter((issue) => explicitIds.includes(String(issue.webzineId)))
    : availableIssues.slice(0, Math.max(1, latestCount));

  if (targetIssues.length === 0) {
    throw new Error("수집 대상 호수를 찾지 못했습니다.");
  }

  const issues = [];

  for (const targetIssue of targetIssues) {
    console.log(`[scrape-webzine] ${targetIssue.issueLabel} 수집 중...`);
    const indexHtml = await fetchHtml(`${BASE_URL}/index.asp?webzine=${targetIssue.webzineId}`);
    const issue = await parseIssue(indexHtml, targetIssue);

    if (!checkOnly) {
      const folder = issueFolder(issue.issueNo);
      const issueDir = path.join(outputDir, "issues", folder);
      await fs.mkdir(issueDir, { recursive: true });
      await fs.writeFile(
        path.join(issueDir, `${issue.issueNo}.json`),
        `${JSON.stringify(issue, null, 2)}\n`,
        "utf-8"
      );
    }

    issues.push(issue);
    await pause(delayMs);
  }

  const totalArticles = issues.reduce((sum, issue) => sum + issue.articles.length, 0);

  if (checkOnly) {
    console.log(`[scrape-webzine] 검증 완료: ${issues.length}개 호, ${totalArticles}개 기사`);
    return;
  }

  // 기존 index.json 읽어서 병합 (이미 수집된 호수는 유지)
  const indexPath = path.join(outputDir, "index.json");
  let existingIssues = [];
  try {
    const existing = JSON.parse(await fs.readFile(indexPath, "utf-8"));
    existingIssues = Array.isArray(existing.issues) ? existing.issues : [];
  } catch {}

  const mergedMap = new Map(existingIssues.map((i) => [i.issueNo, i]));
  for (const issue of issues) {
    const folder = issueFolder(issue.issueNo);
    mergedMap.set(issue.issueNo, {
      webzineId: issue.webzineId,
      issueNo: issue.issueNo,
      issueLabel: issue.issueLabel,
      dateLabel: issue.dateLabel,
      coverUrl: issue.coverUrl,
      pdfUrl: issue.pdfUrl,
      articleCount: issue.articles.length,
      filePath: `issues/${folder}/${issue.issueNo}.json`
    });
  }
  const mergedIssues = [...mergedMap.values()].sort((a, b) => b.issueNo - a.issueNo);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    indexPath,
    `${JSON.stringify({ version: makeVersion(), generatedAt: new Date().toISOString(), source: `${BASE_URL}/`, issues: mergedIssues }, null, 2)}\n`,
    "utf-8"
  );
  console.log(`[scrape-webzine] 완료: ${issues.length}개 호 추가, 총 ${mergedIssues.length}개 호 인덱스 (${totalArticles}개 기사)`);
}

// KR: 특정 호의 목록 페이지를 파싱해 메타데이터와 기사 목록을 수집한다.
// EN: Parses an issue index page and collects metadata with article entries.
async function parseIssue(indexHtml, issueInfo) {
  const dateLabel = normalizeText(extract(indexHtml, /<div style="height:30px; margin-top:10px; text-align:center; width:190px">([\s\S]*?)<\/div>/i));
  const coverUrl = normalizeAssetUrl(extract(indexHtml, /<img src="([^"]*webzine\/cover\/[^"]+)" width="190px" height="250px"/i));
  const pdfUrl = normalizeAssetUrl(extract(indexHtml, /<a href="([^"]*\/pdf\/hoebo\d+\.pdf)"[^>]*>\s*PDF\s*<\/a>/i));
  const links = extractArticleLinks(indexHtml);
  const articles = [];

  for (let index = 0; index < links.length; index += 1) {
    const link = links[index];
    console.log(`  - ${index + 1}/${links.length} ${link.url}`);
    const articleHtml = await fetchHtml(link.url);
    articles.push(parseArticle(articleHtml, issueInfo, link, index + 1));
    await pause(delayMs);
  }

  return {
    webzineId: issueInfo.webzineId,
    issueNo: issueInfo.issueNo,
    issueLabel: issueInfo.issueLabel,
    dateLabel,
    coverUrl,
    pdfUrl,
    articles
  };
}

// KR: 기사 상세 HTML에서 구조화된 기사 객체를 생성한다.
// EN: Builds a normalized article object from article detail HTML.
function parseArticle(html, issueInfo, link, order) {
  const pageUrl = new URL(link.url);
  const bno = pageUrl.searchParams.get("bno") || String(order);
  const menuNo = pageUrl.searchParams.get("menu_no") || "0";
  const page = pageUrl.searchParams.get("page") || "1";

  const category = normalizeText(extract(html, /<span style="margin-left:90px">([\s\S]*?)<\/span>\s*:/i));
  const contentHtmlRaw = extract(html, /<td style="padding:50px 25px; text-align:justify; line-height:160%; width:560px">([\s\S]*?)<\/td>/i);
  const contentHtml = cleanupBodyHtml(contentHtmlRaw);
  const bodyText = normalizeText(htmlToText(contentHtmlRaw));
  const title = normalizeText(
    extract(html, /<title>([\s\S]*?)\s*-\s*대순회보/i) ||
    extract(contentHtmlRaw, /<font size="5">([\s\S]*?)<\/font>/i) ||
    link.title
  );
  const author = normalizeAuthor(extract(contentHtmlRaw, /<p[^>]*align="right"[^>]*>([\s\S]*?)<\/p>/i));
  const imageUrls = [...contentHtmlRaw.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => normalizeAssetUrl(match[1]))
    .filter(Boolean);

  return {
    id: `w${issueInfo.webzineId}-b${bno}-m${menuNo}`,
    order,
    bno: Number(bno),
    menuNo: Number(menuNo),
    page: Number(page),
    category,
    title,
    author,
    summary: summarize(bodyText),
    bodyText,
    bodyHtml: contentHtml,
    imageUrls,
    sourceUrl: link.url
  };
}

// KR: 호수 페이지에서 기사 링크를 추출하고 중복을 제거한다.
// EN: Extracts article links from an issue page and removes duplicates.
function extractArticleLinks(html) {
  const seen = new Set();
  const links = [];

  for (const match of html.matchAll(/<a href="([^"]*board\/readcnt\.asp\?[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = absoluteUrl(match[1]);
    const title = normalizeText(stripTags(match[2]));
    if (!url || !title) {
      continue;
    }

    const parsed = new URL(url);
    const webzineId = parsed.searchParams.get("webzine") || "0";
    const menuNo = parsed.searchParams.get("menu_no") || "0";
    const bno = parsed.searchParams.get("bno") || "0";
    const canonicalKey = `${webzineId}:${menuNo}:${bno}`;

    if (seen.has(canonicalKey)) {
      continue;
    }

    seen.add(canonicalKey);
    links.push({ url, title });
  }

  return links;
}

// KR: 옵션 목록에서 수집 가능한 호수 정보를 추출한다.
// EN: Extracts available issue options from the selector HTML.
function parseIssueOptions(html) {
  const issues = [];
  for (const match of html.matchAll(/<option value="(\d+)"[^>]*>(\d+)호<\/option>/gi)) {
    issues.push({
      webzineId: Number(match[1]),
      issueNo: Number(match[2]),
      issueLabel: `${match[2]}호`
    });
  }
  return issues.sort((left, right) => right.issueNo - left.issueNo);
}

// KR: 대상 URL의 HTML을 가져오고 실패 시 예외를 던진다.
// EN: Fetches HTML from URL and throws when the response is not OK.
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

// KR: 본문 HTML에서 불필요한 인라인 속성을 정리한다.
// EN: Cleans body HTML by removing noisy inline attributes.
function cleanupBodyHtml(html) {
  return String(html || "")
    .replace(/name='zb_target_resize'/gi, "")
    .replace(/onclick='imgOpen\(this\);'/gi, "")
    .replace(/align="top"/gi, "")
    .replace(/align="left"/gi, "")
    .replace(/hspace="\d+"/gi, "")
    .replace(/vspace="\d+"/gi, "")
    .replace(/width="\d+px"/gi, "")
    .replace(/src=["']([^"']+)["']/gi, (_, src) => `src="${normalizeAssetUrl(src)}"`)
    .replace(/<p>(&nbsp;|\s|<br\s*\/?>)*<\/p>/gi, "")
    .trim();
}

  // KR: HTML 본문을 줄바꿈을 보존한 일반 텍스트로 변환한다.
  // EN: Converts HTML body into plain text while preserving line breaks.
function htmlToText(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
  );
}

// KR: HTML 태그를 제거한 텍스트를 반환한다.
// EN: Returns text with HTML tags stripped.
function stripTags(html) {
  return decodeHtmlEntities(String(html || "").replace(/<[^>]+>/g, " "));
}

// KR: 자주 등장하는 HTML 엔티티를 문자로 복원한다.
// EN: Decodes frequently used HTML entities into plain characters.
function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#10;/gi, "\n")
    .replace(/　/g, " ");
}

  // KR: 텍스트 공백을 표준화하고 양 끝 공백을 제거한다.
  // EN: Normalizes whitespace and trims text boundaries.
function normalizeText(value) {
  return decodeHtmlEntities(value)
    .replace(/\s+/g, " ")
    .trim();
}

// KR: 작성자 표기에서 표시용 태그만 제거해 이름을 정규화한다.
// EN: Normalizes author text by removing formatting tags only.
function normalizeAuthor(value) {
  // author 필드에서 실제 HTML 태그만 제거하고, <선무ㆍ...> 같은 텍스트 표기는 유지한다.
  const stripped = String(value || "")
    .replace(/<\/?(?:span|font|br|b|strong|em|i|u|o:p|p)(?:\s+[^>]*)?>/gi, " ")
    .replace(/<<\s*(?=span|font|br|b|strong|em|i|u|o:p|p)/gi, "<");
  return normalizeText(stripped);
}

// KR: 본문 앞부분을 사용해 고정 길이 요약문을 만든다.
// EN: Builds a fixed-length summary from the beginning of body text.
function summarize(text) {
  const normalized = normalizeText(text);
  if (normalized.length <= 140) {
    return normalized;
  }
  return `${normalized.slice(0, 140)}...`;
}

// KR: 자산 URL을 절대 경로/HTTPS로 정규화한다.
// EN: Normalizes asset URL to absolute form and HTTPS.
function normalizeAssetUrl(url) {
  if (!url) {
    return "";
  }

  const absolute = absoluteUrl(url);
  return absolute.replace(/^http:\/\//i, "https://");
}

// KR: 상대/비정상 URL을 안전하게 절대 URL로 변환한다.
// EN: Safely resolves relative or malformed URLs to absolute URL.
function absoluteUrl(url) {
  try {
    return new URL(url, BASE_URL).toString();
  } catch {
    return "";
  }
}

// KR: 정규식 그룹 1을 추출하고 없으면 빈 문자열을 반환한다.
// EN: Returns regex capture group 1, or empty string when absent.
function extract(text, pattern) {
  return text.match(pattern)?.[1] || "";
}

// KR: 요청 간 간격 제어를 위한 지연 Promise를 생성한다.
// EN: Creates a delay Promise to throttle requests between fetches.
function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// KR: 인덱스 파일 버전 문자열(yyyyMMdd.HHmm)을 생성한다.
// EN: Creates index version string in yyyyMMdd.HHmm format.
function makeVersion() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}.${hour}${minute}`;
}

// KR: CLI 인자를 --key value 또는 --flag 형태로 파싱한다.
// EN: Parses CLI args in --key value or --flag form.
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

// KR: 호수를 10개 단위 폴더명(예: 341-350)으로 매핑한다.
// EN: Maps issue number to 10-issue folder range (e.g., 341-350).
function issueFolder(issueNo) {
  const base = Math.floor((issueNo - 1) / 10) * 10 + 1;
  return `${base}-${base + 9}`;
}

// KR: 스크립트 사용법을 출력하고 지정 코드로 종료한다.
// EN: Prints script usage and exits with the provided code.
function printUsageAndExit(code) {
  console.log("사용법: node scripts/scrape-webzine.mjs --latest <count> --output <dir> [--webzine-ids 348,347] [--check-only]");
  process.exit(code);
}