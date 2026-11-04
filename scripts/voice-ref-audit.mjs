/**
 * 判定 H3 是否真的使用 refAudios：
 * 同一提示词，分别用「男声样本」「女声样本」跑两条 4 秒片，
 * 再抽取音轨用频谱质心（男声显著更低）判断。
 */
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const { __test } = await import("../lib/index.js");
const T = __test();
const config = { comfyUrl: "http://127.0.0.1:8188", requestTimeoutMs: 20 * 60 * 1000 };

const pid = "e6abc13b";
const SAMPLES = {
  male: "media/voice-5a16e196.wav",
  female: "media/voice-5b8b5347.wav",
};

const results = {};
for (const [tag, voiceFile] of Object.entries(SAMPLES)) {
  const job = {
    id: `vt-${tag}-${Date.now()}`,
    projectId: pid, nodeId: "",
    prompt: "A person looks at the camera and speaks calmly.",
    mode: "r2v", model: "h3-director", duration: 4, aspect: "16:9", resolution: "480p",
    voiceFile, status: "queued", startedAt: Date.now(),
  };
  const t0 = Date.now();
  await T.runVideoJob({}, config, job);
  const f = job.asset?.file;
  console.log(`${tag}: ${job.status} ${f || job.error} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (!f) continue;
  const abs = join(homedir(), ".dsh", "projects", pid, f);
  const wav = abs.replace(/\.mp4$/, `-${tag}.wav`);
  await run("ffmpeg", ["-y", "-i", abs, "-vn", "-ac", "1", "-ar", "16000", wav]).catch(() => {});
  const st = await stat(wav).catch(() => null);
  if (st) results[tag] = wav;
}

// 用 python+numpy 算频谱质心与过零率
if (Object.keys(results).length) {
  const py = `
import wave, numpy as np, sys, json
out = {}
for tag, path in json.loads(sys.argv[1]).items():
    with wave.open(path, "rb") as w:
        n = w.getnframes(); sr = w.getframerate()
        raw = w.readframes(n)
    x = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if x.size < sr: 
        out[tag] = None; continue
    frame = 1024; hop = 512
    cents = []
    for i in range(0, len(x) - frame, hop * 4):
        seg = x[i:i+frame] * np.hanning(frame)
        spec = np.abs(np.fft.rfft(seg))
        freqs = np.fft.rfftfreq(frame, 1/sr)
        if spec.sum() > 1e-6:
            cents.append(float((spec * freqs).sum() / spec.sum()))
    out[tag] = round(float(np.median(cents)), 1) if cents else None
print(json.dumps(out))
`;
  const { stdout } = await run("python", ["-c", py, JSON.stringify(results)]).catch((e) => ({ stdout: String(e.stderr || "") }));
  console.log("\n男/女样本 → 成片音轨频谱质心（越低越低沉）:");
  console.log(stdout.trim());
}
