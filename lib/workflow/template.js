/**
 * 内置模板：读取 templates/*.json。
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MODELS } from "./models.js";

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));

export async function loadTemplate(model) {
  const spec = MODELS[model];
  if (!spec) throw new Error(`未知模型: ${model}`);
  const raw = await readFile(join(HERE, "..", "templates", spec.template), "utf8");
  return { spec, workflow: JSON.parse(raw) };
}
