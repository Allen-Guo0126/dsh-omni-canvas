/**
 * 内置模板的模型清单：让「模型与依赖」能显示所有能力的依赖，
 * 而不只是用户手工导出过的能力包。
 */
import { MODELS } from "../workflow/models.js";
import { loadTemplate } from "../workflow/template.js";
import { extractModels, modelIndex } from "./manager.js";

/** 内置模板 → 能力（一个模板可能覆盖多个能力） */
export const BUILTIN_CAPS = {
  "qwen-t2i-fast": { capability: "image-t2i", capabilities: ["image-t2i"], name: "文生图 · Qwen 2.1 加速" },
  "qwen-t2i-hq": { capability: "image-t2i", capabilities: ["image-t2i"], name: "文生图 · Qwen 2.1 高清" },
  "qwen-edit": { capability: "image-edit", capabilities: ["image-edit"], name: "图生图 · 参考图编辑" },
  "h3-director": {
    capability: "video-r2v",
    capabilities: ["video-t2v", "video-i2v", "video-r2v", "video-fl2v"],
    name: "H3 导演台（文生/图生/参考生/首尾帧）",
  },
};

/** 生成内置模板的能力包列表（模型已按实际目录归类） */
export async function builtinPacks(comfyRoot) {
  const idx = await modelIndex(comfyRoot);
  const out = [];

  for (const [tplId, meta] of Object.entries(BUILTIN_CAPS)) {
    const spec = MODELS[tplId];
    if (!spec || !spec.template) continue;
    let models = [];
    try {
      const { workflow } = await loadTemplate(tplId);
      models = extractModels(workflow).map((file) => {
        const hit = idx.get(String(file).toLowerCase());
        return {
          file: String(file).split(/[\\/]/).pop(),   // 去掉子目录，交给下面 dir 字段
          subPath: String(file).includes("\\") || String(file).includes("/") ? String(file) : "",
          dir: hit?.dir || guessDir(file),
          bytes: undefined,
        };
      });
    } catch {
      models = [];
    }
    out.push({
      schema: "omni-canvas.pack/1",
      id: `builtin:${tplId}`,
      name: meta.name,
      capability: meta.capability,
      capabilities: meta.capabilities,
      source: "builtin",
      models,
      customNodes: [],
    });
  }
  return out;
}

function guessDir(file) {
  const f = String(file).toLowerCase();
  if (/lora/.test(f)) return "loras";
  if (/vae/.test(f)) return "vae";
  if (/clip|text_enc/.test(f)) return "text_encoders";
  if (/seedvr/.test(f)) return "SEEDVR2";
  return "unet";
}
