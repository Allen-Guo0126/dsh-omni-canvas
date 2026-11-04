/**
 * 能力包端到端：伪造一个"缺模型"的包 → 预检报缺 → 下载（带进度/断点）→ 复检变 ready
 * 用完清理：删除测试模型与测试包。
 */
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const { buildApi } = await import("../lib/api/server.js");

const COMFY = "E:/ComfyUI-aki-new";
const PACKS = join(homedir(), ".dsh", "omni-canvas.packs");
const TEST_FILE = "__omni_pack_test__.safetensors";
const TEST_PACK_ID = "pack-e2e-test";

// 造一个 2MB 测试文件
const payload = Buffer.alloc(2 * 1024 * 1024, 7);
const sha = createHash("sha256").update(payload).digest("hex");

// 带 Range 支持的静态服务（验证断点续传）
const server = createServer((req, res) => {
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d+)-/.exec(range);
    const start = m ? Number(m[1]) : 0;
    res.writeHead(206, {
      "content-length": payload.length - start,
      "content-range": `bytes ${start}-${payload.length - 1}/${payload.length}`,
    });
    res.end(payload.subarray(start));
  } else {
    res.writeHead(200, { "content-length": payload.length });
    res.end(payload);
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/model.safetensors`;
console.log("测试下载源:", url);

// 写测试包
await mkdir(PACKS, { recursive: true });
const packFile = join(PACKS, `${TEST_PACK_ID}.pack.json`);
await writeFile(packFile, JSON.stringify({
  schema: "omni-canvas.pack/1",
  id: TEST_PACK_ID,
  name: "端到端测试包",
  capability: "image-t2i",
  workflow: { file: "test.json", json: { nodes: [], links: [] } },
  inputs: {}, outputs: {},
  models: [
    { file: "moss_image_sft_bf16.safetensors", dir: "unet" },              // 已存在
    { file: TEST_FILE, dir: "unet", bytes: 2 * 1024 * 1024, sha256: sha,   // 缺失
      source: { url } },
  ],
  customNodes: [],
}, null, 2), "utf8");

const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, { comfyUrl: "http://127.0.0.1:8188", comfyRoot: COMFY });

let fail = 0;
const ok = (m, c, extra = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${m}${extra ? "  " + extra : ""}`); if (!c) fail += 1; };

try {
  // ① 预检：应报缺 1 个
  const pf = await api["pack.preflight"]({ id: TEST_PACK_ID });
  ok("① 预检报告缺失模型", (pf.missing || []).some((m) => m.file === TEST_FILE), `缺 ${pf.missing.length} 个`);
  ok("① 估算所需空间", Number(pf.needBytes) > 0, `${(Number(pf.needBytes) / 1024 / 1024).toFixed(1)}MB`);

  // ② 下载（先写一半 .part 模拟断点）
  const partPath = join(COMFY, "models", "unet", `${TEST_FILE}.part`);
  await mkdir(join(COMFY, "models", "unet"), { recursive: true });
  await writeFile(partPath, payload.subarray(0, 1024 * 1024));
  console.log("已预置 1MB 断点文件，验证续传…");

  const dl = await api["pack.download"]({ id: TEST_PACK_ID, file: TEST_FILE });
  const taskId = (dl.started || []).find((s) => s.taskId)?.taskId;
  ok("② 下载任务已启动", Boolean(taskId), String(taskId));

  let last = null;
  for (let i = 0; i < 120; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    const list = (await api["pack.downloads"]()).tasks || [];
    last = list.find((t) => t.id === taskId);
    if (last && ["done", "failed"].includes(last.status)) break;
  }
  ok("② 下载完成", last?.status === "done", `status=${last?.status} err=${last?.error || ""} 进度=${last?.percent}%`);

  const installed = join(COMFY, "models", "unet", TEST_FILE);
  const st = await stat(installed).catch(() => null);
  ok("② 文件已落盘到 models/unet", Boolean(st), st ? `${(st.size / 1024 / 1024).toFixed(1)}MB` : "不存在");
  if (st) {
    const got = createHash("sha256").update(await readFile(installed)).digest("hex");
    ok("② sha256 校验一致", got === sha, got.slice(0, 12));
  }

  // ③ 复检：应变为 ready（节点为空、模型齐）
  const pf2 = await api["pack.preflight"]({ id: TEST_PACK_ID });
  ok("③ 复检通过（不再缺模型）", (pf2.missing || []).length === 0, `缺 ${pf2.missing.length}`);
} finally {
  server.close();
  await rm(join(COMFY, "models", "unet", TEST_FILE), { force: true });
  await rm(join(COMFY, "models", "unet", `${TEST_FILE}.part`), { force: true });
  await rm(packFile, { force: true });
  console.log("已清理测试文件与测试包");
}

console.log(`\n=== 能力包端到端：${fail ? "失败 " + fail : "全部通过"} ===`);
process.exit(fail ? 1 : 0);
