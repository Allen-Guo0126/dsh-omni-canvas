/**
 * 严格验证：传"能力包 id"必须真正切换默认（写入真实绑定 id）并可被解析
 */
const { buildApi } = await import("../lib/api/server.js");
const { resolveDefaultImpl, loadBindingDoc, setDefaultBinding } = await import("../lib/workflow/bindings.js");

const config = { comfyUrl: "http://127.0.0.1:8188", comfyRoot: "E:/ComfyUI-aki-new" };
const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, config);

let fail = 0;
const ok = (m, c, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${m}${extra ? "  " + extra : ""}`); if (!c) fail += 1; };

const before = (await loadBindingDoc()).defaults["image-t2i"];
console.log("原默认:", before, "\n");

// 包 id → 期望落到的真实绑定 id
const CASES = [
  ["builtin:z-image", "image-t2i-7258f2", "z-image"],
  ["builtin:qwen-t2i-fast", "image-t2i-0738be", "Qwen 加速"],
  ["builtin:moss", "image-t2i-94f394", "MOSS"],
];

for (const [packId, expectId, label] of CASES) {
  const r = await api["impls.setDefault"]({ id: packId, capabilities: ["image-t2i"] }).catch((e) => ({ error: String(e.message) }));
  const saved = (await loadBindingDoc()).defaults["image-t2i"];
  const resolved = await resolveDefaultImpl("image-t2i");
  console.log(`传 ${packId}（${label}）`);
  console.log(`  接口返回 target=${r.target ?? r.error}`);
  console.log(`  实际写入     ${saved}`);
  console.log(`  解析得到     ${resolved ? resolved.name + " (" + resolved.id + ")" : "null ❌"}`);
  ok(`${label} 写入的是真实绑定 id`, saved === expectId, `${saved} vs ${expectId}`);
  ok(`${label} 能被解析回来`, Boolean(resolved) && resolved.id === expectId);
}

await setDefaultBinding({ capability: "image-t2i", target: before });
ok("已还原原默认", (await loadBindingDoc()).defaults["image-t2i"] === before,
   (await loadBindingDoc()).defaults["image-t2i"]);

// 真模板 id 仍允许（视频默认就是 builtin:h3-director）
const v = await api["impls.setDefault"]({ id: "builtin:h3-director", capabilities: ["video-r2v"] }).catch((e) => ({ error: String(e.message) }));
ok("内置模板 id 仍被接受", v.ok === true, JSON.stringify(v).slice(0, 80));

console.log(`\n=== 能力包 id 兼容：${fail ? "失败 " + fail : "全部通过"} ===`);
process.exit(fail ? 1 : 0);
