/**
 * Argos 离线翻译（CPU，不占显存、不走 ComfyUI 队列）。
 * 语言包位置：E:\Allen\.tmp\argos-cache\packages（可用 settings.voice/translate 覆盖）
 * 调用方式：spawn ComfyUI 自带 python，执行 argostranslate.translate.translate
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const PYTHON = process.env.OMNI_PYTHON || "E:/ComfyUI-aki-new/python/python.exe";
const CACHE = process.env.OMNI_ARGOS_CACHE || "E:/Allen/.tmp/argos-cache";

const SCRIPT = `
import json, os, sys, time
os.environ["XDG_CACHE_HOME"] = sys.argv[1]
os.environ["ARGOS_PACKAGES_DIR"] = os.path.join(sys.argv[1], "packages")
from argostranslate import translate
src, dst, text = sys.argv[2], sys.argv[3], sys.argv[4]
langs = [l.code for l in translate.get_installed_languages()]
if src not in langs or dst not in langs:
    print(json.dumps({"error": "missing-package", "have": langs}))
    sys.exit(0)
t0 = time.time()
out = translate.translate(text, src, dst)
print(json.dumps({"text": out, "seconds": round(time.time() - t0, 2)}))
`;

/** 探测 Argos 是否可用（语言包是否齐） */
export async function argosAvailable(pair = ["en", "zh"]) {
  try {
    const { stdout } = await run(PYTHON, ["-c",
      `import os,sys,json
os.environ["XDG_CACHE_HOME"]=sys.argv[1]
os.environ["ARGOS_PACKAGES_DIR"]=os.path.join(sys.argv[1],"packages")
from argostranslate import translate
print(json.dumps([l.code for l in translate.get_installed_languages()]))`,
      CACHE], { timeout: 60000 });
    const langs = JSON.parse(stdout.trim() || "[]");
    return pair.every((code) => langs.includes(code));
  } catch {
    return false;
  }
}

/** 用 Argos 翻译整段文本 */
export async function argosTranslate(text, from = "en", to = "zh") {
  const { stdout } = await run(PYTHON, ["-c", SCRIPT, CACHE, from, to, String(text || "")], {
    timeout: 300000,
    maxBuffer: 32 * 1024 * 1024,
  }).catch((e) => {
    throw new Error(`Argos 调用失败：${String(e?.message || e).slice(0, 120)}`);
  });
  const line = String(stdout).trim().split("\n").pop() || "{}";
  const res = JSON.parse(line);
  if (res.error) throw new Error(`Argos 缺语言包（已有：${(res.have || []).join(",")}）`);
  return { text: String(res.text || ""), seconds: res.seconds };
}
