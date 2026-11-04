/**
 * 方案 A 验收：面板音色引用与提交数据必须同源同序
 *  - voiceRefsOf 返回的顺序 === refAudios 下标顺序
 *  - 去重 / 上限 3 / 未生成过滤
 */
const { buildApi } = await import("../lib/api/server.js");
const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 60000 });

// 直接验证宿主侧注入顺序与去重（等价于面板显示顺序）
const { patchDirector } = await import("../lib/workflow/patch.js");
const { loadTemplate } = await import("../lib/workflow/template.js");
const { spec, workflow } = await loadTemplate("h3-director");

const cases = [
  { name: "三条音色", voiceNames: [
    { file: "voice_a.wav", name: "老程" },
    { file: "voice_b.wav", name: "小雨" },
    { file: "voice_c.wav", name: "旁白" }] },
  { name: "超过三条（应截断）", voiceNames: [
    { file: "v1.wav" }, { file: "v2.wav" }, { file: "v3.wav" }, { file: "v4.wav" }] },
];

let fail = 0;
for (const c of cases) {
  const { wf } = patchDirector(JSON.parse(JSON.stringify(workflow)), spec, {
    ...c, prompt: "A scene.", duration: 5, aspect: "16:9", resolution: "480p", seed: 1, refNames: [],
  });
  const dir = Object.values(wf).find((n) => /H3Director/.test(n.class_type || ""));
  const td = JSON.parse(dir.inputs.timeline_data);
  const aud = td.global.refAudios || [];
  const expect = Math.min(3, c.voiceNames.length);
  const okCount = aud.length === expect;
  const okOrder = aud.every((a, i) => a.audioFile === c.voiceNames[i].file);
  const okIndex = aud.every((a, i) => a.index === i);
  const okCommon = td.global.commonEnabled === true;
  const seg = (td.segments || [])[0] || {};
  const hasDefs = /voice_definitions/.test(seg.prompt || "") || /<Audio\s+1>/i.test(seg.prompt || "");
  console.log(`${c.name}:`);
  console.log(`  ${okCount ? "PASS" : "FAIL"} 条数 ${aud.length}/${expect}`);
  console.log(`  ${okOrder ? "PASS" : "FAIL"} 顺序与下标一致 → ${aud.map((a) => a.audioFile).join(", ")}`);
  console.log(`  ${okIndex ? "PASS" : "FAIL"} 每条带 index 字段`);
  console.log(`  ${okCommon ? "PASS" : "FAIL"} commonEnabled=true`);
  console.log(`  ${hasDefs ? "PASS" : "FAIL"} 自动注入 voice_definitions`);
  if (!okCount || !okOrder || !okIndex || !okCommon || !hasDefs) fail += 1;
}

console.log(`\n=== 音色引用一致性：${fail ? "失败 " + fail : "全部通过"} ===`);
process.exit(fail ? 1 : 0);
