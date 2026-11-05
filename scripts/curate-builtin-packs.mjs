/**
 * 把用户绑定的 z-image / MOSS / SeedVR2 收编成「出厂模板」：
 *  - 内嵌 workflow JSON（新机器也能直接用）
 *  - 生成 packs/builtin/*.pack.json
 * 然后删掉重复项：qwen 高清 + qwen 加速（本机）
 */
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { extractModels, modelIndex } from "../lib/packs/manager.js";
import { loadBindings } from "../lib/workflow/bindings.js";

const ROOT = "E:/ComfyUI-aki-new";
const OUT = "packs/builtin";
await mkdir(OUT, { recursive: true });

const WANT = {
  "z-image": { capability: "image-t2i", name: "文生图 · Z-Image Turbo" },
  "moss": { capability: "image-t2i", name: "文生图 · MOSS 全能生图" },
  "seedvr2": { capability: "image-upscale", name: "高清放大 · SeedVR2 4K" },
};

const bindings = await loadBindings();
const idx = await modelIndex(ROOT);

const pick = (kw) => bindings.find((b) => {
  const n = (b.name || "") + " " + ((b.workflow || {}).file || "");
  return n.toLowerCase().includes(kw);
});

for (const [key, meta] of Object.entries(WANT)) {
  const b =
    key === "z-image" ? pick("z-image") :
    key === "moss" ? pick("moss") :
    pick("seedvr2") || pick("4k");
  if (!b) { console.log("✗ 找不到绑定:", key); continue; }

  const wfPath = (b.workflow || {}).file;
  const workflow = JSON.parse(await readFile(wfPath, "utf8"));
  const models = extractModels(workflow).map((raw) => {
    const base = String(raw).split(/[\\/]/).pop();
    const hit = idx.get(base.toLowerCase());
    return {
      file: base,
      dir: hit?.dir || "unet",
      bytes: 0, sha256: "",
      source: { url: "", hfSearch: `https://huggingface.co/models?search=${encodeURIComponent(base.replace(/\.(safetensors|gguf|ckpt|pth)$/i, ""))}` },
    };
  });

  const pack = {
    schema: "omni-canvas.pack/1",
    id: `builtin:${key}`,
    name: meta.name,
    capability: meta.capability,
    capabilities: [meta.capability],
    source: "builtin",
    workflow: { file: `${key}.json`, json: workflow },
    inputs: b.inputs || {},
    outputs: b.outputs || {},
    models,
    customNodes: [],
    notes: "出厂模板：工作流已内嵌，模型按 dir 放到 ComfyUI/models/<dir>/。",
  };
  const f = join(OUT, `${key}.pack.json`);
  await writeFile(f, JSON.stringify(pack, null, 2), "utf8");
  console.log(`✓ ${f}  ${models.length} 个模型  capability=${meta.capability}`);
}

// 删除重复项
for (const f of ["qwen-t2i-hq.pack.json"]) {
  try { await unlink(join(OUT, f)); console.log("🗑 删除重复出厂包:", f); } catch { console.log("（无）", f); }
}
const existing = (await import("node:fs/promises")).readdir;
console.log("\n当前出厂包:", await existing(OUT));
