const { buildApi } = await import("../lib/api/server.js");
const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 120000 });

const { argosReady, argosLangs, argosTranslateFast } = await import("../lib/text/argos-worker.js");

console.log("worker ready:", argosReady(), "langs:", argosLangs());
try {
  const out = await argosTranslateFast("The living room holds the brown leather sofa.");
  console.log("直接调用 Argos OK:", out.slice(0, 40));
} catch (e) {
  console.log("直接调用 Argos 失败:", String(e.message).slice(0, 150));
}
console.log("ready after:", argosReady());

try {
  const r = await api["prompt.translate"]({ text: "The door opens and she bows.", direction: "en2zh", provider: "argos" });
  console.log("路由结果:", JSON.stringify(r).slice(0, 200));
} catch (e) {
  console.log("路由失败:", String(e.message).slice(0, 200));
  console.log(String(e.stack || "").split("\n").slice(0, 5).join("\n"));
}
