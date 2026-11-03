/**
 * ComfyUI 通信层：HTTP 封装、上传、下载、以及**唯一的提交入口** submitPrompt()。
 * 不变式：任何提交都必须经过 submitPrompt()，它负责
 *   1. client_id 固定为 DSH_COMFY_CLIENT_ID（否则收不到 ws 进度）
 *   2. 提交后立刻 registerProgress(promptId, graph)
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readJson } from "./fs.js";
import { DSH_COMFY_CLIENT_ID, registerProgress } from "./progress.js";

export let COMFY_OVERRIDE = "";

export function settingsPath() {
  return join(homedir(), ".dsh", "omni-canvas.settings.json");
}

export async function loadSettings() {
  const s = await readJson(settingsPath(), {});
  COMFY_OVERRIDE = String(s.comfyUrl || "").trim();
  return s;
}

export function comfyBase(config) {
  return String(COMFY_OVERRIDE || config?.comfyUrl || "http://127.0.0.1:8188").replace(/\/+$/, "");
}

export async function comfyFetch(config, path, init) {
  const res = await fetch(comfyBase(config) + path, {
    ...init,
    signal: AbortSignal.timeout(config?.requestTimeoutMs || 30000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ComfyUI ${path} -> ${res.status} ${text.slice(0, 300)}`);
  }
  return res;
}

export async function comfyJson(config, path, init) {
  const res = await comfyFetch(config, path, init);
  return res.json();
}

export async function uploadToComfy(config, filePath, fileName) {
  const buf = await readFile(filePath);
  const form = new FormData();
  form.append("image", new Blob([buf]), fileName);
  form.append("overwrite", "true");
  const res = await fetch(comfyBase(config) + "/upload/image", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(config?.requestTimeoutMs || 30000),
  });
  if (!res.ok) throw new Error(`上传参考图失败: ${res.status}`);
  const data = await res.json();
  return data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
}

export async function submitPrompt(config, workflow) {
  const clientId = DSH_COMFY_CLIENT_ID;
  const data = await comfyJson(config, "/prompt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  if (data?.error || data?.node_errors && Object.keys(data.node_errors).length) {
    throw new Error(`ComfyUI 拒绝工作流: ${JSON.stringify(data.node_errors || data.error).slice(0, 400)}`);
  }
  registerProgress(data.prompt_id, workflow);
  return data.prompt_id;
}

export async function waitForPrompt(config, promptId, opts = {}) {
  const deadline = Date.now() + (opts.timeoutMs || 15 * 60 * 1000);
  const interval = config?.pollIntervalMs || 2000;
  while (Date.now() < deadline) {
    const hist = await comfyJson(config, `/history/${promptId}`);
    const entry = hist?.[promptId];
    if (entry) {
      if (entry.status?.status_str === "error") {
        const messages = (entry.status?.messages || []).flat().filter((x) => typeof x === "string").join(" | ");
        throw new Error(`生成失败: ${messages.slice(0, 400)}`);
      }
      const outputs = entry.outputs || {};
      const all = [];
      for (const nodeOut of Object.values(outputs)) {
        for (const key of ["images", "gifs", "videos", "video"]) {
          for (const item of nodeOut[key] || []) all.push(item);
        }
      }
      if (!all.length) return null;
      return opts.all ? all : all[0];
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error("生成超时（15 分钟）");
}

export async function downloadImage(config, item) {
  const qs = new URLSearchParams({
    filename: item.filename,
    subfolder: item.subfolder || "",
    type: item.type || "output",
  });
  const res = await comfyFetch(config, `/view?${qs}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function downloadBinary(config, item) {
  const q = new URLSearchParams({ filename: item.filename, subfolder: item.subfolder || "", type: item.type || "output" });
  const res = await comfyFetch(config, "/view?" + q.toString(), {});
  if (!res.ok) throw new Error("下载产物失败 " + res.status);
  return Buffer.from(await res.arrayBuffer());
}
