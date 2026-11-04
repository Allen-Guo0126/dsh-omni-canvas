/**
 * 合成：挑两个已有视频片段 → video.concat → 产物落回画布
 * 只提交并核对结果，不长时间等待。
 */
const { buildApi } = await import("../lib/api/server.js");

const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 20 * 60 * 1000 });

const PID = "e6abc13b";
const cv = (await api["canvas.get"]({ id: PID })).canvas;
const vids = (cv.nodes || []).filter((n) => n.type === "video" && n.data?.file);
console.log("可用视频片段:", vids.length);
if (vids.length < 2) { console.log("SKIP 片段不足"); process.exit(0); }

const pick = vids.slice(0, 2).map((n) => n.id);
console.log("挑选:", pick.join(", "));

const t0 = Date.now();
const r = await api["video.concat"]({ projectId: PID, nodeIds: pick, title: "选中片段合成" });
console.log("concat 返回:", JSON.stringify(r).slice(0, 200));

const after = (await api["canvas.get"]({ id: PID })).canvas;
const made = (after.nodes || []).filter((n) => n.data?.title === "选中片段合成");
console.log(`耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s | 画布新增合成节点: ${made.length}`);
if (made.length) {
  const f = made[made.length - 1].data?.file;
  console.log("产物文件:", f);
  const fs = await import("node:fs/promises");
  const st = await fs.stat(`${process.env.USERPROFILE}\\.dsh\\projects\\${PID}\\${f}`).catch(() => null);
  console.log(st ? `PASS 产物存在 ${(st.size / 1024).toFixed(0)}KB` : "FAIL 产物文件不存在");
}
process.exit(made.length ? 0 : 1);
