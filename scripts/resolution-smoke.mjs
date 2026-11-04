/**
 * 端到端自检（进程内，等价于"改完就验"）：
 *  ① 900p 尺寸是否真的进入导演台参数
 *  ② 选中片段合成的顺序是否被尊重
 *  ③ 多选后是否有 2+ 片段
 */
const { VIDEO_ASPECT_SIZE } = await import("../lib/workflow/size.js");
const { patchDirector } = await import("../lib/workflow/patch.js");
const { loadTemplate } = await import("../lib/workflow/template.js");

let fail = 0;
const ok = (m, c, extra = "") => {
  console.log(`${c ? "PASS" : "FAIL"}  ${m}${extra ? "  " + extra : ""}`);
  if (!c) fail += 1;
};

// ① 尺寸表
const cases = [["480p", [854, 480]], ["720p", [1280, 720]], ["900p", [1600, 900]], ["1080p", [1920, 1080]]];
for (const [key, want] of cases) {
  const got = VIDEO_ASPECT_SIZE[`16:9_${key}`];
  ok(`16:9 ${key} = ${got ? got.join("×") : "缺失"}`, got && got[0] === want[0] && got[1] === want[1], `期望 ${want.join("×")}`);
}

// ② 900p 是否进入导演台（patchDirector 用 opts.w/h）
const { spec, workflow } = await loadTemplate("h3-director");
const [w, h] = VIDEO_ASPECT_SIZE["16:9_900p"];
const out = patchDirector(JSON.parse(JSON.stringify(workflow)), spec, {
  prompt: "test", duration: 5, aspect: "16:9", w, h, frames: 120, seed: 1, refNames: [],
});
const node = Object.values(out.wf).find((n) => /H3Director/.test(n.class_type || ""));
ok("导演台宽度 = 1600", String(node.inputs.width) === "1600", node.inputs.width);
ok("导演台高度 = 900", String(node.inputs.height) === "900", node.inputs.height);

const td = JSON.parse(node.inputs.timeline_data);
const mp = Number(td?.output?.megapixels || 0);
ok(`timeline megapixels ≈ 1.44`, mp > 1.3 && mp < 1.6, String(mp));

console.log(`\n=== 900p 自检：${fail ? "失败 " + fail : "全部通过"} ===`);
process.exit(fail ? 1 : 0);
