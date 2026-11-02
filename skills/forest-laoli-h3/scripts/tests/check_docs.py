#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_docs.py —— 文档自洽检查（不改稿、不跑机检，只查文档之间有没有对不上）

每次改规则/加机检码/改条目数之后跑一遍：
    python scripts/tests/check_docs.py

查什么：
  1. 机检码 H1–H<N> 有没有缺号，文档里的区间表述是否落后于代码
  2. 文档声称的条目数（checklist 项数 / gates P0·P1 / 用例数）与实际是否一致
  3. 文档互相引用的 .md / .py / .json 是否存在（死链）
  4. 是否还残留已删除能力的表述（生产机、队列、桥接脚本）
  5. 命令行帮助里的 H 码区间是否已更新

退出码：全过 = 0；有问题 = 1。
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
LINT = ROOT / "scripts" / "h3_lint.py"
TESTS = ROOT / "scripts" / "tests"

problems = []


def check(name, ok, detail=""):
    print(("  OK    " if ok else "  BAD   ") + name + (("  :: " + str(detail)) if not ok else ""))
    if not ok:
        problems.append((name, detail))


def read(p):
    return p.read_text(encoding="utf-8", errors="replace")


def main():
    lint_src = read(LINT)

    print("\n[1] 机检码区间")
    # 所有被当作机检码抛出的字面量：r.fail("Hxx") / rep.fail("Hxx") / getattr(rep, level)("Hxx")
    # 用「带引号的 H 码字面量」统一抓，避免漏掉 getattr 与循环体里的写法
    thrown = sorted({int(x) for x in re.findall(r'"H(\d{1,2})"', lint_src)})
    top = max(thrown) if thrown else 0
    missing = [i for i in range(1, top + 1) if i not in thrown]
    check(f"H1–H{top} 无缺号", not missing, f"缺 {missing}")

    print("\n[2] 文档中的区间表述不落后于代码")
    stale = {}
    for doc in [ROOT / "SKILL.md"] + sorted((ROOT / "references").glob("*.md")):
        s = read(doc)
        for m in re.finditer(r"H1\s*[-–~]\s*H(\d+)", s):
            n = int(m.group(1))
            # 只拦「像全表声明」的旧区间（H1–H30 以上）；H1-H3 / H4-H7 这类
            # 分组小标题是合法写法，不报。
            if 25 <= n < top:
                stale.setdefault(doc.name, []).append(m.group(0))
    check(f"无低于 H{top} 的区间表述", not stale, stale)

    print("\n[3] 条目数自洽")
    ck = read(ROOT / "references" / "checklist.md")
    ids = list(dict.fromkeys(re.findall(r"\|\s*\*{0,2}([A-I]\d{1,2})\*{0,2}\s*\|", ck)))
    claim = re.search(r"（(\d+)\s*项", ck.split("\n")[0])
    check(f"checklist 实际 {len(ids)} 项 = 头部声称 {claim.group(1) if claim else '?'}",
          claim and int(claim.group(1)) == len(ids))

    g = read(ROOT / "references" / "gates.md")
    for tag, pat, claimpat in [
        ("P0", r"^\|\s*\*{0,2}P0-\d+", r"P0 门禁（阻断，共 (\d+) 条）"),
        ("P1", r"^\|\s*\*{0,2}P1-\d+", r"P1 门禁（自动修，共 (\d+) 条）"),
    ]:
        real = len(re.findall(pat, g, re.M))
        c = re.search(claimpat, g)
        check(f"gates {tag} 实际 {real} = 声称 {c.group(1) if c else '?'}",
              c and int(c.group(1)) == real)

    rt = read(TESTS / "run_tests.py")
    n_reg = len(re.findall(r'^\s*\(\s*"case', rt, re.M))
    n_disk = len(list(TESTS.glob("case*")))
    c = re.search(r"(\d+)\s*个用例", rt)
    check(f"run_tests 登记 {n_reg} = 声称 {c.group(1) if c else '?'} = 磁盘 {n_disk}",
          c and int(c.group(1)) == n_reg == n_disk)
    sk = read(ROOT / "SKILL.md")
    cs = re.search(r"(\d+)\s*用例零放水基线", sk)
    check(f"SKILL.md 声称用例数 {cs.group(1) if cs else '?'} = 实际 {n_reg}",
          cs and int(cs.group(1)) == n_reg)

    print("\n[4] 交互引用无死链")
    exist = {p.name for p in ROOT.rglob("*") if p.is_file()}
    dead = {}
    for doc in [ROOT / "SKILL.md"] + sorted((ROOT / "references").glob("*.md")):
        s = read(doc)
        # 只查「本包内」引用：前缀为空或 references/ 才算；带别的包名前缀（如
        # `sd-xuanhuan-engine/references/xxx.md`）是跨包溯源标注，不算死链。
        for m in re.finditer(r"((?:[\w\-]+/)*)([a-zA-Z0-9][a-zA-Z0-9_\-]*\.(?:md|py|json))", s):
            prefix, n = m.group(1), m.group(2)
            if prefix not in ("", "references/", "scripts/", "scripts/tests/"):
                continue
            if n not in exist:
                dead.setdefault(doc.name, set()).add(n)
    # 包外溯源文件属历史标注，不算死链，单独放行
    external_ok = {
        "camera-action-specs.md", "short-drama-camera-system.md", "shot-economy-and-acting.md",
        "camera-specs-15.md", "camera-system.md", "model-adapters.md", "zh-CN.md",
    }
    dead = {k: sorted(v - external_ok) for k, v in dead.items()}
    dead = {k: v for k, v in dead.items() if v}
    check("包内引用文件都存在", not dead, dead)

    print("\n[5] 无已删除能力的残留表述")
    banned = ["h3-bridge", "production-handoff", "h3pm ", "投喂跑片"]
    hit = {}
    for doc in [ROOT / "SKILL.md"] + sorted((ROOT / "references").glob("*.md")):
        s = read(doc)
        for b in banned:
            if b in s:
                hit.setdefault(doc.name, []).append(b)
    check("无生产机/桥接残留", not hit, hit)

    print("\n[6] CLI 帮助区间")
    p = subprocess.run([sys.executable, str(LINT), "-h"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    check(f"帮助里写的是 H1~H{top}", f"H1~H{top}" in (p.stdout or ""))

    print("\n" + "=" * 66)
    if problems:
        print(f"文档自检：{len(problems)} 项不一致")
        return 1
    print("文档自检：全部一致")
    return 0


if __name__ == "__main__":
    sys.exit(main())
