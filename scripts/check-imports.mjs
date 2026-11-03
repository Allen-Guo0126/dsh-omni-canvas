#!/usr/bin/env node
/**
 * 跨模块符号检查（精确版）：只看「lib 内部 export 的函数/常量」，
 * 若某模块调用了它却既没 import 也没本地声明 → 报错。
 *
 * 用途：防止重构搬移代码时「函数搬走了但忘了 import」这类事故上线
 *（2026-11-03 就因 readBody/writeJsonRes 漏 import 导致 API 全 400、面板空白）。
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const LIB = fileURLToPath(new URL("../lib/", import.meta.url));
const SKIP_DIRS = new Set(["client-src"]);
const SKIP_FILES = new Set(["client-main.js", "client.js"]);

const files = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) await walk(join(dir, e.name));
      continue;
    }
    if (e.name.endsWith(".js") && !SKIP_FILES.has(e.name)) files.push(join(dir, e.name));
  }
}
await walk(LIB);

const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const sources = new Map();
for (const f of files) sources.set(f, stripComments(await readFile(f, "utf8")));

// 收集 lib 内所有 export 的名字
const exported = new Set();
for (const [, src] of sources) {
  for (const m of src.matchAll(/^export (?:async function|function|const|let)\s+([A-Za-z_$][\w$]*)/gm)) {
    exported.add(m[1]);
  }
}

const problems = [];
for (const [f, src] of sources) {
  const imported = new Set();
  for (const m of src.matchAll(/import\s*\{([\s\S]*?)\}\s*from/g)) {
    for (const part of m[1].split(",")) {
      const n = part.trim().split(" as ").pop().trim();
      if (n) imported.add(n);
    }
  }
  for (const m of src.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from/g)) imported.add(m[1]);

  const declared = new Set();
  for (const m of src.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);

  const missing = [];
  for (const name of exported) {
    if (imported.has(name) || declared.has(name)) continue;
    const re = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, "\\$")}\\s*\\(`);
    if (re.test(src)) missing.push(name);
  }
  if (missing.length) problems.push([relative(LIB, f), missing]);
}

if (!problems.length) {
  console.log(`跨模块符号检查：${files.length} 个模块全部通过`);
  process.exit(0);
}
for (const [f, miss] of problems) console.log(`${f}: ${miss.join(", ")}`);
console.log(`\n发现 ${problems.length} 个模块存在「调用了但没 import」的符号`);
process.exit(1);
