#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const outputDir = path.resolve(args.output || "data");

main().catch((error) => {
  console.error(`[clean-authors] failed: ${error.message}`);
  process.exit(1);
});

async function main() {
  const indexPath = path.join(outputDir, "index.json");
  const indexRaw = await fs.readFile(indexPath, "utf-8");
  const index = JSON.parse(indexRaw);
  const issues = Array.isArray(index.issues) ? index.issues : [];

  let changedIssues = 0;
  let changedAuthors = 0;

  for (const issue of issues) {
    if (!issue?.filePath) {
      continue;
    }

    const issuePath = path.join(outputDir, issue.filePath);
    const issueRaw = await fs.readFile(issuePath, "utf-8");
    const issueData = JSON.parse(issueRaw);
    const articles = Array.isArray(issueData.articles) ? issueData.articles : [];

    let issueTouched = false;

    for (const article of articles) {
      const prevAuthor = String(article.author || "");
      const nextAuthor = normalizeAuthor(prevAuthor);
      if (prevAuthor !== nextAuthor) {
        // 기존 데이터의 author HTML 태그를 제거해 화면 노출 오염을 방지한다.
        article.author = nextAuthor;
        issueTouched = true;
        changedAuthors += 1;
      }
    }

    if (issueTouched) {
      changedIssues += 1;
      await fs.writeFile(issuePath, `${JSON.stringify(issueData, null, 2)}\n`, "utf-8");
    }
  }

  console.log(`[clean-authors] done: ${changedIssues} issues, ${changedAuthors} author fields updated`);
}

function normalizeAuthor(value) {
  // 실제 HTML 태그만 제거하고, <선무ㆍ...> 같은 저자 표기 괄호는 남긴다.
  const stripped = String(value || "")
    .replace(/<\/?(?:span|font|br|b|strong|em|i|u|o:p|p)(?:\s+[^>]*)?>/gi, " ")
    .replace(/<<\s*(?=span|font|br|b|strong|em|i|u|o:p|p)/gi, "<");

  return stripped
    .replace(/\s+/g, " ")
    .trim();
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
