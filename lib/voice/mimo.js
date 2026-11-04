/**
 * 音色（TTS）：小米 MiMo，OpenAI 兼容端点。
 *
 * 已验证的调用配方（2026-11-04）：
 *   端点  POST {base}/chat/completions
 *   设计  model=mimo-v2.5-tts-voicedesign
 *         messages=[{role:"user", content:<音色描述>}, {role:"assistant", content:<要说的文本>}]
 *         modalities=["audio"], audio={format:"wav"}
 *   克隆  model=mimo-v2.5-tts-voiceclone
 *         audio={format:"wav", voice:"data:audio/wav;base64,..."}
 *   返回  choices[0].message.audio.data（base64 WAV）
 *
 * 注意：TTS 模型不接受 system role；user 用于"音色/指令"，assistant 是"要念的内容"。
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { readJson } from "../core/fs.js";

const DEFAULT_BASE = "https://api.xiaomimimo.com/v1";
const DESIGN_MODEL = "mimo-v2.5-tts-voicedesign";
const CLONE_MODEL = "mimo-v2.5-tts-voiceclone";

/** 音色配置读自设置文件（不发到仓库里） */
export async function voiceConfig() {
  const st = await readJson(join(homedir(), ".dsh", "omni-canvas.settings.json"), {});
  const v = st.voice || {};
  return {
    base: String(v.base || DEFAULT_BASE).replace(/\/+$/, ""),
    apiKey: String(v.apiKey || ""),
    designModel: String(v.designModel || DESIGN_MODEL),
    cloneModel: String(v.cloneModel || CLONE_MODEL),
    defaultText: String(v.defaultText || "这是一段测试音频，请确认我的音色是否合适。"),
  };
}

/** 默认音色描述模板（按年龄/质感给起始值，用户可改） */
export const VOICE_PRESETS = {
  elder: "60岁左右男性，声音苍老、沙哑、语速偏慢，带一点气息感",
  elder_female: "60岁左右女性，声音温和偏哑，语速舒缓，略带喉音",
  young_male: "25岁左右男性，清亮有力，语速中等，情绪自然",
  young_female: "22岁左右女性，清甜柔和，语气轻快",
  cold: "30岁左右男性，低沉冷峻，语速慢，句子间停顿明显",
};

async function callTts(cfg, payload, timeoutMs = 180000) {
  if (!cfg.apiKey) throw new Error("未配置音色 API Key（设置 → 音色）");
  const res = await fetch(`${cfg.base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msg = json?.error?.message || json?.error?.param || text.slice(0, 200);
    throw new Error(`音色合成失败(${res.status})：${msg}`);
  }
  const audio = json?.choices?.[0]?.message?.audio;
  const b64 = audio?.data;
  if (!b64) throw new Error("音色接口没有返回音频");
  return { buf: Buffer.from(b64, "base64"), transcript: audio?.transcript || "" };
}

/** 文字描述 → 试听音频（音色设计） */
export async function synthDesign({ desc, text, cfg }) {
  const c = cfg || (await voiceConfig());
  const voiceDesc = String(desc || "").trim() || VOICE_PRESETS.elder;
  const line = String(text || "").trim() || c.defaultText;
  return callTts(c, {
    model: c.designModel,
    messages: [
      { role: "user", content: voiceDesc },
      { role: "assistant", content: line },
    ],
    modalities: ["audio"],
    audio: { format: "wav" },
  });
}

/** 参考音频 → 试听音频（音色克隆） */
export async function synthClone({ sampleBuf, mime = "audio/wav", text, cfg }) {
  const c = cfg || (await voiceConfig());
  const line = String(text || "").trim() || c.defaultText;
  const url = `data:${mime};base64,${sampleBuf.toString("base64")}`;
  return callTts(c, {
    model: c.cloneModel,
    messages: [
      { role: "user", content: "用参考音频里的音色朗读" },
      { role: "assistant", content: line },
    ],
    modalities: ["audio"],
    audio: { format: "wav", voice: url },
  });
}

/** 把音频写进项目的 media/ 并返回相对路径 */
export async function saveVoiceFile(projectAbsDir, buf) {
  const name = `voice-${randomUUID().slice(0, 8)}.wav`;
  const path = join(projectAbsDir, "media", name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buf);
  return { file: `media/${name}`, abs: path };
}
