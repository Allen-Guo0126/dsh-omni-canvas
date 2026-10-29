#!/usr/bin/env node
/**
 * 一键准备依赖：ffmpeg（视频放大/抽帧/拼接）+ edge-tts（语音合成）
 *
 * 用法：
 *   node tools/setup.mjs            # 只检查，不改动
 *   node tools/setup.mjs --ffmpeg   # 缺则下载 ffmpeg 到 tools/bin
 *   node tools/setup.mjs --tts      # pip install edge-tts
 *   node tools/setup.mjs --all      # 全部
 */
import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN_DIR = join(HERE, "..", "bin");
const FFMPEG_URL = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";

const args = process.argv.slice(2);
const doFfmpeg = args.includes("--all") || args.includes("--ffmpeg");
const doTts = args.includes("--all") || args.includes("--tts");

const pass = [];
const todo = [];

const EXTRA_FFMPEG = ["E:/Allen/tools/bin/ffmpeg.exe", "C:/ffmpeg/bin/ffmpeg.exe"];

function hasFfmpeg() {
  for (const c of [join(BIN_DIR, "ffmpeg.exe"), ...EXTRA_FFMPEG]) {
    if (existsSync(c)) return c;
  }
  const r = spawnSync("ffmpeg", ["-version"], { windowsHide: true });
  return r.status === 0 ? "ffmpeg (PATH)" : null;
}

function hasEdgeTts() {
  const r = spawnSync("python", ["-c", "import edge_tts;print(edge_tts.__version__)"], { windowsHide: true });
  return r.status === 0 ? String(r.stdout).trim() : null;
}

async function installFfmpeg() {
  mkdirSync(BIN_DIR, { recursive: true });
  const zip = join(BIN_DIR, "ffmpeg.zip");
  console.log("下载 ffmpeg（约 110 MB）…");
  const res = await fetch(FFMPEG_URL);
  if (!res.ok) throw new Error("下载失败: " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  const { writeFileSync } = await import("node:fs");
  writeFileSync(zip, buf);
  console.log("解压…");
  const ps = `Expand-Archive -Path '${zip}' -DestinationPath '${BIN_DIR}' -Force`;
  const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], { windowsHide: true });
  if (r.status !== 0) throw new Error("解压失败: " + String(r.stderr).slice(0, 120));
  const { readdirSync } = await import("node:fs");
  for (const d of readdirSync(BIN_DIR)) {
    const exe = join(BIN_DIR, d, "bin", "ffmpeg.exe");
    if (existsSync(exe)) {
      const { copyFileSync } = await import("node:fs");
      copyFileSync(exe, join(BIN_DIR, "ffmpeg.exe"));
      const probe = join(BIN_DIR, d, "bin", "ffprobe.exe");
      if (existsSync(probe)) copyFileSync(probe, join(BIN_DIR, "ffprobe.exe"));
      console.log("已安装到", join(BIN_DIR, "ffmpeg.exe"));
      return true;
    }
  }
  throw new Error("压缩包里没找到 ffmpeg.exe");
}

async function main() {
  const ff = hasFfmpeg();
  if (ff) pass.push(`ffmpeg：${ff}`);
  else if (doFfmpeg) {
    await installFfmpeg();
    pass.push("ffmpeg：已安装");
  } else todo.push("ffmpeg 缺失 → node tools/setup.mjs --ffmpeg");

  const tts = hasEdgeTts();
  if (tts) pass.push(`edge-tts：v${tts}`);
  else if (doTts) {
    console.log("pip install edge-tts …");
    const r = spawnSync("python", ["-m", "pip", "install", "--quiet", "edge-tts"], { windowsHide: true });
    if (r.status === 0) pass.push("edge-tts：已安装");
    else todo.push("edge-tts 安装失败，请手动运行 python -m pip install edge-tts");
  } else todo.push("edge-tts 缺失 → node tools/setup.mjs --tts");

  console.log("\n=== 已就绪 ===");
  pass.forEach((p) => console.log("  ✓ " + p));
  console.log("\n=== 待处理 ===");
  if (!todo.length) console.log("  （无）");
  todo.forEach((t) => console.log("  ✗ " + t));
  process.exit(todo.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
