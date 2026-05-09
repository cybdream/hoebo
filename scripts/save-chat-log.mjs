import fs from "node:fs";
import path from "node:path";

const DEFAULT_BASE_DIR = "D:\\07_\uAC1C\uBC1C\uBB38\uC11C";

function parseArgs(argv) {
  const options = {
    source: "",
    outDir: "",
    format: "md",
    watch: false,
    fromStart: false,
    intervalMs: 1500
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === "--source" && next) {
      options.source = next;
      i += 1;
    } else if (key === "--outDir" && next) {
      options.outDir = next;
      i += 1;
    } else if (key === "--format" && next) {
      options.format = next;
      i += 1;
    } else if (key === "--interval" && next) {
      options.intervalMs = Number(next);
      i += 1;
    } else if (key === "--watch") {
      options.watch = true;
    } else if (key === "--from-start") {
      options.fromStart = true;
    } else if (key === "--help" || key === "-h") {
      options.help = true;
    }
  }

  return options;
}

function printHelp() {
  console.log("Usage: node scripts/save-chat-log.mjs [options]");
  console.log("\nOptions:");
  console.log("  --source <jsonl>     Transcript file path (optional, auto-detects latest)");
  console.log("  --outDir <folder>    Output folder (optional)");
  console.log(`                       Default: ${DEFAULT_BASE_DIR}\\<project-name>`);
  console.log("  --format <md|txt|both>  Output format (default: md)");
  console.log("  --watch              Keep watching and append new messages");
  console.log("  --from-start         Export from start (watch mode defaults to from-now)");
  console.log("  --interval <ms>      Poll interval for watch mode (default: 1500)");
}

function resolveProjectOutDir() {
  const projectName = path.basename(process.cwd()) || "project";
  return path.join(DEFAULT_BASE_DIR, projectName);
}

function detectLatestTranscript() {
  const appData = process.env.APPDATA;
  if (!appData) return "";

  const workspaceStorage = path.join(appData, "Code", "User", "workspaceStorage");
  if (!fs.existsSync(workspaceStorage)) return "";

  const candidates = [];
  const workspaces = fs.readdirSync(workspaceStorage, { withFileTypes: true });
  for (const ws of workspaces) {
    if (!ws.isDirectory()) continue;
    const transcriptsDir = path.join(workspaceStorage, ws.name, "GitHub.copilot-chat", "transcripts");
    if (!fs.existsSync(transcriptsDir)) continue;

    const files = fs.readdirSync(transcriptsDir, { withFileTypes: true });
    for (const entry of files) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const filePath = path.join(transcriptsDir, entry.name);
      const stat = fs.statSync(filePath);
      candidates.push({ filePath, mtimeMs: stat.mtimeMs });
    }
  }

  if (candidates.length === 0) return "";
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0].filePath;
}

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function pickMessage(entry) {
  if (!entry || typeof entry !== "object") return null;

  const type = entry.type;
  const data = entry.data || {};
  if (type === "user.message") {
    const text = normalizeText(data.content);
    if (!text) return null;
    return { role: "User", text, timestamp: entry.timestamp || "" };
  }

  if (type === "assistant.message") {
    const text = normalizeText(data.content || data.reasoningText);
    if (!text) return null;
    return { role: "Assistant", text, timestamp: entry.timestamp || "" };
  }

  return null;
}

function formatTime(iso) {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString("ko-KR");
}

function formatDateForFile(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function appendMd(filePath, msg) {
  const chunk = `## [${formatTime(msg.timestamp)}] ${msg.role}\n\n${msg.text}\n\n---\n\n`;
  fs.appendFileSync(filePath, chunk, "utf8");
}

function appendTxt(filePath, msg) {
  const chunk = `[${formatTime(msg.timestamp)}] ${msg.role}\n${msg.text}\n\n`; 
  fs.appendFileSync(filePath, chunk, "utf8");
}

function ensureFileWithHeader(filePath, type) {
  if (fs.existsSync(filePath)) return;
  const header = type === "md"
    ? `# Copilot Chat Export\n\nGenerated: ${new Date().toLocaleString("ko-KR")}\n\n---\n\n`
    : `Copilot Chat Export\nGenerated: ${new Date().toLocaleString("ko-KR")}\n\n`;
  fs.writeFileSync(filePath, header, "utf8");
}

function createWriters(outDir, transcriptPath, format) {
  const dateStamp = formatDateForFile();
  const baseName = `${dateStamp}_작업로그`;
  const mdPath = path.join(outDir, `${baseName}.md`);
  const txtPath = path.join(outDir, `${baseName}.txt`);

  if (format === "md" || format === "both") ensureFileWithHeader(mdPath, "md");
  if (format === "txt" || format === "both") ensureFileWithHeader(txtPath, "txt");

  return {
    write(msg) {
      if (format === "md" || format === "both") appendMd(mdPath, msg);
      if (format === "txt" || format === "both") appendTxt(txtPath, msg);
    },
    outputs: [
      ...(format === "md" || format === "both" ? [mdPath] : []),
      ...(format === "txt" || format === "both" ? [txtPath] : [])
    ]
  };
}

function processChunk(chunk, pending, onMessage) {
  const merged = `${pending}${chunk}`;
  const lines = merged.split("\n");
  const nextPending = lines.pop() || "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed);
      const msg = pickMessage(entry);
      if (msg) onMessage(msg);
    } catch {
      // Ignore malformed lines while streaming.
    }
  }

  return nextPending;
}

function readFromOffset(filePath, offset) {
  const buffer = fs.readFileSync(filePath);
  const safeOffset = Math.min(Math.max(offset, 0), buffer.length);
  return {
    text: buffer.subarray(safeOffset).toString("utf8"),
    size: buffer.length
  };
}

function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  const resolvedOutDir = options.outDir || resolveProjectOutDir();

  const transcriptPath = options.source || detectLatestTranscript();
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    console.error("Transcript file not found. Use --source to specify a .jsonl file.");
    process.exit(1);
  }

  if (!["md", "txt", "both"].includes(options.format)) {
    console.error("--format must be md, txt, or both.");
    process.exit(1);
  }

  fs.mkdirSync(resolvedOutDir, { recursive: true });
  const writers = createWriters(resolvedOutDir, transcriptPath, options.format);

  let offset = 0;
  let pending = "";
  if (options.watch && !options.fromStart) {
    offset = fs.statSync(transcriptPath).size;
  }

  const syncOnce = () => {
    if (!fs.existsSync(transcriptPath)) return;
    const stat = fs.statSync(transcriptPath);
    if (offset > stat.size) {
      offset = 0;
      pending = "";
    }

    const { text, size } = readFromOffset(transcriptPath, offset);
    offset = size;
    if (!text) return;
    pending = processChunk(text, pending, (msg) => writers.write(msg));
  };

  syncOnce();
  console.log(`Output directory: ${resolvedOutDir}`);
  console.log(`Saved chat log to:`);
  writers.outputs.forEach((p) => console.log(` - ${p}`));

  if (!options.watch) {
    process.exit(0);
  }

  console.log(`Watching transcript: ${transcriptPath}`);
  setInterval(syncOnce, options.intervalMs);
}

run();
