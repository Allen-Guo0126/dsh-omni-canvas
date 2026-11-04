/**
 * 重写「场2 初次看房」与「场3 催租对峙」，并逐镜出片。
 * 原则：一镜一动作、机位固定、不描述外貌（只用 <Picture N> 引用）、台词极少。
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const { buildApi } = await import("../lib/api/server.js");
const { mutateCanvas, getCanvas, readJson, writeJson } = await import("../lib/core/fs.js");

const PID = "e6abc13b";
const COMFY = "E:/ComfyUI-aki-new";
const config = { comfyUrl: "http://127.0.0.1:8188", comfyRoot: COMFY, requestTimeoutMs: 30 * 60 * 1000 };
const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, config);

const BASE = (subject, line) => `subject_definitions:
<Subject 1> is Lu Yuan, shown in <Picture 1>.
<Subject 2> is Juhua, shown in <Picture 2>.
<Subject 3> is the living room, shown in <Picture 3>.

summary:
${line}

retention_analysis:
<Subject 1> (image): fully_preserved.
<Subject 2> (image): fully_preserved.
<Subject 3> (image): fully_preserved.

detailed_description:
Reference generation, photorealistic live-action short drama; warm daylight from the window on the right, soft film grain. Static camera. One single action only; no cuts, no camera movement, no other person enters or leaves.${subject}

overall_soundscape:
Quiet room tone, natural cloth movement, no music.

non_diegetic_music:
None.`;

/** 8 个新镜（场2 4 镜 + 场3 4 镜） */
const NEW = [
  {
    row: "r-da819a35", dur: 6,
    shot: "S03 门铃·换鞋", desc: "1镜。中景·45°侧·固定——陆远已经站在门内，右手把门拉开一半（结果态入场），门外橘花低头看着地上的一双拖鞋；她抬脚，脚从过大的拖鞋里滑出半只，她立刻用脚尖勾回去，肩膀一缩（可爱的小窘迫，不是动作戏）。无台词，只有门轴与拖鞋声。",
    prompt: BASE(" Lu Yuan simply opens the door halfway and holds it; the girl outside looks down at an oversized pair of house slippers. She lifts her foot, the slipper slips off halfway, and she quickly hooks it back with her toes while her shoulders pull in slightly, embarrassed. Nobody else moves.", "A tenant arrives at the door for the first time; she is too small for the slippers."),
  },
  {
    row: "r-d329061a", dur: 7,
    shot: "S04 看房·踮脚摸墙", desc: "1镜。中近景·45°侧·固定——橘花在房间中央踮起脚尖，伸手摸了摸墙上的相框边缘，又轻轻按了两下窗台，最后把手贴在窗玻璃上试温度；陆远站在她身后不远处，双手交握，紧张地跟着她的视线转头。无台词。",
    prompt: BASE(" Juhua stands in the middle of the room and rises on her toes to touch the edge of a framed picture on the wall, then taps the window sill twice and rests one palm on the glass. Lu Yuan stands behind her, hands clasped, turning his head to follow whatever she looks at. Only these two motions happen.", "She inspects the rented room seriously; he nervously watches her."),
  },
  {
    row: "r-b37eb139", dur: 6,
    shot: "S05 房租·硬币", desc: "1镜。插入特写·俯拍·固定——茶几上，一只小手把钱包里的硬币一枚枚推出来排成一行，推到最后一枚时手指按住它停住；画面上方，陆远的手悬着没敢伸过去。无台词，只有硬币落在玻璃上的细响。",
    prompt: BASE(" Close overhead shot: a small hand pushes coins out of a wallet one by one and lines them up on the glass coffee table; when the last coin is placed, the fingers rest on it and stop. Above, a man's hand hovers without reaching in. Nothing else moves.", "She pays the rent in coins, very seriously."),
  },
  {
    row: "r-e584deb3", dur: 6,
    shot: "S06 成交·猫耳发带", desc: "1镜。近景·45°侧·固定——橘花双手把最后一枚硬币推到陆远面前，然后抬手把猫耳发带往上扶了一下，露出一个很确定的笑容（只此一个动作）；陆远在她身后低头看着那排硬币，慢慢点了下头。无台词。",
    prompt: BASE(" Juhua pushes the last coin toward the camera side with both hands, then lifts her cat-ear headband with one hand and gives a confident smile. Lu Yuan, behind her, looks down at the row of coins and gives one slow nod. No other motion.", "Deal closed: the coin row, the cat ears, the nod."),
  },
  {
    row: "r-87e7438c", dur: 6,
    shot: "S07 敲门·王哥登场", desc: "1镜。中景（大门方向）·45°侧·固定——大门关着，门上传来三下克制的敲击，门把手转动，门被推开一半，王哥站在门口没有进来，只是抬手把合约卷在掌心敲了两下。无踹门、无推搡。",
    prompt: BASE(" The front door is closed; three restrained knocks land on it, the handle turns, and the door swings open halfway. A heavyset man stands in the doorway and does not step in; he only taps a rolled-up contract twice against his palm. No kicking, no shoving, nobody else moves.", "The landlord shows up to collect rent, polite but heavy."),
  },
  {
    row: "r-4c11673b", dur: 6,
    shot: "S08 合约拍桌", desc: "1镜。中景·45°侧·固定——王哥把合约卷放到茶几上，手掌压住它往下一按（只此一个动作），身体微微前倾；陆远坐在沙发上，手指抓紧膝盖。无台词。",
    prompt: BASE(" The heavyset man places the rolled contract on the coffee table and presses it down once with his palm, leaning slightly forward. Lu Yuan sits on the sofa and grips his own knee. Only that one press happens; nobody walks.", "The contract lands on the table; the pressure is in the palm."),
  },
  {
    row: "r-7c770576", dur: 7,
    shot: "S09 橘花递钱袋", desc: "1镜。中近景·45°侧·固定——橘花从陆远身后走到茶几侧边，把一个布钱袋轻轻放在合约旁边，手掌在袋子上按了一下；王哥的手停在半空，眼睛看着钱袋。无推搡、无争吵。",
    prompt: BASE(" Juhua steps from behind Lu Yuan to the side of the coffee table and sets a small cloth money pouch gently next to the contract, then rests her palm on it for a moment. The heavyset man's hand stops in mid-air as he looks down at the pouch. No shoving, no arguing.", "She answers the pressure with a money pouch."),
  },
  {
    row: "r-de6ea85f", dur: 6,
    shot: "S10 收钱走人", desc: "1镜。中景（大门方向）·45°侧·固定——王哥拿起钱袋塞进外套内袋，转身跨出门，反手把门带上（门自己合拢）；陆远与橘花站在客厅里没动。无台词。",
    prompt: BASE(" The heavyset man picks up the pouch, tucks it into his coat, turns and steps out through the doorway; the door swings shut behind him on its own. Lu Yuan and Juhua stay where they are in the living room and do not move.", "He takes the money and leaves; the door closes itself."),
  },
];

// ---------- 1) 写入脚本行 ----------
await mutateCanvas(config, PID, (canvas) => {
  const sc = canvas.nodes.find((n) => n.type === "script");
  for (const g of sc.data.groups) {
    for (const row of g.rows || []) {
      const patch = NEW.find((x) => x.row === row.id);
      if (!patch) continue;
      row.cells = {
        ...(row.cells || {}),
        shot: patch.shot, dur: patch.dur, desc: patch.desc, prompt: patch.prompt,
        size: "中景/近景·45°侧·固定", move: "固定（一镜一动作）",
        line: "",
        sound: "SFX only（无台词）",
      };
    }
  }
  // 场标题改名
  for (const g of sc.data.groups) {
    if ((g.rows || []).some((r) => r.id === "r-da819a35")) g.title = "场景2 · 客厅·日（樱花妹初次看房）";
    if ((g.rows || []).some((r) => r.id === "r-87e7438c")) g.title = "场景3 · 客厅·稍后（催租对峙·文斗）";
  }
  return canvas;
});
console.log("✓ 脚本已改写（场2 初次看房 / 场3 催租对峙）");

// ---------- 2) 逐镜出片 ----------
const cv = await getCanvas(config, PID);
const sc = cv.nodes.find((n) => n.type === "script");
const byId = new Map(cv.nodes.map((n) => [n.id, n]));

const results = [];
for (const [i, item] of NEW.entries()) {
  const row = sc.data.groups.flatMap((g) => g.rows || []).find((r) => r.id === item.row);
  const group = sc.data.groups.find((g) => (g.rows || []).some((r) => r.id === item.row));
  const a = row.assets || {};
  const refIds = [...(a.characters || []), a.scene].filter(Boolean);
  const refFiles = refIds.map((id) => byId.get(id)?.data?.file).filter(Boolean);

  // 复用该行已有的视频节点（没生成过就新建）
  let node = cv.nodes.find((n) => n.type === "video" && n.data?.rowId === item.row);
  if (!node) {
    node = {
      id: `n-${Math.random().toString(16).slice(2, 10)}`,
      type: "video", x: -1200 + i * 360, y: 2200, w: 320, h: 420,
      data: { title: item.shot, role: "", prompt: item.prompt, duration: item.dur, aspect: "16:9",
              resolution: "720p", rowId: item.row, groupId: group?.id || "", scriptId: sc.id, status: "" },
    };
    await mutateCanvas(config, PID, (canvas) => {
      canvas.nodes.push(node);
      return canvas;
    });
    cv.nodes.push(node);
  }

  const t0 = Date.now();
  const r = await api["gen.video"]({
    projectId: PID, nodeId: node.id, prompt: item.prompt, mode: "r2v",
    duration: item.dur, aspect: "16:9", resolution: "720p", refFiles,
  });
  if (!r.jobId) { console.log(`✗ ${item.shot} 提交失败`, JSON.stringify(r).slice(0, 120)); continue; }
  console.log(`▶ ${i + 1}/${NEW.length} ${item.shot} 提交 ${r.jobId} (参考图 ${refFiles.length})`);

  let job = {};
  for (let k = 0; k < 300; k += 1) {
    await new Promise((s) => setTimeout(s, 4000));
    job = ((await api["job.get"]({ jobId: r.jobId })).job) || {};
    if (["done", "failed"].includes(job.status)) break;
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`  → ${job.status} ${secs}s ${job.asset?.file || job.error || ""}`);
  results.push({ shot: item.shot, row: item.row, nodeId: node.id, status: job.status, file: job.asset?.file || "", secs, error: job.error || "" });

  // 抽帧拼图
  if (job.asset?.file) {
    const src = join(homedir(), ".dsh", "projects", PID, job.asset.file);
    const outDir = join("E:/Allen/.tmp/qa/scene23");
    await mkdir(outDir, { recursive: true });
    const sheet = join(outDir, `${item.row}.jpg`);
    await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", src,
      "-vf", "fps=1,scale=300:-1,tile=6x2", "-frames:v", "1", sheet]).catch(() => {});
    console.log(`  抽帧: ${sheet}`);
  }
}

await writeJson(join("E:/Allen/.tmp/qa/scene23", "results.json"), results);
console.log("\n=== 出片完成 ===");
for (const r of results) console.log(` ${r.status === "done" ? "✓" : "✗"} ${r.shot} ${r.secs}s ${r.file || r.error}`);
