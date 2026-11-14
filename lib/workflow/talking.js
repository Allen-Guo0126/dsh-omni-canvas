export const TALKING_MAX_SEG_SEC = 15;

export const TALKING_CHARS_PER_SEC = 5.0;

/**
 * 数字人口播：文案切段 + 六段式提示词（纯函数，无 IO）。
 * 分段规则：按气口（。！？；）切，5 字/秒，单段 4–15s，总长 ≤120s。
 */

/** 数字人口播：文案 → 按气口切段（每段 <= segmentSec，总时长 <= 120s） */
export const TALKING_MAX_SEC = 120;

export function splitTalkingScript(script, segmentSec = 15, maxSec = TALKING_MAX_SEC) {
  const segSec = Math.min(TALKING_MAX_SEG_SEC, Math.max(4, Number(segmentSec) || 15));
  const text = String(script || "")
    .replace(/\r/g, "")
    .replace(/[`*#_>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) throw new Error("口播文案不能为空");

  // 1) 按气口切句（。！？；… 以及换行已归一）
  const sentences = text.split(/(?<=[。！？；!?;])/).map((x) => x.trim()).filter(Boolean);
  // 2) 单句过长再按逗号切
  const units = [];
  for (const s0 of sentences) {
    const budget = Math.floor(segSec * TALKING_CHARS_PER_SEC * 0.92);
    if (s0.length <= budget) { units.push(s0); continue; }
    let cur = "";
    for (const part of s0.split(/(?<=[，,、])/)) {
      if ((cur + part).length > budget && cur) { units.push(cur); cur = part; }
      else cur += part;
    }
    if (cur) units.push(cur);
  }
  // 3) 合并到接近段长（不超过 budget），并统计
  const budget = Math.floor(segSec * TALKING_CHARS_PER_SEC * 0.92);
  const segs = [];
  let cur = "";
  for (const u of units) {
    if (cur && (cur + u).length > budget) { segs.push(cur); cur = u; }
    else cur += u;
  }
  if (cur) segs.push(cur);

  // 4) 计算时长 + 总上限
  const est = (t) => Math.min(segSec, Math.max(4, Math.round((t.length / TALKING_CHARS_PER_SEC) * 10) / 10));
  let out = segs.map((t, i) => ({ idx: i + 1, text: t, chars: t.length, seconds: est(t) }));
  let total = out.reduce((a, b) => a + b.seconds, 0);
  if (total > maxSec) {
    const cut = [];
    let acc = 0;
    for (const sg of out) {
      if (acc + sg.seconds > maxSec) break;
      cut.push(sg); acc += sg.seconds;
    }
    out = cut;
    total = acc;
    out.push({ idx: out.length + 1, text: "", chars: 0, seconds: 0, truncated: true });
    return { segments: out.filter((x) => !x.truncated), totalSeconds: Math.round(total * 10) / 10,
             truncated: true, droppedChars: text.length - out.reduce((a, b) => a + b.chars, 0),
             segmentSec: segSec, maxSeconds: maxSec };
  }
  return { segments: out, totalSeconds: Math.round(total * 10) / 10,
           truncated: false, segmentSec: segSec, maxSeconds: maxSec };
}

/** 数字人口播内置模板：三档参考图组合，各自独立的提示词分支与校验 */
export const TALKING_PRESETS = [
  {
    id: "talking-combined",
    name: "单图 · 人物带场景",
    desc: "一张图里已有人物和所处环境；口播就在这个环境里进行",
    needs: { person: 1, scene: 0 }, refMode: "combined",
  },
  {
    id: "talking-person-scene",
    name: "双图 · 人物 + 场景",
    desc: "一张人物图 + 一张空场景图；把人物放进场景里口播",
    needs: { person: 1, scene: 1 }, refMode: "person+scene",
  },
  {
    id: "talking-portrait",
    name: "单图 · 纯人像（棚拍）",
    desc: "只有人物、背景干净；给中性背景与柔和光位，适合知识口播",
    needs: { person: 1, scene: 0 }, refMode: "portrait",
  },
];

export function talkingPresetById(id) {
  return TALKING_PRESETS.find((x) => x.id === id || x.id === `builtin:${id}`) || TALKING_PRESETS[0];
}

/** 口播段间轮换的手部动作（可见、具体、不否定；每段一句，避免全片静止） */
export function gestureLine(index) {
  // 手势纪律：
  // ① 手只在画框下三分之一、与身体同深度（不靠近镜头，否则 H3 会把手画大且皮肤过饱和）
  // ② 不朝镜头翻转掌心、不触碰衣物/脸部（易被理解成整理衣领、擦脸等怪动作）
  // ③ 只写可见事实，不写否定句
  const lines = [
    "<Subject 1> keeps both hands in the lower third of the frame at the same distance as the body, the right hand lifting a few centimetres and settling back.",
    "<Subject 1> keeps the hands low and still, the right fingers closing once in a small beat as the stress lands.",
    "<Subject 1> shifts the weight slightly onto the left hip, the shoulders following, the hands staying low and quiet.",
    "<Subject 1> leans in by a hand's width toward the camera, the hands staying in the lower third of the frame.",
    "<Subject 1> turns the left shoulder a few degrees toward the light, the hands staying low and relaxed.",
    "<Subject 1> opens one hand outward at waist height for a single beat, then brings it back level with the other.",
  ];
  return lines[index % lines.length];
}

/** 手部纪律（每段都写，防止手被画大/皮肤过饱和） */
export function handAnchorLine() {
  return "The hands stay small in the lower third of the frame, at the same distance from the camera as the body; the skin tone stays natural and even; the fingers stay relaxed.";
}

/** 数字人口播：单段六段式提示词（同一人物图槽，固定机位，本段台词） */
export function buildTalkingSegmentPrompt(seg, opts) {
  const { scene, index, total, refMode } = opts;
  const isLast = index === total - 1;
  const pic1 = "Picture 1";

  const personDef = `<Subject 1> is the person in ${pic1}: keep the face, hairstyle and clothing exactly as in ${pic1}.`;
  let sceneDef = "";
  let placement = "";
  let retain = `<Subject 1> (image): fully_preserved - face and clothing follow ${pic1}.`;

  if (refMode === "person+scene" && scene) {
    sceneDef = `\n<Subject 2> is the room in Picture 2: keep its furniture, walls, window and light direction exactly as in Picture 2.`;
    placement = `<Subject 1> stands in the room of <Subject 2>, the light of that room falls on the face from the side; the furniture of <Subject 2> keeps its places.`;
    retain += `\n<Subject 2> (image): fully_preserved - room follows Picture 2.`;
  } else if (refMode === "portrait") {
    placement = `<Subject 1> stands against a quiet neutral grey wall, soft light falls on the face from the front left, the background stays plain and uncluttered.`;
  } else {
    placement = `<Subject 1> keeps the environment of ${pic1} around the body; walls, furniture and the light direction stay as in ${pic1}.`;
  }

  // 口播一律固定机位、固定景别。
  // 旧版每三段里有两段写 "the camera slides forward ten centimetres over three seconds"，
  // 下一段又回到中景 —— 成片里就是"画面不断放大、然后突然弹回"。整段口播不需要运镜。
  const camera = "Medium close-up of <Subject 1> at eye level, camera locked off on a tripod: no push-in, no zoom, no drift, the framing stays identical in every part.";
  const tail = isLast
    ? "The framing holds still to the last frame."
    : "The posture stays the same at the cut, so the next part continues from exactly this framing.";

  return [
    "subject_definitions:",
    personDef + sceneDef,
    "",
    "summary:",
    `<Subject 1> speaks to camera, part ${index + 1} of ${total}.`,
    "",
    "retention_analysis:",
    retain,
    "",
    "detailed_description:",
    "Live-action realism, natural skin texture, shallow depth of field, fine film grain.",
    placement,
    camera,
    gestureLine(index),
    handAnchorLine(),
    "<Subject 1> blinks and breathes slowly, the shoulders stay level, the head turns only a few degrees; the voice stays the same calm voice through the whole part:",
    `<d>[Chinese] ${seg.text}</d>`,
    tail,
    "",
    "overall_soundscape:",
    "Room tone under the voice, a soft air handling hum, the voice close to the microphone.",
    "",
    "non_diegetic_music:",
    "No music, only a very low room tone bed.",
  ].join("\n");
}

