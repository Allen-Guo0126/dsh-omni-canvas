/**
 * 产物落画布：新卡/覆盖、就近摆放、参考连线。
 */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readJson, writeJson, withCanvasLock, projectDir } from "../core/fs.js";


/** 多张出图时：第一张留在原卡，其余每张各建一张新卡，用户自己删留 */
export async function placeExtraImageCards(config, job, assets, primaryNodeId) {
  const extra = (assets || []).slice(1);
  if (!job?.projectId || !extra.length) return 0;
  const dir = projectDir(config, job.projectId);
  let added = 0;
  await withCanvasLock(job.projectId, async () => {
    const canvas = await readJson(join(dir, "canvas.json"),
      { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, rev: 1 });
    const nodes = Array.isArray(canvas.nodes) ? canvas.nodes : [];
    const base = primaryNodeId ? nodes.find((n) => n.id === primaryNodeId) : null;
    const w = base?.w || 320;
    const h = base?.h || 320;
    const x0 = base?.x ?? 80;
    const y0 = base?.y ?? 80;
    const name0 = (base?.data?.name || "图");
    extra.forEach((a, i) => {
      const spot = findFreeSpot(nodes, w, h, {
        startX: x0 + (i + 1) * (w + 16), startY: y0, gap: 16,
      });
      nodes.push({
        id: `n-${randomUUID().slice(0, 10)}`,
        type: "image",
        x: spot.x,
        y: spot.y,
        w, h,
        data: {
          name: `${name0} #${i + 2}`,
          title: `${name0} #${i + 2}`,
          role: base?.data?.role || "",
          file: a.file,
          assetId: a.id,
          status: "done",
          prompt: a.prompt,
          width: a.params?.resolution ? a.params.width : a.params?.width,
          height: a.params?.resolution ? a.params.height : a.params?.height,
          aspect: "16:9",
        },
      });
      added += 1;
    });
    canvas.nodes = nodes;
    canvas.rev = (canvas.rev || 1) + 1;
    await writeJson(join(dir, "canvas.json"), canvas);
  });
  return added;
}

/** 生成产物一律落画布：没指定 nodeId 就新建一张卡（资产库 + 画布都有） */
/** 在画布上找一个不与现有卡片重叠的位置（按 10px 间隙判定） */
export function findFreeSpot(nodes, w, h, opts = {}) {
  const gap = opts.gap ?? 16;
  const startX = opts.startX ?? 120;
  const startY = opts.startY ?? 120;
  const maxTry = opts.maxTry ?? 40;
  const list = Array.isArray(nodes) ? nodes : [];
  const hits = (x, y) => list.some((n) => {
    const nw = n.w || 320;
    const nh = n.h || 320;
    return !(x + w + 8 <= n.x || x >= n.x + nw + 8 ||
             y + h + 8 <= n.y || y >= n.y + nh + 8);
  });
  // 先在同一行向右找；行内放不下才整行下移一行
  for (let row = 0; row < 30; row += 1) {
    for (let k = 0; k < maxTry; k += 1) {
      const x = startX + k * (w + gap);
      const y = startY + row * (h + gap);
      if (!hits(x, y)) return { x, y };
    }
  }
  return { x: startX, y: startY };
}

export async function autoPlaceOnCanvas(config, job, asset) {
  try {
    if (!job?.projectId || !asset?.file) return null;
    const dir = projectDir(config, job.projectId);
    const kind = asset.kind === "video" ? "video" : (asset.kind === "audio" ? "audio" : "image");
    await withCanvasLock(job.projectId, async () => {
      const canvas = await readJson(join(dir, "canvas.json"),
        { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, rev: 1 });
      const nodes = Array.isArray(canvas.nodes) ? canvas.nodes : [];
      const edges = Array.isArray(canvas.edges) ? canvas.edges : [];
      // newCard=true：产物另起一张卡（超分等"派生"操作用），不覆盖源卡片
      const existing = (!job.newCard && job.nodeId) ? nodes.find((n) => n.id === job.nodeId) : null;
      if (existing) {
        if (existing.data?.file === asset.file) return;
        existing.data = { ...existing.data, file: asset.file, assetId: asset.id, status: "done",
          width: asset.params?.width ?? existing.data?.width,
          height: asset.params?.height ?? existing.data?.height };
        if (asset.params?.duration) existing.data.duration = asset.params.duration;
        await writeJson(join(dir, "canvas.json"), { ...canvas, nodes, rev: (Number(canvas.rev) || 1) + 1 });
        return;
      }
      const id = `n-${randomUUID().slice(0, 8)}`;
      const cw0 = kind === "video" ? 320 : 300;
      const ch0 = kind === "video" ? 240 : 300;
      const srcNode = job.linkFrom ? nodes.find((n) => n.id === job.linkFrom) : null;
      const spot = srcNode
        ? { x: Number(srcNode.x || 0) + Number(srcNode.w || 300) + 40, y: Number(srcNode.y || 0) }
        : findFreeSpot(nodes, cw0, ch0, { gap: 16 });
      nodes.push({
        id, type: kind,
        x: spot.x, y: spot.y,
        w: kind === "video" ? 320 : 300, h: kind === "video" ? 240 : 300,
        data: {
          title: job.title || (kind === "video" ? "视频" : (kind === "audio" ? "音频" : "图片")),
          file: asset.file, assetId: asset.id,
          prompt: job.prompt || "",
          width: asset.params?.width, height: asset.params?.height,
          duration: asset.params?.duration,
          genMode: job.mode, status: "done",
        },
      });
      if (srcNode) {
        const eid = `e-${randomUUID().slice(0, 8)}`;
        if (!edges.some((e) => e.from === srcNode.id && e.to === id)) {
          edges.push({ id: eid, from: srcNode.id, to: id });
        }
      }
      await writeJson(join(dir, "canvas.json"), { ...canvas, nodes, edges, rev: (Number(canvas.rev) || 1) + 1 });
    });
    return true;
  } catch (e) {
    return null;
  }
}

/** 参考图自动连线：生成完成时把 refFiles 对应的节点连到本节点（缺失才补，重复忽略） */
export function wireRefEdges(canvas, nodeId, refFiles) {
  if (!nodeId || !Array.isArray(refFiles) || !refFiles.length) return 0;
  const byFile = new Map();
  for (const n of canvas.nodes || []) {
    const f = n.data && n.data.file;
    if (f) byFile.set(String(f), n.id);
  }
  canvas.edges = Array.isArray(canvas.edges) ? canvas.edges : [];
  let added = 0;
  for (const rf of refFiles) {
    const src = byFile.get(String(rf));
    if (!src || src === nodeId) continue;
    const dup = canvas.edges.some((e) => e.from === src && e.to === nodeId);
    if (!dup) {
      canvas.edges.push({ from: src, to: nodeId, kind: "ref" });
      added += 1;
    }
  }
  return added;
}
