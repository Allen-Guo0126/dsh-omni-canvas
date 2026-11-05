/**
 * 场2/场3 重制 v3：有台词、有故事、有钩子。
 *
 * 场2 初次看房（喜剧）：破房子 + 房东硬撑 + 她认真到离谱 + 奇葩条件（钉一百个挂钩）
 * 场3 催租对峙（文斗）：王哥上门 → 橘花替付 → 钩子回收（一百个挂钩）
 * 动作仍然压到最低（一镜一动作），台词用 H3 原生中文语音。
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

const buildPrompt = ({ refs, line, body, dialogue, sound }) => {
  const defs = refs.map((r, i) => (r[0] === "room"
    ? `<Subject ${i + 1}> is the living room, shown in <Picture ${i + 1}>.`
    : `<Subject ${i + 1}> is ${r[1]}, shown in <Picture ${i + 1}>.`));
  const retention = refs.map((_, i) => `<Subject ${i + 1}> (image): fully_preserved.`);
  return `subject_definitions:
${defs.join("\n")}

summary:
${line}

retention_analysis:
${retention.join("\n")}

detailed_description:
Reference generation. Photorealistic live-action short drama, warm daylight from the window on the right, soft film grain.
Framing and camera: static tripod shot, medium close-up; the camera stands about 2.5 metres away and the subjects fill roughly 60 percent of the frame height. Faces are clearly visible, three-quarter angle.
The reference pictures define faces, wardrobe and the room only - do NOT copy their wide camera distance.
Both characters are already inside the frame at the very first frame, and the first line is spoken immediately at 00:00.500.
One single physical action only. No cut, no camera movement, nobody enters or leaves.
${body}

dialogue:
${dialogue}

overall_soundscape:
Quiet room tone, cloth movement, natural indoor ambience.${sound ? " " + sound : ""}

non_diegetic_music:
None.`;
};

const SHOTS = [
  {
    row: "r-da819a35", dur: 7, shot: "S03 开门·看房客",
    refs: [["char", "Lu Yuan", NODE.lu], ["char", "Juhua", NODE.juhua], ["room", "", NODE.room]],
    desc: "陆远开门，橘花鞠躬：她是来看房的。他不太相信有人真的会来。",
    body: "Lu Yuan holds the half-open door. Juhua bows once from the doorstep and stays outside the threshold until the last line, then takes one small step in.",
    dialogue: `<Audio 1> says: <d>[Chinese] 打扰了，我在网上看到招租。</d>
<Audio 2> says: <d>[Chinese] 你就是那个只问了一句能住人吗的？</d>
<Audio 1> says: <d>[Chinese] 能住人吗？</d>
<Audio 2> says: <d>[Chinese] ……能。</d>`,
    sound: "One knock on the door, then a door hinge.",
  },
  {
    row: "r-d329061a", dur: 7, shot: "S04 看房·漏雨",
    refs: [["char", "Lu Yuan", NODE.lu], ["char", "Juhua", NODE.juhua], ["room", "", NODE.room]],
    desc: "她环视客厅，说采光好；他老实交代漏雨，她的回答让他无言。",
    body: "Juhua stands in the middle of the living room and slowly looks up at the ceiling. Lu Yuan stands behind her, hands clasped, and answers each line.",
    dialogue: `<Audio 1> says: <d>[Chinese] 采光挺好。</d>
<Audio 2> says: <d>[Chinese] 就是下雨的时候，天花板会漏一点。</d>
<Audio 1> says: <d>[Chinese] 漏雨好啊，我喜欢听雨声。</d>
<Audio 2> says: <d>[Chinese] ……啊？</d>`,
  },
  {
    row: "r-b37eb139", dur: 7, shot: "S05 房租·信封",
    refs: [["char", "Juhua", NODE.juhua], ["char", "Lu Yuan", NODE.lu], ["room", "", NODE.room]],
    desc: "她掏出信封推过去，押一付三；里面是一沓零钱和一张手写清单。",
    body: "Juhua pushes a thick paper envelope across the coffee table toward Lu Yuan. He picks it up, opens the flap and looks inside while she keeps her hands folded.",
    dialogue: `<Audio 1> says: <d>[Chinese] 押一付三，我都算好了。</d>
<Audio 2> says: <d>[Chinese] ……你数了几遍？</d>
<Audio 1> says: <d>[Chinese] 三遍。第四遍怕数错。</d>`,
  },
  {
    row: "r-e584deb3", dur: 8, shot: "S06 条件·一百个挂钩",
    refs: [["char", "Juhua", NODE.juhua], ["char", "Lu Yuan", NODE.lu], ["room", "", NODE.room]],
    desc: "她提出唯一条件：能在墙上钉一百个挂钩吗。他沉默两秒，答应了。",
    body: "Juhua points at the blank wall with one finger. Lu Yuan looks at the wall, then at her, and after a pause gives one small nod.",
    dialogue: `<Audio 1> says: <d>[Chinese] 我有一个请求。我能在墙上钉一百个挂钩吗？</d>
<Audio 2> says: <d>[Chinese] ……可以。</d>
<Audio 1> says: <d>[Chinese] 那成交。以后请多关照，房东先生。</d>`,
  },
  {
    row: "r-87e7438c", dur: 7, shot: "S07 敲门·王哥",
    refs: [["char", "the visitor", NODE.visitor], ["char", "Lu Yuan", NODE.lu], ["room", "", NODE.room]],
    desc: "王哥上门催租，站在门口不进来，语气客气但不容商量。",
    body: "The heavy-set visitor stands in the open doorway with a rolled-up contract in one hand. Lu Yuan stands just inside, facing him, and does not step back.",
    dialogue: `<Audio 1> says: <d>[Chinese] 陆远，三个月了。</d>
<Audio 2> says: <d>[Chinese] 王哥，再宽限几天。</d>
<Audio 1> says: <d>[Chinese] 我今天不是来商量的。</d>`,
    sound: "Three knocks on the door.",
  },
  {
    row: "r-4c11673b", dur: 7, shot: "S08 拍桌·收房",
    refs: [["char", "the visitor", NODE.visitor], ["char", "Lu Yuan", NODE.lu], ["room", "", NODE.room]],
    desc: "他把合约拍在茶几上，说今天不交就收房。",
    body: "The visitor presses the rolled contract down onto the coffee table with his open palm and leans slightly forward. Lu Yuan sits on the sofa with his hands on his knees.",
    dialogue: `<Audio 1> says: <d>[Chinese] 今天不交，这屋我收回去。</d>
<Audio 2> says: <d>[Chinese] 我这周就有活儿了，真的。</d>
<Audio 1> says: <d>[Chinese] 你上周也是这么说的。</d>`,
    sound: "Paper pressed on a wooden table.",
  },
  {
    row: "r-7c770576", dur: 8, shot: "S09 橘花·我付",
    refs: [["char", "Juhua", NODE.juhua], ["char", "the visitor", NODE.visitor], ["room", "", NODE.room]],
    desc: "橘花把钱袋放在合约旁，说他的房租我付。王哥问你是谁，她答：租客。",
    body: "Juhua sets a small cloth money pouch down on the table next to the contract and rests her palm on it. The visitor looks from the pouch up to her face.",
    dialogue: `<Audio 1> says: <d>[Chinese] 他的房租，我付。</d>
<Audio 2> says: <d>[Chinese] 你谁啊？</d>
<Audio 1> says: <d>[Chinese] 租客。今天刚搬进来。</d>`,
  },
  {
    row: "r-de6ea85f", dur: 8, shot: "S10 走人·钩子",
    refs: [["char", "the visitor", NODE.visitor], ["char", "Lu Yuan", NODE.lu], ["room", "", NODE.room]],
    desc: "王哥收钱走人，撂下一句下个月别让我再跑。门关后陆远问为什么帮他，她答：一百个挂钩。",
    body: "The visitor tucks the pouch into his coat and steps out through the doorway; the door swings shut behind him. Lu Yuan stays in the room and turns his head toward the door.",
    dialogue: `<Audio 1> says: <d>[Chinese] 下个月，别让我再跑一趟。</d>
<Audio 2> says: <d>[Chinese] ……你为什么帮我？</d>
<Audio 1> says: <d>[Chinese] 一百个挂钩，你答应了。</d>`,
    sound: "A door closing.",
  },
];

const cv0 = await getCanvas(config, PID);
const byId = new Map(cv0.nodes.map((n) => [n.id, n]));
const sc = cv0.nodes.find((n) => n.type === "script");
const results = [];

for (const [i, s] of SHOTS.entries()) {
  const files = s.refs.map((r) => byId.get(r[2])?.data?.file).filter(Boolean);
  const prompt = buildPrompt({ refs: s.refs, line: s.desc, body: s.body, dialogue: s.dialogue, sound: s.sound });
  console.log(`\n▶ ${i + 1}/${SHOTS.length} ${s.shot} refs=${files.length}`);

  await mutateCanvas(config, PID, (canvas) => {
    const sc2 = canvas.nodes.find((n) => n.type === "script");
    for (const g of sc2.data.groups) {
      for (const r of g.rows || []) {
        if (r.id !== s.row) continue;
        r.cells = {
          ...(r.cells || {}),
          shot: s.shot, dur: s.dur, desc: s.desc, prompt,
          line: s.dialogue.replace(/<[^>]+>/g, "").replace(/\n+/g, " / ").slice(0, 120),
          sound: "原生中文语音 + 房间底噪",
        };
        const chars = new Set(r.assets?.characters || []);
        for (const [kind, , id] of s.refs) if (kind === "char") chars.add(id);
        r.assets = { ...(r.assets || {}), characters: [...chars], scene: r.assets?.scene || NODE.room };
      }
    }
    return canvas;
  });

  const fresh = await getCanvas(config, PID);
  const node = (fresh.nodes || []).find((n) => n.type === "video" && n.data?.rowId === s.row);
  await mutateCanvas(config, PID, (canvas) => {
    const n = canvas.nodes.find((x) => x.id === node.id);
    if (n) {
      n.data = { ...(n.data || {}), status: "", prompt, duration: s.dur, title: s.shot,
                 resolution: "720p", aspect: "16:9", role: "shot" };
    }
    return canvas;
  });

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
  results.push({ shot: s.shot, row: s.row, status: job.status, file: job.asset?.file || "", secs });

  if (job.asset?.file) {
    const src = join(homedir(), ".dsh", "projects", PID, job.asset.file);
    const outDir = "E:/Allen/.tmp/qa/scene23v3";
    await mkdir(outDir, { recursive: true });
    await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", src,
      "-vf", "fps=1,scale=300:-1,tile=8x1", "-frames:v", "1", join(outDir, `${s.row}.jpg`)]).catch(() => {});
  }
}

await writeJson("E:/Allen/.tmp/qa/scene23v3/results.json", results);
console.log("\n=== 完成 ===");
for (const r of results) console.log(` ${r.status === "done" ? "✓" : "✗"} ${r.shot} ${r.secs}s ${r.file || ""}`);
