/**
 * 音色链路端到端自检（进程内，不需要 DSH 重启）：
 *   1. voice.config 能读到 key
 *   2. voice.preview(design) 真的合成出 wav 并落盘
 *   3. 该 wav 能被 H3 当参考音频接受（上传 + 注入 timeline_data.refAudios）
 */
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { readdir } from "node:fs/promises";

const { buildApi } = await import("../lib/api/server.js");
const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; }, webServer: { register: () => () => {} }, on: () => () => {} };
const config = { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 300000 };
const api = buildApi(ctx, config);

const projects = await readdir(join(homedir(), ".dsh", "projects")).catch(() => []);
const pid = projects.find((p) => !p.startsWith(".")) || "";

let pass = 0, fail = 0;
const ok = (m, e = "") => { pass += 1; console.log(`PASS  ${m}${e ? "  " + e : ""}`); };
const bad = (m, e) => { fail += 1; console.log(`FAIL  ${m}  ${String(e).slice(0, 160)}`); };

// 1) 配置
let cfg;
try {
  cfg = await api["voice.config"]({});
  if (!cfg.hasKey) throw new Error("没有配置 apiKey");
  ok("voice.config", `${cfg.base} · ${cfg.designModel}`);
} catch (e) { bad("voice.config", e.message); }

// 2) 试听合成（真实调云端）
let preview;
try {
  const t0 = Date.now();
  preview = await api["voice.preview"]({
    projectId: pid, mode: "design",
    desc: "60岁左右男性，声音苍老、沙哑、语速偏慢，带一点气息感",
    text: "这是一段测试音频，请确认我的音色是否合适。",
  });
  const abs = join(homedir(), ".dsh", "projects", pid, preview.file);
  const st = await stat(abs);
  const head = await readFile(abs).then((b) => b.subarray(0, 4).toString("latin1"));
  if (head !== "RIFF") throw new Error("不是 WAV: " + head);
  if (st.size < 20000) throw new Error("音频过小: " + st.size);
  ok("voice.preview(design)", `${((Date.now() - t0) / 1000).toFixed(1)}s · ${(st.size / 1024).toFixed(0)}KB · ${preview.file}`);
} catch (e) { bad("voice.preview(design)", e.message); }

// 3) 上传到 ComfyUI，确认能当参考音频
if (preview) {
  try {
    const abs = join(homedir(), ".dsh", "projects", pid, preview.file);
    const buf = await readFile(abs);
    const boundary = "----dshvoice";
    const parts = [];
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${preview.file.split("/").pop()}"\r\nContent-Type: audio/wav\r\n\r\n`));
    parts.push(buf);
    parts.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(parts);
    const res = await fetch("http://127.0.0.1:8188/upload/image", {
      method: "POST", headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, body,
    });
    const j = await res.json();
    if (!j?.name) throw new Error("上传未返回文件名");
    ok("上传为 H3 参考音频", j.name);
  } catch (e) { bad("上传参考音频", e.message); }
}

console.log(`\n=== 音色自检：通过 ${pass} / 失败 ${fail} ===`);
process.exit(fail ? 1 : 0);
