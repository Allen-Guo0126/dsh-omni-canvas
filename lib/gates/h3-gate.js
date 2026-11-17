/**
 * H3 投喂前机检门（2026-11-10）
 *
 * 为什么要有：技能里有 39 条机检规则，但生成链路从不调用——稿子 19/19 FAIL 照样提交渲染。
 * 这个模块在 gen.video 提交前跑一遍 h3_lint.py，FAIL 就拒绝提交并把失败项回给 agent。
 *
 * 设计取舍：
 * - **fail-open**：找不到 python / lint 脚本 / 输出解析不了 → 放行，插件不依赖技能也能跑
 * - **只拦 H3 六段式稿**：不认识格式的普通提示词不拦（looksLikeH3 判定）
 * - **氛围三件套用 --strict-atmo**：光位/空气/前景缺失在门禁里算 FAIL（技能里仍是 WARN）
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { stat, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

// 优先用「插件自带」的技能副本：仓库里改了立刻生效，不会出现
// "仓库是新版、已安装副本是旧版，机检按旧规则拒绝提交"这种鬼打墙。2026-11-17
const bundledLint = () =>
  fileURLToPath(new URL("../../skills/h3-short-drama/scripts/h3_lint.py", import.meta.url));

export const lintPath = () => {
  if (process.env.DSH_H3_LINT) return process.env.DSH_H3_LINT;
  const local = bundledLint();
  if (existsSync(local)) return local;
  return join(homedir(), ".dsh", "skills", "h3-short-drama", "scripts", "h3_lint.py");
};

/** 这份稿子是不是 H3 六段式（不是就不拦） */
export function looksLikeH3(text) {
  const s = String(text || "");
  return /subject_definitions\s*:/i.test(s) || /detailed_description\s*:/i.test(s);
}

function runPython(python, args) {
  return new Promise((done) => {
    const p = spawn(python, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => { stdout += d; });
    p.stderr.on("data", (d) => { stderr += d; });
    p.on("error", () => done({ failed: true }));
    p.on("close", (code) => done({ code, stdout, stderr }));
  });
}

/**
 * @returns {Promise<{ok:boolean, skipped?:string, fails?:Array<{code:string,msg:string}>, warns?:Array}>}
 */
export async function runH3Gate(prompt, { duration, aspect, python } = {}) {
  if (!looksLikeH3(prompt)) return { ok: true, skipped: "not-h3" };
  const lint = lintPath();
  try {
    await stat(lint);
  } catch {
    return { ok: true, skipped: "no-lint-script" };
  }

  const dir = await mkdtemp(join(tmpdir(), "h3gate-"));
  const file = join(dir, "prompt.txt");
  try {
    await writeFile(file, String(prompt), "utf8");
    const args = [lint, file, "--strict-atmo", "--json"];
    const d = Number(duration);
    if (Number.isFinite(d) && d > 0) args.push("--duration", String(Math.round(d * 10) / 10));
    if (aspect) args.push("--aspect", String(aspect));

    const bins = python ? [python] : ["python", "python3", "py"];
    let out = null;
    for (const bin of bins) {
      const r = await runPython(bin, args);
      if (!r.failed) { out = r; break; }
    }
    if (!out) return { ok: true, skipped: "no-python" };

    let data = null;
    try {
      data = JSON.parse(out.stdout);
    } catch {
      return { ok: true, skipped: "unparsable", raw: String(out.stderr || out.stdout).slice(0, 200) };
    }
    const items = Array.isArray(data.items) ? data.items : [];
    const allFails = items.filter((x) => x && x.level === "FAIL").map((x) => ({ code: x.code, msg: x.msg }));
    let warns = items.filter((x) => x && x.level === "WARN").map((x) => ({ code: x.code, msg: x.msg }));

    // 2026-11-10 修正：只「带字段名」不等于「完整镜行稿」。
    // 用户手写/半结构化的提示词常常没有 [Shot N]，此时 H1/H2/H35 这类结构项
    // 全量 FAIL 会把正常提示词拦死（实测一次挂 4 项）。
    // 判据改为「有没有 [Shot N]」：有 → 完整稿，全量严格；没有 → 草稿，只拦会毁画面的。
    const CRITICAL = new Set(["H13", "H14", "H36"]); // 词根 / 画幅 / 图槽越界
    const isShotScript = /\[Shot\s*\d+\]/i.test(String(prompt || ""));
    let fails = allFails;
    if (!isShotScript) {
      const downgraded = allFails.filter((f) => !CRITICAL.has(f.code));
      fails = allFails.filter((f) => CRITICAL.has(f.code));
      warns = downgraded.map((f) => ({ code: f.code, msg: `[草稿模式·提示] ${f.msg}` })).concat(warns);
    }
    return { ok: fails.length === 0, fails, warns, failCount: fails.length, warnCount: warns.length };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** 拼一条人类可读的拒绝原因 */
export function gateError(prefix, gate) {
  const lines = (gate.fails || []).slice(0, 8).map((f) => `· ${f.code} ${f.msg}`).join("\n");
  const more = (gate.fails || []).length > 8 ? `\n…另有 ${gate.fails.length - 8} 项` : "";
  return `${prefix}（${gate.fails.length} 项 FAIL）\n${lines}${more}\n\n修完再提交；紧急绕过传 skipGate: true。`;
}
