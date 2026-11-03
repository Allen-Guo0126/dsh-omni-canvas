#!/usr/bin/env node
/**
 * 检查 node 内建（readFile/join/homedir/rm…）是否在用到它们的模块里 import 了。
 * 重构搬移代码时最容易漏这一类，漏了就是接口 500 / 面板空白。
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const LIB = fileURLToPath(new URL("../lib/", import.meta.url));
const BUILTINS = ["readFile","writeFile","mkdir","readdir","rm","stat","rename","copyFile","appendFile",
  "join","dirname","resolve","homedir","randomUUID","createHash","execFile","spawn","fileURLToPath",
  "basename","extname","tmpdir","platform"];
const SKIP_DIRS = new Set(["client-src"]);

const files = [];
async function walk(d) {
  for (const e of await readdir(d, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) await walk(join(d, e.name)); continue; }
    if (e.name.endsWith(".js") && e.name !== "client-main.js") files.push(join(d, e.name));
  }
}
await walk(LIB);

const problems = [];
for (const f of files) {
  const src = await readFile(f, "utf8");
  const have = new Set();
  for (const m of src.matchAll(/import\s*\{([\s\S]*?)\}\s*from/g))
    for (const part of m[1].split(",")) { const n = part.trim().split(" as ").pop().trim(); if (n) have.add(n); }
  for (const m of src.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from/g)) have.add(m[1]);
  for (const m of src.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) have.add(m[1]);

  const miss = BUILTINS.filter((b) => {
    const re = new RegExp(`(?<![\\w$.])${b}\\s*\\(`);
    return re.test(src) && !have.has(b);
  });
  if (miss.length) problems.push([relative(LIB, f), miss]);
}

if (!problems.length) { console.log(`内建 import 检查：${files.length} 个模块全部通过`); process.exit(0); }
for (const [f, m] of problems) console.log(`${f}: ${m.join(", ")}`);
process.exit(1);
