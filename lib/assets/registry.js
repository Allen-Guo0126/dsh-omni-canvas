/**
 * 资产库 v2：更细的分类、血缘、场次流程。
 *
 * 索引文件：~/.dsh/projects/<id>/assets/index.json（保持向后兼容，原有字段全部保留）
 * 新增字段：
 *   role        character | scene | prop | voice | shot | frame | upscale | edit | other
 *   sceneId/   所在场（脚本卡的 groupId）
 *   sceneTitle 场标题
 *   shotLabel  镜号（如 "S03 回家·漏底垃圾桶"）
 *   parentId   派生来源（图 → 视频 → 抽帧 → 超分）
 *   rootId     血缘根
 *   tags[]     可编辑标签
 *   favorite   收藏
 *   width/height/durationSec/sizeBytes  便于筛选与展示
 */

import { readJson, writeJson, projectDir } from "../core/fs.js";
import { join } from "node:path";

const indexPath = (projectDirAbs) => join(projectDirAbs, "assets", "index.json");

export async function readIndex(projectId, config) {
  return (await readJson(indexPath(projectDir(config, projectId)), [])) || [];
}

export async function writeIndex(projectId, config, list) {
  await writeJson(indexPath(projectDir(config, projectId)), list);
}

const ROLE_BY_KIND = { audio: "voice", video: "shot", image: "other", text: "other" };

/** 根据画布节点推断 role */
function inferRole(node) {
  const d = node?.data || {};
  if (d.role) return d.role;
  if (node?.type === "audio") return "voice";
  if (d.frameOf) return "frame";
  if (d.upscaledFrom) return "upscale";
  if (d.editFrom) return "edit";
  if (node?.type === "video") return "shot";
  return ROLE_BY_KIND[node?.type] || "other";
}

/** 从脚本卡建立 rowId → {sceneTitle, shotLabel, sceneId} 索引 */
function scriptIndex(canvas) {
  const map = new Map();
  for (const n of canvas.nodes || []) {
    if (n.type !== "script") continue;
    const groups = n.data?.groups || [];
    for (const g of groups) {
      for (const r of g.rows || []) {
        map.set(r.id, {
          sceneId: g.id || "",
          sceneTitle: g.title || "",
          shotLabel: (r.cells && (r.cells.shot || r.cells.desc)) ? String(r.cells.shot || "").slice(0, 40) : "",
        });
      }
    }
  }
  return map;
}

/**
 * 迁移/补齐：把画布上的信息写回资产索引。
 * 幂等：重复调用不会产生重复数据。
 */
export async function migrateAssets(projectId, config, canvas) {
  const list = await readIndex(projectId, config);
  if (!list.length) return { total: 0, updated: 0 };
  const byNode = new Map();
  for (const n of canvas.nodes || []) byNode.set(n.id, n);
  const rows = scriptIndex(canvas);

  let updated = 0;
  for (const a of list) {
    const node = byNode.get(a.nodeId);
    const before = JSON.stringify(a);
    if (node) {
      const d = node.data || {};
      a.role = a.role || inferRole(node);
      if (d.rowId) {
        a.rowId = a.rowId || d.rowId;
        const info = rows.get(d.rowId);
        if (info) {
          // 剧本是唯一真源：改了场名/镜号，资产跟着刷新
          a.sceneId = info.sceneId || a.sceneId;
          a.sceneTitle = info.sceneTitle || a.sceneTitle;
          a.shotLabel = info.shotLabel || a.shotLabel;
        }
      }
      if (d.groupId) a.sceneId = a.sceneId || d.groupId;
      if (d.scriptId) a.scriptId = a.scriptId || d.scriptId;
      if (d.width) a.width = a.width || Number(d.width);
      if (d.height) a.height = a.height || Number(d.height);
      if (d.durationSec) a.durationSec = a.durationSec || Number(d.durationSec);
      // 血缘
      const parentNodeId = d.frameOf || d.upscaledFrom || d.editFrom || d.refFrom || "";
      if (parentNodeId && !a.parentId) {
        const parentAsset = list.find((x) => x.nodeId === parentNodeId && x.id !== a.id);
        if (parentAsset) {
          a.parentId = parentAsset.id;
          a.rootId = parentAsset.rootId || parentAsset.id;
        }
      }
    }
    if (!a.rootId) a.rootId = a.parentId ? (list.find((x) => x.id === a.parentId)?.rootId || a.parentId) : a.id;
    if (!Array.isArray(a.tags)) a.tags = [];
    if (a.favorite === undefined) a.favorite = false;
    if (JSON.stringify(a) !== before) updated += 1;
  }
  if (updated) await writeIndex(projectId, config, list);
  return { total: list.length, updated };
}

/** 查询：过滤 + 分面 + 分页 */
export function queryAssets(list, opts = {}) {
  const {
    kind, role, sceneId, favorite, q, sort = "new", limit = 200, offset = 0, nodeId,
  } = opts;

  // 分面基集：只应用"搜索/收藏"，不应用 kind/role/sceneId
  // （否则点了某一场，其他场和「全部」会从标签栏里消失，用户无法取消筛选）
  let base = list.slice();
  if (favorite) base = base.filter((a) => a.favorite);
  if (q) {
    const needle = String(q).toLowerCase();
    base = base.filter((a) =>
      String(a.prompt || "").toLowerCase().includes(needle) ||
      String(a.name || "").toLowerCase().includes(needle) ||
      String(a.shotLabel || "").toLowerCase().includes(needle) ||
      String(a.sceneTitle || "").toLowerCase().includes(needle) ||
      (a.tags || []).some((t) => String(t).toLowerCase().includes(needle)));
  }

  let out = base.slice();
  if (kind) out = out.filter((a) => a.kind === kind);
  if (role) out = out.filter((a) => a.role === role);
  if (sceneId) out = out.filter((a) => a.sceneId === sceneId);
  if (nodeId) out = out.filter((a) => a.nodeId === nodeId);

  if (sort === "old") out.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  else if (sort === "long") out.sort((a, b) => Number(b.durationSec || 0) - Number(a.durationSec || 0));
  else out.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const total = out.length;

  // 分面（在过滤后的集合上统计，便于逐层收窄）
  const facet = (key) => {
    const m = new Map();
    for (const a of base) {
      const v = a[key];
      if (!v) continue;
      m.set(v, (m.get(v) || 0) + 1);
    }
    return [...m.entries()].map(([value, count]) => ({ value, count })).sort((x, y) => y.count - x.count);
  };

  const scenes = new Map();
  for (const a of base) {
    const key = a.sceneId || "__none__";
    if (!scenes.has(key)) scenes.set(key, { sceneId: a.sceneId || "", sceneTitle: a.sceneTitle || "未归场", count: 0 });
    scenes.get(key).count += 1;
  }

  // 版本组：同一 nodeId 多次生成的资产归成一组（同一张卡的第 1/2/3 版）
  const groups = new Map();
  for (const a of out) {
    const key = a.nodeId || a.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }
  for (const [key, arr] of groups) {
    if (arr.length < 2) continue;
    arr.sort((x, y) => String(y.createdAt || "").localeCompare(String(x.createdAt || "")));
    arr.forEach((a, i) => {
      a.variantCount = arr.length;
      a.variantIndex = i + 1;
      a.variantOf = key;
      a.variantNewest = i === 0;
    });
  }

  return {
    total,
    items: out.slice(offset, offset + limit),
    facets: { kinds: facet("kind"), roles: facet("role"), scenes: [...scenes.values()] },
  };
}

/** 血缘：向上找父链，向下找子 */
export function lineageOf(list, assetId) {
  const byId = new Map(list.map((a) => [a.id, a]));
  const self = byId.get(assetId);
  if (!self) return { ok: false };
  const parents = [];
  let cur = self;
  const seen = new Set([self.id]);
  while (cur?.parentId && byId.has(cur.parentId) && !seen.has(cur.parentId)) {
    cur = byId.get(cur.parentId);
    seen.add(cur.id);
    parents.unshift(cur);
  }
  const children = list.filter((a) => a.parentId === assetId);
  return { ok: true, self, parents, children };
}

/** 场次流程视图：按场分组，场内按镜头顺序给资产 */
export function sceneBoard(list, canvas) {
  const script = (canvas.nodes || []).find((n) => n.type === "script");
  const groups = script?.data?.groups || [];
  const rowsIndex = new Map();
  groups.forEach((g, gi) => {
    (g.rows || []).forEach((r, ri) => {
      rowsIndex.set(r.id, { gi, ri, sceneTitle: g.title || `场 ${gi + 1}`, shot: (r.cells && r.cells.shot) || "", dur: Number((r.cells && r.cells.dur) || 0) });
    });
  });

  const buckets = new Map();
  for (const a of list) {
    const info = a.rowId ? rowsIndex.get(a.rowId) : null;
    const key = info ? `g${info.gi}` : (a.sceneId || "__none__");
    if (!buckets.has(key)) buckets.set(key, { key, sceneTitle: info ? info.sceneTitle : (a.sceneTitle || "未归场"), shots: [] });
    buckets.get(key).shots.push({
      a, order: info ? info.ri : 9999, shot: info?.shot || a.shotLabel || "",
      rowId: a.rowId || "", sceneId: a.sceneId || "",
    });
  }

  // 每镜用到的参考图（角色/场景/道具）→ 便于在流程视图里一眼看到素材来源
  const nodeById = new Map((canvas.nodes || []).map((n) => [n.id, n]));
  const rowRefs = new Map();
  for (const n of canvas.nodes || []) {
    if (n.type !== "script") continue;
    for (const g of n.data?.groups || []) {
      for (const row of g.rows || []) {
        const a = row.assets || {};
        const ids = [...(a.characters || []), a.scene, ...(a.props || [])].filter(Boolean);
        rowRefs.set(row.id, ids.map((id) => {
          const node = nodeById.get(id);
          if (!node?.data?.file) return null;
          return { file: node.data.file, role: node.data.role || "" };
        }).filter(Boolean));
      }
    }
  }

  const scenes = [...buckets.values()].map((b) => ({
    ...b,
    shots: b.shots.sort((x, y) => x.order - y.order).map((s) => ({
      file: s.a.file, kind: s.a.kind, role: s.a.role || "",
      shot: s.shot, durationSec: s.a.durationSec || 0, id: s.a.id,
      refs: (rowRefs.get(s.rowId) || []).slice(0, 4),
    })),
  })).sort((a, b) => String(a.key).localeCompare(String(b.key)));

  return { scenes };
}

/** 更新资产元数据 */
export async function patchAsset(projectId, config, assetId, patch) {
  const list = await readIndex(projectId, config);
  const a = list.find((x) => x.id === assetId);
  if (!a) return null;
  for (const k of ["name", "role", "favorite"]) {
    if (patch[k] !== undefined) a[k] = patch[k];
  }
  if (patch.tags !== undefined) a.tags = Array.isArray(patch.tags) ? patch.tags.slice(0, 20) : [];
  await writeIndex(projectId, config, list);
  return a;
}
