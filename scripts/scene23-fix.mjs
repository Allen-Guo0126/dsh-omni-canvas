/**
 * 修正重跑：S03（补橘花参考）、S07（去掉空镜，门一开场就在开）、S09（补王哥参考）
 * 参考图按节点 id 显式指定，避免"取第二个角色"取错人。
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const { buildApi } = await import("../lib/api/server.js");
const { mutateCanvas, getCanvas, writeJson } = await import("../lib/core/fs.js");

const PID = "e6abc13b";
const config = { comfyUrl: "http://127.0.0.1:8188", comfyRoot: "E:/ComfyUI-aki-new", requestTimeoutMs: 30 * 60 * 1000 };
const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, config);

const NODE = { lu: "n-7d1ffa93", juhua: "n-a89bf3f9", visitor: "n-37856f05", room: "n-43158354" };

const CASES = [
  {
    row: "r-da819a35", dur: 6, shot: "S03 门铃·换鞋",
    refs: [["char", "Lu Yuan", NODE.lu], ["char", "Juhua", NODE.juhua], ["room", "", NODE.room]],
    desc: "1镜。中近景·45°侧·固定——开场两人都已在画内：陆远扶半开的门，橘花低头看地上那双过大的拖鞋；她抬脚，拖鞋滑掉一半，脚尖勾回，肩膀缩了一下。无台词。",
    body: "At 00:00.000 Lu Yuan already holds the half-open front door and Juhua already stands inside the doorway, looking down at an oversized pair of house slippers. At 00:01.000 she lifts her right foot and the slipper slips off halfway. At 00:03.000 she hooks it back with her toes and her shoulders pull in, embarrassed.",
  },
  {
    row: "r-87e7438c", dur: 6, shot: "S07 敲门·王哥登场",
    refs: [["char", "the visitor", NODE.visitor], ["room", "", NODE.room]],
    desc: "1镜。中景（大门方向）·45°侧·固定——开场门已经被推开一半，王哥站在门口不进来，用合约卷在掌心敲两下，目光扫过客厅。不踹门、不推搡。",
    body: "At 00:00.000 the front door is already half open and the heavy-set visitor already stands in the doorway without stepping inside. At 00:01.000 he taps a rolled-up contract twice against his open palm and his eyes move across the living room. He does not enter, does not kick, does not shove anything.",
  },
  {
    row: "r-7c770576", dur: 7, shot: "S09 橘花递钱袋",
    refs: [["char", "Juhua", NODE.juhua], ["char", "the visitor", NODE.visitor], ["room", "", NODE.room]],
    desc: "1镜。中近景·45°侧·固定——橘花走到茶几侧边，把布钱袋放在合约旁，手掌轻按在袋子上；王哥停在桌前，手悬在半空低头看钱袋。不推搡、不争吵。",
    body: "At 00:00.000 Juhua already stands at the side of the coffee table. At 00:01.000 she sets a small cloth money pouch down next to the contract, and at 00:02.500 she rests her palm on it. The heavy-set visitor stands at the table, his hand stops in mid-air, and he looks down at the pouch.",
  },
];

const buildPrompt = ({ refs, line, body, sound }) => {
  const defs = refs.map((r, i) => {
    const idx = i + 1;
    return r[0] === "room"
      ? `<Subject ${idx}> is the living room, shown in <Picture ${idx}>.`
      : `<Subject ${idx}> is ${r[1]}, shown in <Picture ${idx}>.`;
  });
  const retention = refs.map((_, i) => `<Subject ${i + 1}> (image): fully_preserved.`);
  return `subject_definitions:
${defs.join("\n")}

summary:
${line}

retention_analysis:
${retention.join("\n")}

detailed_description:
Reference generation. Photorealistic live-action short drama, warm daylight from the window on the right, soft film grain.
Framing and camera: static tripod shot, medium close-up; the camera stands about 2.5 metres away and the subject fills roughly 60 percent of the frame height. FACES ARE CLEARLY VISIBLE, three-quarter angle.
The reference pictures define faces, wardrobe and the room only - do NOT copy their wide camera distance.
All characters named above are already inside the frame at the very first frame, and the action begins immediately at 00:00.000.
One single action only. No cut, no camera movement, nobody else enters or leaves, no scene change.
${body}

overall_soundscape:
${sound}

non_diegetic_music:
None.`;
};

const cv0 = await getCanvas(config, PID);
const byId = new Map(cv0.nodes.map((n) => [n.id, n]));
const sc = cv0.nodes.find((n) => n.type === "script");
const results = [];

for (const [i, c] of CASES.entries()) {
  const files = c.refs.map((r) => byId.get(r[2])?.data?.file).filter(Boolean);
  const prompt = buildPrompt({ refs: c.refs, line: c.desc.slice(0, 90), body: c.body,
    sound: "Quiet room tone, cloth movement, no music." });
  console.log(`\n▶ ${i + 1}/${CASES.length} ${c.shot} 参考图 ${files.length} 张`);

  // 同步剧本行：提示词 + 参考图绑定（S03 补橘花，S09 补王哥）
  await mutateCanvas(config, PID, (canvas) => {
    const sc2 = canvas.nodes.find((n) => n.type === "script");
    for (const g of sc2.data.groups) {
      for (const r of g.rows || []) {
        if (r.id !== c.row) continue;
        r.cells = { ...(r.cells || {}), shot: c.shot, dur: c.dur, desc: c.desc, prompt, line: "", sound: "SFX only（无台词）" };
        const chars = new Set(r.assets?.characters || []);
        for (const [kind, , id] of c.refs) if (kind === "char") chars.add(id);
        r.assets = { ...(r.assets || {}), characters: [...chars], scene: r.assets?.scene || NODE.room };
      }
    }
    return canvas;
  });

  const fresh = await getCanvas(config, PID);
  let node = (fresh.nodes || []).find((n) => n.type === "video" && n.data?.rowId === c.row);
  await mutateCanvas(config, PID, (canvas) => {
    const n = canvas.nodes.find((x) => x.id === node.id);
    if (n) n.data = { ...(n.data || {}), status: "", prompt, duration: c.dur };
    return canvas;
  });

  const t0 = Date.now();
  const r = await api["gen.video"]({ projectId: PID, nodeId: node.id, prompt, mode: "r2v",
    duration: c.dur, aspect: "16:9", resolution: "720p", refFiles: files });
  if (!r.jobId) { console.log("  ✗ 提交失败", JSON.stringify(r).slice(0, 100)); continue; }

  let job = {};
  for (let k = 0; k < 300; k += 1) {
    await new Promise((res) => setTimeout(res, 4000));
    job = ((await api["job.get"]({ jobId: r.jobId })).job) || {};
    if (["done", "failed"].includes(job.status)) break;
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`  → ${job.status} ${secs}s ${job.asset?.file || job.error || ""}`);
  results.push({ shot: c.shot, row: c.row, status: job.status, file: job.asset?.file || "", secs });

  if (job.asset?.file) {
    const src = join(homedir(), ".dsh", "projects", PID, job.asset.file);
    const outDir = "E:/Allen/.tmp/qa/scene23";
    await mkdir(outDir, { recursive: true });
    await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", src,
      "-vf", "fps=1,scale=300:-1,tile=6x2", "-frames:v", "1", join(outDir, `${c.row}.jpg`)]).catch(() => {});
  }
}

await writeJson("E:/Allen/.tmp/qa/scene23/fix-results.json", results);
console.log("\n=== 修正完成 ===");
for (const r of results) console.log(` ${r.status === "done" ? "✓" : "✗"} ${r.shot} ${r.secs}s ${r.file}`);
