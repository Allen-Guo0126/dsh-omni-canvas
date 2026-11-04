/**
 * 视频任务：内置 H3 导演台生成 / 绑定工作流生成 / 抽帧 / 视频超分 / latent 放大。
 */
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { execFile, spawn } from "node:child_process";
import { readFile, writeFile, stat } from "node:fs/promises";
import { ensureDir, projectDir, readJson, writeJson, touchProject, getCanvas, mutateCanvas, withCanvasLock } from "../core/fs.js";
import { downloadBinary, downloadImage, submitPrompt, uploadToComfy, waitForPrompt, comfyBase } from "../core/comfy.js";
import { DSH_COMFY_CLIENT_ID, PROMPT_META, PROGRESS, registerProgress, ensureProgressWs, executionOrder, progressOf, buildWeights } from "../core/progress.js";
import { loadTemplate } from "../workflow/template.js";
import { patchDirector } from "../workflow/patch.js";
import { normalizeReferencePrompt } from "../text/prompt-normalize.js";
import { MODE_TASK } from "../workflow/models.js";
import { VIDEO_ASPECT_SIZE } from "../workflow/size.js";
import { buildTalkingSegmentPrompt } from "../workflow/talking.js";
import { autoPlaceOnCanvas, wireRefEdges } from "./place.js";
import { runBinding, promoteBindingVerified } from "../workflow/bindings.js";
import { adaptModelNames, getObjectInfo } from "../workflow/convert.js";
import { homedir } from "node:os";


/** ComfyUI 进度订阅：连 /ws，把 progress 事件按 promptId 映射到我们的 job（0-100） */
export async function runVideoJob(ctx, config, job) {
  try {
    if (job.canceled) { job.status = "canceled"; return; }
    if (job.canceled) { job.status = "canceled"; return; }
    job.status = "running";
    const { spec, workflow } = await loadTemplate(job.model);
    const refNames = [];
    for (const rel of job.refFiles || []) {
      const abs = join(projectDir(config, job.projectId), rel);
      refNames.push(await uploadToComfy(config, abs, rel.split("/").pop()));
    }
    // 多音色（可选）：每张音频卡 = 一条参考音频，最多 3 条；由 patchDirector 写进 refAudios
    let voiceNames = [];
    {
      const list = Array.isArray(job.voiceFiles) && job.voiceFiles.length
        ? job.voiceFiles
        : (job.voiceFile ? [{ file: job.voiceFile, name: "" }] : []);
      for (const item of list.slice(0, 3)) {
        const rel = typeof item === "string" ? item : item.file;
        if (!rel) continue;
        try {
          const absVoice = join(projectDir(config, job.projectId), rel);
          const uploaded = await uploadToComfy(config, absVoice, "voice_" + String(rel).split("/").pop());
          voiceNames.push({ file: uploaded, name: (typeof item === "object" && item.name) || "" });
        } catch (e) {
          job.warnings = [...(job.warnings || []), `音色上传失败：${String(e?.message || e).slice(0, 80)}`];
        }
      }
    }
    const isFrameMode = job.mode === "i2v" || job.mode === "fl2v";
    // 尺寸表为唯一来源：先算好 w/h 再交给 patchDirector
    const [vw, vh] = VIDEO_ASPECT_SIZE[`${job.aspect}_${job.resolution}`]
      || VIDEO_ASPECT_SIZE[job.aspect] || VIDEO_ASPECT_SIZE["16:9"];
    const { wf, w, h, frames } = patchDirector(workflow, spec, {
      ...job,
      w: vw,
      h: vh,
      refNames,
      voiceNames,
      taskType: spec.taskTypeByMode ? MODE_TASK[job.mode] : spec.taskType,
      mode: job.mode,
      startImageName: isFrameMode ? refNames[0] : "",
      endImageName: job.mode === "fl2v" ? refNames[1] : "",
    });
    try {
      const info = await getObjectInfo(config);
      const warnings = adaptModelNames(wf, info);
      if (warnings.length) job.warnings = [...(job.warnings || []), ...warnings];
    } catch {}
    const promptId = await submitPrompt(config, wf);
    job.promptId = promptId;
    try {
      const order = executionOrder(wf);
      const weights = buildWeights(wf, order);
      PROMPT_META.set(String(promptId), { segs: job.talking?.segments?.length || 1, order });
      PROGRESS.set(String(promptId), { percent: 0, order, weights, at: Date.now() });
    } catch {}
    try {
      const mapPath = join(homedir(), ".dsh", "omni-canvas.prompts.json");
      const prev = await readJson(mapPath, {});
      prev[String(job.id)] = { promptId, nodeId: job.nodeId, projectId: job.projectId, at: Date.now() };
      const keys = Object.keys(prev);
      if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete prev[k];
      await writeJson(mapPath, prev);
    } catch {}
    try { ensureProgressWs(config); } catch {}
    const errTimer = setInterval(() => {
      const pr = progressOf(promptId);
      if (pr.error) { job.error = pr.error; clearInterval(errTimer); }
    }, 2000);
    setTimeout(() => clearInterval(errTimer), 40 * 60 * 1000);
    const item = await waitForPrompt(config, promptId, { timeoutMs: 40 * 60 * 1000 });
    if (!item) throw new Error("ComfyUI 没有返回视频");
    const buf = await downloadImage(config, item);
    const dir = projectDir(config, job.projectId);
    const fileName = `${randomUUID()}.mp4`;
    await ensureDir(join(dir, "media"));
    await writeFile(join(dir, "media", fileName), buf);

    const asset = {
      id: randomUUID().slice(0, 12),
      kind: "video",
      file: `media/${fileName}`,
      prompt: job.prompt,
      model: job.model,
      params: { aspect: job.aspect, resolution: job.resolution, width: w, height: h, frames,
        duration: job.duration, refFiles: job.refFiles || [],
        mode: job.mode || "", model: job.model || "" },
      nodeId: job.nodeId,
      createdAt: new Date().toISOString(),
      durationMs: Date.now() - job.startedAt,
    };
    const idxPath = join(dir, "assets", "index.json");
    const index = await readJson(idxPath, []);
    index.push(asset);
    await writeJson(idxPath, index);
    await touchProject(config, job.projectId);

    job.status = job.canceled ? "canceled" : "done";
    job.asset = asset;
    await autoPlaceOnCanvas(config, job, job.asset);
    if (job.nodeId && !job.canceled) {
      await withCanvasLock(job.projectId, async () => {
        const canvas = await getCanvas(config, job.projectId);
        const node = canvas.nodes.find((n) => n.id === job.nodeId);
        if (node) {
          node.data = { ...(node.data || {}), kind: "video", file: asset.file, prompt: job.prompt,
            assetId: asset.id, status: "done", width: w, height: h,
            genMode: job.mode || "", genModel: job.model || "",
            refCount: (job.refFiles || []).length,
            refFrom: (job.refFiles && job.refFiles[0]) || "" };
          wireRefEdges(canvas, job.nodeId, job.refFiles);
          await writeJson(join(dir, "canvas.json"), canvas);
        }
      });
    }
  } catch (error) {
    job.status = "failed";
    job.error = String(error?.message || error);
  } finally {
    job.updatedAt = new Date().toISOString();
  }
}

/** 从视频抽一帧（首帧 / 末帧）→ 图片节点，供 i2v 续接使用 */
export async function runFrameJob(ctx, config, job) {
  const dir = projectDir(config, job.projectId);
  const src = join(dir, job.sourceFile);
  const binCandidates = [config.ffmpegPath, "ffmpeg", "E:/Allen/tools/bin/ffmpeg.exe", "C:/ffmpeg/bin/ffmpeg.exe"];
  const errors = [];
  let buf = null;
  for (const bin of binCandidates.filter(Boolean)) {
    try {
      buf = await new Promise((resolve, reject) => {
        const args = ["-v", "error"];
        if (job.at === "last") args.push("-sseof", "-1");
        args.push("-i", src, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-");
        const child = spawn(bin, args, { windowsHide: true });
        const chunks = [];
        let errText = "";
        child.stdout.on("data", (d) => chunks.push(d));
        child.stderr.on("data", (d) => { errText += d.toString(); });
        child.on("error", (e) => reject(e));
        child.on("close", (code) => {
          if (code === 0 && chunks.length) resolve(Buffer.concat(chunks));
          else reject(new Error(`ffmpeg exit ${code}: ${errText.slice(-200)}`));
        });
      });
      if (buf?.length) break;
    } catch (e) {
      errors.push(`${bin}: ${String(e.message || e).slice(0, 120)}`);
      buf = null;
    }
  }
  if (!buf?.length) throw new Error("抽帧失败（需要 ffmpeg）：" + errors.join(" | ").slice(0, 300));

  const outName = `frame-${randomUUID().slice(0, 8)}.png`;
  await ensureDir(join(dir, "media"));
  await writeFile(join(dir, "media", outName), buf);

  const idxPath = join(dir, "assets", "index.json");
  const index = await readJson(idxPath, []);
  const asset = {
    id: randomUUID().slice(0, 12),
    kind: "image",
    file: `media/${outName}`,
    prompt: job.prompt || "",
    model: `frame:${job.at || "first"}`,
    params: { sourceFile: job.sourceFile, at: job.at || "first" },
    nodeId: job.nodeId,
    createdAt: new Date().toISOString(),
  };
  index.push(asset);
  await writeJson(idxPath, index);
  await touchProject(config, job.projectId);

  if (job.nodeId) {
    await withCanvasLock(job.projectId, async () => {
      const canvas = await getCanvas(config, job.projectId);
      const node = canvas.nodes.find((n) => n.id === job.nodeId);
      if (node) {
        node.data = { ...(node.data || {}), file: asset.file, assetId: asset.id, status: "done", frameOf: job.sourceNodeId || "", frameAt: job.at || "first" };
        await writeJson(join(dir, "canvas.json"), canvas);
      }
    });
  }
  job.status = "done";
  job.asset = asset;
    await autoPlaceOnCanvas(config, job, job.asset);
  return job;
}

export async function runVideoUpscaleJob(ctx, config, job) {
  const dir = projectDir(config, job.projectId);
  const src = join(dir, job.sourceFile);
  const outName = `vup-${randomUUID().slice(0, 8)}.mp4`;
  const outPath = join(dir, "media", outName);
  await ensureDir(join(dir, "media"));

  const binCandidates = [config.ffmpegPath, "ffmpeg", "E:/Allen/tools/bin/ffmpeg.exe", "C:/ffmpeg/bin/ffmpeg.exe"];
  const errors = [];
  let buf = null;

  for (const bin of binCandidates.filter(Boolean)) {
    try {
      buf = await new Promise((resolve, reject) => {
        const child = spawn(bin, [
          "-v", "error", "-i", src,
          "-vf", "scale=iw*2:ih*2:flags=lanczos",
          "-c:v", "libx264", "-crf", "18", "-preset", "medium",
          "-c:a", "aac", "-b:a", "192k",
          "-movflags", "frag_keyframe+empty_moov",
          "-f", "mp4", "-",
        ], { windowsHide: true });
        const chunks = [];
        let errText = "";
        child.stdout.on("data", (d) => chunks.push(d));
        child.stderr.on("data", (d) => { errText += d.toString(); });
        child.on("error", (e) => reject(e));
        child.on("close", (code) => {
          if (code === 0 && chunks.length) resolve(Buffer.concat(chunks));
          else reject(new Error(`ffmpeg exit ${code}: ${errText.slice(-300)}`));
        });
      });
      if (buf?.length) break;
    } catch (e) {
      errors.push(`${bin}: ${String(e.message || e).slice(0, 160)}`);
      buf = null;
    }
  }
  if (!buf?.length) throw new Error("视频超分失败（需要 ffmpeg）：" + errors.join(" | ").slice(0, 400));

  await writeFile(outPath, buf);

  const idxPath = join(dir, "assets", "index.json");
  const index = await readJson(idxPath, []);
  const asset = {
    id: randomUUID().slice(0, 12),
    kind: "video",
    file: `media/${outName}`,
    prompt: job.prompt || "",
    model: "video-upscale:2x",
    params: { sourceNodeId: job.nodeId, sourceFile: job.sourceFile, scale: 2 },
    nodeId: job.nodeId,
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - job.startedAt,
  };
  index.push(asset);
  await writeJson(idxPath, index);
  await touchProject(config, job.projectId);

  if (job.nodeId) {
    await withCanvasLock(job.projectId, async () => {
      const canvas = await getCanvas(config, job.projectId);
      const node = canvas.nodes.find((n) => n.id === job.nodeId);
      if (node) {
        node.data = { ...(node.data || {}), file: asset.file, assetId: asset.id, status: "done", upscaled: true };
        await writeJson(join(dir, "canvas.json"), canvas);
      }
    });
  }
  job.status = "done";
  job.asset = asset;
    await autoPlaceOnCanvas(config, job, job.asset);
  return job;
}

/** 读视频尺寸/时长（ffprobe；找不到就返回空） */
export async function probeVideo(config, absPath) {
  const binCandidates = ["E:/Allen/tools/bin/ffprobe.exe", "E:/Allen/tools/ffmpeg/ffmpeg-9.0.2-essentials_build/bin/ffprobe.exe", "ffprobe"];
  for (const bin of binCandidates) {
    const out = await new Promise((resolve) => {
      const child = spawn(bin, ["-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-show_entries", "format=duration",
        "-of", "json", absPath], { windowsHide: true });
      let text = "";
      child.stdout.on("data", (d) => { text += d.toString(); });
      child.on("error", () => resolve(null));
      child.on("close", (code) => {
        if (code !== 0) return resolve(null);
        try {
          const j = JSON.parse(text);
          const st = (j.streams || [])[0] || {};
          resolve({ width: st.width, height: st.height, durationSec: Number(j.format?.duration) || 0 });
        } catch { resolve(null); }
      });
    });
    if (out) return out;
  }
  return null;
}

/** 事后 H3 latent 放大：视频 → H3 VAE 编码 → 3D latent 放大 → 解码 → 回封音轨 */
export async function runVideoLatentUpscaleJob(ctx, config, job) {
  const dir = projectDir(config, job.projectId);
  const src = join(dir, job.sourceFile);
  const abs = src;
  const st = await stat(abs).catch(() => null);
  if (!st) throw new Error("源视频不存在：" + job.sourceFile);

  const probe = await probeVideo(config, abs);
  const fps = job.fps || 24;
  const w = Number(job.targetWidth) || (probe?.width ? Math.round((probe.width * 2) / 32) * 32 : 960);
  const h = Number(job.targetHeight) || (probe?.height ? Math.round((probe.height * 2) / 32) * 32 : 1728);

  // 上传到 ComfyUI input
  const { readFile: rf } = await import("node:fs/promises");
  const buf = await rf(abs);
  const form = new FormData();
  form.append("image", new Blob([buf]), "lat_" + randomUUID().slice(0, 8) + ".mp4");
  form.append("overwrite", "true");
  const upRes = await fetch(comfyBase(config) + "/upload/image", { method: "POST", body: form }).then((r) => r.json());
  const vname = upRes.subfolder ? `${upRes.subfolder}/${upRes.name}` : upRes.name;

  const wf = {
    "1": { class_type: "VHS_LoadVideo", inputs: {
      video: vname, force_rate: 0, custom_width: 0, custom_height: 0,
      frame_load_cap: 0, skip_first_frames: 0, select_every_nth: 1 } },
    "2": { class_type: "VAELoader", inputs: { vae_name: "minimax_h3_video_vae_fp16.safetensors" } },
    "3": { class_type: "VAEEncode", inputs: { pixels: ["1", 0], vae: ["2", 0] } },
    "4": { class_type: "MinimaxH3LatentUpscaler3D", inputs: {
      latent: ["3", 0], model_name: "minimax_h3_latent_upscaler_3d_fp16.safetensors",
      mode: "target dimensions", "mode.width": w, "mode.height": h,
      align: 32, enable_temporal_chunking: true, force_unload: false,
      device: "cuda", precision: "fp16" } },
    "5": { class_type: "VAEDecode", inputs: { samples: ["4", 0], vae: ["2", 0] } },
    "6": { class_type: "VHS_VideoCombine", inputs: {
      images: ["5", 0], audio: ["1", 2], frame_rate: fps, loop_count: 0,
      filename_prefix: "latup", format: "video/h264-mp4", pingpong: false, save_output: true } },
  };

  const promptId = await submitPrompt(config, wf);
    try {
      const order = executionOrder(wf);
      const weights = buildWeights(wf, order);
      PROMPT_META.set(String(promptId), { segs: 1, order });
      PROGRESS.set(String(promptId), { percent: 0, order, weights, at: Date.now() });
      ensureProgressWs(config);
    } catch {}
  job.promptId = promptId;
  const items = await waitForPrompt(config, promptId, { all: true, timeoutMs: 30 * 60 * 1000 });
  const item = (items || []).find((x) => x && (x.filename || "").endsWith(".mp4")) || (items || [])[0];
  if (!item) throw new Error("latent 放大没有返回视频");

  const q = `filename=${encodeURIComponent(item.filename)}&subfolder=${encodeURIComponent(item.subfolder || "")}&type=${item.type || "output"}`;
  const bin = Buffer.from(await (await fetch(comfyBase(config) + "/view?" + q)).arrayBuffer());
  const fileName = `latup-${randomUUID().slice(0, 8)}.mp4`;
  await ensureDir(join(dir, "media"));
  await writeFile(join(dir, "media", fileName), bin);

  const probeOut = await probeVideo(config, join(dir, "media", fileName));
  const asset = {
    id: randomUUID().slice(0, 12),
    kind: "video",
    file: `media/${fileName}`,
    prompt: job.prompt || "",
    model: "latent-upscale",
    params: { sourceFile: job.sourceFile, target: `${w}x${h}`,
      width: probeOut?.width, height: probeOut?.height,
      durationSec: probeOut?.durationSec || 0,
      sizeMB: Math.round((bin.length / 1048576) * 10) / 10 },
    createdAt: new Date().toISOString(),
  };
  const idxPath = join(dir, "assets", "index.json");
  const index = await readJson(idxPath, []);
  index.push(asset);
  await writeJson(idxPath, index);
  await touchProject(config, job.projectId);

  await mutateCanvas(config, job.projectId, (canvas) => {
    const node = canvas.nodes.find((n) => n.id === job.nodeId);
    if (node) {
      node.data = { ...(node.data || {}), file: asset.file, assetId: asset.id, status: "done",
        upscaled: true, latentUpscale: true,
        width: probeOut?.width, height: probeOut?.height,
        durationSec: probeOut?.durationSec || 0, sizeMB: asset.params.sizeMB };
    }
  });
  job.status = "done";
  job.asset = asset;
    await autoPlaceOnCanvas(config, job, job.asset);
}

/** 用绑定的工作流出视频（走 binding.run），产物落 media + 资产库 + 节点 */
export async function runBindingVideoJob(ctx, config, job) {
  try {
    job.status = "running";
    const [w, h] = VIDEO_ASPECT_SIZE[`${job.aspect}_${job.resolution}`]
      || VIDEO_ASPECT_SIZE[job.aspect] || VIDEO_ASPECT_SIZE["16:9"];
    const frames = Math.max(24, Math.round(Number(job.duration || 6) * 24));
    const params = {
      prompt: job.prompt,
      seed: job.seed,
      width: w,
      height: h,
      length: frames,
      duration: job.duration,
    };
    if (job.refFiles?.length) {
      const dir0 = projectDir(config, job.projectId);
      for (const [i, f] of job.refFiles.slice(0, 9).entries()) {
        const absRef = join(dir0, f);
        let val = absRef;
        try { val = await uploadToComfy(config, absRef, "ref_" + absRef.split(/[\\/]/).pop()); } catch {}
        params["refImage" + (i ? i + 1 : "")] = val;
      }
    }

    // 音色：上传后由 buildPromptFromBinding 注入 timeline_data.refAudios
    {
      const list = Array.isArray(job.voiceFiles) && job.voiceFiles.length
        ? job.voiceFiles
        : (job.voiceFile ? [{ file: job.voiceFile, name: "" }] : []);
      const up = [];
      for (const item of list.slice(0, 3)) {
        const rel = typeof item === "string" ? item : item.file;
        if (!rel) continue;
        try {
          const absVoice = join(projectDir(config, job.projectId), rel);
          const uploaded = await uploadToComfy(config, absVoice, "voice_" + String(rel).split("/").pop());
          up.push({ file: uploaded, name: (typeof item === "object" && item.name) || "" });
        } catch (e) {
          job.warnings = [...(job.warnings || []), `音色上传失败：${String(e?.message || e).slice(0, 80)}`];
        }
      }
      if (up.length) { params.voiceNames = up; params.voiceName = up[0].file; }
    }

    const run = await runBinding(config, {
      id: job.implBindingId, params, freeVram: false,
      _onSubmitted: (pid) => { job.promptId = pid; },
      timeoutMs: Number(config.renderTimeoutMs) || 30 * 60 * 1000,
    });
    job.promptId = run?.promptId || job.promptId;
    if (!run.ok) throw new Error(run.error || "绑定工作流执行失败");
    await promoteBindingVerified(job.implBindingId);
    const item = (run.outputs || []).find((o) => o.kind === "videos" || o.kind === "gifs");
    if (!item) throw new Error("工作流没有返回视频");

    const dir = projectDir(config, job.projectId);
    await ensureDir(join(dir, "media"));
    const buf = await downloadBinary(config, item);
    const fileName = `${randomUUID()}.mp4`;
    await writeFile(join(dir, "media", fileName), buf);

    const idxPath = join(dir, "assets", "index.json");
    const index = await readJson(idxPath, []);
    const asset = {
      id: randomUUID().slice(0, 12),
      kind: "video",
      file: `media/${fileName}`,
      prompt: job.prompt,
      model: "binding:" + job.implBindingId,
      params: { width: w, height: h, frames, duration: job.duration, seed: job.seed,
                impl: job.implBindingName, refFiles: job.refFiles || [] },
      nodeId: job.nodeId,
      createdAt: new Date().toISOString(),
      durationMs: Date.now() - job.startedAt,
    };
    index.push(asset);
    await writeJson(idxPath, index);
    await touchProject(config, job.projectId);

    job.status = "done";
    job.asset = asset;
    await autoPlaceOnCanvas(config, job, job.asset);
    if (job.nodeId) {
      await withCanvasLock(job.projectId, async () => {
        const canvas = await getCanvas(config, job.projectId);
        const node = canvas.nodes.find((n) => n.id === job.nodeId);
        if (node) {
          node.data = { ...(node.data || {}), file: asset.file, prompt: job.prompt, assetId: asset.id,
            status: "done", duration: job.duration, width: w, height: h, impl: job.implBindingId, implName: job.implBindingName };
          wireRefEdges(canvas, job.nodeId, job.refFiles);
          await writeJson(join(dir, "canvas.json"), canvas);
        }
      });
    }
    return job;
  } catch (e) {
    job.status = "failed";
    job.error = String(e.message || e);
    return job;
  }
}