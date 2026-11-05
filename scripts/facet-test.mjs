/**
 * 分面筛选回归：按场景筛选后，标签栏必须还能看到其它场和「全部」
 */
const { buildApi } = await import("../lib/api/server.js");

const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, { comfyUrl: "http://127.0.0.1:8188", comfyRoot: "E:/ComfyUI-aki-new" });

const PID = "e6abc13b";
let fail = 0;
const ok = (m, c, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${m}${extra ? "  " + extra : ""}`); if (!c) fail += 1; };

const all = await api["asset.query"]({ projectId: PID, limit: 500 });
const allScenes = all.facets.scenes || [];
console.log("未筛选时的场次标签:", allScenes.map((s) => `${s.sceneTitle.slice(0, 10)}(${s.count})`).join(" | "));

const target = allScenes.find((s) => s.sceneId);
ok("至少有一个场次可选", Boolean(target));

if (target) {
  const filtered = await api["asset.query"]({ projectId: PID, sceneId: target.sceneId, limit: 500 });
  const fScenes = filtered.facets.scenes || [];
  console.log("\n按场筛选后：");
  console.log("  结果条数:", filtered.items.length);
  console.log("  场次标签:", fScenes.map((s) => `${s.sceneTitle.slice(0, 10)}(${s.count})`).join(" | "));
  ok("筛选后「其它场次」仍在标签栏", fScenes.length === allScenes.length,
     `${fScenes.length} vs ${allScenes.length}`);
  ok("筛选结果确实收窄", filtered.items.length < all.total || filtered.items.every((a) => a.sceneId === target.sceneId));

  // 清除筛选
  const cleared = await api["asset.query"]({ projectId: PID, limit: 500 });
  ok("清除筛选后恢复全部", cleared.items.length === all.total, `${cleared.items.length}/${all.total}`);
}

// 类型/角色分面同理
const vids = await api["asset.query"]({ projectId: PID, kind: "video", limit: 500 });
ok("按类型筛选后类型标签不塌缩", (vids.facets.kinds || []).length === (all.facets.kinds || []).length,
   `${(vids.facets.kinds || []).length} vs ${(all.facets.kinds || []).length}`);

const roles = await api["asset.query"]({ projectId: PID, role: "shot", limit: 500 });
ok("按角色筛选后角色标签不塌缩", (roles.facets.roles || []).length === (all.facets.roles || []).length);

console.log(`\n=== 分面筛选：${fail ? "失败 " + fail : "全部通过"} ===`);
process.exit(fail ? 1 : 0);
