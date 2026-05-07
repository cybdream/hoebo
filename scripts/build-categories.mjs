#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const outputDir = path.resolve(args.output || "data");

main().catch((error) => {
  console.error(`[build-categories] failed: ${error.message}`);
  process.exit(1);
});

async function main() {
  const indexPath = path.join(outputDir, "index.json");
  const indexRaw = await fs.readFile(indexPath, "utf-8");
  const index = JSON.parse(indexRaw);
  const issues = Array.isArray(index.issues) ? [...index.issues] : [];

  if (issues.length === 0) {
    throw new Error("no issues found in data/index.json");
  }

  issues.sort((a, b) => Number(b.issueNo || 0) - Number(a.issueNo || 0));

  const categoryMap = new Map();

  for (const issue of issues) {
    if (!issue?.filePath) {
      continue;
    }

    const issueFilePath = path.join(outputDir, issue.filePath);
    const issueRaw = await fs.readFile(issueFilePath, "utf-8");
    const issueData = JSON.parse(issueRaw);
    const articles = Array.isArray(issueData.articles) ? issueData.articles : [];

    for (const article of articles) {
      const category = normalizeCategory(article.category);
      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          category,
          categoryId: makeCategoryId(category),
          latestIssueNo: Number(issue.issueNo || 0),
          articles: []
        });
      }

      const bucket = categoryMap.get(category);
      bucket.latestIssueNo = Math.max(bucket.latestIssueNo, Number(issue.issueNo || 0));
      bucket.articles.push({
        id: article.id,
        issueNo: Number(issue.issueNo || 0),
        issueLabel: issue.issueLabel || "",
        issueDateLabel: issue.dateLabel || "",
        webzineId: Number(issue.webzineId || 0),
        order: Number(article.order || 0),
        category,
        title: article.title || "",
        author: article.author || "",
        summary: article.summary || "",
        sourceUrl: article.sourceUrl || ""
      });
    }
  }

  const categories = [...categoryMap.values()].sort((a, b) => {
    if (b.latestIssueNo !== a.latestIssueNo) {
      return b.latestIssueNo - a.latestIssueNo;
    }
    return a.category.localeCompare(b.category, "ko");
  });

  const categoriesDir = path.join(outputDir, "categories");
  const itemsDir = path.join(categoriesDir, "items");
  await fs.mkdir(itemsDir, { recursive: true });

  const indexItems = [];

  for (const item of categories) {
    item.articles.sort((a, b) => {
      if (b.issueNo !== a.issueNo) {
        return b.issueNo - a.issueNo;
      }
      return a.order - b.order;
    });

    const fileName = `${item.categoryId}.json`;
    const filePath = path.join(itemsDir, fileName);

    const payload = {
      version: index.version,
      generatedAt: new Date().toISOString(),
      source: index.source || "https://webzine.daesoon.org/",
      category: item.category,
      categoryId: item.categoryId,
      articleCount: item.articles.length,
      latestIssueNo: item.latestIssueNo,
      articles: item.articles
    };

    await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");

    indexItems.push({
      category: item.category,
      categoryId: item.categoryId,
      articleCount: item.articles.length,
      latestIssueNo: item.latestIssueNo,
      filePath: `categories/items/${fileName}`
    });
  }

  const categoriesIndex = {
    version: index.version,
    generatedAt: new Date().toISOString(),
    source: index.source || "https://webzine.daesoon.org/",
    totalCategories: indexItems.length,
    categories: indexItems
  };

  await fs.writeFile(path.join(categoriesDir, "index.json"), `${JSON.stringify(categoriesIndex, null, 2)}\n`, "utf-8");

  console.log(`[build-categories] done: ${indexItems.length} categories`);
}

function normalizeCategory(value) {
  const text = String(value || "").trim();
  return text.length > 0 ? text : "미분류";
}

function makeCategoryId(name) {
  let hash = 5381;
  for (const ch of name) {
    hash = ((hash << 5) + hash) ^ ch.codePointAt(0);
  }
  return `cat-${(hash >>> 0).toString(16).padStart(8, "0")}`;
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
