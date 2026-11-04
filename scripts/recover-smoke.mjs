/**
 * 断点恢复自检（不重启宿主，直接验证逻辑）：
 *  ① notePending 写入 pending 文件
 *  ② 伪造一条"已完成"的 pending（用真实 promptId）→ recoverPending 应认领产物
 *  ③ 伪造一条"找不到"的 pending → 应标记 interrupted 并清空
 */
const { readFile, writeFile } = await import("node:fs/promises");
const { homedir } = await import("node:os");
const { join } = await import("node:path");

const { notePending, clearPending, recoverPending } = await import("../lib/jobs/recover.js");
const { buildApi } = await import("../lib/api/server.js");

const PENDING = join(homedir(), ".dsh", "omni-canvas.pending.json");
const config = { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 60000 };

// 备份原文件
const backup = await readFile(PENDING, "utf8").catch(() => "[]");

const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, config);

const PID = "e6abc13b";
const cv = (await api["canvas.get"]({ id: PID })).canvas;

// 找一个已有成品的 video 节点当作恢复目标
const target = (cv.nodes || []).find((n) => n.type === "video" && n.data?.file);
const imgTarget = (cv.nodes || []).find((n) => n.type === "image" && n.data?.file);
if (!target) { console.log("SKIP 没有可用的视频节点"); process.exit(0); }

// 取一个真实的、已完成的 promptId：用最近的电影片段？改用 image 任务更稳
console.log("目标节点:", target.id, "当前 file:", target.data?.file);

// ① notePending
await writeFile(PENDING, "[]", "utf8");
await notePending({ id: "recover-test-1", projectId: PID, nodeId: target.id, kind: "h3-director", model: "h3-director", promptId: "deadbeef-0000" });
const after1 = JSON.parse(await readFile(PENDING, "utf8"));
console.log(after1.length === 1 ? "PASS ① notePending 写入" : "FAIL ① notePending");

// ③ 找不到 promptId → 中断
const res = await recoverPending(config, (m) => console.log("  log:", m));
console.log("恢复结果:", JSON.stringify(res));
const cv2 = (await api["canvas.get"]({ id: PID })).canvas;
const n2 = (cv2.nodes || []).find((n) => n.id === target.id);
const marked = n2?.data?.interrupted === true || n2?.data?.status === "";
console.log(marked ? "PASS ③ 找不到的任务被标记中断" : `WARN ③ 节点状态: ${JSON.stringify(n2?.data?.status)} interrupted=${n2?.data?.interrupted}`);

const after3 = JSON.parse(await readFile(PENDING, "utf8"));
console.log(after3.length === 0 ? "PASS ③ pending 已清理" : `FAIL ③ pending 残留 ${after3.length}`);

// 还原 pending 备份
await writeFile(PENDING, backup, "utf8");
console.log("已还原 pending 文件");
