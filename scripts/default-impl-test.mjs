/**
 * 「设为默认」回归：
 *  ① 每条文生图实现都能设为默认
 *  ② 设完能被 resolveDefaultImpl 真正解析出来（不是 null）
 *  ③ 传无效 builtin: id 必须报错而不是静默写入
 */
const { buildApi } = await import("../lib/api/server.js");
const { resolveDefaultImpl, setDefaultBinding, loadBindingDoc } = await import("../lib/workflow/bindings.js");

const config = { comfyUrl: "http://127.0.0.1:8188", comfyRoot: "E:/ComfyUI-aki-new" };
const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, config);

let fail = 0;
const ok = (m, c, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${m}${extra ? "  " + extra : ""}`); if (!c) fail += 1; };

const before = (await loadBindingDoc()).defaults || {};
console.log("原始默认 image-t2i =", before["image-t2i"]);

const res = await api["impls.list"]({ includeUnbound: false });
const t2i = res.impls.filter((i) => (i.capabilities || []).includes("image-t2i"));
console.log("\n文生图候选:");
for (const i of t2i) console.log(`  ${i.name}  id=${i.id}  defaultTarget=${i.defaultTarget}  isDefault=${i.isDefault}`);

ok("每条都给出了可用的 defaultTarget", t2i.every((i) => typeof i.defaultTarget === "string" && i.defaultTarget.length > 0));

for (const i of t2i) {
  const r = await setDefaultBinding({ capability: "image-t2i", target: i.defaultTarget });
  const resolved = await resolveDefaultImpl("image-t2i");
  console.log(`\n设为 ${i.name} → setDefault=${r.ok} · 解析=${resolved ? resolved.name + " (" + resolved.id + ")" : "null ❌"}`);
  ok(`${i.name} 设默认后能被解析`, Boolean(resolved));
  ok(`${i.name} 解析到的是它自己`, resolved && (resolved.id === i.bindingId || resolved.name === i.name),
     resolved ? resolved.id : "null");
}

// 无效 id 必须被拒
const bad = await setDefaultBinding({ capability: "image-t2i", target: "builtin:z-image" });
console.log("\n传无效 id(builtin:z-image):", JSON.stringify(bad));
ok("无效 builtin id 被拒绝", bad.ok === false);

// 还原
await setDefaultBinding({ capability: "image-t2i", target: before["image-t2i"] });
const restored = await resolveDefaultImpl("image-t2i");
console.log("\n还原后 image-t2i 解析:", restored ? restored.name : "null");
ok("已还原原默认", (await loadBindingDoc()).defaults["image-t2i"] === before["image-t2i"]);

console.log(`\n=== 设为默认：${fail ? "失败 " + fail : "全部通过"} ===`);
process.exit(fail ? 1 : 0);
