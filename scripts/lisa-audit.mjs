#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "audit");
const REPORT_MD = path.join(OUT_DIR, "LISA_AUDIT_REPORT.md");
const REPORT_JSON = path.join(OUT_DIR, "LISA_AUDIT_REPORT.json");

const HARD_EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  ".vercel",
  ".idea",
  ".vscode",
]);

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function sha256File(filePath) {
  const h = crypto.createHash("sha256");
  const buf = fs.readFileSync(filePath);
  h.update(buf);
  return h.digest("hex");
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
    ...opts,
  });
  return {
    cmd: [cmd, ...args].join(" "),
    code: r.status ?? 0,
    stdout: (r.stdout ?? "").trim(),
    stderr: (r.stderr ?? "").trim(),
  };
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function walkFiles(dir) {
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const dirs = [dir];

  while (dirs.length) {
    const cur = dirs.pop();
    if (!cur) break;
    const base = path.basename(cur);
    if (HARD_EXCLUDE_DIRS.has(base)) continue;

    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const e of entries) {
      const fp = path.join(cur, e.name);
      if (e.isDirectory()) {
        dirs.push(fp);
      } else if (e.isFile()) {
        files.push(fp);
      }
    }
  }

  return files;
}

function isTextFile(fp) {
  const ext = path.extname(fp).toLowerCase();
  // broad code + config + docs set
  const textExts = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".json", ".yml", ".yaml", ".md", ".txt",
    ".sql", ".prisma", ".env", ".env.example",
    ".sh", ".ps1", ".toml", ".ini",
    ".html", ".css", ".scss",
  ]);
  if (textExts.has(ext)) return true;
  // allow extensionless env files or README variants
  const bn = path.basename(fp).toLowerCase();
  if (bn.startsWith(".env")) return true;
  if (bn === "dockerfile") return true;
  return false;
}

function safeReadText(fp) {
  try {
    const buf = fs.readFileSync(fp);
    // crude binary detection: if NUL exists, treat as binary
    if (buf.includes(0)) return null;
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

function grepCount(content, needle) {
  let idx = 0;
  let count = 0;
  while (true) {
    idx = content.indexOf(needle, idx);
    if (idx === -1) break;
    count += 1;
    idx += needle.length;
  }
  return count;
}

function unique(arr) {
  return Array.from(new Set(arr)).sort();
}

function topN(obj, n) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function redactPotentialSecret(s) {
  if (!s) return s;
  // mask long token-like strings
  return s.replace(/[A-Za-z0-9_\-]{24,}/g, (m) => `${m.slice(0, 4)}${m.slice(-4)}`);
}

function extractEnvKeysFromText(content) {
  // captures process.env.MY_KEY and process.env["MY_KEY"]
  const keys = [];
  const re1 = /process\.env\.([A-Z0-9_]+)/g;
  const re2 = /process\.env\[\s*["']([A-Z0-9_]+)["']\s*\]/g;

  let m;
  while ((m = re1.exec(content)) !== null) keys.push(m[1]);
  while ((m = re2.exec(content)) !== null) keys.push(m[1]);
  return keys;
}

function secretHeuristicsFindings(filePath, content) {
  // Heuristics only; report as possible
  const findings = [];

  const patterns = [
    { name: "AWS Access Key", re: /AKIA[0-9A-Z]{16}/g },
    { name: "AWS Secret Key-ish", re: /(?<![A-Za-z0-9])[A-Za-z0-9\/+=]{40}(?![A-Za-z0-9])/g },
    { name: "GitHub Token-ish", re: /gh[pousr]_[A-Za-z0-9_]{20,}/g },
    { name: "OpenAI Key-ish", re: /sk-[A-Za-z0-9]{20,}/g },
    { name: "Google API Key-ish", re: /AIza[0-9A-Za-z\-_]{35}/g },
    { name: "Slack Token-ish", re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
    { name: "JWT-ish", re: /eyJ[A-Za-z0-9_\-]+?\.[A-Za-z0-9_\-]+?\.[A-Za-z0-9_\-]+/g },
    { name: "Private Key Header", re: /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/g },
  ];

  for (const p of patterns) {
    const matches = content.match(p.re);
    if (matches && matches.length) {
      findings.push({
        file: path.relative(ROOT, filePath),
        type: "possible_secret",
        pattern: p.name,
        count: matches.length,
        sampleRedacted: redactPotentialSecret(matches[0]),
      });
    }
  }

  return findings;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push(`# LISA / LLMpire Top-to-Bottom Audit Report`);
  lines.push("");
  lines.push(`**Generated:** ${report.generatedAt}`);
  lines.push(`**OS:** ${report.system.os} | **Node:** ${report.system.node} | **npm:** ${report.system.npm}`);
  lines.push(`**Repo Root:** ${report.repo.root}`);
  lines.push(`**Git Commit:** ${report.repo.gitCommit}`);
  lines.push(`**Git Dirty:** ${report.repo.gitDirty}`);
  lines.push("");
  lines.push(`## 1) Build & Script Health`);
  lines.push("");
  for (const r of report.build.runs) {
    lines.push(`- \`${r.cmd}\`  exit ${r.code}`);
    if (r.stdout) lines.push(`  - stdout: ${r.stdout.split("\n")[0].slice(0, 220)}`);
    if (r.stderr) lines.push(`  - stderr: ${r.stderr.split("\n")[0].slice(0, 220)}`);
  }
  lines.push("");
  lines.push(`## 2) Dependency Risk (npm audit)`);
  lines.push("");
  lines.push(`- audit ran: ${report.deps.auditRan}`);
  if (report.deps.auditRan) {
    lines.push(`- vulnerabilities: ${JSON.stringify(report.deps.vulnSummary)}`);
  } else {
    lines.push(`- reason: ${report.deps.auditError || "unknown"}`);
  }
  lines.push("");
  lines.push(`## 3) Environment Keys Used in Code`);
  lines.push("");
  lines.push(`Found **${report.env.keys.length}** unique env keys.`);
  lines.push("");
  for (const k of report.env.keys.slice(0, 200)) {
    lines.push(`- \`${k}\``);
  }
  if (report.env.keys.length > 200) lines.push(`- (truncated)`);
  lines.push("");
  lines.push(`## 4) Secret Scan (Heuristic)`);
  lines.push("");
  lines.push(`Findings: **${report.secrets.findings.length}** (possible  verify manually)`);
  lines.push("");
  for (const f of report.secrets.findings.slice(0, 50)) {
    lines.push(`- ${f.file} | ${f.pattern} | count=${f.count} | sample=${f.sampleRedacted}`);
  }
  if (report.secrets.findings.length > 50) lines.push(`- (truncated)`);
  lines.push("");
  lines.push(`## 5) Cross-Contamination / Keyword Signals`);
  lines.push("");
  lines.push(`Keyword counts across text files (helps detect MealScout in TradeScout, etc):`);
  lines.push("");
  for (const [k, v] of Object.entries(report.keywords.counts)) {
    lines.push(`- \`${k}\`: ${v}`);
  }
  lines.push("");
  lines.push(`Top files by keyword hits (first 25):`);
  lines.push("");
  for (const item of report.keywords.topFiles) {
    lines.push(`- ${item.file}  ${JSON.stringify(item.hits)}`);
  }
  lines.push("");
  lines.push(`## 6) Repo Fingerprints`);
  lines.push("");
  lines.push(`- package.json sha256: \`${report.fingerprints.packageJsonSha256}\``);
  lines.push(`- lockfile: \`${report.fingerprints.lockfile || "none"}\``);
  if (report.fingerprints.lockfileSha256) {
    lines.push(`- lockfile sha256: \`${report.fingerprints.lockfileSha256}\``);
  }
  lines.push("");
  lines.push(`---`);
  lines.push("");
  lines.push(`### What to do next`);
  lines.push(`1) Fix any build/test failures first.`);
  lines.push(`2) Resolve any real secrets (rotate keys, purge history if needed).`);
  lines.push(`3) If keyword contamination is high, isolate brand modules and remove mixed assets.`);
  lines.push(`4) Send this report back here and Il convert it into a ranked patch plan.`);
  lines.push("");
  return lines.join("\n");
}

function main() {
  ensureDir(OUT_DIR);

  const report = {
    generatedAt: nowIso(),
    system: {
      os: `${os.type()} ${os.release()}`,
      node: process.version,
      npm: "",
    },
    repo: {
      root: ROOT,
      gitCommit: "",
      gitDirty: false,
    },
    build: {
      runs: [],
    },
    deps: {
      auditRan: false,
      vulnSummary: null,
      auditError: null,
    },
    env: {
      keys: [],
    },
    secrets: {
      findings: [],
    },
    keywords: {
      counts: {},
      topFiles: [],
    },
    fingerprints: {
      packageJsonSha256: "",
      lockfile: null,
      lockfileSha256: null,
    },
  };

  // npm version
  const npmV = run("npm", ["-v"]);
  report.system.npm = npmV.code === 0 ? npmV.stdout : "unknown";

  // git info
  const gitCommit = run("git", ["rev-parse", "HEAD"]);
  report.repo.gitCommit = gitCommit.code === 0 ? gitCommit.stdout : "no-git";
  const gitDirty = run("git", ["status", "--porcelain"]);
  report.repo.gitDirty = gitDirty.code === 0 && gitDirty.stdout.length > 0;

  // fingerprints
  const pkgPath = path.join(ROOT, "package.json");
  if (!fs.existsSync(pkgPath)) {
    console.error("[lisa-audit] package.json not found. Run from repo root.");
    process.exit(1);
  }
  report.fingerprints.packageJsonSha256 = sha256File(pkgPath);

  const lockCandidates = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"];
  for (const c of lockCandidates) {
    const fp = path.join(ROOT, c);
    if (fs.existsSync(fp)) {
      report.fingerprints.lockfile = c;
      report.fingerprints.lockfileSha256 = sha256File(fp);
      break;
    }
  }

  // read package.json scripts and run what exists (real data, no guessing)
  const pkg = readJson(pkgPath);
  const scripts = (pkg && pkg.scripts) ? pkg.scripts : {};
  const scriptOrder = ["check", "typecheck", "lint", "test", "build"];
  for (const s of scriptOrder) {
    if (scripts[s]) {
      const r = run("npm", ["run", s]);
      report.build.runs.push(r);
      // keep going; we want the full picture
    }
  }

  // npm audit (non-fatal)
  const audit = run("npm", ["audit", "--json"]);
  if (audit.code === 0 || audit.code === 1) {
    // 0 = no vulns; 1 = vulns found
    try {
      const data = JSON.parse(audit.stdout || "{}");
      report.deps.auditRan = true;

      // npm v7+ shape varies; normalize
      const meta = data.metadata || data;
      const vulns = meta.vulnerabilities || meta.advisories || null;

      if (meta && meta.vulnerabilities) {
        report.deps.vulnSummary = meta.vulnerabilities;
      } else if (data && data.vulnerabilities) {
        report.deps.vulnSummary = data.vulnerabilities;
      } else {
        report.deps.vulnSummary = vulns;
      }
    } catch (e) {
      report.deps.auditRan = false;
      report.deps.auditError = `could not parse npm audit json: ${String(e)}`;
    }
  } else {
    report.deps.auditRan = false;
    report.deps.auditError = audit.stderr || "npm audit failed";
  }

  // scan files
  const files = walkFiles(ROOT);
  const envKeys = [];
  const secretFindings = [];

  // keyword contamination scan (tune terms to your ecosystem)
  const keywords = [
    "mealscout",
    "tradescout",
    "4data",
    "lisa",
    "vac",
    "vua",
    "verify all claims",
    "sidekick",
    "county_metrics",
    "county_entities",
    "county_notes",
  ];
  const keywordCounts = Object.fromEntries(keywords.map((k) => [k, 0]));
  const perFileHits = []; // {file, hits:{k:n}}

  for (const fp of files) {
    if (!isTextFile(fp)) continue;
    const content = safeReadText(fp);
    if (!content) continue;

    // env keys
    for (const k of extractEnvKeysFromText(content)) envKeys.push(k);

    // secrets
    for (const f of secretHeuristicsFindings(fp, content)) secretFindings.push(f);

    // keywords
    const rel = path.relative(ROOT, fp);
    const hits = {};
    let any = false;
    for (const kw of keywords) {
      const c = grepCount(content.toLowerCase(), kw.toLowerCase());
      if (c > 0) {
        hits[kw] = c;
        keywordCounts[kw] += c;
        any = true;
      }
    }
    if (any) perFileHits.push({ file: rel, hits });
  }

  report.env.keys = unique(envKeys);
  report.secrets.findings = secretFindings;

  report.keywords.counts = keywordCounts;
  report.keywords.topFiles = perFileHits
    .sort((a, b) => {
      const sa = Object.values(a.hits).reduce((x, y) => x + y, 0);
      const sb = Object.values(b.hits).reduce((x, y) => x + y, 0);
      return sb - sa;
    })
    .slice(0, 25);

  // write report files
  const md = buildMarkdown(report);
  fs.writeFileSync(REPORT_MD, md, "utf8");
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), "utf8");

  console.log(`[lisa-audit] wrote: ${path.relative(ROOT, REPORT_MD)}`);
  console.log(`[lisa-audit] wrote: ${path.relative(ROOT, REPORT_JSON)}`);
}

main();
