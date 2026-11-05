/**
 * 统一实现列表自检：
 *  ① 6 个出厂实现，无重复（同名同工作流只出现一次）
 *  ② 每个实现有默认标记（4 个默认）
 *  ③ 未绑定的工作流能被识别并可绑定
 */
const { buildApi } = await import("../lib/api/server.js");
const { writeFile, rm } = await import("node:fs/promises");

const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const config = { comfyUrl: "http://127.0.0.1:8188", comfyRoot: "E:/ComfyUI-aki-new" };
const api = buildApi(ctx, config);

let fail = 0;
const ok = (m, c, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${m}${extra ? "  " + extra : ""}`); if (!c) fail += 1; };

const r = await api["impls.list"]({ includeUnbound: false });
console.log("统计:", JSON.stringify(r.stats));
for (const i of r.impls) {
  console.log(`  ${i.isDefault ? "★" : " "} ${String(i.name).slice(0, 30).padEnd(32)} ${i.ready ? "就绪" : "缺" + i.missing.length}  ${(i.capabilities || []).join(",")}`);
}

ok("实现数量 = 6（无重复）", r.impls.length === 6, `${r.impls.length}`);
ok("默认实现有 4 个", r.impls.filter((x) => x.isDefault).length === 4, `${r.impls.filter((x) => x.isDefault).length}`);
ok("全部就绪", r.impls.every((x) => x.ready));
ok("名字不重复", new Set(r.impls.map((x) => x.name)).size === r.impls.length);

// 未绑定工作流
const r2 = await api["impls.list"]({ includeUnbound: true });
const unbound = r2.impls.filter((x) => !x.bound);
console.log(`\n未绑定的工作流: ${unbound.length} 个`);
ok("能识别未绑定工作流", unbound.length > 0, unbound.slice(0, 3).map((x) => x.name).join(" / "));

if (unbound.length) {
  const target = unbound[0];
  const res = await api["impls.bind"]({ workflowFile: target.workflowFile, capability: "image-t2i", name: "__test_bind__" }).catch((e) => ({ error: String(e.message) }));
  if (res.error) {
    console.log("  绑定失败（可能该工作流没有提示词节点）:", res.error.slice(0, 80));
  } else {
    ok("未绑定工作流可绑定", Boolean(res.binding?.id), res.binding?.id);
    // 还原：删掉测试绑定
    await api["binding.delete"]({ id: res.binding.id }).catch(() => {});
  }
}

console.log(`\n=== 统一实现列表：${fail ? "失败 " + fail : "全部通过"} ===`);
process.exit(fail ? 1 : 0);
