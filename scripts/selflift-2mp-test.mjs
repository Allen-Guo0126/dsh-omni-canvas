/**
 * 验证：默认模板 SelfLift 已按新版配置 → 构图检查 + 真出一条 1080p 短片
 */
import { buildApi } from "../lib/api/server.js";
import { patchDirector } from "../lib/workflow/patch.js";
import { loadTemplate } from "../lib/workflow/template.js";
import { VIDEO_ASPECT_SIZE } from "../lib/workflow/size.js";
import { readJson } from "../lib/core/fs.js";
import { join } from "node:path";
import { homedir } from "node:os";

const config = { comfyUrl: "http://127.0.0.1:8188", comfyRoot: "E:/ComfyUI-aki-new", requestTimeoutMs: 30 * 60 * 1000 };
const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, config);

// ---------- ① 构图检查 ----------
const { spec, workflow } = await loadTemplate("h3-director");
const [w, h] = VIDEO_ASPECT_SIZE["16:9_1080p"];
const out = patchDirector(JSON.parse(JSON.stringify(workflow)), spec, {
  prompt: "test", duration: 4, aspect: "16:9", w, h, frames: 96, seed: 1, refNames: [],
});
const sl = out.wf["30"].inputs;
console.log("=== SelfLift 实际提交参数 ===");
for (const k of ["split_mode", "highres_steps", "transition_step", "lowres_scale", "sampler_mode",
                 "latent_upscale_model", "latent_upsample", "enable_latent_chunking", "enable_tiling",
                 "tile_count", "tile_overlap"]) {
  console.log(`  ${k.padEnd(24)} = ${sl[k]}`);
}
const td = JSON.parse(out.wf["18"].inputs.timeline_data);
console.log("\n输出尺寸:", td.output.width + "×" + td.output.height,
            "· megapixels:", td.output.megapixels,
            "· 帧数:", td.totalFrames);

// ---------- ② 真出一条 ----------
const PID = "e6abc13b";
const cv = (await api["canvas.get"]({ id: PID })).canvas;
const img = (cv.nodes || []).find((n) => n.type === "image" && n.data?.file);
console.log("\n参考图:", img?.data?.file || "（无）");

const t0 = Date.now();
const r = await api["gen.video"]({
  projectId: PID, nodeId: "", mode: "r2v",
  prompt: `subject_definitions:
<Subject 1> is Lu Yuan, shown in <Picture 1>.

summary:
A slow test shot of the character standing in a bright room.

detailed_description:
Reference generation. Photorealistic live-action short drama, warm daylight. Framing: static tripod shot, medium close-up, camera about 2.5 metres away, faces clearly visible.
The character is already inside the frame at 00:00.000 and does not move much; only a slow blink.

overall_soundscape:
Quiet room tone.

non_diegetic_music:
None.`,
  duration: 4, aspect: "16:9", resolution: "1080p",
  refFiles: img?.data?.file ? [img.data.file] : [],
});
console.log("提交:", JSON.stringify(r).slice(0, 140));
if (!r.jobId) process.exit(1);

let job = {};
for (let i = 0; i < 240; i += 1) {
  await new Promise((s) => setTimeout(s, 5000));
  job = ((await api["job.get"]({ jobId: r.jobId })).job) || {};
  if (["done", "failed"].includes(job.status)) break;
  if (i % 6 === 0) console.log(`  …${job.status} ${((Date.now() - t0) / 1000) | 0}s`);
}
console.log(`\n结果: ${job.status} · ${((Date.now() - t0) / 1000).toFixed(0)}s · ${job.asset?.file || job.error}`);
if (job.asset?.file) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const src = join(homedir(), ".dsh", "projects", PID, job.asset.file);
  const p = await run("ffprobe", ["-v", "error", "-show_entries", "stream=width,height,duration",
    "-of", "csv=p=0", src]).catch(() => ({ stdout: "?" }));
  console.log("成片规格:", p.stdout.trim().replace(/\n/g, " | "));
}
