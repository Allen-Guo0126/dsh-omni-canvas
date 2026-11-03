#!/usr/bin/env node
/**
 * 极简客户端打包器：把 lib/client-src/*.js（CJS 子模块）+ lib/client-main.js（工厂体）
 * 组装成 DSH 需要的单文件 lib/client.js（window.__ModuleLoader__.load 形式）。
 *
 * 为什么不用 esbuild：本机没有打包器依赖，而 DSH 的客户端是
 * `window.__ModuleLoader__.load({ id, factory })` 的 CJS 形态，只需要"文件内联"，
 * 不需要 ESM 静态分析。这个脚本只做拼接，保证行为与拆分前逐行一致。
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url)); // 包根
const SRC = join(HERE, "lib", "client-src");

const read = (p) => readFile(p, "utf8");

const poller = await read(join(SRC, "_poller.txt"));
const head = await read(join(SRC, "_head.txt"));
const tail = await read(join(SRC, "_tail.txt"));
const main = await read(join(HERE, "lib", "client-main.js"));

const MODULES = ["styles.js"];

let out = poller;
out += head; // window.__ModuleLoader__.load({ id, factory: (require) => {
out += '\t\t/* ---- 子模块（构建时内联；源文件在 lib/client-src/） ---- */\n';
out += "\t\tconst __sub = Object.create(null);\n\n";

for (const name of MODULES) {
  const body = await read(join(SRC, name));
  out += `\t\t__sub["./${name}"] = (function () {\n`;
  out += `\t\t\tconst module = { exports: {} };\n`;
  out += `\t\t\tconst exports = module.exports;\n`;
  out += body.split("\n").map((l) => (l ? `\t\t\t${l}` : "")).join("\n");
  out += `\n\t\t\treturn module.exports;\n`;
  out += `\t\t})();\n\n`;
}

out += "\t\t/* ---- 主逻辑 ---- */\n";
out += main;
out += tail;

const target = join(HERE, "lib", "client.js");
await writeFile(target, out, "utf8");
console.log(`bundle: lib/client.js  ${out.split("\n").length} 行（main ${main.split("\n").length} + styles ${MODULES.length} 个子模块）`);
