/**
 * 翻译性能自检：Argos 快通道 vs DSH 并行，输出实际耗时与质量抽样。
 */
const { buildApi } = await import("../lib/api/server.js");

const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 120000 });

const SHORT = `subject_definitions:
<Subject 1> is Lu Yuan, shown in <Picture 1>.
<Audio 1> is the voice of <Subject 1>.

summary:
The bedroom door opens and she steps into the living room.`;

const LONG = Array.from({ length: 12 }).map((_, i) =>
  `[Shot ${i + 1}] At 00:0${(i % 9) + 1}.000, the camera cuts to a medium close-up, 45-degree side angle, static; ` +
  `<Subject 1> tilts his head and the warm daylight falls across the brick wall behind him. ` +
  `<Audio 1> says: <d>[Chinese] episode line number ${i + 1} goes here.</d>`).join("\n\n");

let fail = 0;
const ok = (m, c, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${m}${extra ? "  " + extra : ""}`); if (!c) fail += 1; };

for (const [name, text, provider] of [
  ["短文本 argos", SHORT, "argos"],
  ["短文本 auto", SHORT, "auto"],
  ["长文本 auto(→dsh)", LONG, "auto"],
]) {
  const t0 = Date.now();
  try {
    const r = await api["prompt.translate"]({ text, direction: "en2zh", provider });
    const dt = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`\n■ ${name}: provider=${r.provider} 服务端计时=${r.seconds}s 实测=${dt}s 段=${r.segments ?? 1} 命中=${r.cacheHits ?? 0}`);
    console.log("   译文:", String(r.text).slice(0, 90).replace(/\n/g, " / "));
    ok(`${name} 有译文`, String(r.text || "").length > 10);
    ok(`${name} 标签保留`, /<Picture 1>|<Audio 1>/.test(String(r.text)));
  } catch (e) {
    const msg = String(e.message || e);
    if (/ctx\.llm 不存在|模型服务不可用/.test(msg)) {
      console.log(`\n■ ${name}: SKIP（进程内没有 DSH 模型服务，实际宿主可用）`);
      continue;
    }
    console.log(`\n■ ${name}: 失败`, msg.slice(0, 120));
    fail += 1;
  }
}

console.log(`\n=== 翻译自检：${fail ? "失败 " + fail : "全部通过"} ===`);
process.exit(fail ? 1 : 0);
