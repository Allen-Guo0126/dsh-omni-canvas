/**
 * 数字人口播回归：走 talking 分支不能再抛 TDZ，且能正常建任务（立刻取消，避免占用 GPU）
 */
const { buildApi } = await import("../lib/api/server.js");

const config = { comfyUrl: "http://127.0.0.1:8188", comfyRoot: "E:/ComfyUI-aki-new", requestTimeoutMs: 60000 };
const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, config);

const PID = "e6abc13b";
const cv = (await api["canvas.get"]({ id: PID })).canvas;
const person = (cv.nodes || []).find((n) => n.type === "image" && n.data?.file);

let fail = 0;
const ok = (m, c, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${m}${extra ? "  " + extra : ""}`); if (!c) fail += 1; };

console.log("参考人物图:", person?.data?.file || "（无）");

try {
  const r = await api["gen.video"]({
    projectId: PID, nodeId: "", mode: "talking",
    script: "这是一次口播测试。第二句话。第三句话。",
    duration: 6, aspect: "16:9", resolution: "480p",
    refFiles: person?.data?.file ? [person.data.file] : [],
  });
  console.log("提交结果:", JSON.stringify(r).slice(0, 200));
  ok("口播不再抛 TDZ（能建任务）", Boolean(r.jobId), r.jobId || "");
  ok("分段数 > 0", (r.talking?.segments || 0) > 0, `${r.talking?.segments} 段 / ${r.talking?.totalSeconds}s`);
  if (r.jobId) {
    await api["job.cancel"]({ jobId: r.jobId }).catch(() => {});
    console.log("已取消测试任务:", r.jobId);
  }
} catch (e) {
  const msg = String(e.message || e);
  console.log("失败:", msg);
  ok("口播不再抛 TDZ", !/before initialization/.test(msg));
  fail += 1;
}

// 非口播分支仍正常
try {
  const r2 = await api["gen.video"]({
    projectId: PID, nodeId: "", mode: "r2v",
    prompt: "subject_definitions:\n<Subject 1> is the person in <Picture 1>.", duration: 3,
    aspect: "16:9", resolution: "480p",
    refFiles: person?.data?.file ? [person.data.file] : [],
  });
  ok("普通参考生视频仍可提交", Boolean(r2.jobId));
  if (r2.jobId) await api["job.cancel"]({ jobId: r2.jobId }).catch(() => {});
} catch (e) {
  console.log("普通分支失败:", String(e.message).slice(0, 120));
  fail += 1;
}

console.log(`\n=== 数字人口播：${fail ? "失败 " + fail : "全部通过"} ===`);
process.exit(fail ? 1 : 0);
