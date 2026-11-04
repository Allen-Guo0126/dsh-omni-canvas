/**
 * 验证"连续提交多条 → 全部入队 → 串行执行"（不等待出结果，提交完立即返回）。
 */
const { buildApi } = await import("../lib/api/server.js");
const { writeFile } = await import("node:fs/promises");

const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 20 * 60 * 1000 });

const PID = "e6abc13b";
const cv = (await api["canvas.get"]({ id: PID })).canvas;
const img = (cv.nodes || []).map((n) => n.data?.file).find((f) => /\.(png|jpg)$/i.test(String(f || "")));
if (!img) { console.log("SKIP 没有参考图"); process.exit(0); }

const ids = [];
for (let i = 1; i <= 3; i += 1) {
  const r = await api["gen.video"]({
    projectId: PID, nodeId: "",
    prompt: `queue test ${i}\nA person says: <d>[队列测试${i}]</d>`,
    mode: "r2v", duration: 3, aspect: "16:9", resolution: "480p",
    refFiles: [img],
  });
  ids.push(r.jobId);
  console.log(`提交 ${i}: ${r.jobId}  queued=${r.queued}`);
}
const list = await api["job.list"]();
console.log("当前 running:", list.running && list.running.id);
console.log("排队数量:", (list.queue || []).length);
console.log("排队里的 id:", (list.queue || []).map((x) => x.id).slice(0, 6));

const ok = (list.queue || []).length >= 2;
console.log(ok ? "\nPASS 连续提交被正确排队（不会互相顶掉）" : "\nFAIL 排队异常");
await writeFile("E:/Allen/.tmp/probes/_queue_ids.txt", ids.join("\n"), "utf8");
process.exit(ok ? 0 : 1);
