/**
 * 基础设施：项目目录、canvas 文件锁、JSON 读写。
 * 所有对 <project>/{canvas.json, media/, assets/} 的读写都应经过这里。
 */
import { mkdir, readFile, writeFile, readdir, rm, stat, rename, copyFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export function rootDir(config) {
  return config?.projectsDir || join(homedir(), ".dsh", "projects");
}

export function projectDir(config, id) {
  return join(rootDir(config), String(id));
}

export async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

export async function readJson(p, fallback) {
  try {
    return JSON.parse(await readFile(p, "utf8"));
  } catch {
    return fallback;
  }
}

export async function writeJson(p, value) {
  await ensureDir(dirname(p));
  await writeFile(p, JSON.stringify(value, null, 2), "utf8");
}

export async function listProjects(config) {
  const root = rootDir(config);
  await ensureDir(root);
  const ids = await readdir(root).catch(() => []);
  const out = [];
  for (const id of ids) {
    const p = await readJson(join(root, id, "project.json"), null);
    if (!p) continue;
    const canvas = await readJson(join(root, id, "canvas.json"), { nodes: [] });
    const nodes = canvas.nodes || [];
    const assets = await readJson(join(root, id, "assets", "index.json"), []);
    const withFile = n => n?.data?.file;
    const thumbNode = nodes.find(n => n.type === "image" && withFile(n))
      || nodes.find(n => n.type === "video" && withFile(n));
    const videoCards = nodes.filter(n => n.type === "video").length;
    const scriptNodes = nodes.filter(n => n.type === "script").length;
    out.push({
      ...p,
      nodes: nodes.length,
      images: nodes.filter(n => n.type === "image").length,
      videos: videoCards,
      scripts: scriptNodes,
      assets: assets.length,
      thumb: thumbNode ? thumbNode.data.file : "",
      thumbKind: thumbNode ? thumbNode.type : "",
    });
  }
  out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return out;
}

export async function createProject(config, name) {
  const id = randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  const project = { id, name: name?.trim() || `项目 ${id}`, createdAt: now, updatedAt: now };
  const dir = projectDir(config, id);
  await ensureDir(join(dir, "media"));
  await ensureDir(join(dir, "assets"));
  await writeJson(join(dir, "project.json"), project);
  await writeJson(join(dir, "canvas.json"), { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
  await writeJson(join(dir, "assets", "index.json"), []);
  return project;
}

export async function touchProject(config, id) {
  const p = await readJson(join(projectDir(config, id), "project.json"), null);
  if (!p) return;
  p.updatedAt = new Date().toISOString();
  await writeJson(join(projectDir(config, id), "project.json"), p);
}

export const CANVAS_LOCKS = new Map();

/** 同一项目的画布读改写串行化，避免「生成完成写回」与「客户端保存」互相覆盖。 */
export async function withCanvasLock(projectId, fn) {
  const prev = CANVAS_LOCKS.get(projectId) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  CANVAS_LOCKS.set(projectId, prev.then(() => current));
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (CANVAS_LOCKS.get(projectId) === current) CANVAS_LOCKS.delete(projectId);
  }
}

/** 画布读写：带 revision，防止客户端与工具互相覆盖。 */
export async function mutateCanvas(config, projectId, mutate) {
  return withCanvasLock(projectId, async () => {
    const dir = projectDir(config, projectId);
    const canvas = await readJson(join(dir, "canvas.json"), { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
    canvas.nodes = canvas.nodes || [];
    canvas.edges = canvas.edges || [];
    canvas.rev = Number(canvas.rev) || 1;
    const result = await mutate(canvas);
    canvas.rev += 1;
    await writeJson(join(dir, "canvas.json"), canvas);
    await touchProject(config, projectId);
    return { canvas, result, rev: canvas.rev };
  });
}

export async function getCanvas(config, id) {
  const canvas = await readJson(join(projectDir(config, id), "canvas.json"), null);
  if (!canvas) throw new Error(`项目不存在: ${id}`);
  return canvas;
}

/* ---------------------------------------------------------------- ComfyUI */
