/**
 * H3 是否真的使用 refAudios？
 * 同一提示词 + 同一台词，分别用男声样本 / 女声样本 / 无参考 跑三条，量 F0 与频谱质心。
 */
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const { __test } = await import("../lib/index.js");
const T = __test();
const config = { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 20 * 60 * 1000 };

// 找样本：先按文件名里的 desc 无痕，改用先后两个 voice-*.wav（不同描述生成）
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
if (all.length < 2) { console.log("SKIP 样本不足"); process.exit(0); }

const a = all[all.length - 2];
const b = all[all.length - 1];
const pid = a.pid;
console.log(`样本A: ${a.file}\n样本B: ${b.file}\n项目: ${pid}`);

const PROMPT = "A middle-aged person sits still and speaks one short line to camera.";
const LINE = "A person says: <d>[这是一段用来比对音色的测试台词。]</d>";

const runs = [
  { tag: "A", voiceFiles: [{ file: a.file, name: "A" }] },
  { tag: "B", voiceFiles: [{ file: b.file, name: "B" }] },
  { tag: "none", voiceFiles: [] },
];

const wavs = {};
for (const r of runs) {
  const job = {
    id: `audit-${r.tag}-${Date.now()}`, projectId: pid, nodeId: "",
    prompt: `${PROMPT}\n${LINE}`,
    mode: "r2v", model: "h3-director", duration: 4, aspect: "16:9", resolution: "480p",
    voiceFiles: r.voiceFiles, status: "queued", startedAt: Date.now(),
  };
  const t0 = Date.now();
  await T.runVideoJob({}, config, job);
  console.log(`  ${r.tag}: ${job.status} ${job.asset?.file || job.error} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (!job.asset?.file) continue;
  const abs = join(base, pid, job.asset.file);
  const wav = abs.replace(/\.mp4$/, `.${r.tag}.wav`);
  await run("ffmpeg", ["-y", "-i", abs, "-vn", "-ac", "1", "-ar", "16000", wav]).catch(() => {});
  wavs[r.tag] = wav;
}

const py = `
import wave, numpy as np, json, sys
out = {}
for tag, path in json.loads(sys.argv[1]).items():
    with wave.open(path, "rb") as w:
        sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)/32768.0
    if x.size < sr//2: out[tag] = None; continue
    f0s, cents = [], []
    frame, hop = 1024, 512
    for i in range(0, len(x)-frame, hop):
        seg = x[i:i+frame] - x[i:i+frame].mean()
        if np.abs(seg).max() < 0.01: continue
        # 自相关估 F0（60–400Hz）
        ac = np.correlate(seg, seg, 'full')[frame-1:]
        lo, hi = int(sr/400), int(sr/60)
        if hi >= len(ac): continue
        peak = lo + int(np.argmax(ac[lo:hi]))
        if peak > 0 and ac[peak] > 0.25*ac[0]: f0s.append(sr/peak)
        spec = np.abs(np.fft.rfft(seg*np.hanning(frame))); fr = np.fft.rfftfreq(frame, 1/sr)
        if spec.sum() > 1e-6: cents.append(float((spec*fr).sum()/spec.sum()))
    out[tag] = {
        "f0_median": round(float(np.median(f0s)), 1) if f0s else None,
        "centroid_median": round(float(np.median(cents)), 1) if cents else None,
    }
print(json.dumps(out, ensure_ascii=False))
`;
const { stdout } = await run("python", ["-c", py, JSON.stringify(wavs)]).catch((e) => ({ stdout: String(e.stderr || "") }));
console.log("\n指标:", stdout.trim());
