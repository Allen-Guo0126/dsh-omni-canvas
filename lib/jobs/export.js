const BACKUP_TODAY = new Map();

/**
 * 导出与发布：ZIP 打包、成片拼接、每日备份、剪贴板、产物下载。
 */
import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ensureDir, projectDir, readJson, writeJson, getCanvas, mutateCanvas, touchProject } from "../core/fs.js";
import { downloadBinary, comfyFetch } from "../core/comfy.js";
import { probeVideo } from "./video.js";


/** 用 PowerShell 直接写系统剪贴板（浏览器没权限时的兜底） */
export async function setSystemClipboard(text) {
  const tmp = join(homedir(), ".dsh", "omni-clip.txt");
  await mkdir(dirname(tmp), { recursive: true });
  await writeFile(tmp, String(text), "utf8");
  await new Promise((resolve, reject) => {
    execFile(
      "powershell",
      ["-NoProfile", "-Command", "Get-Content -Raw -Encoding UTF8 -LiteralPath $env:OMNI_CLIP | Set-Clipboard"],
      { windowsHide: true, env: { ...process.env, OMNI_CLIP: tmp }, timeout: 15000 },
      (err) => (err ? reject(err) : resolve()),
    );
  });
  return { ok: true, bytes: String(text).length };
}

/** 极简 ZIP 写入（只存储不压缩）：媒体本身已压缩，够用且无外部依赖 */
export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function zipStore(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const dosTime = 0;
  const dosDate = (2026 - 1980) << 9 | (1 << 5) | 1;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, data);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(dosTime, 12);
    cen.writeUInt16LE(dosDate, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cenBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, cenBuf, end]);
}

/** 导出项目：project.json / canvas.json / assets/index.json / media/* → 一个 zip */
export async function exportProject(config, projectId) {
  const dir = projectDir(config, projectId);
  const entries = [];
  for (const rel of ["project.json", "canvas.json", "assets/index.json"]) {
    try {
      entries.push({ name: rel, data: await readFile(join(dir, rel)) });
    } catch {}
  }
  try {
    const mediaDir = join(dir, "media");
    const files = await readdir(mediaDir);
    for (const f of files) {
      try {
        const buf = await readFile(join(mediaDir, f));
        if (buf.length <= 200 * 1024 * 1024) entries.push({ name: `media/${f}`, data: buf });
      } catch {}
    }
  } catch {}
  const outDir = join(homedir(), ".dsh", "exports");
  await mkdir(outDir, { recursive: true });
  const name = `omni-${projectId}-${new Date().toISOString().slice(0, 10)}.zip`;
  const outPath = join(outDir, name);
  await writeFile(outPath, zipStore(entries));
  return { path: outPath, files: entries.length };
}

export async function ensureDailyBackup(config, projectId) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const key = projectId + ":" + today;
    if (BACKUP_TODAY.get(projectId) === today) return;
    BACKUP_TODAY.set(projectId, today);

    const dir = projectDir(config, projectId);
    const bakRoot = join(homedir(), ".dsh", "backups", projectId);
    await mkdir(bakRoot, { recursive: true });
    const target = join(bakRoot, today);
    await mkdir(target, { recursive: true });
    for (const rel of ["project.json", "canvas.json", "assets/index.json"]) {
      try {
        await writeFile(join(target, rel.replace("/", "_")), await readFile(join(dir, rel)));
      } catch {}
    }
    // 只保留最近 7 份
    const days = (await readdir(bakRoot)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    for (const old of days.slice(0, Math.max(0, days.length - 7))) {
      await rm(join(bakRoot, old), { recursive: true, force: true });
    }
  } catch {}
}

export async function concatProjectVideos(config, projectId, ids, title) {
  const canvas = await getCanvas(config, projectId);
  const byId = new Map(canvas.nodes.map((n) => [n.id, n]));
  const useIds = (ids || []).filter((id) => byId.get(id)?.data?.file);
  if (useIds.length < 2) throw new Error("至少需要两个有视频的节点");

  const dir = projectDir(config, projectId);
  const listPath = join(dir, "concat-" + Date.now() + ".txt");
  const lines = useIds
    .map((id) => "file '" + join(dir, byId.get(id).data.file).replace(/\\/g, "/") + "'")
    .join("\n");
  await writeFile(listPath, lines + "\n", "utf8");
  const fileName = `${randomUUID()}.mp4`;
  await ensureDir(join(dir, "media"));
  const outAbs = join(dir, "media", fileName);

  const binCandidates = [config.ffmpegPath, "ffmpeg", "E:/Allen/tools/bin/ffmpeg.exe", "C:/ffmpeg/bin/ffmpeg.exe"];
  const errors = [];
  let run = null;
  let buf = null;
  for (const bin of binCandidates.filter(Boolean)) {
    try {
      buf = await new Promise((resolve, reject) => {
        const child = spawn(bin, ["-v", "error", "-f", "concat", "-safe", "0", "-i", listPath,
          "-c", "copy", "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", "-"],
          { windowsHide: true });
        const chunks = [];
        let total = 0;
        let errText = "";
        child.stdout.on("data", (d) => { chunks.push(d); total += d.length; });
        child.stderr.on("data", (d) => { errText += d.toString(); });
        child.on("error", (e) => reject(e));
        child.on("close", (code) => {
          // 注意：要按"字节总数"判断，不是分片个数
          if (code === 0 && total > 50 * 1024) resolve(Buffer.concat(chunks));
          else reject(new Error(`ffmpeg exit ${code} (${total} bytes): ${errText.slice(-300)}`));
        });
      });
      if (buf?.length) break;
    } catch (e) {
      run = e;
      buf = null;
      errors.push(`${bin}: ${String(e.message || e).slice(0, 120)}`);
    }
  }
  await rm(listPath, { force: true }).catch(() => {});
  if (!buf) throw new Error("ffmpeg 拼接失败: " + errors.join(" | ").slice(-400));
  await writeFile(outAbs, buf);

  const probe = await probeVideo(config, outAbs);
  const sizeMB = Math.round((buf.length / 1048576) * 10) / 10;
  const asset = {
    id: randomUUID().slice(0, 12),
    kind: "video",
    file: `media/${fileName}`,
    prompt: title || "拼接成片",
    model: "concat",
    params: { clips: useIds.length, clipIds: useIds, sizeMB,
      width: probe?.width, height: probe?.height, durationSec: probe?.durationSec || 0 },
    createdAt: new Date().toISOString(),
  };
  const idxPath = join(dir, "assets", "index.json");
  const index = await readJson(idxPath, []);
  index.push(asset);
  await writeJson(idxPath, index);
  await touchProject(config, projectId);

  const nodeId = "n-" + randomUUID().slice(0, 8);
  await mutateCanvas(config, projectId, (cv) => {
    cv.nodes.push({
      id: nodeId, type: "video", x: 120, y: 120, w: 320, h: 420,
      data: { title: title || "拼接成片", file: asset.file, assetId: asset.id, status: "done",
        model: "concat", clipIds: useIds, sizeMB, width: probe?.width, height: probe?.height,
        durationSec: probe?.durationSec || 0 },
    });
  });
  return { ok: true, nodeId, asset };
}

export async function downloadOutput(config, item, destDir) {
  const q = new URLSearchParams({ filename: item.filename, subfolder: item.subfolder || "", type: item.type || "output" });
  const res = await comfyFetch(config, "/view?" + q.toString(), {});
  if (!res.ok) throw new Error("下载失败 " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(destDir, { recursive: true });
  const name = String(item.filename).split(/[\\/]/).pop();
  const out = join(destDir, name);
  await writeFile(out, buf);
  return out;
}


export async function exportPublishPack(config, projectId, nodeId) {
  const canvas = await getCanvas(config, projectId);
  const node = canvas.nodes.find((n) => n.id === nodeId);
  if (!node?.data?.file) throw new Error("这个节点还没有成片");
  const dir = projectDir(config, projectId);
  const src = join(dir, node.data.file);
  const title = String(node.data.title || node.data.prompt || "成片").replace(/[\\/:*?"<>|]/g, "_").slice(0, 40);
  const meta = node.data || {};
  const parts = [
    meta.width && meta.height ? `${meta.width}x${meta.height}` : "",
    meta.durationSec ? `${Math.round(meta.durationSec)}s` : "",
  ].filter(Boolean).join("_");
  const baseName = `${title}${parts ? "_" + parts : ""}`;
  const outDir = join(homedir(), ".dsh", "exports");
  await mkdir(outDir, { recursive: true });
  const outVideo = join(outDir, baseName + ".mp4");
  await writeFile(outVideo, await (await import("node:fs/promises")).readFile(src));

  const lines = [
    `标题：${title}`,
    `文件：${baseName}.mp4`,
    `规格：${meta.width || "?"}x${meta.height || "?"} · ${meta.durationSec ? meta.durationSec.toFixed(1) + "s" : "?"} · ${meta.sizeMB || "?"} MB`,
    `模型：${meta.model || node.data?.model || ""}`,
  ];
  if (meta.clipIds?.length) lines.push(`来源镜头：${meta.clipIds.join(" → ")}`);
  if (meta.refFrom) lines.push(`首帧来源：${meta.refFrom}`);
  if (meta.prompt) lines.push("", "提示词：", String(meta.prompt).slice(0, 800));
  const outTxt = join(outDir, baseName + ".txt");
  await writeFile(outTxt, lines.join("\n"), "utf8");
  return { ok: true, video: outVideo, meta: outTxt };
}

export async function exportAllShots(config, projectId) {
  const canvas = await getCanvas(config, projectId);
  const proj = await readJson(join(projectDir(config, projectId), "project.json"), {});
  const clips = canvas.nodes
    .filter((n) => n.type === "video" && n.data?.file && n.data?.model !== "concat")
    .sort((a, b) => a.x - b.x);
  if (!clips.length) throw new Error("还没有镜头可以导出");

  const safe = String(proj?.name || projectId).replace(/[\\/:*?"<>|]/g, "_").slice(0, 40);
  const outDir = join(homedir(), ".dsh", "exports", safe);
  await mkdir(outDir, { recursive: true });
  const dir = projectDir(config, projectId);

  const rows = [];
  for (let i = 0; i < clips.length; i++) {
    const n = clips[i];
    const idx = `S${String(i + 1).padStart(2, "0")}`;
    const meta = n.data || {};
    const spec = [meta.width && meta.height ? `${meta.width}x${meta.height}` : "", meta.durationSec ? `${Math.round(meta.durationSec)}s` : ""]
      .filter(Boolean).join("_");
    const name = `${idx}${spec ? "_" + spec : ""}.mp4`;
    await writeFile(join(outDir, name), await readFile(join(dir, n.data.file)));
    rows.push(`${idx}  ${name}  ${meta.durationSec ? meta.durationSec.toFixed(1) + "s" : "?"}  ${(meta.prompt || "").slice(0, 60)}`);
  }
  await writeFile(join(outDir, "汇总.txt"), rows.join("\n") + "\n", "utf8");
  return { ok: true, dir: outDir, count: clips.length };
}
