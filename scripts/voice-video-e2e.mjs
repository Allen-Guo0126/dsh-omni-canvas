/**
 * 音色 → 视频 端到端：带 voiceFile 跑一条 5 秒视频，验证
 *   ① 提交图里 timeline_data.global.refAudios 指向该音频
 *   ② 成片有音轨且非静音
 */
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const { __test } = await import("../lib/index.js");
const T = __test();
const config = { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 20 * 60 * 1000 };

const projects = await readdir(join(homedir(), ".dsh", "projects"));
let projectId = "", voiceFile = "";
for (const p of projects) {
  if (p.startsWith(".")) continue;
  const media = join(homedir(), ".dsh", "projects", p, "media");
  try {
    const files = await readdir(media);
    const v = files.find((f) => f.startsWith("voice-") && f.endsWith(".wav"));
    if (v) { projectId = p; voiceFile = `media/${v}`; break; }
  } catch {}
}
if (!voiceFile) { console.log("SKIP  没有找到 voice-*.wav（先跑 node scripts/voice-smoke.mjs）"); process.exit(0); }
console.log(`用项目 ${projectId} 的音色样本 ${voiceFile}`);

// 断言 0：参考图列表里绝不能出现音频文件（H3 会把 wav 当图片解码而失败）
const badRefs = (j) => (j.refFiles || []).filter((f) => /\.(wav|mp3|m4a|flac)$/i.test(f));
const job = {
  id: "voicectl-" + Date.now(),
  projectId, nodeId: "",
  prompt: "A middle-aged man looks at the camera and says slowly: <d>[这是一段测试音频，请确认我的音色是否合适。]</d>",
  mode: "r2v", model: "h3-director", duration: 5, aspect: "16:9", resolution: "480p",
  voiceFile, status: "queued", startedAt: Date.now(),
};

let fail = 0;
if (badRefs(job).length) { console.log("FAIL  参考图里混入了音频:", badRefs(job)); fail += 1; }
else console.log("PASS  参考图不含音频文件");
const t0 = Date.now();
try {
  await T.runVideoJob({}, config, job);
} catch (e) {
  console.log("FAIL  runVideoJob:", String(e.message).slice(0, 160));
  process.exit(1);
}
if (job.status !== "done") { console.log("FAIL  状态:", job.status, String(job.error || "").slice(0, 160)); fail += 1; }
else console.log(`PASS  出片 ${((Date.now() - t0) / 1000).toFixed(1)}s · ${job.asset?.file}`);

// ① 检查提交图里的 refAudios
if (job.promptId) {
  const h = await fetch(`http://127.0.0.1:8188/history/${job.promptId}`).then((r) => r.json()).catch(() => ({}));
  const g = h?.[job.promptId]?.prompt?.[2] || {};
  const dir = Object.values(g).find((n) => n?.class_type === "ComfyMiniMaxH3Director");
  if (dir?.inputs?.timeline_data) {
    const td = JSON.parse(dir.inputs.timeline_data);
    const aud = td?.global?.refAudios || [];
    const okRef = aud.length > 0 && /voice_/.test(String(aud[0].audioFile || ""));
    console.log(`${okRef ? "PASS" : "FAIL"}  refAudios = ${JSON.stringify(aud).slice(0, 120)} · commonEnabled=${td?.global?.commonEnabled}`);
    if (!okRef) fail += 1;
  } else {
    console.log("FAIL  提交图里找不到导演台 timeline_data");
    fail += 1;
  }
}

// ② 检查成片音轨
if (job.asset?.file) {
  const abs = join(homedir(), ".dsh", "projects", projectId, job.asset.file);
  try {
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type",
      "-of", "csv=p=0", abs]).catch(() => ({ stdout: "" }));
    const hasAudio = stdout.split("\n").map((s) => s.trim()).filter(Boolean).includes("audio");
    const vol = await run("ffmpeg", ["-hide_banner", "-i", abs, "-af", "volumedetect", "-f", "null", "NUL"])
      .catch((e) => ({ stderr: String(e.stderr || "") }));
    const mean = /mean_volume:\s*(-?\d+(?:\.\d+)?) dB/.exec(vol.stderr || "")?.[1];
    const silent = mean == null || Number(mean) < -50;
    console.log(`${hasAudio && !silent ? "PASS" : "FAIL"}  成片音轨 audio=${hasAudio} mean=${mean ?? "?"}dB`);
    if (!hasAudio || silent) fail += 1;
  } catch (e) {
    console.log("WARN  音轨检测失败:", String(e.message).slice(0, 100));
  }
}

console.log(`\n=== 音色→视频：${fail ? "失败 " + fail : "全部通过"} ===`);
process.exit(fail ? 1 : 0);
