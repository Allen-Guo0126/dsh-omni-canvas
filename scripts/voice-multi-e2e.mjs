/**
 * 双音色端到端：两条参考音频 + 提示词里 <Audio 1>/<Audio 2> 台词
 * 验证：refAudios 两条、提示词含标签、成片有声。
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

// 找两段不同的音色样本（不同描述生成的两个 wav）
const base = join(homedir(), ".dsh", "projects");
const found = [];
for (const p of await readdir(base)) {
  if (p.startsWith(".")) continue;
  try {
    const files = (await readdir(join(base, p, "media"))).filter((f) => f.startsWith("voice-") && f.endsWith(".wav"));
    for (const f of files) found.push({ projectId: p, file: `media/${f}` });
  } catch {}
  if (found.length >= 6) break;
}
if (found.length < 2) { console.log("SKIP 需要至少 2 段音色样本（先跑 voice-smoke）"); process.exit(0); }
const voices = [
  { file: found[0].file, name: "老程（老者）" },
  { file: found[1].file, name: "小雨（少女）" },
];
const pid = found[0].projectId;
console.log("音色:", voices.map((v) => `${v.name} → ${v.file}`).join(" | "));

const prompt = [
  "A dim living room. Two people argue across a table.",
  "<Audio 1> says: <d>[谁让你进这个家的！]</d>",
  "<Audio 2> says: <d>[爷爷，我只是想帮您收拾一下。]</d>",
].join("\n");

const job = {
  id: "multi-" + Date.now(), projectId: pid, nodeId: "",
  prompt, mode: "r2v", model: "h3-director", duration: 5, aspect: "16:9", resolution: "480p",
  voiceFiles: voices, status: "queued", startedAt: Date.now(),
};

let fail = 0;
const t0 = Date.now();
await T.runVideoJob({}, config, job);
if (job.status !== "done") { console.log("FAIL 出片:", job.status, String(job.error || job.warnings || "").slice(0, 200)); fail += 1; }
else console.log(`PASS  出片 ${((Date.now() - t0) / 1000).toFixed(1)}s · ${job.asset?.file}`);

// 断言：refAudios 两条 + 提示词含 <Audio 1>/<Audio 2>
if (job.promptId) {
  const h = await fetch(`http://127.0.0.1:8188/history/${job.promptId}`).then((r) => r.json()).catch(() => ({}));
  const g = h?.[job.promptId]?.prompt?.[2] || {};
  const dir = Object.values(g).find((n) => n?.class_type === "ComfyMiniMaxH3Director");
  const td = dir?.inputs?.timeline_data ? JSON.parse(dir.inputs.timeline_data) : null;
  const aud = td?.global?.refAudios || [];
  const okCount = aud.length === 2;
  const segPrompt = String((td?.segments?.[0]?.prompt) || "");
  const okTags = /<Audio\s+1>/i.test(segPrompt) && /<Audio\s+2>/i.test(segPrompt);
  console.log(`${okCount ? "PASS" : "FAIL"}  refAudios 条数 = ${aud.length} → ${JSON.stringify(aud.map((a) => a.audioFile))}`);
  console.log(`${okTags ? "PASS" : "FAIL"}  提示词含 <Audio 1>/<Audio 2>（注入的 voice_definitions 或用户原文）`);
  if (!okCount) fail += 1;
  if (!okTags) fail += 1;
}

// 断言：成片有声
if (job.asset?.file) {
  const abs = join(base, pid, job.asset.file);
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", abs]).catch(() => ({ stdout: "" }));
  const hasAudio = stdout.split("\n").map((s) => s.trim()).includes("audio");
  const vol = await run("ffmpeg", ["-hide_banner", "-i", abs, "-af", "volumedetect", "-f", "null", "NUL"]).catch((e) => ({ stderr: "" }));
  const mean = /mean_volume:\s*(-?\d+(?:\.\d+)?) dB/.exec(vol.stderr || "")?.[1];
  console.log(`${hasAudio && mean != null && Number(mean) > -50 ? "PASS" : "FAIL"}  成片音轨 audio=${hasAudio} mean=${mean ?? "?"}dB`);
  if (!hasAudio) fail += 1;
}

console.log(`\n=== 双音色：${fail ? "失败 " + fail : "全部通过"} ===`);
process.exit(fail ? 1 : 0);
