/**
 * 生成随插件分发的「出厂能力包」：packs/builtin/*.pack.json
 * 内容 = 模板的模型依赖 + 摆放目录 + 下载线索（HF 搜索页，不猜直链）
 */
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { MODELS } from "../lib/workflow/models.js";
import { loadTemplate } from "../lib/workflow/template.js";
import { extractModels, modelIndex } from "../lib/packs/manager.js";

const ROOT = "E:/ComfyUI-aki-new";
const OUT = "packs/builtin";

const META = {
  "qwen-t2i-fast": { capability: "image-t2i", name: "文生图 · Qwen-Image 2.1 加速", hf: "Qwen/Qwen-Image" },
  "qwen-t2i-hq": { capability: "image-t2i", name: "文生图 · Qwen-Image 2.1 高清", hf: "Qwen/Qwen-Image" },
  "qwen-edit": { capability: "image-edit", name: "图生图 · 参考图编辑", hf: "Qwen/Qwen-Image-Edit" },
  "h3-director": {
    capability: "video-r2v",
    capabilities: ["video-t2v", "video-i2v", "video-r2v", "video-fl2v"],
    name: "视频导演台 · MiniMax H3（文生/图生/参考生/首尾帧）",
    hf: "MiniMaxAI",
  },
};

const idx = await modelIndex(ROOT);
await mkdir(OUT, { recursive: true });

for (const [tplId, meta] of Object.entries(META)) {
  const spec = MODELS[tplId];
  if (!spec?.template) { console.log("跳过", tplId); continue; }

  const { workflow } = await loadTemplate(tplId);
  const models = extractModels(workflow).map((raw) => {
    const base = String(raw).split(/[\\/]/).pop();
    const hit = idx.get(base.toLowerCase());
    return {
      file: base,
      subPath: String(raw).includes("\\") || String(raw).includes("/") ? String(raw) : "",
      dir: hit?.dir || "unet",
      bytes: 0,
      sha256: "",
      // 有直链就填 source.url；没有就给搜索页，UI 会提示"需手动下载"
      source: {
        url: "",
        hfSearch: `https://huggingface.co/models?search=${encodeURIComponent(base.replace(/\.(safetensors|gguf|ckpt|pth)$/i, ""))}`,
      },
    };
  });

  const pack = {
    schema: "omni-canvas.pack/1",
    id: `builtin:${tplId}`,
    name: meta.name,
    capability: meta.capability,
    capabilities: meta.capabilities || [meta.capability],
    source: "builtin",
    workflowTemplate: tplId,
    models,
    customNodes: [],
    notes: "出厂内置。模型需按 dir 放到 ComfyUI/models/<dir>/；有 source.url 时可一键下载。",
  };
  const file = join(OUT, `${tplId}.pack.json`);
  await writeFile(file, JSON.stringify(pack, null, 2), "utf8");
  console.log(`✓ ${file}  (${models.length} 个模型)`);
}
