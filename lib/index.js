/**
 * dsh-omni-canvas · host half (M1)
 *
 * 直连本地 ComfyUI（默认 127.0.0.1:8188），提供：
 *  - 项目（= 画布）存储：~/.dsh/projects/<id>/{project.json,canvas.json,media/,assets/}
 *  - 图像生成：qwen-t2i-fast / qwen-t2i-hq（Qwen-Image 2.1 加速版）
 *  - 资产库：所有产物永久归档，节点只做引用
 *  - HTTP API：/omni-canvas/api/*（客户端画布用）
 *  - 模型工具：comfy_generate_image / comfy_job_status / comfy_self_check / comfy_prompt_template
 */
import { defineTool } from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";
import { mkdir, readFile, writeFile, readdir, rm, stat, rename, copyFile, appendFile } from "node:fs/promises";
import { rootDir, projectDir, ensureDir, readJson, writeJson, listProjects, createProject, touchProject, withCanvasLock, mutateCanvas, getCanvas } from "./core/fs.js";
import { DSH_COMFY_CLIENT_ID, PROGRESS, PROMPT_META, registerProgress, executionOrder, buildWeights, ensureProgressWs, progressOf } from "./core/progress.js";
import { JOBS, QUEUE, RUNNING_JOB, queueLength, jobQueueInfo, enqueueJob, pumpQueue, appendJobHistory, submitJob } from "./core/queue.js";
import { loadSettings, settingsPath, comfyBase, comfyFetch, comfyJson, uploadToComfy, submitPrompt, waitForPrompt, downloadImage, downloadBinary } from "./core/comfy.js";
import { MODELS, MODE_TASK, PROMPT_TEMPLATES } from "./workflow/models.js";
import { patchWorkflow, patchDirector } from "./workflow/patch.js";
import { TALKING_MAX_SEC, splitTalkingScript, TALKING_PRESETS, talkingPresetById, gestureLine, handAnchorLine, buildTalkingSegmentPrompt } from "./workflow/talking.js";
import { WF_CAPS, inferCaps, UUID_RE, isUuid, parseWorkflow, walkJson, scanWorkflows, DIAG_CACHE_MS, DIAG_CACHE, runDiagnose, LINK_TYPES, MODEL_INPUT_KEYS, COMPAT_CACHE } from "./core/diag.js";
import { setSystemClipboard, crc32, zipStore, exportProject, ensureDailyBackup, concatProjectVideos, downloadOutput, exportPublishPack, exportAllShots } from "./jobs/export.js";
import { comfyRoot, info_has_node, model_exists_locally, envCheck, templateNeeds, COMFY_PORTS, fileExists, probeHttp, inspectInstall, scanForInstalls, LAUNCHED, tailLines, startComfy, stopComfy } from "./core/env.js";
import { buildApi, registerTools, writeProbe, readBody, writeJsonRes } from "./api/server.js";
import { probeVideo, runFrameJob, runVideoJob, runBindingVideoJob, runVideoUpscaleJob, runVideoLatentUpscaleJob } from "./jobs/video.js";
import { pngSize, adjustForVram, runImageJob, runBindingImageJob, runUpscaleJob } from "./jobs/image.js";
import { findFreeSpot, autoPlaceOnCanvas, placeExtraImageCards, wireRefEdges } from "./jobs/place.js";
import { bindingsPath, loadBindings, loadBindingDoc, saveBindings, saveBinding, listBindings, setDefaultBinding, deleteBinding, testBinding, buildPromptFromBinding, resolveExplicitImpl, resolveDefaultImpl , runBinding, validatePrompt } from "./workflow/bindings.js";
import { pickModelName, adaptModelNames, builtinCompat, hashText, normalizeWorkflow, inspectWorkflow, guessBindings, isWidgetInput, widgetKeysFor, CONTROL_VALUES, expandSubgraphs, uiToApi, translateSubgraphTargets, loadAdapters, getObjectInfo } from "./workflow/convert.js";
import { sizeFor, widthRatio, ASPECT_SIZE, VIDEO_ASPECT_SIZE } from "./workflow/size.js";
import { spawn, execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

// hmr-probe 18:05:13
export const name = "dsh-omni-canvas";
export const inject = ["webServer", "tools"];

/** 测试面：仅供 scripts/*.mjs 做端到端验证，不对外承诺稳定 */
export const __test = () => ({
  runVideoJob, runImageJob, runUpscaleJob, runFrameJob,
  runBindingImageJob, runBindingVideoJob, runBinding, buildPromptFromBinding,
  uiToApi, buildWeights, executionOrder, renderTalkingSegments: buildTalkingSegmentPrompt,
  splitTalkingScript, projectDir, progressOf, registerProgress, submitJob, JOBS,
});

export const Config = z.object({
  comfyUrl: z.string().description("ComfyUI 地址").default("http://127.0.0.1:8188"),
  projectsDir: z.string().description("项目根目录，留空 = ~/.dsh/projects").default(""),
  requestTimeoutMs: z.number().default(30000),
  pollIntervalMs: z.number().default(2000),
  ffmpegPath: z.string().default("ffmpeg"),
});


/* ---------------------------------------------------------------- 模板 */





/* ---------------------------------------------------------------- 存储 */



/** 把项目内的媒体文件上传到 ComfyUI 的 input/，返回其文件名。 */


/* ---------------------------------------------------------------- 任务 */








/** 按能力解析"当前默认实现"：返回 binding 对象，或 null（表示用内置模板） */


/** 生成历史：完成的任务追加到 ~/.dsh/omni-canvas.jobs.json（最多 100 条） */




/** 用绑定的工作流出图（走 binding.run），产物同样落 media + 资产库 + 节点 */

/** 图片超分：4x-UltraSharp（本机唯一可用的 ESRGAN 模型） */

/** 文字 → 语音：优先 edge-tts（神经音色），失败回退 Windows SAPI */

/** 视频超分（ffmpeg 重采样 2x）：子进程无写权限 → 让它输出到 stdout，由本进程落盘 */



/** 按给定节点顺序拼接视频（ffmpeg stdout 方案），产物落回画布 + 资产库 */


/** 发布包：把成片复制到 ~/.dsh/exports/ 并生成同名说明文档 */

/** 批量导出：按画布顺序把所有镜头导出成 S01_*.mp4，并写一份汇总 */

/** 每天首保一次项目快照（画布 + 资产索引），保留最近 7 份 */
const BACKUP_TODAY = new Map();







/** 下载任意产物（图片/视频）为 Buffer */



/* ---------------------------------------------------------------- HTTP API */




/* ---------------------------------------------------------- P1：找/启 ComfyUI */










/* ---------------------------------------------------- P2：扫描工作流 */










/* ------------------------------------------------ 绑定：inspect / save / list */

const { createHash } = await import("node:crypto");


/* ------------------------------------------------ UI→API 转换 + 执行 */


/**
 * 提交前本地校验：把 ComfyUI 的校验前移，给出人能读的 problems。
 * 返回 [{ node, type, field, expected, actual, message }]
 */





/* ---------------------------------------------------------------- 工具 */







/* ---------------------------------------------------------------- apply */




export function apply(ctx, config) {
  void loadSettings().catch(() => {});
  void writeProbe(`apply start: tools=${typeof ctx.tools} webServer=${typeof ctx.webServer} effect=${typeof ctx.effect} config=${JSON.stringify(config || {}).slice(0, 120)}`);

  let disposeTools = () => {};
  try {
    disposeTools = registerTools(ctx, config);
    void writeProbe("tools registered");
  } catch (error) {
    void writeProbe(`registerTools FAILED: ${error?.name}: ${error?.message}`.slice(0, 400));
  }

  const api = buildApi(ctx, config);

  try {
    ctx.effect(() => ctx.webServer.register({
      kind: "prefix",
      path: "/omni-canvas/api",
      handler: async (req, res) => {
        if (req.method !== "POST") {
          writeJsonRes(res, 405, { ok: false, error: "method not allowed" });
          return;
        }
        const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
        const method = pathname.startsWith("/omni-canvas/api/") ? pathname.slice("/omni-canvas/api/".length) : "";
        const handler = api[method];
        if (!handler) {
          writeJsonRes(res, 404, { ok: false, error: `unknown method ${method}` });
          return;
        }
        try {
          const body = await readBody(req);
          writeJsonRes(res, 200, { ok: true, result: await handler(body) });
        } catch (error) {
          writeJsonRes(res, 500, { ok: false, error: String(error?.message || error) });
        }
      },
    }), "dsh-omni-canvas: /omni-canvas/api");
    void writeProbe("api route registered");
    try { ensureProgressWs(config); } catch {}
  } catch (error) {
    void writeProbe(`api route FAILED: ${error?.name}: ${error?.message}`.slice(0, 400));
  }

  try {
    ctx.effect(() => ctx.webServer.register({
      kind: "prefix",
      path: "/omni-canvas/media",
      handler: async (req, res) => {
        try {
          const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
          const rest = decodeURIComponent(pathname.slice("/omni-canvas/media/".length));
          const [projectId, ...seg] = rest.split("/");
          const file = join(projectDir(config, projectId), seg.join("/"));
          const ext = file.split(".").pop()?.toLowerCase();
          const type = ext === "mp4" ? "video/mp4" : ext === "png" ? "image/png" : ext === "jpg" ? "image/jpeg" : "application/octet-stream";
          const data = await readFile(file);
          res.writeHead(200, { "content-type": type, "cache-control": "max-age=3600" });
          res.end(data);
        } catch (error) {
          res.writeHead(404);
          res.end("not found");
        }
      },
    }), "dsh-omni-canvas: /omni-canvas/media");
    void writeProbe("media route registered");
  } catch (error) {
    void writeProbe(`media route FAILED: ${error?.name}: ${error?.message}`.slice(0, 400));
  }

  return () => disposeTools();
}