/**
 * 模拟"一台没装模型的机器"：comfyRoot 指向空目录 → 所有依赖都缺，检查提示是否清楚
 */
import { mkdirSync, rmSync } from "node:fs";
const { buildApi } = await import("../lib/api/server.js");

const EMPTY = "E:/Allen/.tmp/fake-comfy-empty";
rmSync(EMPTY, { recursive: true, force: true });
mkdirSync(EMPTY, { recursive: true });

const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, { comfyUrl: "http://127.0.0.1:8188", comfyRoot: EMPTY });

const r = await api["pack.list"]();
console.log("汇总:", JSON.stringify(r.summary), "\n");
for (const p of r.packs.slice(0, 4)) {
  console.log(`[${p.source}] ${p.name}`);
  console.log(`   状态: ${p.ready ? "就绪" : `缺 ${p.missing.length} 个模型`}  依赖 ${(p.deps || []).length} 个`);
  for (const m of p.missing.slice(0, 3)) console.log(`     ✗ ${m.file}  (${m.dir})`);
}
console.log("\n首页横幅会显示: 有", r.summary.missingModels, "个模型没下载");
rmSync(EMPTY, { recursive: true, force: true });
