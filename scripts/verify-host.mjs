/**
 * 运行中宿主（DSH 重启后）的端到端验收：只读 + 一次真实生成。
 * 用法：node scripts/verify-host.mjs [--no-gen]
 */
const API = "http://127.0.0.1:43120/omni-canvas/api/";
const noGen = process.argv.includes("--no-gen");

async function call(method, body = {}, timeoutMs = 240000) {
  const res = await fetch(API + method, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.error || "失败"}`);
  return json.result;
}

const ok = [];
const bad = [];
const log = (st, name, extra = "") => {
  (st === "PASS" ? ok : bad).push(name);
  console.log(`${st.padEnd(5)} ${name.padEnd(44)} ${extra}`);
};

// 1. 绑定与默认
try {
  const list = await call("binding.list");
  const defs = list.defaults || {};
  log("PASS", "binding.list 可用", `默认 ${Object.keys(defs).length} 项`);
  for (const [cap, target] of Object.entries(defs)) {
    if (String(target).startsWith("builtin:")) continue;
    const found = (list.bindings || []).find((b) => b.id === target);
    log(found ? "PASS" : "FAIL", `默认实现存在：${cap}`, String(target));
  }
} catch (e) {
  log("FAIL", "binding.list", String(e.message).slice(0, 120));
}

// 2. 默认实现是否真的被 gen.image 采用
if (!noGen) {
  try {
    const projects = await call("project.list").catch(() => null);
    const projectId = projects?.projects?.[0]?.id || "61e83ea5";
    const r = await call("gen.image", {
      projectId, nodeId: "", prompt: "验收：竹林晨雾里的古装女子",
      aspect: "16:9", resolution: "1K", count: 1,
    });
    const impl = r.impl || "";
    log(impl && impl !== "内置模板" ? "PASS" : "FAIL", "gen.image 使用默认绑定", impl);
    const jid = r.jobId;
    let peak = 0, status = "";
    const t0 = Date.now();
    while (Date.now() - t0 < 300000) {
      await new Promise((r) => setTimeout(r, 3000));
      const g = await call("job.get", { jobId: jid });
      status = g.job?.status || "";
      const p = await call("job.progress", { jobId: jid }).catch(() => ({}));
      const pct = Number(p.percent) || 0;
      if (pct > peak) peak = pct;
      if (status === "done" || status === "failed") break;
    }
    log(status === "done" ? "PASS" : "FAIL", "默认绑定生成完成", `${status} peak=${peak}%`);
  } catch (e) {
    log("FAIL", "gen.image", String(e.message).slice(0, 160));
  }
}

console.log(`\n=== 宿主验收：通过 ${ok.length} / 失败 ${bad.length} ===`);
process.exit(bad.length ? 1 : 0);
