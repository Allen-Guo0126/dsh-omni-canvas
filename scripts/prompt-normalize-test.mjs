/**
 * 归一化单测：用你之前那套"复述特征"的提示词，验证提交时被改写成引用写法。
 */
import { normalizeReferencePrompt } from "../lib/text/prompt-normalize.js";
import { lintPrompt } from "../lib/text/prompt-lint.js";

const BAD = `subject_definitions:
<Subject 1> is Lu Yuan, the young Chinese man in Picture 1: mid-twenties, short black slightly messy hair, an olive green utility jacket worn open over a white t-shirt, dark jeans.
<Subject 2> is the living room in Picture 2: a brown leather sofa, a low walnut coffee table, wooden blinds.
<Audio 1> is the voice of Lu Yuan: a dry, flat, mid-low male voice in his mid-twenties, unhurried.

summary:
reference generation — she bows.

detailed_description:
With a dry, flat, slow voice he says: <d>[Chinese] 你好。</d>
The young woman with a soft, high, unhurried voice says: <d>[Chinese] 谢谢。</d>`;

const out = normalizeReferencePrompt(BAD);
console.log("=== 归一化后 ===");
console.log(out);
console.log("=== 校验 ===");

let fail = 0;
const check = (m, c, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${m}${extra ? "  " + extra : ""}`); if (!c) fail += 1; };

check("Subject 1 保留名字+引用", /<Subject 1> is Lu Yuan, shown in <Picture 1>\./.test(out));
check("Subject 2 已改为引用", /<Subject 2> is the subject in <Picture 2>\./.test(out));
check("Audio 1 已改为「谁的音色」", /<Audio 1> is the voice of <Subject 1>\./.test(out));
check("正文去掉 with a ... voice", !/with a (dry|flat|slow)/i.test(out));
check("正文去掉 the young woman with a ... voice", !/the young woman with a/i.test(out));
check("台词仍在", out.includes("<d>[Chinese] 你好。</d>") && out.includes("<d>[Chinese] 谢谢。</d>"));

const lintAfter = lintPrompt(out, { hasRefImages: true, hasRefAudios: true });
console.log("\n归一化后机检警告数:", lintAfter.warnings.length);
lintAfter.warnings.forEach((w) => console.log("   -", w.code, w.msg.slice(0, 70)));
check("归一化后机检通过", lintAfter.ok);

console.log(`\n=== 归一化：${fail ? "失败 " + fail : "全部通过"} ===`);
process.exit(fail ? 1 : 0);
