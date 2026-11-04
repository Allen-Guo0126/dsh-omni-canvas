/**
 * 宿主 API：路由表 + AI 工具表（薄层，只做参数校验与调度）。
 */
import { defineTool } from "@deepseek-ai/dsh-tools";
import { readFile, mkdir, readdir, rm, stat, writeFile, rename, appendFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// 入口与客户端在 lib/ 根（本文件位于 lib/api/）
export const HOST_BOOT_AT = Date.now();
export const HOST_FILE = join(HERE, "..", "index.js");
export const CLIENT_FILE = join(HERE, "..", "client.js");
import { COMFY_OVERRIDE, comfyBase, comfyFetch, comfyJson, loadSettings, settingsPath } from "../core/comfy.js";
import { DIAG_CACHE, runDiagnose, scanWorkflows } from "../core/diag.js";
import { COMFY_PORTS, LAUNCHED, comfyRoot, envCheck, info_has_node, inspectInstall, model_exists_locally, probeHttp, scanForInstalls, startComfy, stopComfy } from "../core/env.js";
import { createProject, ensureDir, getCanvas, listProjects, mutateCanvas, projectDir, readJson, rootDir, touchProject, withCanvasLock, writeJson } from "../core/fs.js";
import { progressOf } from "../core/progress.js";
import { JOBS, JOBS_HISTORY_PATH, QUEUE, RUNNING_JOB, jobQueueInfo, queueLength, submitJob } from "../core/queue.js";
import { concatProjectVideos, downloadOutput, ensureDailyBackup, exportAllShots, exportProject, exportPublishPack, setSystemClipboard } from "../jobs/export.js";
import { adjustForVram, runBindingImageJob, runImageJob, runUpscaleJob } from "../jobs/image.js";
import { findFreeSpot } from "../jobs/place.js";
import { runBindingVideoJob, runFrameJob, runVideoJob, runVideoLatentUpscaleJob, runVideoUpscaleJob } from "../jobs/video.js";
import { deleteBinding, listBindings, loadBindings, resolveDefaultImpl, resolveExplicitImpl, runBinding, saveBinding, setDefaultBinding, testBinding } from "../workflow/bindings.js";
import { builtinCompat, getObjectInfo, inspectWorkflow } from "../workflow/convert.js";
import { MODELS, PROMPT_TEMPLATES } from "../workflow/models.js";
import { TALKING_MAX_SEC, TALKING_PRESETS, buildTalkingSegmentPrompt, splitTalkingScript, talkingPresetById } from "../workflow/talking.js";
import { loadTemplate } from "../workflow/template.js";
import { voiceConfig, VOICE_PRESETS, synthDesign, synthClone, saveVoiceFile } from "../voice/mimo.js";
import { maskPrompt, unmaskPrompt, systemPromptFor } from "../text/translate.js";
import { generateText, resolveModel, listProviders } from "../text/llm.js";
import { PROMPT_PRESETS } from "../text/presets.js";
import { lintPrompt } from "../text/prompt-lint.js";
import { homedir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";

export function writeJsonRes(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(payload);
}

export async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function buildApi(ctx, config) {
  return {
    async health() {
      try {
        const stats = await comfyJson(config, "/system_stats");
        const queue = await comfyJson(config, "/queue");
        return { ok: true, comfy: comfyBase(config), stats,
          queue: { running: queue.queue_running?.length ?? 0, pending: queue.queue_pending?.length ?? 0 },
          models: Object.keys(MODELS) };
      } catch (error) {
        return { ok: false, comfy: comfyBase(config), error: String(error?.message || error) };
      }
    },
    async "project.list"() {
      return { projects: await listProjects(config) };
    },
    async "project.create"(body) {
      return { project: await createProject(config, body?.name) };
    },
    async "project.rename"(body) {
      const dir = projectDir(config, body.id);
      const p = await readJson(join(dir, "project.json"), null);
      if (!p) throw new Error("项目不存在");
      p.name = String(body.name || p.name).slice(0, 60);
      p.updatedAt = new Date().toISOString();
      await writeJson(join(dir, "project.json"), p);
      return { project: p };
    },
    async "project.trash"(body) {
      try {
        const id = body.id;
        const src = projectDir(config, id);
        const proj = await readJson(join(src, "project.json"), null);
        if (!proj) throw new Error("项目不存在");
        const trashRoot = join(homedir(), ".dsh", "projects-trash");
        await mkdir(trashRoot, { recursive: true });
        const dst = join(trashRoot, id);
        await rm(dst, { recursive: true, force: true });
        await rename(src, dst);
        await writeJson(join(dst, "trash.json"), {
          id, name: proj.name || id, deletedAt: new Date().toISOString(),
        });
        return { ok: true, trashed: id };
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },
    async "project.trashList"() {
      try {
        const trashRoot = join(homedir(), ".dsh", "projects-trash");
        const ids = await readdir(trashRoot).catch(() => []);
        const out = [];
        for (const id of ids) {
          const dir = join(trashRoot, id);
          const st = await stat(dir).catch(() => null);
          if (!st || !st.isDirectory()) continue;
          const proj = await readJson(join(dir, "project.json"), {});
          const meta = await readJson(join(dir, "trash.json"), {});
          let assets = 0;
          let thumb = "";
          try {
            const idx = await readJson(join(dir, "assets", "index.json"), []);
            assets = idx.length;
            if (idx.length) thumb = idx[idx.length - 1].file || "";
          } catch {}
          out.push({
            id, name: proj.name || meta.name || id,
            deletedAt: meta.deletedAt || st.mtime.toISOString(),
            assets, thumb, bytes: st.size,
          });
        }
        out.sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
        return { ok: true, projects: out };
      } catch (e) {
        return { ok: false, error: String(e.message || e), projects: [] };
      }
    },
    async "project.restore"(body) {
      try {
        const id = body.id;
        const src = join(homedir(), ".dsh", "projects-trash", id);
        if (!(await stat(src).catch(() => null))) throw new Error("回收站里没有这个项目");
        const dst = projectDir(config, id);
        await rm(dst, { recursive: true, force: true });
        await rename(src, dst);
        await rm(join(dst, "trash.json"), { force: true }).catch(() => {});
        const proj = await readJson(join(dst, "project.json"), { id, name: id });
        proj.updatedAt = new Date().toISOString();
        await writeJson(join(dst, "project.json"), proj);
        return { ok: true, project: proj };
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },
    async "project.purge"(body) {
      try {
        await rm(join(homedir(), ".dsh", "projects-trash", body.id), { recursive: true, force: true });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },
    async "project.delete"(body) {
      await rm(projectDir(config, body.id), { recursive: true, force: true });
      return { ok: true };
    },
    async "canvas.get"(body) {
      return { canvas: await getCanvas(config, body.id) };
    },
    async "canvas.save"(body) {
      ensureDailyBackup(config, body?.id).catch(() => {});
      const dir = projectDir(config, body.id);
      const conflict = await withCanvasLock(body.id, async () => {
        // 合并：磁盘上新写入的生成结果（有 file 但客户端快照里还没有）不被旧快照覆盖
        const incoming = body.canvas || { nodes: [], edges: [], viewport: {} };
        const existing = await readJson(join(dir, "canvas.json"), { nodes: [], edges: [], viewport: {} });
        const byId = new Map((incoming.nodes || []).map((n) => [n.id, n]));
        for (const old of existing.nodes || []) {
          const fresh = byId.get(old.id);
          if (!fresh) continue;
          const oldFile = old.data?.file;
          const newFile = fresh.data?.file;
          if (!oldFile || oldFile === newFile) continue;
          // 只在「客户端没有文件」或「客户端仍认为在生成中」时保护磁盘上的新产物；
          // 客户端明确提交一个 done 状态的不同文件（如音色重新生成）必须被接受。
          const st = String(fresh.data?.status || "");
          const clientGenerating = st !== "" && st !== "done" && st !== "idle" && st !== "failed";
          if (newFile && !clientGenerating) continue;
          byId.set(old.id, { ...fresh, data: { ...fresh.data, file: oldFile,
            width: old.data?.width ?? fresh.data?.width, height: old.data?.height ?? fresh.data?.height,
            status: "done", assetId: old.data?.assetId } });
        }
        const disk = await readJson(join(dir, "canvas.json"), { rev: 1 });
        const diskRev = Number(disk.rev) || 1;
        if (body.baseRev != null && Number(body.baseRev) !== diskRev) {
          return { conflict: true, rev: diskRev };
        }
        const rev = diskRev + 1;
        await writeJson(join(dir, "canvas.json"), { ...incoming, nodes: [...byId.values()], rev });
        await touchProject(config, body.id);
        return { conflict: false, rev };
      });
      return conflict.conflict ? { conflict: true, rev: conflict.rev } : { ok: true, rev: conflict.rev };
    },
    async "video.frame"(body) {
      const job = {
        id: randomUUID().slice(0, 12),
        projectId: body.projectId,
        nodeId: body.nodeId || null,
        sourceNodeId: body.sourceNodeId || "",
        sourceFile: body.file,
        at: body.at === "last" ? "last" : "first",
        status: "running",
        startedAt: Date.now(),
      };
      JOBS.set(job.id, job);
      try {
        await runFrameJob(ctx, config, job);
        return { jobId: job.id, status: job.status, asset: job.asset || null };
      } catch (e) {
        job.status = "failed";
        job.error = String(e.message || e);
        return { jobId: job.id, status: "failed", error: job.error };
      }
    },
    async "env.check"() {
      try {
        return await envCheck(config);
      } catch (e) {
        return { ok: false, items: [], error: String(e.message || e) };
      }
    },
    async "backup.list"(body) {
      try {
        const projectId = body.projectId;
        if (!projectId) return { ok: true, days: [] };
        const root = join(homedir(), ".dsh", "backups", projectId);
        const names = (await readdir(root).catch(() => []))
          .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
          .sort()
          .reverse();
        const days = [];
        for (const d of names) {
          let bytes = 0;
          try {
            for (const f of await readdir(join(root, d))) {
              const st = await stat(join(root, d, f)).catch(() => null);
              if (st) bytes += st.size;
            }
          } catch {}
          days.push({ date: d, bytes });
        }
        return { ok: true, days };
      } catch (e) {
        return { ok: false, error: String(e.message || e), days: [] };
      }
    },
    async "backup.restore"(body) {
      try {
        const { projectId, date } = body;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error("日期格式不对");
        const src = join(homedir(), ".dsh", "backups", projectId, date, "canvas.json");
        const dstDir = projectDir(config, projectId);
        const canvas = await readFile(src, "utf8");
        // 恢复前先把当前画布再快照一次，避免恢复后无法回退
        await writeFile(join(homedir(), ".dsh", "backups", projectId, "before-restore-" + Date.now() + ".json"),
          await readFile(join(dstDir, "canvas.json")).catch(() => Buffer.from("{}")));
        await writeFile(join(dstDir, "canvas.json"), canvas);
        await touchProject(config, projectId);
        return { ok: true, restored: true, date };
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },
    async "video.publishAll"(body) {
      try {
        return await exportAllShots(config, body.projectId);
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },
    async "video.publish"(body) {
      try {
        return await exportPublishPack(config, body.projectId, body.nodeId);
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },
    async "video.concat"(body) {
      try {
        return await concatProjectVideos(config, body.projectId, body.nodeIds || [], body.title || "");
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },
    async "video.upscaleLatent"(body) {
      const job = {
        id: randomUUID().slice(0, 12),
        projectId: body.projectId,
        nodeId: body.nodeId,
        sourceFile: body.file,
        prompt: body.prompt || "",
        targetWidth: body.width,
        targetHeight: body.height,
        fps: body.fps,
        status: "queued",
        startedAt: Date.now(),
      };
      submitJob({ ctx, config, job: job, runner: () => runVideoLatentUpscaleJob(ctx, config, job) });
      return { jobId: job.id };
    },
    async "video.upscale"(body) {
      const job = {
        id: randomUUID().slice(0, 12),
        projectId: body.projectId,
        nodeId: body.nodeId,
        sourceFile: body.file,
        prompt: body.prompt || "",
        status: "running",
        startedAt: Date.now(),
      };
      JOBS.set(job.id, job);
      // 说明：插值放大是 ffmpeg 秒级操作（≈3s），有意保持同步返回；
      // 如需入队，可改成 submitJob + jobId，前端 pollJob 即可（同 latent 链路）。
      try {
        await runVideoUpscaleJob(ctx, config, job);
        return { jobId: job.id, status: job.status, asset: job.asset || null };
      } catch (e) {
        job.status = "failed";
        job.error = String(e.message || e);
        return { jobId: job.id, status: "failed", error: job.error };
      }
    },
    async "image.upscale"(body) {
      const job = {
        id: randomUUID().slice(0, 12),
        projectId: body.projectId,
        nodeId: body.nodeId,
        sourceFile: body.file,
        prompt: body.prompt || "",
        upscaleModel: body.model || "4x_foolhardy_Remacri.pth",
        upscaleScale: Number(body.scale) === 2 ? 2 : 4,
        capability: "image-upscale",
        status: "queued",
        startedAt: Date.now(),
      };
      // 超分是"派生"操作：产物另起一张卡片，源卡片保持不动
      job.newCard = true;
      job.kind = "upscale";
      job.linkFrom = body.nodeId || "";
      job.title = "4K 超分";
      // 优先用绑定的 4K 超分实现（修细节），没有才回退本地放大链（只放大）
      const upDb = await resolveDefaultImpl("image-upscale");
      if (upDb) {
        job.implBindingId = upDb.id;
        job.implBindingName = upDb.name;
        job.refFiles = [body.file];
        job.model = "binding:" + upDb.id;
      }
      submitJob({ ctx, config, job, runner: () => (upDb ? runBindingImageJob(ctx, config, job) : runUpscaleJob(ctx, config, job)) });
      return { jobId: job.id, impl: upDb ? upDb.name : "内置放大链" };
    },
    /** 当前翻译用的模型（DSH 用户默认模型） */
    /** 提示词机检：是否在复述素材特征（人物/场景/音色） */
    async "prompt.lint"(body) {
      const res = lintPrompt(String(body?.text || ""), {
        hasRefImages: Boolean(body?.hasRefImages),
        hasRefAudios: Boolean(body?.hasRefAudios),
      });
      return { ok: true, pass: res.ok, warnings: res.warnings };
    },

    /** 提示词模板 */
    async "prompt.presets"() {
      return { ok: true, presets: PROMPT_PRESETS };
    },

    async "prompt.model"() {
      const picked = resolveModel(ctx);
      return { ok: true, provider: picked.provider, model: picked.model, providers: listProviders(ctx) };
    },

    /**
     * 提示词翻译（英↔中）。走 DSH 默认模型。
     * 分段翻译：按空行切段，每段独立掩码/翻译/还原/缓存，避免长文本撞 max-tokens。
     */
    async "prompt.translate"(body) {
      const text = String(body?.text || "");
      const direction = body?.direction === "zh2en" ? "zh2en" : "en2zh";
      if (!text.trim()) return { ok: true, text: "", cached: true };

      const cacheFile = join(homedir(), ".dsh", "omni-canvas.translations.json");
      const cache = await readJson(cacheFile, {});
      const keyOf = (t) => createHash("sha256").update(direction + "\u0000" + t).digest("hex").slice(0, 16);

      // 按空行切段（保留分隔）；过长的段再按单行切小，避免单次输出被截断
      const rawBlocks = String(text).split(/(\n\s*\n)/);
      const blocks = [];
      for (const b of rawBlocks) {
        if (!b || /^\s*$/.test(b) || b.length <= 1000) { blocks.push(b); continue; }
        const lines = b.split(/(\n)/);
        let buf = "";
        for (const ln of lines) {
          if (buf.length + ln.length > 900 && buf.trim()) { blocks.push(buf); buf = ""; }
          buf += ln;
        }
        if (buf) blocks.push(buf);
      }
      let hits = 0;
      let calls = 0;

      for (let i = 0; i < blocks.length; i += 1) {
        const piece = blocks[i];
        if (!piece || /^\s*$/.test(piece)) continue;      // 分隔符原样保留
        const key = keyOf(piece);
        if (cache[key]?.text) { blocks[i] = cache[key].text; hits += 1; continue; }

        const { masked, tokens } = maskPrompt(piece);
        let out = null;
        let budget = Math.min(8192, Math.max(768, Math.ceil(masked.length * 2) + 256));
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const r = await generateText(ctx, {
            system: systemPromptFor(direction),
            user: masked,
            maxTokens: budget,
            timeoutMs: 90000,
            override: { provider: body?.provider, model: body?.model },
          });
          calls += 1;
          if (!r.truncated) { out = r; break; }
          budget = Math.min(16384, budget * 2);           // 截断就加倍再试
          out = r;
        }
        if (!out) throw new Error("翻译失败：模型无输出");
        if (out.truncated) {
          throw new Error(`翻译失败：第 ${i + 1} 段被截断（已达 ${budget} tokens），请分段翻译或缩短该段`);
        }
        const restored = unmaskPrompt(out.text, tokens);
        cache[key] = { text: restored, provider: out.provider, model: out.model, at: Date.now() };
        blocks[i] = restored;
      }

      // 只保留最近 800 条
      const keys = Object.keys(cache);
      if (keys.length > 800) {
        keys.sort((a, b) => (cache[a].at || 0) - (cache[b].at || 0));
        for (const k of keys.slice(0, keys.length - 800)) delete cache[k];
      }
      await writeJson(cacheFile, cache);
      return { ok: true, text: blocks.join(""), cached: hits > 0 && calls === 0, segments: calls, cacheHits: hits };
    },

    async "voice.presets"() {
      return { ok: true, presets: VOICE_PRESETS };
    },

    /** 当前音色配置（不返回 key 明文，只告诉前端"配没配"） */
    async "voice.config"() {
      const c = await voiceConfig();
      return { ok: true, base: c.base, hasKey: Boolean(c.apiKey), designModel: c.designModel,
               cloneModel: c.cloneModel, defaultText: c.defaultText };
    },

    /** 生成试听音频：mode=design（文字描述）| clone（参考音频） */
    async "voice.preview"(body) {
      const cfg = await voiceConfig();
      const projectId = String(body?.projectId || "");
      if (!projectId) throw new Error("缺少 projectId");
      const text = String(body?.text || "").trim();
      let result;
      if (String(body?.mode) === "clone") {
        const rel = String(body?.sampleFile || "");
        if (!rel) throw new Error("克隆模式需要 sampleFile（项目内音频路径）");
        const abs = join(projectDir(config, projectId), rel);
        const buf = await readFile(abs);
        const mime = rel.endsWith(".mp3") ? "audio/mpeg" : rel.endsWith(".m4a") ? "audio/mp4" : "audio/wav";
        result = await synthClone({ sampleBuf: buf, mime, text, cfg });
      } else {
        result = await synthDesign({ desc: String(body?.desc || ""), text, cfg });
      }
      const saved = await saveVoiceFile(projectDir(config, projectId), result.buf);
      return { ok: true, file: saved.file, transcript: result.transcript,
               bytes: result.buf.length, desc: String(body?.desc || ""), text };
    },

    async "impl.list"(body) {
      const cap = String(body?.capability || "");
      const VIDEO_CAP = { "video-r2v": "r2v", "video-i2v": "i2v", "video-fl2v": "fl2v", "video-t2v": "t2v" };
      const isVideo = Boolean(VIDEO_CAP[cap]);
      const ALL_CAPS = ["image-t2i", "image-edit", "image-upscale", "video-r2v", "video-i2v", "video-fl2v", "video-t2v"];
      const want = !cap
        ? ALL_CAPS
        : (isVideo ? [cap] : (cap === "image-edit" ? ["image-edit"] : ["image-t2i", "image-edit"]));
      const out = [];
      // 视频：只暴露一个「H3 导演台（全模式）」内置实现，task_type 由卡片上的生成方式决定
      if (want.some((c) => c.startsWith("video-"))) {
        if (want.includes("video-talking")) {
          const compatT = await builtinCompat(config, "h3-director");
          for (const tp of TALKING_PRESETS) {
            out.push({ id: tp.id, name: tp.name, kind: "内置模板", capability: "video-talking",
                       desc: tp.desc, verified: compatT.ok, missing: compatT.missing,
                       compatError: compatT.error || "" });
          }
        }
        const compatV = await builtinCompat(config, "h3-director");
        for (const c of want.filter((x) => x.startsWith("video-"))) {
          out.push({ id: "builtin:h3-director", name: "H3 导演台（全模式）", kind: "内置模板",
                     verified: compatV.ok, capability: c,
                     missing: compatV.missing, compatError: compatV.error || "" });
        }
      }
      for (const [key, t] of Object.entries(MODELS)) {
        if (!want.some((c) => c.startsWith("image-"))) continue;
        if (t.kind === "video") continue;
        const c = key === "qwen-edit" ? "image-edit" : "image-t2i";
        if (!want.includes(c)) continue;
        const compatI = await builtinCompat(config, key);
        out.push({ id: "builtin:" + key, name: t.label || key, kind: "内置模板",
                   verified: compatI.ok, capability: c, missing: compatI.missing, compatError: compatI.error || "" });
      }
      const bindings = await loadBindings();
      for (const b of (Array.isArray(bindings) ? bindings : [])) {
        if (!want.includes(b.capability)) continue;
        if (b.verified?.mode !== "run") continue;   // 只列实测跑通过的
        out.push({ id: b.id, name: b.name, kind: "工作流", verified: true, capability: b.capability });
      }
      return { impls: out };
    },
    async "gen.image"(body) {
      if (!body?.prompt?.trim()) throw new Error("提示词不能为空");
      const refFiles = Array.isArray(body.refFiles) ? body.refFiles.filter(Boolean) : [];
      const wantImpl = String(body.impl || "").trim();
      let impl = null;
      let job_model_override = null;
      if (wantImpl) {
        impl = await resolveExplicitImpl(wantImpl, refFiles.length ? "image-edit" : "image-t2i");
        if (!impl) throw new Error(`所选工作流不可用：${wantImpl}`);
        if (impl.builtin) {
          const compat = await builtinCompat(config, impl.builtin);
          if (!compat.ok) {
            const miss = compat.missing.map((m) => `${m.input}=${m.want}`).join("、");
            throw new Error(`内置模板缺主模型（${miss}），本机也没有相近版本。请安装模型，或在设置→工作流库绑定你自己的工作流`);
          }
          job_model_override = impl.builtin;
          impl = null;
        }
      } else {
        // 默认实现：优先用户设置的默认绑定，没有再回退内置模板
        const cap = refFiles.length ? "image-edit" : "image-t2i";
        const db = await resolveDefaultImpl(cap);
        if (db) {
          impl = { id: db.id, name: db.name, capability: db.capability || cap };
        } else {
          impl = null;
          job_model_override = refFiles.length ? "qwen-edit" : "qwen-t2i-fast";
        }
      }
      const job = {
        refFiles,
        id: randomUUID().slice(0, 12),
        projectId: body.projectId,
        nodeId: body.nodeId,
        prompt: body.prompt,
        model: refFiles.length ? "qwen-edit" : (job_model_override || body.model || "qwen-t2i-fast"),
        aspect: body.aspect || "1:1",
        resolution: body.resolution === "2K" ? "2K" : "1K",
        count: Math.min(4, Math.max(1, Number(body.count) || 1)),
        seed: body.seed === "" || body.seed == null ? Math.floor(Math.random() * 2147483647) : Number(body.seed),
        status: "queued",
        capability: refFiles.length ? "image-edit" : "image-t2i",
        startedAt: Date.now(),
      };
      await adjustForVram(config, job, "image");
      if (impl) {
        job.implBindingId = impl.id;
        job.implBindingName = impl.name;
        job.model = "binding:" + impl.id;
      }
      submitJob({ ctx, config, job: job, runner: () => (impl ? runBindingImageJob(ctx, config, job) : runImageJob(ctx, config, job)) });
      return { jobId: job.id, queued: jobQueueInfo().length, impl: impl ? impl.name : "内置模板" };
    },
    async clientlog(body) {
      await writeProbe(`[client] ${String(body?.msg || "").slice(0, 300)}`);
      return { ok: true };
    },
    async "gen.video"(body) {
      // 多音色：voiceFiles=[{file,name}] 或 voiceFile="media/x.wav"
      // 兜底：前端没带（旧客户端/漏传）时，直接读画布上连到该节点的音频卡
      const parseVoices = async (b) => {
        const raw = Array.isArray(b?.voiceFiles) ? b.voiceFiles : (b?.voiceFile ? [b.voiceFile] : []);
        const list = raw.map((x) => typeof x === "string"
          ? { file: x, name: "" }
          : { file: String(x?.file || ""), name: String(x?.name || "") })
          .filter((x) => x.file)
          .slice(0, 3);
        if (list.length || !b?.nodeId || !b?.projectId) return list;
        try {
          const canvas = await getCanvas(config, b.projectId);
          const ups = (canvas.edges || []).filter((e) => e.to === b.nodeId).map((e) => e.from);
          const audios = (canvas.nodes || []).filter(
            (n) => ups.includes(n.id) && n.type === "audio" && n.data && n.data.file);
          return audios.slice(0, 3).map((n) => ({
            file: n.data.file,
            name: (n.data.voice && n.data.voice.name) || n.data.title || "",
          }));
        } catch {
          return [];
        }
      };

      const isTalkingReq = String(body?.mode || "").toLowerCase() === "talking";
      if (isTalkingReq) {
        if (!String(body?.script || body?.prompt || "").trim()) throw new Error("口播文案不能为空");
      } else if (!body?.prompt?.trim()) {
        throw new Error("提示词不能为空");
      }
      const refFiles = Array.isArray(body.refFiles) ? body.refFiles.filter(Boolean) : [];
      // 模式由调用方显式指定，不再按参考图数量静默推断
      // 一个工作流覆盖全模式：task_type 由卡片选的模式决定，不再按模式拆模型键
      const MODE_MAP = {
        t2v: { model: "h3-director", min: 0, max: 0, label: "文生视频" },
        i2v: { model: "h3-director", min: 1, max: 2, label: "图生视频（首帧驱动）" },
        r2v: { model: "h3-director", min: 1, max: 9, label: "参考生视频" },
        fl2v: { model: "h3-director", min: 2, max: 2, label: "首尾帧生视频" },
      };
      const rawMode = String(body.mode || "").toLowerCase();
      // ---- 数字人口播：文案 → N 段 → 一次导演台任务（总时长 <= 120s，防 OOM）----
      if (rawMode === "talking") {
        // 模板自动判定：2 张 = 人物 + 场景；1 张 = 人物带环境；超过 2 张拒绝
        if (refFiles.length < 1 || refFiles.length > 2) {
          throw new Error(`数字人口播需要 1 张（人物带场景）或 2 张（人物 + 场景）参考图，当前连了 ${refFiles.length} 张`);
        }
        const preset = refFiles.length === 2
          ? talkingPresetById("talking-person-scene")
          : talkingPresetById(body.preset && body.preset !== "auto" ? body.preset : "talking-combined");
        const needScene = refFiles.length === 2 ? 1 : 0;
        const plan = splitTalkingScript(body.script || body.prompt, body.segmentSec, body.maxSeconds);
        if (plan.truncated) {
          throw new Error(`文案超出 ${TALKING_MAX_SEC} 秒上限（约 ${Math.round(plan.totalSeconds)}s），请删减文案或拆成两条`);
        }
        const person = refFiles[0];
        const scene = needScene ? refFiles[1] : null;
        const segs = plan.segments.map((sg, i) => ({
          prompt: buildTalkingSegmentPrompt(sg, { person, scene, index: i,
                                                  total: plan.segments.length, refMode: preset.refMode }),
          seconds: sg.seconds,
        }));
        const totalFrames = Math.round(segs.reduce((a, b) => a + b.seconds, 0) * 24);
        if (totalFrames > 120 * 24) throw new Error(`口播总时长超过 120 秒（${Math.round(totalFrames / 24)}s），请删减文案或拆成两条`);
        const talkJob = {
          refFiles, mode: "r2v", id: randomUUID().slice(0, 12), projectId: body.projectId,
          nodeId: body.nodeId, prompt: segs.map((x) => x.prompt).join("\n\n"),
          model: "h3-director", duration: Math.round((totalFrames / 24) * 10) / 10, talkingMode: true,
          aspect: body.aspect || "16:9", resolution: body.resolution || "480p",
          capability: `video-${mode}`,
        status: "queued", startedAt: Date.now(),
          talking: { segments: segs, totalFrames, plan, preset: preset.id },
          voiceFiles: await parseVoices(body),
        };
      submitJob({ ctx, config, job: talkJob, runner: () => runVideoJob(ctx, config, talkJob) });
        return { ok: true, jobId: talkJob.id,
                 talking: { segments: segs.length, totalSeconds: Math.round((totalFrames / 24) * 10) / 10 } };
      }
      const mode = MODE_MAP[rawMode]
        ? rawMode
        : (refFiles.length ? "r2v" : "t2v");            // auto：有参考走参考生视频，没有就看有没有首帧
      const spec = MODE_MAP[mode];
      if (refFiles.length < spec.min || refFiles.length > spec.max) {
        throw new Error(
          `${spec.label}需要 ${spec.min}${spec.max === spec.min ? "" : "–" + spec.max} 张参考图，当前连了 ${refFiles.length} 张`
        );
      }

      const job = {
        refFiles,
        mode,
        id: randomUUID().slice(0, 12),
        projectId: body.projectId,
        nodeId: body.nodeId,
        prompt: body.prompt,
        model: spec.model,
        duration: (() => {
          const d = Number(body.duration);
          return Number.isFinite(d) ? Math.min(15, Math.max(2, Math.round(d * 10) / 10)) : 6;
        })(),
        aspect: body.aspect || "16:9",
        resolution: body.resolution || "720p",
        voiceFiles: await parseVoices(body),
        status: "queued",
        startedAt: Date.now(),
      };
      if (mode === "fl2v") {
        job.warnings = ["首尾帧模式（fl2v）未验证：H3 对两张图的首/末帧映射不稳，结果不符请改用参考生视频"];
      }

      // 指定实现（内置模板 / 已验证绑定）：与图片链路一致
      let impl = null;
      const wantImpl = String(body.impl || "").trim();
      if (!wantImpl) {
        const dv = await resolveDefaultImpl(`video-${mode}`);
        if (dv) impl = { id: dv.id, name: dv.name, capability: dv.capability || `video-${mode}` };
      }
      if (wantImpl) {
        impl = await resolveExplicitImpl(wantImpl, `video-${mode}`);
        if (!impl) throw new Error(`所选工作流不可用：${wantImpl}`);
        if (impl.builtin) {
          const compat = await builtinCompat(config, impl.builtin);
          if (!compat.ok) {
            const miss = compat.missing.map((m) => `${m.input}=${m.want}`).join("、");
            throw new Error(`内置模板缺主模型（${miss}），本机也没有相近版本。请安装模型，或在设置→工作流库绑定你自己的工作流`);
          }
          impl = null;              // builtin:xxx 走内置模板链路
        }
        else {
          job.implBindingId = impl.id;
          job.implBindingName = impl.name;
          job.model = "binding:" + impl.id;
        }
      }
      job.seed = body.seed != null && body.seed !== ""
        ? Number(body.seed)
        : Math.floor(Math.random() * 2147483647);

      submitJob({ ctx, config, job, runner: () => (impl ? runBindingVideoJob(ctx, config, job) : runVideoJob(ctx, config, job)) });
      return { jobId: job.id, queued: jobQueueInfo().length, impl: impl ? impl.name : "内置模板" };
    },
    async version() {
      return {
        hostMtime: await fileMtime(HOST_FILE),
        clientMtime: await fileMtime(CLIENT_FILE),
        bootAt: HOST_BOOT_AT,
      };
    },
    async "project.export"(body) {
      try {
        return await exportProject(config, body.projectId);
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },
    async "job.history"() {
      return { jobs: await readJson(JOBS_HISTORY_PATH(), []) };
    },
    async "job.get"(body) {
      const id = String(body?.jobId || body?.id || "");
      let job = JOBS.get(id);
      if (!job) {
        // 宿主重启/任务丢失：按落盘的 promptId 去 ComfyUI 找回真实状态
        try {
          const mapPath = join(homedir(), ".dsh", "omni-canvas.prompts.json");
          const map = await readJson(mapPath, {});
          const rec = map[id];
          if (rec?.promptId) {
            const hist = await comfyFetch(config, `/history/${rec.promptId}`, {}).then((r) => r.json()).catch(() => ({}));
            const item = hist?.[rec.promptId];
            if (item) {
              const st = item.status || {};
              const failed = st.status_str === "error";
              const pr = progressOf(rec.promptId);
              return { ok: true, job: {
                id, nodeId: rec.nodeId, projectId: rec.projectId,
                status: failed ? "failed" : "done",
                error: failed ? (pr.error || "执行失败") : "",
                promptId: rec.promptId, recovered: true,
              } };
            }
            const q = await comfyFetch(config, "/queue", {}).then((r) => r.json()).catch(() => ({}));
            const running = (q.queue_running || []).some((x) => String(x[1]) === String(rec.promptId));
            const pending = (q.queue_pending || []).some((x) => String(x[1]) === String(rec.promptId));
            if (running || pending) {
              return { ok: true, job: {
                id, nodeId: rec.nodeId, projectId: rec.projectId,
                status: running ? "running" : "queued", promptId: rec.promptId, recovered: true,
              } };
            }
          }
        } catch {}
        return { ok: false, error: "任务不存在或已过期", job: { id, status: "unknown" } };
      }
      return { ok: true, job };
    },
    async "job.list"() {
      return { running: RUNNING_JOB ? { id: RUNNING_JOB.id, nodeId: RUNNING_JOB.nodeId, prompt: RUNNING_JOB.prompt?.slice(0, 60) } : null,
        queue: jobQueueInfo() };
    },
    async "job.cancel"(body) {
      const job = JOBS.get(body?.jobId);
      if (!job) throw new Error("任务不存在");
      if (job.status === "done" || job.status === "failed") return { ok: true, status: job.status };
      job.canceled = true;
      const idx = QUEUE.findIndex((it) => it.job.id === job.id);
      if (idx >= 0) {
        QUEUE.splice(idx, 1);
        job.status = "canceled";
        return { ok: true, status: "canceled" };
      }
      // 正在跑：尝试从 ComfyUI 队列踢掉
      if (job.promptId) {
        await comfyFetch(config, "/queue", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ delete: [job.promptId] }),
        }).catch(() => {});
      }
      job.status = "canceling";
      return { ok: true, status: "canceling" };
    },
    async "binding.run"(body) {
      const r = await runBinding(config, body || {});
      if (r.ok && body?.saveTo) {
        const files = [];
        for (const it of r.outputs || []) {
          try { files.push(await downloadOutput(config, it, body.saveTo)); } catch (e) { files.push({ error: String(e.message || e) }); }
        }
        r.files = files;
      }
      return r;
    },
    async "workflow.inspect"(body) {
      return inspectWorkflow(config, String(body?.file || ""));
    },
    async "binding.save"(body) {
      return saveBinding(config, body?.binding || {});
    },
    async "binding.list"() {
      return listBindings(config);
    },
    async "binding.setDefault"(body) {
      return setDefaultBinding(body || {});
    },
    async "binding.delete"(body) {
      return deleteBinding(String(body?.id || ""));
    },
    async "binding.test"(body) {
      return testBinding(config, body);
    },
    async "clipboard.set"(body) {
      try {
        return await setSystemClipboard(String(body?.text || ""));
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },
    async "comfy.status"() {
      try {
        const st = await comfyFetch(config, "/system_stats", {}).then((r) => r.json());
        const dev = Array.isArray(st?.devices) ? st.devices[0] : null;
        const total = dev?.vram_total ? dev.vram_total / 1024 / 1024 / 1024 : 0;
        const free = dev?.vram_free ? dev.vram_free / 1024 / 1024 / 1024 : 0;
        return {
          ok: true,
          vramTotalGB: Math.round(total * 10) / 10,
          vramFreeGB: Math.round(free * 10) / 10,
          vramUsedGB: Math.round((total - free) * 10) / 10,
          queue: QUEUE.length + (RUNNING_JOB ? 1 : 0),
        };
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },
    async "comfy.free"() {
      try {
        await comfyFetch(config, "/free", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ unload_models: true, free_memory: true }),
        });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    },
    async "comfy.find"() {
      const st = await loadSettings();
      const ports = [];
      for (const port of COMFY_PORTS) {
        const r = await probeHttp(`http://127.0.0.1:${port}`, 700);
        if (r) ports.push({ port, ...r });
      }
      const installs = await scanForInstalls(st.installPath || "");
      return {
        running: ports,
        installs: installs.map((i) => ({ ...i, launch: i.launch ? { kind: i.launch.kind, exe: i.launch.exe } : null })),
        savedInstallPath: st.installPath || "",
        launchedByPlugin: LAUNCHED ? { pid: LAUNCHED.pid, dir: LAUNCHED.dir } : null,
      };
    },
    async "comfy.start"(body) {
      const dir = String(body?.path || "").trim();
      if (!dir) return { ok: false, error: "缺少 path" };
      const info = await inspectInstall(dir);
      if (!info) return { ok: false, error: "该目录不像 ComfyUI（没有 main.py）" };
      const r = await startComfy(dir, info.launch);
      if (r.ok) {
        const next = { ...(await readJson(settingsPath(), {})), installPath: dir };
        await mkdir(dirname(settingsPath()), { recursive: true });
        await writeJson(settingsPath(), next);
        DIAG_CACHE = { at: 0, key: "", data: null };
      }
      return r;
    },
    async "comfy.stop"() {
      const r = await stopComfy();
      DIAG_CACHE = { at: 0, key: "", data: null };
      return r;
    },
    async "workflows.list"(body) {
      const st = await loadSettings();
      let dir = String(body?.dir || st.installPath || "").trim();
      if (!dir) {
        const found = await scanForInstalls("");
        dir = found[0]?.path || "";
        if (dir) {
          const next = { ...(await readJson(settingsPath(), {})), installPath: dir };
          await mkdir(dirname(settingsPath()), { recursive: true });
          await writeJson(settingsPath(), next);
        }
      }
      return scanWorkflows(config, dir || "");
    },
    async diagnose() {
      return runDiagnose(config);
    },
    async "settings.get"() {
      const st = await loadSettings();
      return { comfyUrl: COMFY_OVERRIDE, configComfyUrl: config?.comfyUrl || "", settings: st };
    },
    async "settings.set"(body) {
      const next = { ...(await readJson(settingsPath(), {})), ...(body || {}) };
      await mkdir(dirname(settingsPath()), { recursive: true });
      await writeJson(settingsPath(), next);
      COMFY_OVERRIDE = String(next.comfyUrl || "").trim();
      DIAG_CACHE = { at: 0, key: "", data: null };
      return { ok: true, comfyUrl: COMFY_OVERRIDE };
    },
    async "media.upload"(body) {
      const pid = body?.projectId;
      const dataUrl = String(body?.dataUrl || "");
      if (!pid || !dataUrl.startsWith("data:")) throw new Error("缺少文件数据");
      const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
      if (!m) throw new Error("文件格式无法解析");
      const mime = m[1].toLowerCase();
      const buf = Buffer.from(m[2], "base64");
      if (buf.length > 300 * 1024 * 1024) throw new Error("文件超过 300MB");
      const ext = mime.includes("png") ? "png" : mime.includes("jpeg") || mime.includes("jpg") ? "jpg"
        : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif"
        : mime.includes("mp4") ? "mp4" : mime.includes("webm") ? "webm" : mime.includes("quicktime") ? "mov"
        : mime.includes("mpeg") ? "mp3" : mime.includes("wav") ? "wav" : mime.includes("ogg") ? "ogg"
        : mime.includes("m4a") ? "m4a" : "bin";
      const kind = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video"
        : mime.startsWith("audio/") ? "audio" : "image";
      const dir = projectDir(config, pid);
      await ensureDir(join(dir, "media"));
      const fileName = `${randomUUID()}.${ext}`;
      await writeFile(join(dir, "media", fileName), buf);

      const baseName = String(body?.name || "").trim() || `上传-${fileName.slice(0, 6)}`;
      const asset = {
        id: randomUUID().slice(0, 12), kind, file: `media/${fileName}`, prompt: "",
        model: "upload", params: { bytes: buf.length, mime }, nodeId: "", name: baseName,
        createdAt: new Date().toISOString(), durationMs: 0,
      };
      const idxPath = join(dir, "assets", "index.json");
      const index = await readJson(idxPath, []);
      index.push(asset);
      await writeJson(idxPath, index);
      await touchProject(config, pid);

      // 卡片尺寸跟随素材原始比例（基准宽 320，高按比例；头像/竖屏也不会被拉扁）
      const nW = Math.max(1, Number(body?.naturalW) || 0);
      const nH = Math.max(1, Number(body?.naturalH) || 0);
      const baseW = kind === "video" ? 420 : 320;
      let w = baseW;
      let h = kind === "audio" ? 120 : Math.round(baseW * (nW && nH ? nH / nW : (kind === "video" ? 9 / 16 : 1)));
      if (!Number.isFinite(h) || h < 60) h = kind === "audio" ? 120 : 240;
      h = Math.min(h, 900);
      const made = { id: `n-${randomUUID().slice(0, 8)}`, type: kind, x: 0, y: 0, w, h,
        data: { name: baseName, title: baseName, file: asset.file, assetId: asset.id,
                status: "done",
                width: nW || undefined, height: nH || undefined,
                aspect: (nW && nH) ? `${Math.round((nW / nH) * 1000)}:1000` : (kind === "video" ? "16:9" : "1:1") } };
      await withCanvasLock(pid, async () => {
        const canvas = await getCanvas(config, pid);
        const atX = Number(body?.at?.x);
        const atY = Number(body?.at?.y);
        if (Number.isFinite(atX) && Number.isFinite(atY)) {
          made.x = Math.round(atX); made.y = Math.round(atY);
        } else {
          const spot = findFreeSpot(canvas.nodes || [], w, h, { gap: 16 });
          made.x = spot.x; made.y = spot.y;
        }
        canvas.nodes = Array.isArray(canvas.nodes) ? canvas.nodes : [];
        canvas.nodes.push(made);
        await writeJson(join(dir, "canvas.json"), canvas);
      });
      asset.nodeId = made.id;
      return { ok: true, asset, node: made };
    },
    async "env.plan"(body) {
      // 选了内置模板但缺东西 → 生成安装计划：节点（Manager 装）+ 模型（HF 下，先查重）
      const modelKey = String(body?.model || "h3-director");
      const compat = await builtinCompat(config, modelKey);
      const plan = { model: modelKey, ok: compat.ok, nodes: [], models: [], notes: [] };
      if (compat.ok) return plan;
      // 节点：模板引用的 class_type 在 object_info 里不存在 → 建议装插件
      const { workflow } = await loadTemplate(modelKey);
      const info = await getObjectInfo(config);
      const seen = new Set();
      for (const node of Object.values(workflow || {})) {
        const t = node?.class_type;
        if (!t || seen.has(t)) continue;
        seen.add(t);
        if (!info?.[t]) plan.nodes.push({ class_type: t });
      }
      // 模型：compat.missing（lora 已按加速/风格分类）
      const manifest = await readJson(join(HERE, "..", "templates", "models.manifest.json"), {});
      for (const m of compat.missing || []) {
        const meta = manifest[m.want] || {};
        plan.models.push({
          file: m.want, input: m.input, lora: !!m.lora,
          sizeGb: meta.size_gb ?? null, subdir: meta.subdir || (m.lora ? "loras" : "unet"),
          repo: meta.repo || null, role: meta.role || (m.lora ? "lora" : "model"),
        });
      }
      plan.notes.push("节点缺失 → 用 ComfyUI-Manager 安装后需重启 ComfyUI；模型缺失 → 从 HF 下载到对应目录，装前先查重（本机已有同名/同族就跳过）");
      return plan;
    },
    async "env.install"(body) {
      // 执行安装计划：节点走 Manager；模型只装 repo 已知的（避免瞎猜源），装前查重
      const out = { installed: [], skipped: [], failed: [], modelManual: [] };
      for (const n of body?.nodes || []) {
        if (await info_has_node(config, n.class_type)) { out.skipped.push(n.class_type + "（已存在）"); continue; }
        try {
          const res = await comfyFetch(config, "/manager/queue/install", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: n.class_type }),
          }).then((r) => r.json().catch(() => ({})));
          if (res && res.status !== "error") out.installed.push(n.class_type);
          else out.failed.push(n.class_type + "：Manager 拒绝（请手动装）");
        } catch (e) {
          out.failed.push(n.class_type + "：Manager 不可用（" + String(e.message || e).slice(0, 60) + "）");
        }
      }
      for (const m of body?.models || []) {
        if (await model_exists_locally(config, m.file)) { out.skipped.push(m.file + "（已存在，不重复下载）"); continue; }
        if (!m.repo) { out.modelManual.push(m.file + "（未登记来源，请把 HF/ModelScope 的 repo 给我或手动下载到 models/" + m.subdir + "）"); continue; }
        try {
          const url = (config.hfMirror ? "https://hf-mirror.com/" : "https://huggingface.co/") + m.repo + "/resolve/main/" + (m.remotePath || m.file);
          const dir = join(comfyRoot(config), "models", m.subdir);
          await ensureDir(dir);
          await new Promise((resolve, reject) => {
            const child = spawn("curl", ["-L", "-C", "-", "-o", join(dir, m.file), url], { windowsHide: true });
            child.on("close", (code) => code === 0 ? resolve() : reject(new Error("curl exit " + code)));
            child.on("error", reject);
          });
          out.installed.push(m.file + " → models/" + m.subdir);
        } catch (e) {
          out.failed.push(m.file + "：" + String(e.message || e).slice(0, 80));
        }
      }
      return { ok: out.failed.length === 0, ...out,
        next: "装完节点/模型后按《工作流绑定流程》§1.2 重启 ComfyUI，再点「重新检查」复验" };
    },
    async "talking.split"(body) {
      try {
        const r = splitTalkingScript(body?.script, body?.segmentSec, body?.maxSeconds);
        return { ok: true, ...r };
      } catch (e) {
        return { ok: false, error: String(e?.message || e) };
      }
    },
    async "job.progress"(body) {
      const id = body?.promptId || body?.jobId;
      const jobs = JOBS || null;
      const job = jobs && id ? (jobs.get(String(id)) || jobs.get(id)) : null;
      const wsP = progressOf(job?.promptId || id);

      // ① 多段（口播）：每段占固定区间，段内用 ComfyUI 步数填充
      if (job?.talking?.segments?.length && wsP.percent > 0) {
        return { ok: true, percent: Math.min(97, wsP.percent), node: wsP.node || "", stage: wsP.stage || 0 };
      }
      // ② 单段：直接用 ws 的真步骤进度
      if (wsP.percent > 0) {
        return { ok: true, percent: Math.min(97, wsP.percent), node: wsP.node || "", stage: wsP.stage || 0 };
      }
      // ③ 还没有首个事件：不给假数字
      return { ok: true, percent: null, node: "准备中", stage: 0 };
    },
    async "client.version"() {
      try {
        const st = await stat(join(dirname(fileURLToPath(import.meta.url)), "client.js"));
        return { ok: true, version: String(Math.floor(st.mtimeMs)) };
      } catch {
        return { ok: true, version: "0" };
      }
    },
    async "asset.listAll"() {
      const root = rootDir(config);
      const ids = await readdir(root).catch(() => []);
      const out = [];
      for (const id of ids) {
        const proj = await readJson(join(root, id, "project.json"), null);
        if (!proj) continue;
        const idx = await readJson(join(root, id, "assets", "index.json"), []);
        if (!idx.length) continue;
        const canvas = await readJson(join(root, id, "canvas.json"), { nodes: [] });
        const byFile = new Map();
        for (const n of canvas.nodes || []) {
          if (n?.data?.file) byFile.set(n.data.file, n.data.role || "");
        }
        for (const a of idx) {
          out.push({ ...a, role: a.role || byFile.get(a.file) || "", projectId: id, projectName: proj.name || id });
        }
      }
      out.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      return { assets: out };
    },
    async "asset.list"(body) {
      const index = await readJson(join(projectDir(config, body.id), "assets", "index.json"), []);
      const canvas = await readJson(join(projectDir(config, body.id), "canvas.json"), { nodes: [] });
      const byFile = new Map();
      for (const n of canvas.nodes || []) {
        if (n?.data?.file) byFile.set(n.data.file, n.data.role || "");
      }
      const assets = index.slice().reverse().map((a) => ({
        ...a,
        role: a.role || byFile.get(a.file) || "",
      }));
      return { assets };
    },
    async "asset.delete"(body) {
      const dir = projectDir(config, body.id);
      const idxPath = join(dir, "assets", "index.json");
      const index = await readJson(idxPath, []);
      const target = index.find((a) => a.id === body.assetId);
      if (!target) return { ok: true };
      const next = index.filter((a) => a.id !== body.assetId);
      await writeJson(idxPath, next);
      await rm(join(dir, target.file), { force: true }).catch(() => {});
      return { ok: true };
    },
  };
}

/** 工具返回：包成 DSH 的 text content 数组。 */
export const ok = (value) => [{ type: "text", text: JSON.stringify(value) }];

/**
 * 画布工具（Agent 侧）：读写 canvas.json，操作脚本卡与资产。
 * 所有变更都走 mutateCanvas（带锁 + rev 自增），客户端轮询 rev 刷新。
 */
export function canvasNodeSummary(n) {
  return {
    id: n.id,
    type: n.type,
    name: n.data?.name || n.data?.title || "",
    role: n.data?.role || "",
    prompt: (n.data?.prompt || "").slice(0, 200),
    file: n.data?.file || "",
    status: n.data?.status || "",
    x: n.x, y: n.y, w: n.w, h: n.h,
  };
}

export const DEFAULT_COLUMNS = [
  { key: "shot", title: "镜号", w: 54 },
  { key: "dur", title: "时长", w: 52 },
  { key: "size", title: "景别", w: 84 },
  { key: "move", title: "运镜", w: 72 },
  { key: "desc", title: "画面描述", w: 220 },
  { key: "light", title: "光影氛围", w: 140 },
  { key: "line", title: "台词", w: 120 },
  { key: "sound", title: "音效", w: 130 },
  { key: "assets", title: "资产（角色/场景/道具）", w: 220 },
  { key: "prompt", title: "提示词", w: 130 },
];

/** 用一行 + 已绑定资产 → H3 六段式提示词 */
export function composeRow(group, row, index, assets) {
  const c = row.cells || {};
  const lines = [];
  lines.push("subject_definitions:");
  if (assets.length) {
    assets.forEach((a, i) => {
      const role = a.role === "scene" ? "the environment" : a.role === "prop" ? "a prop" : "the subject";
      const desc = String(a.desc || "").replace(/\s+/g, " ").slice(0, 160);
      lines.push("<Picture " + (i + 1) + "> is " + role + "「" + a.name + "」" + (desc ? "：" + desc : "") + ". Identity / layout comes only from this image.");
    });
  } else {
    lines.push("<Subject 1> appears in this shot. Identity comes only from the reference images when provided.");
  }
  lines.push("");
  lines.push("summary:");
  lines.push(c.desc || "A single continuous shot.");
  lines.push("");
  lines.push("retention_analysis:");
  lines.push("<Picture 1>: fully_preserved - identity unchanged; only natural motion moves.");
  lines.push("");
  lines.push("detailed_description:");
  const head = ["[Shot " + index + "]",
    c.size || "",
    c.move ? "运镜：" + c.move : "",
    group.scene ? "场景：" + group.scene : "",
    (c.light || group.light) ? "光影：" + (c.light || group.light) : "",
  ].filter(Boolean).join(" · ");
  lines.push(head + "。");
  lines.push(c.desc || "");
  if (c.line) lines.push("台词：<d>[Chinese] " + c.line + "</d>");
  lines.push("");
  lines.push("overall_soundscape:");
  lines.push(c.sound || group.sound || "自然环境声，无音乐。");
  lines.push("");
  lines.push("non_diegetic_music: N/A");
  return lines.join("\n");
}

export function registerTools(ctx, config) {
  const disposers = [];
  /** defineTool 要求 output.schema + output.render。 */
  const output = {
    schema: { type: "object", additionalProperties: true },
    render: (_args, value) => [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }],
  };

  disposers.push(ctx.tools.register(defineTool({
    name: "cnv_self_check",
    description: "检查本地 ComfyUI 是否连通，返回队列状态与可用模型（qwen-t2i-fast / qwen-t2i-hq）。",
    parameters: {},
    output,
    async execute() {
      const api = buildApi(ctx, config);
      return await api.health();
    },
  })));

  disposers.push(ctx.tools.register(defineTool({
    name: "cnv_workflow_inspect",
    description: "读取一个 ComfyUI 工作流的节点表（UI 或 API 格式），返回每个节点的 id/类型/标题/输入字段与当前值，并给出 prompt、seed、时长、参考图、输出节点的候选位置。用于把外部工作流绑定成插件实现。",
    parameters: {
      file: { type: "string", required: true, description: "工作流文件路径：绝对路径，或相对 ComfyUI 安装目录的路径（如 user/default/workflows/xxx.json）" },
    },
    output,
    async execute(args) {
      const api = buildApi(ctx, config);
      return await api["workflow.inspect"]({ file: String(args.file || "") });
    },
  })));

  disposers.push(ctx.tools.register(defineTool({
    name: "cnv_binding_save",
    description: "保存一条「工作流 → 能力」绑定。会先校验节点与输入是否存在，通过后写入 ~/.dsh/omni-canvas.bindings.json。binding 形如 { capability, workflow:{file,name}, inputs:{prompt:{node,field},seed:{node,field},length:{node,field},refImage:{node,field}}, outputs:{video:{node,field}} }。",
    parameters: {
      binding: { type: "object", additionalProperties: true, required: true, description: "绑定对象" },
    },
    output,
    async execute(args) {
      const api = buildApi(ctx, config);
      return await api["binding.save"]({ binding: args.binding || {} });
    },
  })));

  disposers.push(ctx.tools.register(defineTool({
    name: "cnv_binding_run",
    description: "用已绑定的工作流出图/出片：自动把 UI 工作流转成 API 格式、回填 prompt/seed/尺寸等参数、提交并等待产物。dry=true 时只返回转换后的提交图（不执行）。",
    parameters: {
      id: { type: "string", required: true, description: "绑定 id" },
      prompt: { type: "string", description: "提示词" },
      seed: { type: "number", description: "随机种子" },
      width: { type: "number", description: "宽（若绑定里配了 width）" },
      height: { type: "number", description: "高（若绑定里配了 height）" },
      count: { type: "number", description: "张数（若绑定里配了 count/batch_size）" },
      negative: { type: "string", description: "负向提示词（若绑定里配了 negative）" },
      dry: { type: "boolean", description: "只做转换校验，不提交" },
      saveTo: { type: "string", description: "产物下载目录（可选）" },
    },
    output,
    async execute(args) {
      const api = buildApi(ctx, config);
      return await api["binding.run"]({
        id: String(args.id || ""),
        params: {
          prompt: args.prompt, seed: args.seed, width: args.width, height: args.height,
          count: args.count, negative: args.negative,
        },
        dry: !!args.dry,
        saveTo: args.saveTo,
      });
    },
  })));

  disposers.push(ctx.tools.register(defineTool({
    name: "cnv_binding_list",
    description: "列出已保存的工作流绑定及其状态（ok / changed 工作流已改动 / missing-nodes 缺节点 / missing-file）。",
    parameters: {},
    output,
    async execute() {
      const api = buildApi(ctx, config);
      return await api["binding.list"]();
    },
  })));

  disposers.push(ctx.tools.register(defineTool({
    name: "cnv_binding_test",
    description: "对已保存的绑定做校验。当前 mode=structure 只做结构校验（节点/输入是否存在、hash 是否匹配）；mode=run 尚未接入执行链路。",
    parameters: {
      id: { type: "string", required: true, description: "绑定 id" },
      mode: { type: "string", description: "structure（默认）| run" },
    },
    output,
    async execute(args) {
      const api = buildApi(ctx, config);
      return await api["binding.test"]({ id: String(args.id || ""), mode: String(args.mode || "structure") });
    },
  })));

  disposers.push(ctx.tools.register(defineTool({
    name: "cnv_generate_image",
    description: "用本地 ComfyUI 的 Qwen-Image 2.1 生成图片。产物**一定落两处**：资产库 + 项目画布（没给 nodeId 时自动新建一张图片卡并放上画布，不会只进资产库）。",
    parameters: {
      prompt: { type: "string", required: true, description: "提示词" },
      projectId: { type: "string", required: true, description: "项目 id（画布 id）" },
      nodeId: { type: "string", description: "写入哪个节点（省略则只进资产库）" },
      model: { type: "string", description: "qwen-t2i-fast（默认）/ qwen-t2i-hq / qwen-edit（带参考图时自动用）" },
      refFiles: { type: "array", description: "参考图（项目内相对路径，media/xxx.png），1–4 张" },
      aspect: { type: "string", description: "1:1 / 16:9 / 9:16" },
      resolution: { type: "string", description: "1K 或 2K（长边）" },
      count: { type: "number", description: "张数 1-4" },
      seed: { type: "number", description: "随机种子（省略=随机）" },
    },
    output,
    async execute(args) {
      const refFiles = Array.isArray(args.refFiles) ? args.refFiles.filter(Boolean) : [];
      const job = {
        id: randomUUID().slice(0, 12),
        projectId: args.projectId,
        nodeId: args.nodeId,
        prompt: args.prompt,
        refFiles,
        model: refFiles.length ? "qwen-edit" : (args.model || "qwen-t2i-fast"),
        aspect: args.aspect || "1:1",
        resolution: args.resolution === "2K" ? "2K" : "1K",
        count: Math.min(4, Math.max(1, Number(args.count) || 1)),
        seed: args.seed,
        status: "queued",
        startedAt: Date.now(),
      };
      JOBS.set(job.id, job);
      submitJob({ ctx, config, job, runner: () => runImageJob(ctx, config, job) });
      return { jobId: job.id, status: "queued" };
    },
  })));

  disposers.push(ctx.tools.register(defineTool({
    name: "cnv_job_status",
    description: "查询一个 ComfyUI 生成任务的状态与产物。",
    parameters: { jobId: { type: "string", required: true } },
    output,
    async execute(args) {
      const job = JOBS.get(args.jobId);
      if (!job) return { status: "unknown" };
      const pos = QUEUE.findIndex((it) => it.job.id === job.id);
      return { status: job.status, error: job.error || "", asset: job.asset || null,
        position: pos >= 0 ? pos + 1 : 0, queueLength: queueLength() };
    },
  })));

  disposers.push(ctx.tools.register(defineTool({
    name: "cnv_prompt_template",
    description: "返回 H3 六段式提示词骨架（t2v / r2v / i2v 三种模式）。",
    parameters: { mode: { type: "string", description: "t2v / r2v / i2v，默认 r2v" } },
    output,
    async execute(args) {
      const mode = ["t2v", "r2v", "i2v"].includes(args?.mode) ? args.mode : "r2v";
      return { mode, template: PROMPT_TEMPLATES[mode] };
    },
  })));

  const canvasTools = [];

  canvasTools.push(defineTool({
    name: "cnv_project_list",
    description: "列出本机画布项目（id / 名称 / 更新时间）。调用画布相关工具前先用它确认 projectId。",
    parameters: {},
    output,
    async execute() {
      return { projects: await listProjects(config) };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_project_create",
    description: "新建一个画布项目（= 一个新画布）。返回 project.id，后续所有工具都用它。",
    parameters: { name: { type: "string", description: "项目名称" } },
    output,
    async execute(args) {
      return { project: await createProject(config, args.name) };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_canvas_get",
    description: "读取项目的画布：节点清单（id/类型/名字/角色/提示词/坐标/尺寸）、连线、脚本卡结构、当前 rev。写操作前先读，拿 rev 避免覆盖用户编辑。",
    parameters: { projectId: { type: "string", required: true } },
    output,
    async execute(args) {
      const canvas = await getCanvas(config, args.projectId);
      const nodes = (canvas.nodes || []).map(canvasNodeSummary);
      const scripts = (canvas.nodes || []).filter((n) => n.type === "script").map((n) => ({
        id: n.id, title: n.data?.title, target: n.data?.target,
        groups: (n.data?.groups || []).map((g) => ({
          id: g.id, title: g.title, scene: g.scene, light: g.light, sound: g.sound,
          rows: (g.rows || []).map((r) => ({ id: r.id, cells: r.cells, assets: r.assets })),
        })),
      }));
      return { rev: canvas.rev || 1, nodes, edges: canvas.edges || [], scripts };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_canvas_add_node",
    description: "在画布上新建节点。type=image/video/script。data 可含 name/role/prompt/file/width/height。linkFrom 传入已有节点 id 时会自动连线（= 参考关系）。",
    parameters: {
      projectId: { type: "string", required: true },
      type: { type: "string", required: true, description: "image / video / script" },
      data: { type: "object", additionalProperties: true, description: "节点数据，如 {name,role,prompt,file,width,height}" },
      x: { type: "number" }, y: { type: "number" },
      linkFrom: { type: "string", description: "从哪个节点连线过来" },
    },
    output,
    async execute(args) {
      const id = "n-" + randomUUID().slice(0, 8);
      const node = {
        id, type: args.type,
        x: args.x ?? 120, y: args.y ?? 120,
        w: args.type === "script" ? 1180 : args.type === "text" ? 420 : 320,
        h: args.type === "script" ? 320 : args.type === "text" ? 300 : 320,
        data: args.data || {},
      };
      if (args.type === "script" && !node.data.groups) {
        node.data = { title: node.data.title || "分镜脚本", target: "video",
          columns: DEFAULT_COLUMNS, groups: [] };
      }
      await mutateCanvas(config, args.projectId, (canvas) => {
        canvas.nodes.push(node);
        if (args.linkFrom) {
          canvas.edges.push({ id: "e-" + randomUUID().slice(0, 8), from: args.linkFrom, to: id });
        }
      });
      return { id, type: args.type };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_canvas_update_node",
    description: "修改节点头字段（浅合并）：name / role(character|scene|prop) / prompt / 坐标 x,y。",
    parameters: {
      projectId: { type: "string", required: true },
      nodeId: { type: "string", required: true },
      data: { type: "object", additionalProperties: true, description: "要合并进 node.data 的字段" },
      x: { type: "number" }, y: { type: "number" },
    },
    output,
    async execute(args) {
      await mutateCanvas(config, args.projectId, (canvas) => {
        const n = canvas.nodes.find((x) => x.id === args.nodeId);
        if (!n) throw new Error("节点不存在: " + args.nodeId);
        n.data = { ...(n.data || {}), ...(args.data || {}) };
        if (args.x != null) n.x = args.x;
        if (args.y != null) n.y = args.y;
      });
      return { ok: true };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_canvas_delete_node",
    description: "删除节点及其相关连线。资产库里的记录不受影响（可以 cnv_asset_place 放回来）。",
    parameters: {
      projectId: { type: "string", required: true },
      nodeId: { type: "string", required: true },
    },
    output,
    async execute(args) {
      await mutateCanvas(config, args.projectId, (canvas) => {
        canvas.nodes = canvas.nodes.filter((n) => n.id !== args.nodeId);
        canvas.edges = canvas.edges.filter((e) => e.from !== args.nodeId && e.to !== args.nodeId);
      });
      return { ok: true };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_canvas_link",
    description: "在两个节点之间建立连线（= 参考关系）。同一对重复连线会被忽略。",
    parameters: {
      projectId: { type: "string", required: true },
      from: { type: "string", required: true },
      to: { type: "string", required: true },
    },
    output,
    async execute(args) {
      await mutateCanvas(config, args.projectId, (canvas) => {
        if (!canvas.edges.some((e) => e.from === args.from && e.to === args.to)) {
          canvas.edges.push({ id: "e-" + randomUUID().slice(0, 8), from: args.from, to: args.to });
        }
      });
      return { ok: true };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_script_create",
    description: "建一张分镜脚本卡（场 → 镜头两层）。groups 结构与 cnv_script_set_rows 相同；可先建空表再填。",
    parameters: {
      projectId: { type: "string", required: true },
      title: { type: "string" },
      groups: { type: "array", items: { type: "object", additionalProperties: true }, description: "场数组，可省略" },
      x: { type: "number" }, y: { type: "number" },
    },
    output,
    async execute(args) {
      const id = "n-" + randomUUID().slice(0, 8);
      const node = {
        id, type: "script", x: args.x ?? 120, y: args.y ?? 120, w: 1180, h: 320,
        data: {
          title: args.title || "分镜脚本",
          target: "video",
          columns: DEFAULT_COLUMNS,
          groups: (args.groups || []).map((g, gi) => ({
            id: g.id || "g-" + randomUUID().slice(0, 8),
            title: g.title || "场 " + (gi + 1),
            scene: g.scene || "", light: g.light || "", sound: g.sound || "",
            rows: (g.rows || []).map((r, ri) => ({
              id: r.id || "r-" + randomUUID().slice(0, 8),
              cells: { shot: r.cells?.shot || "S" + String(ri + 1).padStart(2, "0"), ...(r.cells || {}) },
              assets: r.assets || { characters: [], scene: null, props: [] },
            })),
          })),
        },
      };
      await mutateCanvas(config, args.projectId, (canvas) => { canvas.nodes.push(node); });
      return { id };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_script_set_rows",
    description: "整表覆盖脚本卡的场/镜头。groups: [{title, scene, light, sound, rows:[{cells:{shot,dur,size,move,desc,light,line,sound}, assets:{characters:[],scene,props:[]}}]}]。",
    parameters: {
      projectId: { type: "string", required: true },
      nodeId: { type: "string", required: true },
      groups: { type: "array", items: { type: "object", additionalProperties: true }, required: true },
    },
    output,
    async execute(args) {
      let rows = 0;
      await mutateCanvas(config, args.projectId, (canvas) => {
        const n = canvas.nodes.find((x) => x.id === args.nodeId && x.type === "script");
        if (!n) throw new Error("脚本卡不存在: " + args.nodeId);
        let shotNo = 0;
        n.data.groups = (args.groups || []).map((g, gi) => ({
          id: g.id || "g-" + randomUUID().slice(0, 8),
          title: g.title || "场 " + (gi + 1),
          scene: g.scene || "", light: g.light || "", sound: g.sound || "",
          rows: (g.rows || []).map((r) => {
            rows += 1;
            shotNo += 1;
            return {
              id: r.id || "r-" + randomUUID().slice(0, 8),
              cells: { shot: "S" + String(shotNo).padStart(2, "0"), ...(r.cells || {}) },
              assets: r.assets || { characters: [], scene: null, props: [] },
            };
          }),
        }));
      });
      return { ok: true, rows };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_script_update_row",
    description: "改脚本卡里的一行：cells 浅合并、assets 整体替换。",
    parameters: {
      projectId: { type: "string", required: true },
      nodeId: { type: "string", required: true },
      groupId: { type: "string", required: true },
      rowId: { type: "string", required: true },
      cells: { type: "object", additionalProperties: true },
      assets: { type: "object", additionalProperties: true },
    },
    output,
    async execute(args) {
      await mutateCanvas(config, args.projectId, (canvas) => {
        const n = canvas.nodes.find((x) => x.id === args.nodeId);
        const g = n?.data?.groups?.find((x) => x.id === args.groupId);
        const r = g?.rows?.find((x) => x.id === args.rowId);
        if (!r) throw new Error("行不存在");
        r.cells = { ...(r.cells || {}), ...(args.cells || {}) };
        if (args.assets) r.assets = args.assets;
      });
      return { ok: true };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_script_bind_asset",
    description: "给某行绑定资产。slot=characters|scene|props；assetNodeId 传画布图片节点 id，slot=scene 时传单个 id。",
    parameters: {
      projectId: { type: "string", required: true },
      nodeId: { type: "string", required: true },
      groupId: { type: "string", required: true },
      rowId: { type: "string", required: true },
      slot: { type: "string", required: true, description: "characters / scene / props" },
      assetNodeId: { type: "string", required: true },
    },
    output,
    async execute(args) {
      await mutateCanvas(config, args.projectId, (canvas) => {
        const n = canvas.nodes.find((x) => x.id === args.nodeId);
        const g = n?.data?.groups?.find((x) => x.id === args.groupId);
        const r = g?.rows?.find((x) => x.id === args.rowId);
        if (!r) throw new Error("行不存在");
        r.assets = r.assets || { characters: [], scene: null, props: [] };
        if (args.slot === "scene") r.assets.scene = args.assetNodeId;
        else {
          const list = args.slot === "props" ? (r.assets.props = r.assets.props || [])
            : (r.assets.characters = r.assets.characters || []);
          if (!list.includes(args.assetNodeId)) list.push(args.assetNodeId);
        }
      });
      return { ok: true };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_script_generate",
    description: "按脚本行创建「待生成」卡片（默认不提交）。rowId 省略=整表；run=true 时立即提交生成。每组参数与行内一致。",
    parameters: {
      projectId: { type: "string", required: true },
      nodeId: { type: "string", required: true },
      rowId: { type: "string", description: "只处理某一行；省略=全部" },
      run: { type: "boolean", description: "true=立即提交生成" },
    },
    output,
    async execute(args) {
      const created = [];
      const skipped = [];
      const submitted = [];
      const canvas = await getCanvas(config, args.projectId);
      const script = canvas.nodes.find((n) => n.id === args.nodeId);
      if (!script) throw new Error("脚本卡不存在");
      const byId = new Map(canvas.nodes.map((n) => [n.id, n]));
      const targets = [];
      for (const g of script.data.groups || []) {
        for (const r of g.rows || []) {
          if (!args.rowId || r.id === args.rowId) targets.push({ g, r });
        }
      }
      // 已有卡片（按 rowId 记录）默认跳过，避免重复堆卡
      const existing = new Map();
      for (const n of canvas.nodes) {
        if (n.data?.rowId) existing.set(n.data.rowId, n.id);
      }
      let index = 0;
      for (const { g, r } of targets) {
        index += 1;
        if (existing.has(r.id)) {
          const cardId = existing.get(r.id);
          skipped.push({ rowId: r.id, nodeId: cardId });
          // 已有卡片且要求现在跑 → 直接提交这张卡（不重复建卡）
          if (args.run) {
            const card = canvas.nodes.find((n) => n.id === cardId);
            const ra = r.assets || { characters: [], scene: null, props: [] };
            const ordered = [
              ...(ra.characters || []).slice(0, 2),
              ...(ra.scene ? [ra.scene] : []),
              ...(ra.props || []).slice(0, 2),
            ].slice(0, 4);
            const refFiles = ordered.map((id) => byId.get(id)?.data?.file).filter(Boolean);
            const job = {
              id: randomUUID().slice(0, 12), projectId: args.projectId, nodeId: cardId,
              prompt: card?.data?.prompt || "", refFiles,
              model: refFiles.length ? "h3-director" : "h3-director",
              duration: Number(r.cells?.dur) || 6,
              aspect: card?.data?.aspect || "16:9",
              resolution: card?.data?.resolution || "720p",
              status: "queued", startedAt: Date.now(),
            };
      submitJob({ ctx, config, job: job, runner: () => runVideoJob(ctx, config, job) });
            submitted.push({ rowId: r.id, nodeId: cardId, jobId: job.id });
          }
          continue;
        }
        const ra = r.assets || { characters: [], scene: null, props: [] };
        const ordered = [
          ...(ra.characters || []).slice(0, 2).map((id) => ({ id, role: "character" })),
          ...(ra.scene ? [{ id: ra.scene, role: "scene" }] : []),
          ...(ra.props || []).slice(0, 2).map((id) => ({ id, role: "prop" })),
        ].slice(0, 4).filter((a) => byId.get(a.id)?.data?.file)
          .map((a) => {
            const nd = byId.get(a.id);
            return { id: a.id, role: a.role,
              name: nd.data?.name || nd.data?.prompt?.slice(0, 14) || "资产",
              desc: nd.data?.desc || nd.data?.prompt || "" };
          });
        // 行内 prompt 列若已手写完整提示词，直接用它（只补资产指认段）
        const manual = String(r.cells?.prompt || "").trim();
        const manualHasSubjects = /^\s*subject_definitions\s*:/i.test(manual);
        const prompt = manual
          ? (ordered.length && !manualHasSubjects
              ? "subject_definitions:\n" + ordered.map((a, i) =>
                  `<Picture ${i + 1}> is ${a.role === "scene" ? "the environment" : a.role === "prop" ? "a prop" : "the subject"}「${a.name}」${a.desc ? "：" + String(a.desc).replace(/\s+/g, " ").slice(0, 160) : ""}. Identity / layout comes only from this image.`
                ).join("\n") + "\n\n" + manual
              : manual)
          : composeRow(g, r, index, ordered);
        const isVideo = (script.data.target || "video") === "video";
        const nodeId = "n-" + randomUUID().slice(0, 8);
        const col = Math.floor((index - 1) / 3);
        const row = (index - 1) % 3;
        const child = {
          id: nodeId, type: isVideo ? "video" : "image",
          x: script.x + 1240 + col * 380,
          y: script.y + 40 + row * 470,
          w: 320, h: isVideo ? 420 : 320,
          data: { prompt, name: r.cells?.shot || ("段" + index), role: "", status: "idle",
            duration: Number(r.cells?.dur) || 6,
            rowId: r.id, groupId: g.id, scriptId: script.id,
            model: isVideo ? "h3-director" : "qwen-t2i-hq",
            aspect: isVideo ? "9:16" : "1:1", count: 1 },
        };
        await mutateCanvas(config, args.projectId, (cv) => {
          cv.nodes.push(child);
          for (const a of ordered) {
            cv.edges.push({ id: "e-" + randomUUID().slice(0, 8), from: a.id, to: nodeId });
          }
        });
        created.push({ nodeId, shot: r.cells?.shot, refs: ordered.length });
        if (args.run) {
          const refFiles = ordered.map((a) => byId.get(a.id).data.file);
          const job = {
            id: randomUUID().slice(0, 12), projectId: args.projectId, nodeId,
            prompt, refFiles,
            model: refFiles.length ? "h3-director" : "h3-director",
            duration: Number(r.cells?.dur) || 6, aspect: "9:16", resolution: "720p",
            status: "queued", startedAt: Date.now(),
          };
      submitJob({ ctx, config, job: job, runner: () => runVideoJob(ctx, config, job) });
        }
      }
      return { created, skipped, submitted, count: created.length, skippedCount: skipped.length,
        submittedCount: submitted.length };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_asset_list",
    description: "列出项目资产库（所有生成过的产物，含已从画布删除的）。role 可选过滤。",
    parameters: {
      projectId: { type: "string", required: true },
      role: { type: "string", description: "character/scene/prop（可选）" },
    },
    output,
    async execute(args) {
      const index = await readJson(join(projectDir(config, args.projectId), "assets", "index.json"), []);
      return { assets: index.slice().reverse() };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_asset_place",
    description: "把资产库里的某条素材放回画布（新建引用节点）。",
    parameters: {
      projectId: { type: "string", required: true },
      assetId: { type: "string", required: true },
      x: { type: "number" }, y: { type: "number" },
    },
    output,
    async execute(args) {
      const index = await readJson(join(projectDir(config, args.projectId), "assets", "index.json"), []);
      const a = index.find((x) => x.id === args.assetId);
      if (!a) throw new Error("资产不存在");
      const id = "n-" + randomUUID().slice(0, 8);
      await mutateCanvas(config, args.projectId, (canvas) => {
        canvas.nodes.push({
          id, type: a.kind === "video" ? "video" : "image",
          x: args.x ?? 120, y: args.y ?? 120, w: 320,
          h: Math.max(200, Math.round(320 * ((a.params?.height || 1) / (a.params?.width || 1)))),
          data: { file: a.file, kind: a.kind, status: "done", prompt: a.prompt,
            model: a.model, role: a.role || "", width: a.params?.width, height: a.params?.height },
        });
      });
      return { id };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_generate_node",
    description: "对画布上某个已有节点触发一次生成（图片或视频）；产物写回该节点，同时进资产库。参考图取该节点入边的图片。",
    parameters: {
      projectId: { type: "string", required: true },
      nodeId: { type: "string", required: true },
    },
    output,
    async execute(args) {
      const canvas = await getCanvas(config, args.projectId);
      const node = canvas.nodes.find((n) => n.id === args.nodeId);
      if (!node) throw new Error("节点不存在");
      const refFiles = canvas.edges.filter((e) => e.to === args.nodeId)
        .map((e) => canvas.nodes.find((n) => n.id === e.from)?.data?.file)
        .filter(Boolean);
      const isVideo = node.type === "video";
      const job = {
        id: randomUUID().slice(0, 12), projectId: args.projectId, nodeId: args.nodeId,
        prompt: node.data?.prompt || "", refFiles,
        model: isVideo ? (refFiles.length ? "h3-director" : "h3-director") : (refFiles.length ? "qwen-edit" : "qwen-t2i-hq"),
        duration: Number(node.data?.duration) || 6,
        aspect: node.data?.aspect || (isVideo ? "9:16" : "1:1"),
        resolution: "720p", count: 1, status: "queued", startedAt: Date.now(),
      };
      submitJob({ ctx, config, job, runner: isVideo ? () => runVideoJob(ctx, config, job) : () => runImageJob(ctx, config, job) });
      return { jobId: job.id, queued: queueLength() };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_job_list",
    description: "查看生成队列：当前正在跑的任务 + 排队中的任务（串行执行，一次只跑一个）。",
    parameters: {},
    output,
    async execute() {
      return { running: RUNNING_JOB ? { id: RUNNING_JOB.id, nodeId: RUNNING_JOB.nodeId } : null,
        queue: jobQueueInfo() };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_job_cancel",
    description: "取消一个生成任务：排队中的直接移除，正在跑的会尝试从 ComfyUI 队列里踢掉。",
    parameters: { jobId: { type: "string", required: true } },
    output,
    async execute(args) {
      const job = JOBS.get(args.jobId);
      if (!job) throw new Error("任务不存在");
      if (job.status === "done" || job.status === "failed" || job.status === "canceled") {
        return { ok: true, status: job.status };
      }
      job.canceled = true;
      const idx = QUEUE.findIndex((it) => it.job.id === job.id);
      if (idx >= 0) {
        QUEUE.splice(idx, 1);
        job.status = "canceled";
        return { ok: true, status: "canceled" };
      }
      if (job.promptId) {
        await comfyFetch(config, "/queue", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ delete: [job.promptId] }),
        }).catch(() => {});
      }
      job.status = "canceling";
      return { ok: true, status: "canceling" };
    },
  }));

  canvasTools.push(defineTool({
    name: "cnv_concat",
    description: "把画布上的视频节点按脚本顺序拼成一条成片（只做硬切）。不传 nodeIds 时按脚本卡的行顺序自动取片。产物落回画布为一个视频节点，并写入资产库。需要本机 ffmpeg。",
    parameters: {
      projectId: { type: "string", required: true },
      nodeIds: { type: "array", items: { type: "string" }, description: "可选，按顺序拼接的节点 id" },
      scriptId: { type: "string", description: "可选，按该脚本卡的行顺序取片" },
      title: { type: "string", description: "成片节点标题" },
    },
    output,
    async execute(args) {
      const ffmpegPath = config.ffmpegPath || "ffmpeg";
      const canvas = await getCanvas(config, args.projectId);
      const byId = new Map(canvas.nodes.map((n) => [n.id, n]));
      let ids = args.nodeIds;
      const script = args.scriptId
        ? canvas.nodes.find((n) => n.id === args.scriptId)
        : canvas.nodes.find((n) => n.type === "script");
      if (!ids && script) {
        ids = [];
        for (const g of script.data?.groups || []) {
          for (const r of g.rows || []) {
            const card = canvas.nodes.find((n) => n.type === "video" && n.data?.rowId === r.id && n.data?.file);
            if (card) ids.push(card.id);
          }
        }
      }
      ids = (ids || []).filter((id) => byId.get(id)?.data?.file);
      if (ids.length < 2) throw new Error("至少需要两个有视频的执行节点");

      const dir = projectDir(config, args.projectId);
      const listPath = join(dir, "concat-" + Date.now() + ".txt");
      const lines = ids.map((id) => "file '" + join(dir, byId.get(id).data.file).replace(/\\/g, "/") + "'").join("\n");
      await writeFile(listPath, lines + "\n", "utf8");
      const fileName = `${randomUUID()}.mp4`;
      await ensureDir(join(dir, "media"));
      const outAbs = join(dir, "media", fileName);

      // 子进程在本环境里可能没有项目目录的写权限 → 让 ffmpeg 输出到 stdout，
      // 由 Node 把字节写进项目（fragmented mp4 才能走管道）。
      const { spawnSync } = await import("node:child_process");
      const binCandidates = [ffmpegPath, "ffmpeg", "E:/Allen/tools/bin/ffmpeg.exe", "C:/ffmpeg/bin/ffmpeg.exe"];
      let run = null;
      let buf = null;
      for (const bin of binCandidates) {
        run = spawnSync(bin, ["-v", "error", "-f", "concat", "-safe", "0", "-i", listPath,
          "-c", "copy", "-movflags", "frag_keyframe+empty_moov+default_base_moof",
          "-f", "mp4", "pipe:1"], { maxBuffer: 512 * 1024 * 1024 });
        if (run.status === 0 && run.stdout?.length > 50 * 1024) { buf = run.stdout; break; }
        if (!/ENOENT/.test(String(run.error || ""))) break;
      }
      await rm(listPath, { force: true }).catch(() => {});
      if (!buf) throw new Error("ffmpeg 拼接失败: " + String(run?.stderr || run?.error || "").slice(-400));
      await writeFile(outAbs, buf);

      const asset = {
        id: randomUUID().slice(0, 12),
        kind: "video",
        file: `media/${fileName}`,
        prompt: args.title || "拼接成片",
        model: "concat",
        params: { clips: ids.length },
        createdAt: new Date().toISOString(),
      };
      const idxPath = join(dir, "assets", "index.json");
      const index = await readJson(idxPath, []);
      index.push(asset);
      await writeJson(idxPath, index);
      await touchProject(config, args.projectId);

      const nodeId = "n-" + randomUUID().slice(0, 8);
      let rev = 1;
      await mutateCanvas(config, args.projectId, (cv) => {
        cv.nodes.push({
          id: nodeId, type: "video", x: 2400, y: 80, w: 320, h: 200,
          data: { file: asset.file, kind: "video", status: "done", prompt: args.title || "拼接成片",
            name: args.title || "成片", role: "", width: 1280, height: 704 },
        });
      });
      return { nodeId, file: asset.file, clips: ids.length };
    },
  }));

  for (const tool of canvasTools) disposers.push(ctx.tools.register(tool));

  return () => {
    for (const d of disposers) d();
  };
}

/* ---- 宿主版本探针（原 index.js） ---- */
/** 调试探针：把关键步骤写进 ~/.dsh/comfy-canvas-boot.log（稳定后可删）。 */
export async function writeProbe(line) {
  try {
    const { appendFile, mkdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { homedir } = await import("node:os");
    await mkdir(join(homedir(), ".dsh"), { recursive: true });
    await appendFile(join(homedir(), ".dsh", "comfy-canvas-boot.log"), `${new Date().toISOString()} ${line}\n`);
  } catch {}
}
export async function statFile(path) {
  const { stat } = await import("node:fs/promises");
  return stat(path);
}
export async function fileMtime(path) {
  try {
    const st = await stat(path);
    return st.mtimeMs;
  } catch {
    return 0;
  }
}
/** 本进程加载宿主的时刻，用于判断磁盘上的代码是否比运行中的新。 */
export const cascade = (p) => p.replace(/\s+$/, "");