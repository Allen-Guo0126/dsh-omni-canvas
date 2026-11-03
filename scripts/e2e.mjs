/**
 * 端到端测试：直接调用重构后的宿主函数 + 真实 ComfyUI（不需要 DSH 重启）。
 * 覆盖：4K 超分（参考图注入 + 真实尺寸 + 进度）、文生图绑定、口播分段。
 * 运行：node scripts/e2e.mjs            （全部）
 *       node scripts/e2e.mjs upscale    （单项）
 */
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const which = process.argv[2] || "all";
const config = { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 15 * 60 * 1000 };
const { __test } = await import("../lib/index.js");
const T = __test();

const ok = [];
const bad = [];
const log = (st, name, extra = "") => {
  (st === "PASS" ? ok : bad).push(name);
  console.log(`${st.padEnd(5)} ${name.padEnd(46)} ${extra}`);
};

const bindings = JSON.parse(await readFile(join(homedir(), ".dsh", "omni-canvas.bindings.json"), "utf8"));

// 找一个有真实图片的项目，拿来当超分输入
async function pickSourceImage() {
  const base = join(homedir(), ".dsh", "projects");
  for (const proj of await readdir(base)) {
    const cvPath = join(base, proj, "canvas.json");
    try {
      const cv = JSON.parse(await readFile(cvPath, "utf8"));
      for (const n of cv.nodes || []) {
        const f = n?.data?.file;
        if (n.type === "image" && typeof f === "string" && f.endsWith(".png") && (n.data?.width || 0) >= 1000) {
          return { projectId: proj, file: f, abs: join(base, proj, f) };
        }
      }
    } catch {}
  }
  return null;
}

// ---------- 1. 4K 超分 ----------
async function testUpscale() {
  const b = bindings.bindings.find((x) => x.capability === "image-upscale" && x.id === bindings.defaults["image-upscale"]);
  if (!b) return log("SKIP", "4K 超分：没有默认 image-upscale 绑定");
  const src = await pickSourceImage();
  if (!src) return log("SKIP", "4K 超分：找不到可用输入图");

  const job = {
    id: "e2e-up-" + Date.now(),
    kind: "upscale",
    projectId: src.projectId,
    nodeId: "",
    refFiles: [src.file],
    implBindingId: b.id,
    implBindingName: b.name,
    prompt: "",
    seed: 20261103,
  };
  const t0 = Date.now();
  let peak = 0;
  const timer = setInterval(() => {
    if (job.promptId) peak = Math.max(peak, T.progressOf(job.promptId).percent || 0);
  }, 500);
  try {
    await T.runBindingImageJob({}, config, job);
    clearInterval(timer);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (job.status !== "done") throw new Error("状态不是 done: " + String(job.error || "").slice(0, 120));
    const w = job.asset?.params?.width, h = job.asset?.params?.height;
    if (!w || !h || w < 3000) throw new Error(`尺寸异常: ${w}×${h}`);
    log("PASS", "4K 超分（真实尺寸 + 参考图注入）", `${secs}s ${w}×${h} peak=${peak}%`);
  } catch (e) {
    clearInterval(timer);
    log("FAIL", "4K 超分", String(e?.message || e).slice(0, 160));
  }
}

// ---------- 2. 文生图（默认 MOSS 绑定） ----------
async function testT2I() {
  const b = bindings.bindings.find((x) => x.id === bindings.defaults["image-t2i"]);
  if (!b) return log("SKIP", "文生图：没有默认 image-t2i 绑定");
  const src = await pickSourceImage();
  const job = {
    id: "e2e-t2i-" + Date.now(),
    projectId: src?.projectId || "",
    nodeId: "",
    prompt: "竹林古装女子，墨绿抹胸长裙，晨雾侧光",
    seed: 20261103,
    aspect: "16:9",
    resolution: "1K",
    count: 1,
    implBindingId: b.id,
    implBindingName: b.name,
  };
  const t0 = Date.now();
  let peak = 0;
  const timer = setInterval(() => {
    if (job.promptId) peak = Math.max(peak, T.progressOf(job.promptId).percent || 0);
  }, 500);
  try {
    await T.runBindingImageJob({}, config, job);
    clearInterval(timer);
    if (job.status !== "done") throw new Error(String(job.error || "失败").slice(0, 120));
    log("PASS", "文生图（默认绑定 + 进度）", `${((Date.now() - t0) / 1000).toFixed(1)}s peak=${peak}%`);
  } catch (e) {
    clearInterval(timer);
    log("FAIL", "文生图", String(e?.message || e).slice(0, 160));
  }
}

// ---------- 3. 口播分段（不提交，只验分段与提示词） ----------
function testTalking() {
  try {
    const script = "第一句话说明今天的主题，让人愿意听下去。第二句话补充背景，交代清楚为什么重要。第三句话给出结论和行动建议。";
    const plan = T.splitTalkingScript(script, 15, 120);
    if (!plan.segments?.length) throw new Error("没有切出段落");
    if (plan.totalSeconds > 120) throw new Error("总时长超 120s");
    const prompt = T.renderTalkingSegments(plan.segments[0], { person: "p.png", scene: null, index: 0, total: 1, refMode: "combined" });
    if (!/Picture 1/.test(prompt) || !/<Subject 1>/.test(prompt)) throw new Error("提示词缺少 Picture 1 / <Subject 1> 锚点");
    if (!/<d>/.test(prompt)) throw new Error("提示词缺少 <d> 台词块");
    log("PASS", "口播分段 + 六段式提示词", `${plan.segments.length} 段 / ${plan.totalSeconds}s`);
  } catch (e) {
    log("FAIL", "口播分段", String(e?.message || e).slice(0, 160));
  }
}

// ---------- 4. 队列唯一入口 ----------
function testDispatch() {
  try {
    const job = { id: "e2e-q-" + Date.now(), projectId: "", status: "queued" };
    let ran = false;
    T.submitJob({ ctx: {}, config, job, runner: async () => { ran = true; } });
    if (!T.JOBS.has(job.id)) throw new Error("submitJob 未登记 JOBS");
    setTimeout(() => {
      log(ran ? "PASS" : "FAIL", "submitJob 登记 + 入队 + 执行", ran ? "" : "runner 未执行");
      finish();
    }, 800);
  } catch (e) {
    log("FAIL", "submitJob", String(e?.message || e).slice(0, 160));
    finish();
  }
}

// ---------- 5. 视频（内置 H3 导演台，6 秒 t2v） ----------
async function testVideo() {
  const src = await pickSourceImage();
  const job = {
    id: "e2e-vid-" + Date.now(),
    projectId: src?.projectId || "",
    nodeId: "",
    prompt: "A woman walks through bamboo forest at dawn, mist drifting, slow camera push-in",
    mode: "t2v",
    model: "h3-director",
    duration: 6,
    aspect: "16:9",
    resolution: "480p",
    status: "queued",
    startedAt: Date.now(),
  };
  const t0 = Date.now();
  let peak = 0;
  const timer = setInterval(() => {
    if (job.promptId) peak = Math.max(peak, T.progressOf(job.promptId).percent || 0);
  }, 800);
  try {
    await T.runVideoJob({}, config, job);
    clearInterval(timer);
    if (job.status !== "done") throw new Error(String(job.error || "失败").slice(0, 160));
    if (!job.asset?.file) throw new Error("没有产物");
    log("PASS", "视频生成（内置 H3 导演台）", `${((Date.now() - t0) / 1000).toFixed(1)}s peak=${peak}%`);
  } catch (e) {
    clearInterval(timer);
    log("FAIL", "视频生成", String(e?.message || e).slice(0, 160));
  }
}

let done = false;
function finish() {
  if (done) return;
  done = true;
  console.log(`\n=== e2e 汇总：通过 ${ok.length} / 失败 ${bad.length} ===`);
  process.exit(bad.length ? 1 : 0);
}

testTalking();
if (which === "all" || which === "upscale") await testUpscale();
if (which === "all" || which === "t2i") await testT2I();
if (which === "all" || which === "video") await testVideo();
testDispatch();
setTimeout(finish, 60_000);
