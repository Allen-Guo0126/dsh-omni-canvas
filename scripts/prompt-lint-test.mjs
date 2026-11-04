/**
 * 机检单测：复述特征必须被警告，极简引用必须通过。
 */
import { lintPrompt } from "../lib/text/prompt-lint.js";

const BAD = `subject_definitions:
<Subject 1> is Lu Yuan, the young Chinese man in Picture 1: mid-twenties, short black slightly messy hair, an olive green utility jacket worn open over a white t-shirt, dark jeans.
<Subject 2> is the living room in Picture 2: a brown leather sofa, a low walnut coffee table, wooden blinds.
<Audio 1> is the voice of Lu Yuan: a dry, flat, mid-low male voice in his mid-twenties, unhurried.

summary:
she bows.

detailed_description:
With a dry, flat, slow voice he says: <d>[Chinese] 你好。</d>`;

const GOOD = `subject_definitions:
<Subject 1> is the person in <Picture 1>.
<Subject 2> is the space in <Picture 2>.
<Audio 1> is the voice of <Subject 1>.
<Audio 2> is the voice of <Subject 2>.

summary:
reference generation — she bows.

detailed_description:
<Audio 1> says: <d>[Chinese] 你好。</d>`;

let fail = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!cond) fail += 1;
};

const bad = lintPrompt(BAD, { hasRefImages: true, hasRefAudios: true });
console.log("违规样本警告数:", bad.warnings.length);
bad.warnings.forEach((w) => console.log("   -", w.code, ":", w.msg.slice(0, 60)));
check("违规样本被拦截", !bad.ok);
check("命中 subject 复述", bad.warnings.some((w) => w.code === "subject-overdescribed"));
check("命中 audio 复述", bad.warnings.some((w) => w.code === "audio-overdescribed"));
check("命中正文音色描述", bad.warnings.some((w) => w.code === "timbre-in-body"));

const good = lintPrompt(GOOD, { hasRefImages: true, hasRefAudios: true });
console.log("\n合规样本警告数:", good.warnings.length);
good.warnings.forEach((w) => console.log("   -", w.code, ":", w.msg.slice(0, 60)));
check("合规样本通过", good.ok);

const unbound = lintPrompt("<Subject 1> is the person in <Picture 1>.", { hasRefImages: false });
check("引用图但没连图 → 警告", unbound.warnings.some((w) => w.code === "picture-unbound"));

console.log(`\n=== 提示词机检：${fail ? "失败 " + fail : "全部通过"} ===`);
process.exit(fail ? 1 : 0);
