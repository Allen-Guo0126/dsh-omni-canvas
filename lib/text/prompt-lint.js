/**
 * 提示词机检：防止「复述素材特征」。
 *
 * 核心规则（写进 docs/提示词审查清单.md 章节 Z）：
 *   人物/场景/道具只用 <Picture N> 引用，音色只用 <Audio N> 引用，
 *   写得越多 H3 越会按文字重画，导致人物漂移 / 音色被覆盖。
 */

const TIMBRE_WORDS = [
  "husky", "raspy", "gravelly", "breathy", "nasal", "deep voice", "low voice", "high voice",
  "soft voice", "flat voice", "dry voice", "aged voice", "young voice", "male voice", "female voice",
  "mid-low", "baritone", "soprano", "mid-twenties voice",
  "苍老", "沙哑", "低沉", "高亢", "甜美", "烟嗓", "气泡音", "萝莉音", "御姐音", "嗓音", "音色",
];

const FEATURE_WORDS = [
  "hair", "bangs", "jacket", "t-shirt", "jeans", "pajamas", "slippers", "headband", "towel",
  "mid-twenties", "young man", "young woman", "tall", "slim", "pale", "freckles",
  "sofa", "coffee table", "blinds", "brick wall", "bedroom door", "bookshelf",
  "发型", "刘海", "外套", "夹克", "牛仔裤", "睡衣", "拖鞋", "发箍", "沙发", "茶几", "百叶窗",
];

/** 提取 subject_definitions / retention_analysis 里的定义行 */
function definitionLines(text) {
  const out = [];
  for (const raw of String(text || "").split(/\n/)) {
    const line = raw.trim();
    const m = /^<(Subject|Audio)\s+(\d+)>\s+is\s+(.*)$/i.exec(line);
    if (m) out.push({ kind: m[1].toLowerCase(), index: Number(m[2]), rest: m[3], line });
  }
  return out;
}

const hitWords = (s, list) => {
  const low = s.toLowerCase();
  return list.filter((w) => low.includes(w.toLowerCase()));
};

/**
 * @returns {{ok: boolean, warnings: Array<{code: string, msg: string}>}}
 */
export function lintPrompt(text, { hasRefImages = false, hasRefAudios = false } = {}) {
  const warnings = [];
  const src = String(text || "");
  if (!src.trim()) return { ok: true, warnings };

  const defs = definitionLines(src);

  // ① 人物/场景定义过长（> 60 字符或命中特征词）
  for (const d of defs) {
    if (d.kind === "subject") {
      const words = hitWords(d.rest, FEATURE_WORDS);
      const tooLong = d.rest.replace(/<Picture\s+\d+>/gi, "").trim().length > 60;
      if (words.length || tooLong) {
        warnings.push({
          code: "subject-overdescribed",
          msg: `<Subject ${d.index}> 复述了外观（${words.slice(0, 3).join("/") || "描述过长"}）。改成「<Subject ${d.index}> is the person in <Picture N>.」，让参考图决定长相。`,
        });
      }
    }
    // ② 音色定义里出现音色形容词
    if (d.kind === "audio") {
      const words = hitWords(d.rest, TIMBRE_WORDS);
      if (words.length) {
        warnings.push({
          code: "audio-overdescribed",
          msg: `<Audio ${d.index}> 复述了音色（${words.slice(0, 3).join("/")}）。改成「<Audio ${d.index}> is the voice of <Subject N>.」，否则参考音频会被文字覆盖。`,
        });
      }
    }
  }

  // ③ 正文（非台词）里出现音色形容词
  const withoutDialogue = src.replace(/<d>[\s\S]*?<\/d>/gi, "");
  const timbreInBody = hitWords(withoutDialogue, TIMBRE_WORDS);
  if (timbreInBody.length) {
    warnings.push({
      code: "timbre-in-body",
      msg: `正文出现音色描述（${timbreInBody.slice(0, 3).join("/")}），会与参考音频打架。说话人只用 <Audio N> 指认。`,
    });
  }

  // ④ 用了 <Picture N>/<Audio N> 但没连对应素材
  if (!hasRefImages && /<Picture\s+\d+>/i.test(src)) {
    warnings.push({ code: "picture-unbound", msg: "提示词引用了 <Picture N>，但这张卡没有连参考图。" });
  }
  if (!hasRefAudios && /<Audio\s+\d+>/i.test(src)) {
    warnings.push({ code: "audio-unbound", msg: "提示词引用了 <Audio N>，但这张卡没有连音频卡。" });
  }

  return { ok: warnings.length === 0, warnings };
}
