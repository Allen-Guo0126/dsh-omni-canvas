import { sizeFor, widthRatio } from "./size.js";

/** 去掉行尾空白（补丁里替换模板用） */
const cascade = (p) => String(p).replace(/\s+$/, "");
/** 模板补丁：把业务参数写进 UI/API 工作流（提示词、尺寸、参考图、导演台时间线）。 */

export function patchWorkflow(workflow, spec, opts) {
  const wf = JSON.parse(JSON.stringify(workflow));
  // 分辨率档：1K = 1024 长边，2K = 1536 长边（按 32 对齐，Qwen 系在 1.5K 仍稳定）
  const longEdge = opts.resolution === "2K" ? 1536 : spec.longEdge;
  const [w, h] = sizeFor(opts.aspect, longEdge);

  // 图生图：多张参考图 → 新建 LoadImage（用高位 id 避免撞车），
  // 同时接到编码器 images.image_N 与提示词优化节点的 BatchImagesNode。
  if (spec.bind.linkImages && opts.refNames?.length) {
    const enc = wf[spec.bind.linkImages];
    const batch = spec.bind.batchImages ? wf[spec.bind.batchImages] : null;
    if (enc) {
      for (const key of Object.keys(enc.inputs)) {
        if (key.startsWith("images.")) delete enc.inputs[key];
      }
    }
    if (batch) {
      for (const key of Object.keys(batch.inputs)) {
        if (key.startsWith("images.")) delete batch.inputs[key];
      }
    }
    opts.refNames.forEach((name, i) => {
      const nid = String(100 + i);
      wf[nid] = { class_type: "LoadImage", inputs: { image: name } };
      if (enc) enc.inputs[`images.image_${i + 1}`] = [nid, 0];
      if (batch) batch.inputs[`images.image${i}`] = [nid, 0];
    });
  }

  // ResolutionSelector（edit 模板用它决定尺寸）
  if (spec.bind.selector && wf[spec.bind.selector]) {
    const r = widthRatio(w, h);
    const sel = wf[spec.bind.selector];
    sel.inputs.aspect_ratio = r.label;
    sel.inputs.megapixels = Math.max(0.3, Math.round((w * h) / 1e6 * 100) / 100);
  }
  const promptText = cascade(String(opts.prompt || ""));
  if (spec.bind.promptText && wf[spec.bind.promptText]) {
    // 图生图：写进原始提示词节点，让「Edit Prompt Enhancer」链路生效
    wf[spec.bind.promptText].inputs.value = promptText;
  } else if (spec.bind.prompt && wf[spec.bind.prompt]) {
    wf[spec.bind.prompt].inputs.prompt = promptText;
  }
  if (wf[spec.bind.latent]) {
    wf[spec.bind.latent].inputs.width = w;
    wf[spec.bind.latent].inputs.height = h;
    wf[spec.bind.latent].inputs.batch_size = Math.max(1, Math.min(4, opts.count || 1));
  }
  const seed = Number.isFinite(opts.seed) ? opts.seed : Math.floor(Math.random() * 2 ** 31);
  if (wf[spec.bind.seed]) wf[spec.bind.seed].inputs.noise_seed = seed;
  if (wf[spec.bind.save]) wf[spec.bind.save].inputs.filename_prefix = "dsh-canvas/gen";
  return { wf, w, h, seed };
}

/** 视频：改导演台的 timeline_data（提示词 / 参考图 / 时长 / 尺寸）。 */
export function patchDirector(workflow, spec, opts) {
  const wf = JSON.parse(JSON.stringify(workflow));
  const node = wf[spec.bind.director];
  if (!node) throw new Error("模板里没有导演台节点");

  const fps = 24;
  let frames = Math.max(17, Math.round((opts.duration || 6) * fps));
  const lower = frames - ((frames - 1) % 4);
  frames = (frames - lower) <= (lower + 4 - frames) ? lower : lower + 4;

  const tier = opts.resolution === "1080p" ? 1080 : opts.resolution === "480p" ? 480 : 720;
  const [w, h] = sizeFor(opts.aspect || "16:9", tier);
  // 参考生视频：提示词里没写 <Picture N> 时，自动注入指认段（用户无需背标签）
  let prompt = opts.prompt || "";
  const refCount = (opts.refNames || []).length;
  const hasTokens = /<Picture\s+\d+>/i.test(prompt);
  if (refCount && !hasTokens) {
    const lines = ["subject_definitions:"];
    lines.push("<Picture 1> is the main subject of this shot; identity, face, hair and wardrobe come only from it.");
    for (let i = 2; i <= refCount; i++) {
      lines.push(`<Picture ${i}> is the environment / prop reference; keep its layout, materials and light direction.`);
    }
    lines.push("");
    lines.push("retention_analysis:");
    lines.push("<Picture 1>: fully_preserved - identity unchanged; only natural motion moves.");
    prompt = lines.join("\n") + "\n\n" + prompt;
  }

  const td = JSON.parse(node.inputs.timeline_data);
  td.totalFrames = frames;
  td.durationSec = Math.round((frames / fps) * 100) / 100;
  td.width = w;
  td.height = h;
  td.refMaxSize = Math.max(w, h);
  td.global = td.global || {};
  td.global.prompt = prompt;
  const out = (td.output = td.output || {});
  out.width = w;
  out.height = h;
  out.longEdge = Math.max(w, h);
  out.mode = "fixed";
  const r = w / Math.max(1, h);
  out.aspectRatio = r < 0.62 ? "9:16 (竖屏)" : r < 1.15 ? "1:1 (方形)" : "16:9 (宽屏)";

  const refs = (opts.refNames || []).map((name, i) => ({
    index: i, imageFile: name, fileName: "", type: "input", subfolder: "",
  }));
  // 图槽一次钉死：每段全挂全部参考图（H3 Ref2VA <=9），顺序 = 槽位顺序
  if (refs.length) td.global.refs = refs;
  const talking = Array.isArray(opts.talkingSegments) ? opts.talkingSegments
    : (Array.isArray(opts.talking?.segments) ? opts.talking.segments : null);
  if (talking && talking.length) {
    // 数字人口播：N 段，每段独立 prompt + 帧数（每段 4–15s）
    const base = (td.segments && td.segments[0]) || {};
    td.segments = talking.map((t, i) => {
      const f0 = Math.max(17, Math.round((t.seconds || 10) * fps));
      const low = f0 - ((f0 - 1) % 4);
      const ff = (f0 - low) <= (low + 4 - f0) ? low : low + 4;
      const startFrame = talking.slice(0, i).reduce((acc, x) => {
        const f0 = Math.max(17, Math.round((x.seconds || 10) * fps));
        const low = f0 - ((f0 - 1) % 4);
        return acc + ((f0 - low) <= (low + 4 - f0) ? low : low + 4);
      }, 0);
      return {
        ...base,
        id: `${base.id || "seg"}-t${i + 1}`,
        start: startFrame,                       // 段在时间轴上的起始帧（原来全是 0）
        prompt: t.prompt,
        length: ff,
        frameCount: ff,
        durationSec: Math.round((ff / fps) * 100) / 100,
        continuityFromPrev: i > 0,               // 第 2 段起引用上一段做运动引导（原来全 false）
        ...(refs.length ? { refs } : {}),
      };
    });
    td.totalFrames = td.segments.reduce((acc, sg) => acc + (sg.frameCount || 0), 0);
    td.durationSec = Math.round((td.totalFrames / fps) * 100) / 100;
    // 段间引导总开关 + 上下文帧数 + 重绘幅度（口播靠这个接住上一段，否则每段像重开）
    const out2 = (td.output = td.output || {});
    out2.continuityEnabled = true;
    out2.continuityOverlapFrames = Number(out2.continuityOverlapFrames) || 22;
    out2.continuityMode = out2.continuityMode || "continue";
    out2.continuityRedraw = 0.1;
    out2.continuityKeepTail = true;
  } else {
    for (const seg of td.segments || []) {
      seg.prompt = prompt;
      seg.length = frames;
      seg.frameCount = frames;
      seg.durationSec = td.durationSec;
      if (refs.length) seg.refs = refs;
    }
  }
  // 任务类型（i2v / fl2v 等）：导演台的 task_type 与 timeline.global.taskType 都要写
  if (opts.taskType) {
    node.inputs.task_type = opts.taskType;
    td.global.taskType = opts.taskType;
  }
  // 只有在「用图当首/末帧」的模式里才清空参考槽；r2v 的参考图必须保留
  const frameMode = Boolean(opts.startImageName || opts.endImageName);
  if (opts.taskType && frameMode) {
    td.global.refs = [];
    td.global.refAudios = [];
    td.global.refVideos = [];
    td.global.referenceVideo = null;
    for (const seg of td.segments || []) {
      seg.refs = [];
      seg.refAudios = [];
      seg.refVideos = [];
      seg.taskType = "";
    }
  }
  // 图生视频 / 首尾帧：timeline 里有多处"图"的存放点（segments/genImage/shots/keyframes/
   // batchWorkspaces），导演台读的是其中一部分，所以整棵树统一指向上传的图
  if (opts.startImageName || opts.endImageName) {
    const startName = opts.startImageName;
    const endName = opts.endImageName;
    const setImg = (obj, name) => {
      if (obj && typeof obj === "object" && "imageFile" in obj) obj.imageFile = name;
    };
    const walk = (o) => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o.refs)) o.refs = [];
      if (Array.isArray(o.refAudios)) o.refAudios = [];
      if (Array.isArray(o.refVideos)) o.refVideos = [];
      if (startName) {
        if (o.startImage) setImg(o.startImage, startName);
        if (o.genImage) setImg(o.genImage, startName);
        if (Array.isArray(o.keyframes)) o.keyframes.forEach((kf) => { if (kf) kf.imageFile = startName; });
      }
      if (endName && o.endImage) setImg(o.endImage, endName);
      for (const v of Object.values(o)) if (v && typeof v === "object") walk(v);
    };
    walk(td);
    // 首尾帧：keyframes 的最后一个要指到末帧图（walk 里统一写成了首帧）
    if (endName) {
      const kfs = td.keyframes || [];
      if (kfs.length) kfs[kfs.length - 1].imageFile = endName;
      for (const shot of td.shots || []) {
        const sk = shot.keyframes || [];
        if (sk.length) sk[sk.length - 1].imageFile = endName;
        if (shot.endImage) shot.endImage.imageFile = endName;
      }
      for (const seg of td.segments || []) {
        if (seg.endImage) seg.endImage.imageFile = endName;
      }
    }
  }

  // 固定音色：把试听/克隆得到的 wav 作为「参考音频」写进公共参数，H3 会沿用它说话
  if (opts.voiceName) {
    td.global.refAudios = [{ audioFile: String(opts.voiceName), subfolder: "", type: "input" }];
    td.global.commonEnabled = true;
    td.global.commonCollapsed = false;
    for (const seg of td.segments || []) seg.refAudios = [];
  }

  node.inputs.timeline_data = JSON.stringify(td);
  node.inputs.global_prompt = prompt;
  node.inputs.total_frames = String(frames);
  node.inputs.width = String(w);
  node.inputs.height = String(h);
  node.inputs.seed = String(Math.floor(Math.random() * 2 ** 31));
  if (wf[spec.bind.save]) wf[spec.bind.save].inputs.filename_prefix = "dsh-canvas/video";
  if (wf[spec.bind.vhs]) wf[spec.bind.vhs].inputs.filename_prefix = "dsh-canvas/video";
  return { wf, w, h, frames };
}

/**
 * 通用音色注入：把「已上传到 ComfyUI 的音频文件名」写进任意导演台节点的 timeline_data。
 * 用于绑定工作流（用户自己的 H3 工作流）与内置模板两条链路。
 */
export function applyVoiceToDirector(promptGraph, voiceName) {
  if (!voiceName || !promptGraph) return 0;
  let n = 0;
  for (const node of Object.values(promptGraph)) {
    const t = String(node?.class_type || "");
    if (!/Director/i.test(t)) continue;
    const raw = node.inputs?.timeline_data;
    if (typeof raw !== "string") continue;
    try {
      const td = JSON.parse(raw);
      td.global = td.global || {};
      td.global.refAudios = [{ audioFile: String(voiceName), subfolder: "", type: "input" }];
      td.global.commonEnabled = true;
      td.global.commonCollapsed = false;
      for (const seg of td.segments || []) seg.refAudios = [];
      node.inputs.timeline_data = JSON.stringify(td);
      n += 1;
      // 导演台还有独立的 task_type/global_prompt 输入，音色只在 r2v + common 下生效
      if (!node.inputs.task_type || !/r2v/i.test(String(node.inputs.task_type))) {
        node.inputs.task_type = node.inputs.task_type || "r2v";
      }
    } catch {}
  }
  return n;
}
