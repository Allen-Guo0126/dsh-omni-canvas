import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const LIB = fileURLToPath(new URL("../lib/", import.meta.url));
const SKIP = new Set(["client-main.js"]);   // 片段文件（含 return）
const files = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (e.name.endsWith(".js") && !SKIP.has(e.name)) files.push(p);
  }
}
await walk(LIB);
let bad = 0;
for (const f of files) {
  try {
    await run(process.execPath, ["--check", f]);
  } catch (e) {
    bad += 1;
    console.log("FAIL", f, String(e.stderr || e).split("\n").slice(0, 3).join(" "));
  }
}
console.log(`语法检查：${files.length - bad}/${files.length} 通过`);
process.exit(bad ? 1 : 0);
