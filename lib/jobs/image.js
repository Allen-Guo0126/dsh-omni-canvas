/**
 * 图片任务：内置模板生成 / 绑定工作流生成 / 4K 超分。
 * 约定：产物一律写盘 + 进资产库 + 落画布（超分走 newCard）。
 */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { ensureDir, projectDir, readJson, writeJson, touchProject } from "../core/fs.js";
import { downloadBinary, submitPrompt, uploadToComfy } from "../core/comfy.js";
import { buildPromptFromBinding, runBinding, promoteBindingVerified } from "../workflow/bindings.js";
import { adaptModelNames, getObjectInfo } from "../workflow/convert.js";
import { sizeFor } from "../workflow/size.js";
import { autoPlaceOnCanvas, placeExtraImageCards } from "./place.js";
import { loadTemplate } from "../workflow/template.js";


export async function runUpscaleJob(ctx, config, job) {
  try {
    job.status = "running";
    const dir = projectDir(config, job.projectId);
    const abs = join(dir, job.sourceFile);
    const name = await uploadToComfy(config, abs, "up_" + abs.split(/[\\/]/).pop());
    const scale = job.upscaleScale === 2 ? 2 : 4;
    const wf = {
      "1": { class_type: "LoadImage", inputs: { image: name } },
      "2": { class_type: "UpscaleModelLoader", inputs: { model_name: job.upscaleModel || "4x_foolhardy_Remacri.pth" } },
      "3": { class_type: "ImageUpscaleWithModel", inputs: { upscale_model: ["2", 0], image: ["1", 0] } },
      ...(scale === 2 ? { "5": { class_type: "ImageScaleBy", inputs: { image: ["3", 0], upscale_method: "lanczos", scale_by: 0.5 } } } : {}),
      "4": { class_type: "SaveImage", inputs: { images: [scale === 2 ? "5" : "3", 0], filename_prefix: "upscale" } },
    };
    const promptId = await submitPrompt(config, wf);
    job.promptId = promptId;
    const items = await waitForPrompt(config, promptId, { all: true, timeoutMs: 10 * 60 * 1000 });
    const item = (items || [])[0];
    if (!item) throw new Error("超分没有返回图片");
    const buf = await downloadImage(config, item);
    const fileName = `upscale-${randomUUID().slice(0, 8)}.png`;
    await ensureDir(join(dir, "media"));
    await writeFile(join(dir, "media", fileName), buf);

    const idxPath = join(dir, "assets", "index.json");
    const index = await readJson(idxPath, []);
    const asset = {
      id: randomUUID().slice(0, 12),
      kind: "image",
      file: `media/${fileName}`,
      prompt: job.prompt || "",
      model: "upscale:4x",
      params: { sourceNodeId: job.nodeId, sourceFile: job.sourceFile, scale: 4 },
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
          node.data = { ...(node.data || {}), file: asset.file, assetId: asset.id,
            status: "done", upscaled: true
          };
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

/** 从 PNG 字节流读宽高（IHDR） */
export function pngSize(buf) {
  try {
    if (!buf || buf.length < 24) return null;
    if (buf[0] !== 0x89 || buf[1] !== 0x50) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } catch { return null; }
}

export async function runBindingImageJob(ctx, config, job) {
  try {
    job.status = "running";
    // 分辨率档位必须生效：1K=短边 1024，2K=短边 1536（与内置模板路径 sizeFor 同口径）
    const isUpscale = job.kind === "upscale" || job.noSizeHint === true;
    const tier = job.resolution === "2K" ? 1536 : 1024;
    let [w, h] = sizeFor(job.aspect || "1:1", tier);
    if (isUpscale) { w = 0; h = 0; }             // 超分不设尺寸，用产物真实尺寸
    const params = isUpscale
      ? { prompt: job.prompt || "", seed: job.seed }
      : {
          prompt: job.prompt,
          seed: job.seed,
          width: w,
          height: h,
          aspect: job.aspect || "",
          megapixels: Math.round(((w * h) / 1e6) * 100) / 100,
        };
    if (job.refFiles?.length) {
      const absRef = join(projectDir(config, job.projectId), job.refFiles[0]);
      try {
        // LoadImage 只认 ComfyUI input 目录里的文件名；直接传绝对路径会被忽略、退回工作流里自带的图
        params.refImage = await uploadToComfy(config, absRef, "ref_" + absRef.split(/[\\/]/).pop());
      } catch {
        params.refImage = absRef;
      }
    }

    // 张数：绑定若未声明 count 映射就无法一次出多张，宁可报错也不要静默只出 1 张
    const wantCount = Math.max(1, Number(job.count) || 1);
    if (wantCount > 1) {
      const all = await loadBindings();
      const bd = (Array.isArray(all) ? all : []).find((x) => x.id === job.implBindingId);
      if (!bd?.inputs?.count) {
        throw new Error(`所选工作流未绑定「张数」参数，无法一次出 ${wantCount} 张：请改成 1 张，或改用「默认工作流」（内置支持 1–4 张）`);
      }
    }
    params.count = wantCount;

    const run = await runBinding(config, { id: job.implBindingId, params, freeVram: false, _onSubmitted: (pid) => { job.promptId = pid; }, timeoutMs: Number(config.requestTimeoutMs || 30000) * 20 });
    job.promptId = run.promptId || job.promptId;      // 进度/状态查询需要
    if (!run.ok) throw new Error(run.error || "绑定工作流执行失败");
    await promoteBindingVerified(job.implBindingId);
    const items = (run.outputs || []).filter((o) => o.kind === "images" || o.kind === "gifs");
    const item = items[0];
    if (!item) throw new Error("工作流没有返回图片");

    const dir = projectDir(config, job.projectId);
    await ensureDir(join(dir, "media"));
    const idxPath = join(dir, "assets", "index.json");
    const index = await readJson(idxPath, []);
    let asset = null;
    const made = [];
    for (const it of items) {
      const buf = await downloadBinary(config, it);
      const fileName = `${randomUUID()}.png`;
      await writeFile(join(dir, "media", fileName), buf);
      const dim = pngSize(buf);
      const realW = dim?.width || w || undefined;
      const realH = dim?.height || h || undefined;
      const a = {
        id: randomUUID().slice(0, 12),
        kind: "image",
        file: `media/${fileName}`,
        prompt: job.prompt,
        model: "binding:" + job.implBindingId,
        params: { width: realW, height: realH, seed: job.seed, impl: job.implBindingName, count: items.length },
        nodeId: job.nodeId,
        createdAt: new Date().toISOString(),
        durationMs: Date.now() - job.startedAt,
      };
      index.push(a);
      made.push(a);
      if (!asset) asset = a;
    }
    job.assets = made;
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
            status: "done", seed: job.seed, width: w, height: h, impl: job.implBindingId, implName: job.implBindingName };
          await writeJson(join(dir, "canvas.json"), canvas);
        }
      });
    }
    await placeExtraImageCards(config, job, job.assets || [], job.nodeId);
    return job;
  } catch (e) {
    job.status = "failed";
    job.error = String(e.message || e);
    return job;
  }
}

/** 按剩余显存自动降档：显存紧张时把视频/图片分辨率降一档，并记录 warning */
export async function adjustForVram(config, job, kind) {
  // 已停用：ComfyUI 新工作流会自动释放显存，不再按剩余显存降档（避免 720p 被悄悄降成 480p）
  if (true) return job;
  try {
    const st = await comfyFetch(config, "/system_stats", {}).then((r) => r.json());
    const dev = Array.isArray(st?.devices) ? st.devices[0] : null;
    const free = dev?.vram_free ? dev.vram_free / 1024 / 1024 / 1024 : 0;
    if (!free) return job;
    job.warnings = job.warnings || [];
    const VIDEO_TIERS = ["1080p", "720p", "480p"];
    if (kind === "video") {
      let cur = VIDEO_TIERS.includes(job.resolution) ? job.resolution : "480p";
      while (free < 8 && cur !== "480p") {
        cur = VIDEO_TIERS[VIDEO_TIERS.indexOf(cur) + 1] || "480p";
      }
      if (cur !== job.resolution) {
        job.warnings.push(`剩余显存 ${free.toFixed(1)} GB 偏低，视频分辨率 ${job.resolution} → ${cur}`);
        job.resolution = cur;
      }
    } else if (free < 8 && job.resolution === "2K") {
      job.warnings.push(`剩余显存 ${free.toFixed(1)} GB 偏低，图片分辨率 2K → 1K`);
      job.resolution = "1K";
    }
    return job;
  } catch {
    return job;
  }
}

export async function runImageJob(ctx, config, job) {
  try {
    job.status = "running";
    const { spec, workflow } = await loadTemplate(job.model);
    const refNames = [];
    for (const rel of job.refFiles || []) {
      const abs = join(projectDir(config, job.projectId), rel);
      const name = await uploadToComfy(config, abs, rel.split("/").pop());
      refNames.push(name);
    }
    const { wf, w, h, seed } = patchWorkflow(workflow, spec, { ...job, refNames });
    try {
      const info = await getObjectInfo(config);
      const warnings = adaptModelNames(wf, info);
      if (warnings.length) job.warnings = [...(job.warnings || []), ...warnings];
    } catch {}
    const promptId = await submitPrompt(config, wf);
    job.promptId = promptId;
    const items = await waitForPrompt(config, promptId, { all: true });
    if (!items?.length) throw new Error("ComfyUI 没有返回图片");
    const dir = projectDir(config, job.projectId);
    await ensureDir(join(dir, "media"));
    const idxPath = join(dir, "assets", "index.json");
    const index = await readJson(idxPath, []);
    let asset = null;
    const made = [];
    for (const item of items) {
      const buf = await downloadImage(config, item);
      const fileName = `${randomUUID()}.png`;
      await writeFile(join(dir, "media", fileName), buf);
      const a = {
        id: randomUUID().slice(0, 12),
        kind: "image",
        file: `media/${fileName}`,
        prompt: job.prompt,
        model: job.model,
        params: { aspect: job.aspect, resolution: job.resolution, width: w, height: h, seed, count: job.count },
        nodeId: job.nodeId,
        createdAt: new Date().toISOString(),
        durationMs: Date.now() - job.startedAt,
      };
      index.push(a);
      made.push(a);
      if (!asset) asset = a;
    }
    job.assets = made;
    await writeJson(idxPath, index);
    await touchProject(config, job.projectId);

    job.status = "done";
    job.asset = asset;
    await autoPlaceOnCanvas(config, job, job.asset);
    // 节点态写回画布（节点只做引用）
    if (job.nodeId) {
      await withCanvasLock(job.projectId, async () => {
        const canvas = await getCanvas(config, job.projectId);
        const node = canvas.nodes.find((n) => n.id === job.nodeId);
        if (node) {
          node.data = { ...(node.data || {}), file: asset.file, prompt: job.prompt, assetId: asset.id,
            status: "done", seed, width: w, height: h };
          await writeJson(join(dir, "canvas.json"), canvas);
        }
      });
    }
    await placeExtraImageCards(config, job, job.assets || [], job.nodeId);
  } catch (error) {
    job.status = "failed";
    job.error = String(error?.message || error);
  } finally {
    job.updatedAt = new Date().toISOString();
  }
}

