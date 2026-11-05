/**
 * 翻译降级链验证：伪造一个"总是返回空文本"的模型 → 应自动退到 Argos 并出译文（不再报错）
 */
const { buildApi } = await import("../lib/api/server.js");

// 假 llm：每次都返回空文本 + truncated
const fakeLlm = {
  prepareCall: () => ({
    config: { provider: "fake", model: "empty-model" },
    async *stream() {
      yield { type: "finish", reason: { kind: "max-tokens" } };
    },
  }),
};

const ctx = {
  tools: { register: () => () => {} },
  effect: (fn) => { fn(); return () => {}; },
  webServer: { register: () => () => {} },
  on: () => () => {},
  get: (name) => (name === "llm" ? fakeLlm : undefined),
};

const api = buildApi(ctx, { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 120000 });

const TEXT = `subject_definitions:
<Subject 1> is Lu Yuan, shown in <Picture 1>.

summary:
The door opens and she bows in greeting.

detailed_description:
[Shot 1] Static medium shot; she bows.`;

let fail = 0;
const ok = (m, c, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${m}${extra ? "  " + extra : ""}`); if (!c) fail += 1; };

// provider=dsh 强制走模型 → 模型空 → 应退 Argos
const t0 = Date.now();
try {
  const r = await api["prompt.translate"]({ text: TEXT, direction: "en2zh", provider: "dsh" });
  console.log("结果:", JSON.stringify({ provider: r.provider, seconds: r.seconds, head: String(r.text).slice(0, 50) }));
  ok("模型空输出时未报错", true);
  ok("已退回 Argos 并出译文", String(r.text || "").length > 10);
  ok("标签保留", /<Picture 1>/.test(String(r.text)));
} catch (e) {
  console.log("失败:", String(e.message).slice(0, 120));
  fail += 1;
}
console.log("耗时", ((Date.now() - t0) / 1000).toFixed(1) + "s");

console.log(`\n=== 翻译降级链：${fail ? "失败 " + fail : "全部通过"} ===`);
process.exit(fail ? 1 : 0);
