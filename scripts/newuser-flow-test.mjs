/**
 * 新用户流程自检：模拟"刚装完插件、一个模型都没有"的机器
 *  ① 出厂包必须存在（不依赖用户导出）
 *  ② 每个包能报出缺哪些模型
 *  ③ 下载按钮在没直链时给"手动下载指引"，而不是静默失败
 */
import { mkdirSync, rmSync } from "node:fs";
const { buildApi } = await import("../lib/api/server.js");

const EMPTY = "E:/Allen/.tmp/fake-comfy-new-user";
rmSync(EMPTY, { recursive: true, force: true });
mkdirSync(EMPTY, { recursive: true });

const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, { comfyUrl: "http://127.0.0.1:8188", comfyRoot: EMPTY });

let fail = 0;
const ok = (m, c, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${m}${extra ? "  " + extra : ""}`); if (!c) fail += 1; };

const r = await api["pack.list"]();
const builtins = r.packs.filter((p) => p.source === "builtin");
console.log("== 新用户打开看到的能力 ==");
for (const p of builtins) {
  console.log(`  ${p.name}`);
  console.log(`    能力: ${(p.capabilities || []).join(" / ")}`);
  console.log(`    状态: 缺 ${p.missing.length}/${(p.deps || []).length} 个模型`);
}
console.log("汇总:", JSON.stringify(r.summary));

ok("出厂包存在（无需用户导出）", builtins.length >= 4, `${builtins.length} 个`);
ok("图生图在出厂包里", builtins.some((p) => (p.capabilities || []).includes("image-edit")));
ok("导演台覆盖 4 种视频能力", builtins.some((p) => (p.capabilities || []).length >= 4));
ok("缺模型能逐个列出", builtins.every((p) => p.missing.length > 0));
ok("汇总显示缺失总数", r.summary.missingModels > 0, `${r.summary.missingModels} 个`);

// 下载按钮：没有直链 → 手动指引
const one = builtins[0];
const dl = await api["pack.download"]({ id: one.id });
console.log("\n下载返回:", JSON.stringify({ started: dl.started?.slice(0, 1), manual: dl.manual?.slice(0, 1) }).slice(0, 300));
ok("没直链时给手动下载指引", (dl.manual || []).length > 0, `${(dl.manual || []).length} 条`);
ok("指引里带目标目录", Boolean(dl.manual?.[0]?.hint), dl.manual?.[0]?.hint || "");
ok("指引里带搜索链接", Boolean(dl.manual?.[0]?.hfSearch));

rmSync(EMPTY, { recursive: true, force: true });
console.log(`\n=== 新用户流程：${fail ? "失败 " + fail : "全部通过"} ===`);
process.exit(fail ? 1 : 0);
