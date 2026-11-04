/**
 * 场2 / 场3 重制 v2：
 *  - 参考图索引按实际顺序生成（陆远 / 来客 / 房间）
 *  - 强制「首帧人物已在画内」「明确机位距离与景别」
 *  - 一镜一动作，逐镜出片 + 抽帧
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

const buildPrompt = ({ refs, line, body, sound = "Quiet room tone, natural cloth movement, no music." }) => {
  const defs = refs.map((r, i) => {
    const idx = i + 1;
    if (r.kind === "room") return `<Subject ${idx}> is the living room, shown in <Picture ${idx}>.`;
    return `<Subject ${idx}> is ${r.name}, shown in <Picture ${idx}>.`;
  });
  const retention = refs.map((r, i) => `<Subject ${i + 1}> (image): fully_preserved.`);
  return `subject_definitions:
${defs.join("\n")}

summary:
${line}

retention_analysis:
${retention.join("\n")}

detailed_description:
Reference generation. Photorealistic live-action short drama, warm daylight from the window on the right, soft film grain.
Framing and camera: static tripod shot, medium close-up; the camera stands about 2.5 metres from the subject and the subject fills roughly 60 percent of the frame height. FACES ARE CLEARLY VISIBLE, three-quarter angle.
The reference pictures define wardrobe, faces and the room only — do NOT copy the wide camera distance of any reference picture.
Both characters are already inside the frame at the very first frame, and the action listed below begins immediately at 00:00.000.
One single action only. No cut, no camera movement, no extra person entering or leaving, no scene change.
${body}

overall_soundscape:
${sound}

non_diegetic_music:
None.`;
};

/** 每镜：rowId / 时长 / 中文描述 / 英文动作正文 / 是否需要王哥 */
const SHOTS = [
  {
    row: "r-da819a35", dur: 6, shot: "S03 门铃·换鞋",
    desc: "1镜。中近景·45°侧·固定——开场陆远与橘花就都站在门口画内：陆远右手扶着半开的门，橘花低头看脚下那双明显过大的拖鞋；她抬脚，拖鞋从脚上滑掉一半，她用脚尖勾回去，肩膀缩了一下。无台词。",
    body: "At 00:00.000 Lu Yuan already holds the half-open front door with his right hand and Juhua already stands just inside the doorway looking down at an oversized pair of house slippers. At 00:01.000 she lifts her right foot and the slipper slips off halfway. At 00:03.000 she hooks it back onto her foot with her toes and her shoulders pull in, embarrassed. Nobody walks across the room.",
  },
  {
    row: "r-d329061a", dur: 7, shot: "S04 看房·摸窗",
    desc: "1镜。中近景·45°侧·固定——橘花在窗边踮起脚，伸手摸了摸窗框，手掌贴上冰凉的玻璃；陆远站在她身后一步，双手交握跟着她转头。无台词。",
    body: "At 00:00.000 Juhua already stands beside the window and rises on her toes. At 00:01.000 her fingers touch the window frame, and at 00:03.000 her palm presses flat on the glass. Lu Yuan stands one step behind her with his hands clasped, turning his head to follow what she looks at.",
  },
  {
    row: "r-b37eb139", dur: 6, shot: "S05 房租·硬币",
    desc: "1镜。插入特写·俯拍·固定——一只小手把硬币一枚枚推到玻璃茶几上排成一行，最后一枚放好后手指按住不动；上方陆远的手悬着没敢靠近。无台词。",
    body: "Overhead close-up of the glass coffee table. At 00:00.000 a small hand pushes coins out of a wallet one by one and lines them up. At 00:04.000 the last coin is placed and the fingers rest on it without moving. A man's hand hovers above the table and does not come closer.",
  },
  {
    row: "r-e584deb3", dur: 6, shot: "S06 成交·猫耳",
    desc: "1镜。近景·45°侧·固定——橘花双手把最后一枚硬币轻轻推到桌沿，然后抬手把猫耳发带扶了一下，露出确定的笑；陆远在后方看着那排硬币，慢慢点头。无台词。",
    body: "At 00:00.000 Juhua pushes the last coin toward the table edge with both hands. At 00:02.000 she lifts her cat-ear headband with one hand and gives a confident smile. Lu Yuan, standing behind her, looks down at the row of coins and nods once, slowly.",
  },
  {
    row: "r-87e7438c", dur: 6, shot: "S07 敲门·王哥登场", visitor: true,
    desc: "1镜。中景（大门方向）·45°侧·固定——大门关着，门上三下克制的敲击，门把手转动，门被推开一半，王哥站在门口没有进来，只用合约卷在掌心敲了两下。不踹门、不推搡。",
    body: "At 00:00.000 the closed front door receives three restrained knocks. At 00:01.500 the handle turns and the door swings open halfway. The heavy-set visitor stands in the doorway and does not step inside; at 00:03.000 he taps a rolled-up contract twice against his open palm.",
    sound: "Three knocks on wood, a door hinge, two soft taps of paper on a palm.",
  },
  {
    row: "r-4c11673b", dur: 6, shot: "S08 合约拍桌", visitor: true,
    desc: "1镜。中景·45°侧·固定——王哥把合约卷放到茶几上，手掌压住往下一按；陆远坐在沙发上，手指抓紧膝盖。无台词。",
    body: "At 00:00.000 the heavy-set visitor places the rolled contract on the coffee table. At 00:01.500 he presses it down once with his open palm and leans slightly forward. Lu Yuan sits on the sofa and his fingers tighten on his own knee.",
    sound: "Paper on glass, a low room tone, cloth movement.",
  },
  {
    row: "r-7c770576", dur: 7, shot: "S09 橘花递钱袋",
    desc: "1镜。中近景·45°侧·固定——橘花走到茶几侧边，把布钱袋轻轻放在合约旁边，手掌按在袋子上；王哥的手停在半空。不推搡、不争吵。",
    body: "At 00:00.000 Juhua already stands at the side of the coffee table. At 00:01.000 she sets a small cloth money pouch down next to the contract, and at 00:02.500 rests her palm on it. The visitor's hand stops in mid-air above the table and he looks down at the pouch.",
    visitor: true,
  },
  {
    row: "r-de6ea85f", dur: 6, shot: "S10 收钱走人", visitor: true,
    desc: "1镜。中景（大门方向）·45°侧·固定——王哥拿起钱袋塞进外套内袋，转身跨出门，门在身后自己合拢；陆远与橘花站在原地没动。无台词。",
    body: "At 00:00.000 the visitor picks the pouch up from the coffee table. At 00:01.000 he tucks it into his coat pocket and turns toward the doorway. At 00:02.500 he steps out and the door swings shut behind him. Lu Yuan and Juhua stay in place and do not move.",
    sound: "Cloth, a coin pouch, a door closing.",
  },
];

const cv = await getCanvas(config, PID);
const sc = cv.nodes.find((n) => n.type === "script");
const byId = new Map(cv.nodes.map((n) => [n.id, n]));

const results = [];
for (const [i, s] of SHOTS.entries()) {
  const rows = sc.data.groups.flatMap((g) => g.rows || []);
  const row = rows.find((r) => r.id === s.row);
  const group = sc.data.groups.find((g) => (g.rows || []).some((r) => r.id === s.row));
  const a = row?.assets || {};
  const charIds = (a.characters || []).filter(Boolean);
  const sceneId = a.scene || "";

  // 参考图顺序：陆远 / 来客 / 房间
  const refs = [];
  const files = [];
  const lu = byId.get(charIds[0]);
  if (lu?.data?.file) { refs.push({ kind: "char", name: "Lu Yuan" }); files.push(lu.data.file); }
  const visitorNode = charIds.find((id) => id !== charIds[0] || s.visitor);
  if (s.visitor) {
    const v = charIds.map((id) => byId.get(id)).find((n) => n && n.id !== charIds[0]);
    if (v?.data?.file) { refs.push({ kind: "char", name: "the visitor" }); files.push(v.data.file); }
  } else if (charIds[1]) {
    const j = byId.get(charIds[1]);
    if (j?.data?.file) { refs.push({ kind: "char", name: "Juhua" }); files.push(j.data.file); }
  }
  const room = byId.get(sceneId);
  if (room?.data?.file) { refs.push({ kind: "room" }); files.push(room.data.file); }

  const prompt = buildPrompt({ refs, line: s.desc.slice(0, 90), body: s.body, sound: s.sound });
  console.log(`\n▶ ${i + 1}/${SHOTS.length} ${s.shot} 参考图 ${files.length} 张 ${JSON.stringify(refs.map((r) => r.name || "room"))}`);

  // 写回脚本行
  await mutateCanvas(config, PID, (canvas) => {
    const sc2 = canvas.nodes.find((n) => n.type === "script");
    for (const g of sc2.data.groups) {
      for (const r of g.rows || []) {
        if (r.id !== s.row) continue;
        r.cells = { ...(r.cells || {}), shot: s.shot, dur: s.dur, desc: s.desc, prompt, line: "", sound: "SFX only（无台词）" };
      }
    }
    return canvas;
  });

  // 复用/新建节点
  const fresh = await getCanvas(config, PID);
  let node = (fresh.nodes || []).find((n) => n.type === "video" && n.data?.rowId === s.row);
  if (!node) {
    node = { id: `n-${Math.random().toString(16).slice(2, 10)}`, type: "video",
      x: -1600 + i * 340, y: 2600, w: 320, h: 420,
      data: { title: s.shot, prompt, duration: s.dur, aspect: "16:9", resolution: "720p",
              rowId: s.row, groupId: group?.id || "", scriptId: sc.id, status: "" } };
    await mutateCanvas(config, PID, (canvas) => { canvas.nodes.push(node); return canvas; });
  } else {
    await mutateCanvas(config, PID, (canvas) => {
      const n = canvas.nodes.find((x) => x.id === node.id);
      if (n) { n.data = { ...(n.data || {}), status: "", prompt, duration: s.dur }; }
      return canvas;
    });
  }

  const t0 = Date.now();
  const r = await api["gen.video"]({ projectId: PID, nodeId: node.id, prompt, mode: "r2v",
    duration: s.dur, aspect: "16:9", resolution: "720p", refFiles: files });
  if (!r.jobId) { console.log("  ✗ 提交失败", JSON.stringify(r).slice(0, 100)); continue; }

  let job = {};
  for (let k = 0; k < 300; k += 1) {
    await new Promise((res) => setTimeout(res, 4000));
    job = ((await api["job.get"]({ jobId: r.jobId })).job) || {};
    if (["done", "failed"].includes(job.status)) break;
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`  → ${job.status} ${secs}s ${job.asset?.file || job.error || ""}`);
  results.push({ shot: s.shot, row: s.row, nodeId: node.id, status: job.status, file: job.asset?.file || "", secs, error: job.error || "" });

  if (job.asset?.file) {
    const src = join(homedir(), ".dsh", "projects", PID, job.asset.file);
    const outDir = "E:/Allen/.tmp/qa/scene23";
    await mkdir(outDir, { recursive: true });
    await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", src,
      "-vf", "fps=1,scale=300:-1,tile=6x2", "-frames:v", "1", join(outDir, `${s.row}.jpg`)]).catch(() => {});
  }
}

await writeJson("E:/Allen/.tmp/qa/scene23/results.json", results);
console.log("\n=== 完成 ===");
for (const r of results) console.log(` ${r.status === "done" ? "✓" : "✗"} ${r.shot} ${r.secs}s ${r.file || r.error}`);
