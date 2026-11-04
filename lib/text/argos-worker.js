/**
 * Argos 常驻 worker：一次启动 python，后续走 stdin/stdout JSON 行，省掉 ~2s 启动开销。
 * 用途：短文本（≤600 字）快速翻译；纯 CPU，不占显存、不走 ComfyUI 队列。
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const PYTHON = process.env.OMNI_PYTHON || "E:/ComfyUI-aki-new/python/python.exe";
const CACHE = process.env.OMNI_ARGOS_CACHE || "E:/Allen/.tmp/argos-cache";

const WORKER_SRC = String.raw`
import json, os, sys
os.environ["XDG_CACHE_HOME"] = sys.argv[1]
os.environ["ARGOS_PACKAGES_DIR"] = os.path.join(sys.argv[1], "packages")
from argostranslate import translate
langs = [l.code for l in translate.get_installed_languages()]
sys.stdout.write(json.dumps({"ready": True, "langs": langs}) + "\n")
sys.stdout.flush()
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        req = json.loads(line)
        text = req.get("text") or ""
        src = req.get("from") or "en"
        dst = req.get("to") or "zh"
        if src not in langs or dst not in langs:
            sys.stdout.write(json.dumps({"id": req.get("id"), "error": "missing-package", "have": langs}) + "\n")
        else:
            out = translate.translate(text, src, dst)
            sys.stdout.write(json.dumps({"id": req.get("id"), "text": out}) + "\n")
    except Exception as e:
        sys.stdout.write(json.dumps({"id": None, "error": type(e).__name__ + ": " + str(e)[:200]}) + "\n")
    sys.stdout.flush()
`;

let child = null;
let ready = false;
let failed = false;
let seq = 0;
const pending = new Map();
let buffer = "";
let langs = [];

function ensureWorker() {
  if (child || failed) return;
  child = spawn(PYTHON, ["-c", WORKER_SRC, CACHE], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let msg = null;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.ready) { ready = true; langs = msg.langs || []; continue; }
      const waiter = pending.get(msg.id);
      if (waiter) { pending.delete(msg.id); waiter(msg); }
    }
  });
  child.stderr.on("data", () => {});
  child.on("exit", () => { child = null; ready = false; failed = true; for (const [, w] of pending) w({ error: "worker-exited" }); pending.clear(); });
  child.on("error", () => { child = null; ready = false; failed = true; });
}

function waitReady(timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (ready) return resolve();
      if (failed) return reject(new Error("Argos worker 启动失败"));
      if (Date.now() - t0 > timeoutMs) return reject(new Error("Argos worker 启动超时"));
      setTimeout(tick, 100);
    };
    tick();
  });
}

/** 翻译一段（短文本友好） */
export async function argosTranslateFast(text, from = "en", to = "zh", timeoutMs = 120000) {
  ensureWorker();
  await waitReady();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Argos 翻译超时")); }, timeoutMs);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      if (msg.error === "missing-package") return reject(new Error(`Argos 缺语言包（已有 ${(msg.have || []).join(",") || "无"}）`));
      if (msg.error) return reject(new Error(`Argos 失败：${msg.error}`));
      resolve(String(msg.text || ""));
    });
    try {
      child.stdin.write(JSON.stringify({ id, text: String(text || ""), from, to }) + "\n");
    } catch (e) {
      clearTimeout(timer);
      pending.delete(id);
      reject(new Error(`Argos 写入失败：${String(e?.message || e).slice(0, 80)}`));
    }
  });
}

export function argosLangs() { return langs.slice(); }
export function argosReady() { return ready; }
export function stopArgos() { try { child?.kill(); } catch {} child = null; ready = false; }


/** 预热：启动 worker 并等待就绪（不翻译） */
export async function warmArgos() {
  ensureWorker();
  await waitReady();
  return { langs: argosLangs() };
}
