/**
 * 提交前归一化：把「复述素材特征」的写法自动改成「引用写法」。
 *
 * 这是**第一道防线**（生成时自动生效），机检 prompt.lint 只是第二道（提示用户）。
 *
 * 规则：
 *   <Subject 1> is 卢远，二十多岁，短黑发，橄榄绿夹克…   →  <Subject 1> is the subject in <Picture 1>.
 *   <Audio 1> is the voice of 卢远：干、平、中低男声…      →  <Audio 1> is the voice of <Subject 1>.
 *   正文 "With a dry, flat, slow voice he says:"          →  "He says:"
 */

const TIMBRE_ADJ = [
  "dry", "flat", "slow", "quick", "clipped", "soft", "high", "low", "mid-low", "deep",
  "husky", "raspy", "gravelly", "breathy", "nasal", "unhurried", "gentle", "airy",
  "苍老", "沙哑", "低沉", "高亢", "甜美", "低沉沙哑",
];

/** 从 "is XXX, ..." 里取一个短名字（≤16 字、无逗号/冒号、不含特征词） */
const FEATURE_HINTS = /hair|jacket|jeans|shirt|dress|pajama|slipper|headband|towel|sofa|table|window|blind|door|shelf|wall|street|lane|room|男|女|岁|发|衣|裤|裙|沙发|桌|窗|门|墙|街|房/i;
function shortName(rest) {
  const head = String(rest).split(/[,，:：;(（]/)[0].trim();
  if (!head) return "";
  if (head.length > 16) return "";
  if (FEATURE_HINTS.test(head)) return "";
  return head;
}

/** <Subject N> … <Picture M> 映射 */
function subjectPictureMap(text) {
  const map = new Map();
  for (const line of String(text).split(/\n/)) {
    const m = /^<Subject\s+(\d+)>[^\n]*?<Picture\s+(\d+)>/i.exec(line.trim());
    if (m) map.set(Number(m[1]), Number(m[2]));
  }
  return map;
}

/** 名字 → Subject 编号（用于音色行回填） */
function nameSubjectMap(text) {
  const map = new Map();
  for (const line of String(text).split(/\n/)) {
    const m = /^<Subject\s+(\d+)>\s+is\s+([^\n]*)$/i.exec(line.trim());
    if (!m) continue;
    const name = shortName(m[2].replace(/<Picture\s+\d+>/gi, ""));
    if (name) map.set(name.toLowerCase(), Number(m[1]));
  }
  return map;
}

export function normalizeReferencePrompt(text) {
  let out = String(text || "");
  if (!out.trim()) return out;

  const subjPic = subjectPictureMap(out);
  const nameSubj = nameSubjectMap(out);
  let changed = 0;

  // ① Subject 定义行：一律压成引用（保留 "the person/space" 之类角色词更自然，但统一为 subject 最安全）
  out = out.replace(/^(<Subject\s+(\d+)>\s+is\s+)([^\n]*)$/gim, (line, head, idx, rest) => {
    const pic = subjPic.get(Number(idx)) || Number(idx);
    const name = shortName(rest.replace(/<Picture\s+\d+>/gi, ""));
    const hasPicture = /<Picture\s+\d+>/i.test(line);
    const cleaned = rest.replace(/<Picture\s+\d+>/gi, "").replace(/^[\s:：,，-]+/, "").trim();
    const alreadyMinimal = hasPicture && cleaned === "" ;
    if (alreadyMinimal) return line;
    changed += 1;
    // 只保留名字 + 引用，丢掉所有外观特征
    return name
      ? `${head}${name}, shown in <Picture ${pic}>.`
      : `${head}the subject in <Picture ${pic}>.`;
  });

  // ② Audio 定义行：只保留「谁的音色」
  out = out.replace(/^(<Audio\s+(\d+)>\s+is\s+the\s+voice\s+of\s+)([^\n]*)$/gim, (line, head, _idx, rest) => {
    const m = /<Subject\s+(\d+)>/i.exec(rest);
    const name = shortName(rest);
    const byName = name ? nameSubj.get(name.toLowerCase()) : undefined;
    const subjIdx = m ? Number(m[1]) : byName;
    changed += 1;
    return subjIdx ? `${head}<Subject ${subjIdx}>.` : (name ? `${head}${name}.` : `${head}the voice reference.`);
  });

  // ③ 正文：删掉「with a <形容词> voice」这类音色修饰
  const adjPattern = TIMBRE_ADJ.join("|");
  const before = out;
  out = out.replace(new RegExp(`\\bwith an? (?:${adjPattern})(?:[,\\s]+(?:${adjPattern}))* voice\\b[,，]?\\s*`, "gi"), "");
  out = out.replace(new RegExp(`\\bwith an? (?:${adjPattern})(?:[,\\s]+(?:${adjPattern}))*,? (?:and )?(?:${adjPattern})?\\s*voice\\b[,，]?\\s*`, "gi"), "");
  out = out.replace(new RegExp(`\\bthe (?:young |old |middle-aged )?(?:man|woman|person) with an? (?:${adjPattern})(?:[,\\s]+(?:${adjPattern}))* voice\\b`, "gi"), "the speaker");
  if (out !== before) changed += 1;

  // ④ CNY 写法：「用苍老的声音说」→「说」
  out = out.replace(/用[^，。；\n]{0,8}的声音/g, "");

  // 收敛空行
  out = out.replace(/\n{3,}/g, "\n\n");
  return out;
}
