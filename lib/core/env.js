/**
 * 环境：ComfyUI 安装扫描、模型/节点自检、启动与停止。
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { execFile, spawn } from "node:child_process";
import { readJson } from "./fs.js";
import { comfyFetch } from "./comfy.js";


/** 首次运行自检：把环境依赖集中列出（每项带修复指引） */
export function comfyRoot(config) {
  return config?.installPath || "E:/ComfyUI-aki-new";
}

export async function info_has_node(config, classType) {
  try {
    const info = await comfyFetch(config, "/object_info", {}).then((r) => r.json());
    return !!(info && info[classType]);
  } catch { return false; }
}

export async function model_exists_locally(config, fileName) {
  const base = comfyRoot(config);
  for (const sub of ["unet", "diffusion_models", "clip", "text_encoders", "vae", "loras", "upscale_models"]) {
    try {
      const st = await stat(join(base, "models", sub, fileName));
      if (st.isFile() && st.size > 100 * 1024 * 1024) return true;
    } catch {}
  }
  return false;
}

export async function envCheck(config) {
  // 只检查 ComfyUI：ffmpeg / TTS / 磁盘空间不再作为环境项（需要时会按需报错）
  const items = [];
  try {
    const st = await comfyFetch(config, "/system_stats", {}).then((r) => r.json());
    items.push({ id: "comfy", ok: true, label: "本地 ComfyUI",
      detail: `v${st?.system?.comfyui_version || "?"}` });
  } catch (e) {
    items.push({ id: "comfy", ok: false, label: "本地 ComfyUI",
      detail: String(e.message || e).slice(0, 80),
      fix: "确认 ComfyUI 已启动（默认 127.0.0.1:8188），或在设置页点「启动」" });
  }
  return { ok: items.every((i) => i.ok), items };
}

/** 读 templates/*.json，反推"需要哪些节点 / 哪些模型" */
export async function templateNeeds() {
  const dir = join(HERE, "..", "templates");
  const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".json"));
  const needs = [];
  for (const f of files) {
    const wf = await readJson(join(dir, f), null);
    if (!wf || typeof wf !== "object") continue;
    const nodes = new Set();
    const models = [];
    for (const node of Object.values(wf)) {
      if (!node || typeof node !== "object" || !node.class_type) continue;
      nodes.add(node.class_type);
      const inputs = node.inputs || {};
      for (const key of ["unet_name", "clip_name", "vae_name", "ckpt_name", "lora_name"]) {
        const v = inputs[key];
        if (typeof v === "string" && v.trim()) models.push({ file: v.trim(), loader: node.class_type, input: key });
      }
    }
    needs.push({ id: f.replace(/\.json$/, ""), nodes: [...nodes], models });
  }
  return needs;
}

export const COMFY_PORTS = [8188, 8189, 8180, 8000];

export async function fileExists(p) {
  try { await stat(p); return true; } catch { return false; }
}

export async function probeHttp(base, ms = 1200) {
  try {
    const r = await fetch(base.replace(/\/+$/, "") + "/system_stats", { signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    const j = await r.json();
    const dev = Array.isArray(j?.devices) ? j.devices[0] : null;
    return {
      version: String(j?.system?.comfyui_version || ""),
      vramTotalGB: dev?.vram_total ? Math.round((dev.vram_total / 1024 / 1024 / 1024) * 10) / 10 : 0,
    };
  } catch {
    return null;
  }
}

/** 判断某个目录是不是 ComfyUI 安装 */
export async function inspectInstall(dir) {
  const hasMain = await fileExists(join(dir, "main.py"));
  if (!hasMain) return null;
  const customDir = join(dir, "custom_nodes");
  let customCount = 0;
  try { customCount = (await readdir(customDir, { withFileTypes: true })).filter((d) => d.isDirectory()).length; } catch {}
  const hasModels = await fileExists(join(dir, "models"));

  const pythonCandidates = [
    join(dir, "python", "python.exe"),
    join(dir, "venv", "Scripts", "python.exe"),
    join(dir, ".venv", "Scripts", "python.exe"),
    join(dir, "python_embeded", "python.exe"),
  ];
  let launch = null;
  for (const exe of pythonCandidates) {
    if (await fileExists(exe)) { launch = { kind: "python", exe, args: ["-s", "main.py"] }; break; }
  }
  if (!launch) {
    for (const bat of ["run_nvidia_gpu.bat", "run.bat", "run_cpu.bat", "run_amd_gpu.bat"]) {
      if (await fileExists(join(dir, bat))) { launch = { kind: "bat", exe: join(dir, bat), args: [] }; break; }
    }
  }
  return { path: dir, hasModels, customCount, launch };
}

/** 扫盘找 ComfyUI（只扫一层，避免过慢） */
export async function scanForInstalls(prevPath) {
  const found = [];
  const seen = new Set();
  const push = async (dir) => {
    const key = dir.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const info = await inspectInstall(dir);
    if (info) found.push(info);
  };

  if (prevPath) await push(prevPath);

  const home = homedir();
  const quick = [
    join(home, "ComfyUI"), join(home, "Documents", "ComfyUI"), join(home, "Desktop", "ComfyUI"),
    "C:\\ComfyUI", "D:\\ComfyUI", "E:\\ComfyUI", "F:\\ComfyUI",
  ];
  for (const q of quick) await push(q);

  // 各盘根目录下名字含 comfy 的目录
  for (const drive of ["C:", "D:", "E", "F", "G"]) {
    const root = drive.endsWith(":") ? drive + "\\" : drive + ":\\";
    let entries = [];
    try { entries = await readdir(root, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (!/comfy/i.test(e.name)) continue;
      await push(join(root, e.name));
    }
  }
  return found;
}

export let LAUNCHED = null; // { pid, dir, at, log: [] }

export function tailLines(arr, n = 20) {
  return arr.slice(-n).join("\n");
}

export async function startComfy(dir, launch) {
  // 已经有实例在跑就不再启动第二个
  for (const port of COMFY_PORTS) {
    const alive = await probeHttp(`http://127.0.0.1:${port}`, 700);
    if (alive) return { ok: true, already: true, port };
  }
  const info = launch || (await inspectInstall(dir))?.launch;
  if (!info) return { ok: false, error: "找不到启动方式（python/main.py 或 run*.bat）" };

  const cmd = info.kind === "bat" ? "cmd.exe" : info.exe;
  const args = info.kind === "bat" ? ["/c", info.exe] : info.args;
  const log = [];
  const child = spawn(cmd, args, { cwd: dir, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout?.on("data", (b) => { log.push(String(b)); if (log.length > 200) log.shift(); });
  child.stderr?.on("data", (b) => { log.push(String(b)); if (log.length > 200) log.shift(); });
  child.on("exit", () => { if (LAUNCHED && LAUNCHED.pid === child.pid) LAUNCHED = null; });
  LAUNCHED = { pid: child.pid, dir, at: Date.now(), log };

  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    await new Promise((r) => setTimeout(r, 1500));
    for (const port of COMFY_PORTS) {
      const st = await probeHttp(`http://127.0.0.1:${port}`, 900);
      if (st) return { ok: true, pid: child.pid, port, waitedMs: Date.now() - t0, log: tailLines(log) };
    }
    if (child.exitCode !== null) break;
  }
  return { ok: false, pid: child.pid, error: "启动超时（120s）", log: tailLines(log, 30) };
}

export async function stopComfy() {
  if (!LAUNCHED) return { ok: false, error: "当前没有由插件启动的实例" };
  const pid = LAUNCHED.pid;
  try {
    await new Promise((resolve) => {
      execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => resolve());
    });
  } catch {}
  LAUNCHED = null;
  return { ok: true, pid };
}

