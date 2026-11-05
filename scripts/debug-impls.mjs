import { builtinPacks } from "../lib/packs/builtin.js";
import { listImplementations } from "../lib/packs/impls.js";

const ROOT = "E:/ComfyUI-aki-new";
const config = { comfyUrl: "http://127.0.0.1:8188", comfyRoot: ROOT };

const packs = await builtinPacks(ROOT);
console.log("builtinPacks:", packs.length);
for (const p of packs) console.log("  ", p.id, "|", p.name, "| wf:", Boolean(p.workflow?.json), "| models:", (p.models || []).length);

const res = await listImplementations(config, ROOT, { includeUnbound: false });
console.log("\nimpls:", res.impls?.length, "stats:", JSON.stringify(res.stats));
for (const i of res.impls || []) {
  console.log("  ", String(i.name).slice(0, 26).padEnd(28), "bound=" + i.bound, "key=" + (i.hash || i.key), "caps=" + (i.capabilities || []).join(","));
}
