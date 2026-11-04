/**
 * 决定性验证：男声样本 vs 女声样本 → 成片 F0 是否跟随
 * 1) 用 MiMo 生成一个明确的女声样本
 * 2) 分别用 男声样本 / 女声样本 跑视频
 * 3) 量成片 F0
 */
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const { __test } = await import("../lib/index.js");
const { buildApi } = await import("../lib/api/server.js");
const T = __test();

const ctx = { tools: { register: () => () => {} }, effect: (fn) => { fn(); return () => {}; },
              webServer: { register: () => () => {} }, on: () => () => {} };
const api = buildApi(ctx, { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 120000 });
const config = { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 20 * 60 * 1000 };

const base = join(homedir(), ".dsh", "projects");
const all = [];
for (const p of await readdir(base)) {
  if (p.startsWith(".")) continue;
  try {
    for (const f of await readdir(join(base, p, "media"))) {
      if (f.startsWith("voice-") && f.endsWith(".wav")) all.push({ pid: p, file: `media/${f}` });
    }
  } catch {}
}
const pid = all[0].pid;
const maleSample = all[all.length - 2].file;

// 生成明确女声样本
const female = await api["voice.preview"]({
  projectId: pid, mode: "design",
  desc: "20岁左右女性，音调高、清亮甜美，语速轻快",
  text: "这是一段用来比对音色的测试台词。",
});
console.log(`男声样本: ${maleSample}\n女声样本: ${female.file}`);

const PROMPT = "A person sits still and speaks one short line to camera.";
const LINE = "A person says: <d>[这是一段用来比对音色的测试台词。]</d>";

const results = {};
for (const [tag, file] of [["male", maleSample], ["female", female.file]]) {
  const job = {
    id: `f0-${tag}-${Date.now()}`, projectId: pid, nodeId: "",
    prompt: `${PROMPT}\n${LINE}`, mode: "r2v", model: "h3-director",
    duration: 4, aspect: "16:9", resolution: "480p",
    voiceFiles: [{ file, name: tag }], status: "queued", startedAt: Date.now(),
  };
  await T.runVideoJob({}, config, job);
  console.log(`  ${tag}: ${job.status} ${job.asset?.file || job.error}`);
  if (job.asset?.file) {
    const abs = join(base, pid, job.asset.file);
    const wav = `E:/Allen/.tmp/voicetest/f0_${tag}.wav`;
    await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", abs, "-vn", "-ac", "1", "-ar", "16000", wav]).catch((e) => console.log("  ffmpeg err", String(e).slice(0, 100)));
    results[tag] = wav;
  }
}

const py = `
import wave, numpy as np, json, sys
def f0(path):
    with wave.open(path,'rb') as w:
        sr=w.getframerate(); x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(np.float32)/32768.0
    vals=[]; frame=1024
    for i in range(0, max(1,len(x)-frame), 512):
        seg=x[i:i+frame]
        if seg.size<frame: break
        seg=seg-seg.mean()
        if np.abs(seg).max()<0.01: continue
        ac=np.correlate(seg,seg,'full')[frame-1:]
        lo,hi=int(sr/400),int(sr/60)
        if hi>=len(ac): continue
        p=lo+int(np.argmax(ac[lo:hi]))
        if p>0 and ac[p]>0.25*ac[0]: vals.append(sr/p)
    return round(float(np.median(vals)),1) if vals else None
args=json.loads(sys.argv[1])
print(json.dumps({k: f0(v) for k,v in args.items()}))
`;
const { stdout } = await run("python", ["-c", py, JSON.stringify(results)]).catch((e) => ({ stdout: String(e.stderr || "") }));
console.log("\n成片 F0:", stdout.trim());
