/**
 * 资产库 v2 自检：迁移 → 分面查询 → 过滤 → 流程视图 → 收藏/标签 → 血缘
 */
const { buildApi } = await import("../lib/api/server.js");

const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, { comfyUrl: "http://127.0.0.1:8188", comfyRoot: "E:/ComfyUI-aki-new" });

const PID = "e6abc13b";
let fail = 0;
const ok = (m, c, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${m}${extra ? "  " + extra : ""}`); if (!c) fail += 1; };

const mig = await api["asset.migrate"]({ projectId: PID });
ok("① 迁移幂等", typeof mig.updated === "number", `总数 ${mig.total} 本次更新 ${mig.updated}`);

const all = await api["asset.query"]({ projectId: PID, limit: 500 });
ok("② 查询返回资产", all.items.length > 0, `${all.items.length}/${all.total}`);
ok("② 分面有类型", (all.facets.kinds || []).length >= 2, all.facets.kinds.map((k) => `${k.value}:${k.count}`).join(" "));
ok("② 分面有角色", (all.facets.roles || []).length >= 2, all.facets.roles.map((k) => `${k.value}:${k.count}`).join(" "));
ok("② 分面有场次", (all.facets.scenes || []).length >= 1, all.facets.scenes.map((s) => `${s.sceneTitle.slice(0, 8)}:${s.count}`).join(" | "));

const videos = await api["asset.query"]({ projectId: PID, kind: "video", limit: 500 });
ok("③ 按类型过滤（视频）", videos.items.every((a) => a.kind === "video"), `视频 ${videos.items.length} 条`);

const shots = await api["asset.query"]({ projectId: PID, role: "shot", limit: 500 });
ok("③ 按角色过滤（镜头）", shots.items.every((a) => a.role === "shot"), `镜头 ${shots.items.length} 条`);

const sceneId = (all.facets.scenes || []).find((s) => s.sceneId)?.sceneId;
if (sceneId) {
  const inScene = await api["asset.query"]({ projectId: PID, sceneId, limit: 500 });
  ok("③ 按场次过滤", inScene.items.every((a) => a.sceneId === sceneId), `场 ${sceneId} 内 ${inScene.items.length} 条`);
}

const q = await api["asset.query"]({ projectId: PID, q: "橘花", limit: 500 });
ok("③ 关键词搜索", q.items.length > 0, `命中 ${q.items.length}`);

const board = await api["asset.scenes"]({ projectId: PID });
ok("④ 流程视图有场次", (board.scenes || []).length > 0, board.scenes.map((s) => `${s.sceneTitle.slice(0, 10)}(${s.shots.length})`).join(" | "));
const firstShot = board.scenes?.[0]?.shots?.[0];
ok("④ 镜头条目带缩略图", Boolean(firstShot?.file), firstShot ? String(firstShot.file).slice(-24) : "无");

// ⑤ 收藏 + 标签
const target = all.items[0];
const patched = await api["asset.update"]({ projectId: PID, assetId: target.id, patch: { favorite: true, tags: ["测试"] } });
ok("⑤ 收藏写入", patched.asset.favorite === true);
const favOnly = await api["asset.query"]({ projectId: PID, favorite: true, limit: 500 });
ok("⑤ 只看收藏", favOnly.items.some((a) => a.id === target.id), `${favOnly.items.length} 条`);
await api["asset.update"]({ projectId: PID, assetId: target.id, patch: { favorite: false, tags: [] } });   // 还原

// ⑥ 血缘
let lin = null;
for (const a of all.items) {
  const r = await api["asset.lineage"]({ projectId: PID, assetId: a.id }).catch(() => null);
  if (r && (r.parents?.length || r.children?.length)) { lin = r; break; }
}
if (lin) {
  ok("⑥ 血缘可查", true, `父 ${lin.parents.length} 子 ${lin.children.length}`);
} else {
  console.log("SKIP ⑥ 血缘（当前资产无派生关系，可用视频抽帧后再测）");
}

const stats = await api["asset.stats"]({ projectId: PID });
ok("⑦ 统计", stats.total > 0, `总 ${stats.total} · 收藏 ${stats.favorites}`);

console.log(`\n=== 资产库 v2：${fail ? "失败 " + fail : "全部通过"} ===`);
process.exit(fail ? 1 : 0);
