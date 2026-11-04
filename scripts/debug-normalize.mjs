import { normalizeReferencePrompt } from "../lib/text/prompt-normalize.js";

const T = `<Subject 1> is Lu Yuan, the young Chinese man in Picture 1: mid-twenties, short black hair.
<Audio 1> is the voice of Lu Yuan: a dry, flat, mid-low male voice.`;

console.log("输入:\n" + T);
console.log("\n输出:\n" + normalizeReferencePrompt(T));

// 逐步检查名字映射
import { readFile } from "node:fs/promises";
const src = await readFile("../lib/text/prompt-normalize.js", "utf8");
const m = src.match(/function nameSubjectMap[\s\S]*?\n}/);
console.log("\nnameSubjectMap 源码片段:\n" + (m ? m[0] : "未找到"));
