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

async function parseIssue(indexHtml, issueInfo) {
  const dateLabel = normalizeText(extract(indexHtml, /<div style="height:30px; margin-top:10px; text-align:center; width:190px">([\s\S]*?)<\/div>/i));
  const coverUrl = normalizeAssetUrl(extract(indexHtml, /<img src="([^"]*webzine\/cover\/[^"]+)" width="190px" height="250px"/i));
  const pdfUrl = normalizeAssetUrl(extract(indexHtml, /<!--a href="([^"]*\/pdf\/hoebo\d+\.pdf)"/i));
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
  const author = normalizeText(extract(contentHtmlRaw, /<p[^>]*align="right"[^>]*>([\s\S]*?)<\/p>/i));
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

function htmlToText(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
  );
}

function stripTags(html) {
  return decodeHtmlEntities(String(html || "").replace(/<[^>]+>/g, " "));
}

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

function normalizeText(value) {
  return decodeHtmlEntities(value)
    .replace(/\s+/g, " ")
    .trim();
}

function summarize(text) {
  const normalized = normalizeText(text);
  if (normalized.length <= 140) {
    return normalized;
  }
  return `${normalized.slice(0, 140)}...`;
}

function normalizeAssetUrl(url) {
  if (!url) {
    return "";
  }

  const absolute = absoluteUrl(url);
  return absolute.replace(/^http:\/\//i, "https://");
}

function absoluteUrl(url) {
  try {
    return new URL(url, BASE_URL).toString();
  } catch {
    return "";
  }
}

function extract(text, pattern) {
  return text.match(pattern)?.[1] || "";
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeVersion() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}.${hour}${minute}`;
}

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

function issueFolder(issueNo) {
  const base = Math.floor((issueNo - 1) / 10) * 10 + 1;
  return `${base}-${base + 9}`;
}

function printUsageAndExit(code) {
  console.log("사용법: node scripts/scrape-webzine.mjs --latest <count> --output <dir> [--webzine-ids 348,347] [--check-only]");
  process.exit(code);
}