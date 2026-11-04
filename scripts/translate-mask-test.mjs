/**
 * 翻译占位符保护单测：mask → unmask 必须逐字还原。
 * 不调用模型，只验证"不可译片段"能否原样保留。
 */
import { maskPrompt, unmaskPrompt } from "../lib/text/translate.js";

const SAMPLE = `subject_definitions:
<Subject 1> is Lu Yuan, the young Chinese man in Picture 1: mid-twenties, short black slightly messy hair.
<Subject 2> is Juhua, the young Japanese woman in Picture 2.
<Audio 1> is the voice of Lu Yuan (<Subject 1>). Audio used as-is.

summary:
reference generation — she bows ninety degrees in greeting.

retention_analysis:
<Subject 1> (image): fully_preserved.
<Audio 1> (audio): timbre source only.

detailed_description:
[Shot 1] At 00:03.000, the camera cuts to a medium close-up.
<Audio 1> says in an off-screen voiceover: <d>[Chinese] 一个樱花妹，搬进了我的次卧。</d>
[Shot 2] At 00:06.000, the camera cuts again.
<Audio 2> says: <d>[Japanese] おかえりなさい！</d>

overall_soundscape:
Quiet warm room tone.

non_diegetic_music:
Acoustic guitar.`;

const { masked, tokens } = maskPrompt(SAMPLE);
console.log(`占位符数量: ${tokens.length}`);
console.log("掩码后前 200 字:", masked.slice(0, 200).replace(/\n/g, " "));

let fail = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!cond) fail += 1;
};

// ① 不可译片段必须全部被掩码
check("台词标签已掩码", !masked.includes("<d>") && !masked.includes("</d>"));
check("引用标签已掩码", !/<(Subject|Picture|Audio|Video)\s+\d+>/.test(masked));
check("语言码已掩码", !/\[(Chinese|Japanese)\]/.test(masked));
check("时间码已掩码", !/\d{2}:\d{2}\.\d{3}/.test(masked));
check("镜头标号已掩码", !/\[Shot \d+\]/.test(masked));
check("结构标题已掩码", !/subject_definitions:|retention_analysis:|non_diegetic_music:/.test(masked));

// ② 模拟"翻译"（原样返回 + 轻微改动中文），再还原必须等于原文
const fakeTranslated = masked.replace("她九十度鞠躬打招呼", "SHE BOWS").replace("she bows ninety degrees in greeting.", "她九十度鞠躬打招呼。");
const restored = unmaskPrompt(fakeTranslated, tokens);

const missing = tokens.filter((t) => !restored.includes(t));
check("所有占位符都还原成功", missing.length === 0, missing.length ? missing.join(",") : "");
check("还原后含 <d> 标签", restored.includes("<d>") && restored.includes("</d>"));
check("还原后含 <Audio 1>/<Audio 2>", restored.includes("<Audio 1>") && restored.includes("<Audio 2>"));
check("还原后含时间码", restored.includes("00:03.000") && restored.includes("00:06.000"));
check("还原后含结构标题", restored.includes("subject_definitions:"));

// ③ 占位符丢失时必须抛错（防写回半成品）
let threw = false;
try {
  unmaskPrompt("完全丢掉了占位符的文本", tokens);
} catch {
  threw = true;
}
check("占位符丢失时抛错", threw);

console.log(`\n=== 占位符保护：${fail ? "失败 " + fail : "全部通过"} ===`);
process.exit(fail ? 1 : 0);
