/**
 * 模型与依赖自检：内置 + 用户包合并、依赖明细、缺模型时能报出来
 */
const { buildApi } = await import("../lib/api/server.js");

const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, { comfyUrl: "http://127.0.0.1:8188", comfyRoot: "E:/ComfyUI-aki-new" });

let fail = 0;
const ok = (m, c, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${m}${extra ? "  " + extra : ""}`); if (!c) fail += 1; };

const r = await api["pack.list"]();
const packs = r.packs || [];
console.log("汇总:", JSON.stringify(r.summary));
for (const p of packs) {
  const deps = p.deps || [];
  console.log(`  [${p.source === "builtin" ? "内置" : "我的"}] ${p.name.padEnd(30)} ${p.ready ? "就绪" : "缺 " + p.missing.length}  依赖 ${deps.length} 个  ${(p.capabilities || []).join(",")}`);
}

ok("内置模板已纳入", packs.some((p) => p.source === "builtin"), `${packs.filter((p) => p.source === "builtin").length} 个`);
ok("图生图在内", packs.some((p) => (p.capabilities || []).includes("image-edit")));
ok("H3 导演台覆盖四种视频能力",
  packs.some((p) => p.name.includes("H3") && (p.capabilities || []).length >= 4),
  JSON.stringify(packs.find((p) => p.name.includes("H3"))?.capabilities || []));
ok("每个包都有依赖明细", packs.every((p) => (p.deps || []).length > 0));
ok("依赖带 ok 标记", packs.every((p) => (p.deps || []).every((d) => typeof d.ok === "boolean")));
ok("汇总行存在", typeof r.summary?.ready === "number", `${r.summary.ready}/${r.summary.total}`);
ok("缺模型数为 0（本机齐全）", r.summary.missingModels === 0);

console.log(`\n=== 模型与依赖：${fail ? "失败 " + fail : "全部通过"} ===`);
process.exit(fail ? 1 : 0);
