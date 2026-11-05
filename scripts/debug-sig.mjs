import { extractModels } from "../lib/packs/manager.js";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { loadBindings } from "../lib/workflow/bindings.js";

const normModel = (name) => String(name)
  .toLowerCase()
  .replace(/\.(safetensors|gguf|ckpt|pth|bin|pt)$/i, "")
  .replace(/[-_.](int8|int4|bf16|fp8|fp16|fp32|fp4|q4_k_m|q8_0|q4|convrot|scaled|nvfp4|awq|ema|fro|turbo|v\d+([-_.]\d+)*)$/gi, "")
  .replace(/[-_.]{2,}/g, "-");

const sig = (arr) => arr.map((f) => normModel(basename(String(f)))).filter(Boolean).sort().join("|");

const pack = JSON.parse(await readFile("packs/builtin/qwen-t2i-fast.pack.json", "utf8"));
console.log("出厂包 qwen-fast 模型:");
for (const m of pack.models) console.log("  ", m.file, "→", normModel(basename(m.file)));
console.log("  sig:", sig(pack.models.map((m) => m.file)));

const bs = await loadBindings();
for (const b of bs) {
  if (!b.id.includes("0738be")) continue;
  const file = b.workflow?.file;
  const wf = JSON.parse(await readFile(file, "utf8"));
  const models = extractModels(wf);
  console.log("\n你的绑定（Qwen 加速文生）模型:");
  for (const m of models) console.log("  ", m, "→", normModel(basename(m)));
  console.log("  sig:", sig(models));
}
