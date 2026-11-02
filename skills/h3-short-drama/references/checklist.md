# 投喂前必查清单（62 项 · 九组 · 四件套）

> **四件套**＝编号 + 一句话自检 + 规则源 + 机检兜底（`H1`–`H36`）。缺任一件视为未落地。
> **用法**：写完一稿，从 A 到 I 逐项打勾。任何一项答"否"，回对应规则源改，不要凭感觉调。

| 图例 | 含义 |
|---|---|
| ✅/❌ | 自检结论 |
| `H1`–`H36` | 机检码（`h3_lint.py` 兜底） |
| `—` | 语义项，机检抓不住，**必须人眼过** |

---

## A · 锁定组（6 项 · 不定完不动笔）

| # | 一句话自检 | 规则源 | 机检 |
|---|---|---|---|
| A1 | 模式定了吗？（T2VA 零图 / I2VA 首帧 / FL2VA 首尾帧 / L2VA 尾帧 / Ref2VA 参考图） | `pipeline.md §一 A` | — |
| A2 | 时长是 4/5/8/10/12/15 中的整数档吗？ | `pipeline.md §一 C` | `H3` |
| A3 | 画幅定了吗？**推荐 9:16，16:9 实测可用**；全片是否同一个画幅、没有 `auto`？镜行语汇是否与画幅取向一致（竖屏别写左右对峙，横屏别写上下叠压）？ | `pipeline.md §一 B` | `H14` |
| A4 | 画风基底锁了吗？（写实 / 2D 漫 / 3D / 水墨——决定特写能不能正面平视） | `pipeline.md §一 D` | — |
| A5 | 资产形态是 M1（文字档）还是 M2（有图）？段缝方案（尾帧/硬切/空镜）定了吗？ | `pipeline.md §一 E` | — |
| **A6** | **全片「空间锚点卡」钉了吗？**（家具清单 + 座位/站位表 + 三个方位词 + 门窗初始开闭态） | `spatial-anchor-and-hold.md §二` | `H24/H31` |

---

## B · 资产与图槽组（8 项）

| # | 一句话自检 | 规则源 | 机检 |
|---|---|---|---|
| B7 | 三清单（人物/场景/道具）是从剧本里抽的，不是凭想象补的？ | `asset-layer.md §一` | — |
| B8 | 参考图 ≤9 张？超了就按优先级砍，砍掉的用一句可见外观兜？ | `asset-layer.md §三` | `H5` |
| B9 | 每张图标了用途吗？（锁形象 / 锁空间 / 锁道具 / 锁构图） | `asset-layer.md §四` | — |
| B10 | 每个 `<Subject N>` 在正文**真的被引用**过？只在定义段写等于白占额度 | `asset-layer.md §三` | `H5` |
| B11 | 角色外观只留「一句可见特征」？底部声纹 / 无脸版 / 超长设定一律不用 | `asset-layer.md §六` | — |
| B12 | 角色是**三视图**（正面 / 侧面 / 背面）吗？prompt 里写了「恰好三格 · 两条竖线均分 · 从左到右依次是」吗？ | `asset-layer.md §2.1` | — |
| B13 | 场景是**一张正对空间的主视角**吗？没写九宫格、没写多视角拼图？ | `asset-layer.md §2.2` | — |
| **B14** | **全片图槽顺序一次钉死、没有因为某段不用某图就省图删槽吗？**（省图会导致后续 `Picture N` 全部前移错位） | `delivery.md §三` | `H36` 越界 / `H34` 跨段类型 |

---

## C · 格式组（6 项）

| # | 一句话自检 | 规则源 | 机检 |
|---|---|---|---|
| C15 | 字段集对了吗？（三字段 vs 六段式，别混） | `h3-format.md §一` | `H1` |
| C16 | 六段式顺序对了吗？（`subject_definitions → summary → retention_analysis → detailed_description → overall_soundscape → non_diegetic_music`） | `h3-format.md §三` | `H1` |
| C17 | 指令行（I2VA/FL2VA/L2VA 才要）在第一行，后面跟空行？ | `h3-format.md §二` | — |
| C18 | `retention_analysis` 里没写 `(Sx)`？（该段只讲保留度） | `h3-format.md §三` | `H6` |
| C19 | 保留度只用了合法枚举？（段内有开门/关门变化的场景必须标 `partially_preserved` 而非 `fully_preserved`） | `h3-format.md §三` | `H6/H31` |
| C20 | 载荷里 `duration_seconds` / `aspect_ratio` / `task` 三项与稿一致？ | `h3-format.md §六` | — |

---

## D · 镜头组（10 项 · 核心）

| # | 一句话自检 | 规则源 | 机检 |
|---|---|---|---|
| D21 | 每个镜行都是 `[Shot N] 景别, 角度, 运镜; 画面事实` 吗？**分号**分开了镜行头和正文？ | `h3-shot-grammar.md §1.1` | `H2/H13` |
| D22 | 镜号从 1 连续？`At MM:SS.mmm` 严格递增且 < 段时长？首镜无时间戳？ | `h3-shot-grammar.md §1.15` | `H2` |
| D23 | 相邻两镜**没有**「同景别 + 同机位」连排？**没有**连续 2 镜同运镜（对话段 `holds still` 豁免）？ | `h3-shot-grammar.md §1.8` | `H18` |
| D24 | 每个推拉都写了**距离 + 时长 + 轨道**？（`sliding forward 10 cm over two seconds on a rail`）且文戏对话段以固定机位为主力、未滥用花式运镜？ | `camera-movement.md §二` | `H15` |
| D25 | 双人段落开头有一句**正向越轴不变式**？且**没写**"禁越轴/轴线锁定/line/axis/frame"？ | `h3-shot-grammar.md §二` | `H13` |
| D26 | 站位每个人都在**本段某个镜行**被带到？给不了镜头的写明"退场/离画"？ | `h3-shot-grammar.md §三` | — |
| D27 | 一镜内**没有并列主体句式**（`X and Y in the same shot`）？身体部位都带归属（`her hand`）？ | `h3-shot-grammar.md §三` | `H12` |
| D28 | 特写里**只有局部**？没有全身、多人完整站位、胸以下？运镜幅度在 10cm 内？ | `h3-shot-grammar.md §1.4` | `H17` |
| **D29** | **单镜正文 ≤75 词？**（目标 ≤70；超 100 直接丢指令，先丢机位） | `spatial-anchor-and-hold.md §四` | `H23` |
| **D30** | **单镜交代 ≥35 词？**（人物 + 位置 + 动作三件不能缺项） | 同上 | `H25` |

---

## E · 空间、门窗与防分身组（11 项 · 2026-10-21《门后》4 段真机升级）

| # | 一句话自检 | 规则源 | 机检 |
|---|---|---|---|
| **E31** | 每段开头**用锚点卡复述**了吗？座位/站位全片没乱改？ | `spatial-anchor-and-hold.md §二` | `H24` |
| **E32** | 每镜末尾有**正向维持句**（`stay unchanged` / `stays shut`）吗？ | `spatial-anchor-and-hold.md §三` | `H24` |
| **E33** | 每镜**只有一个主角动作**？同框第二人**明确写成纯静止**（`stands still`），**没写 `watches him go` 旁观动态词**？ | `spatial-anchor-and-hold.md §四/7.2` | `H30` |
| **E34** | 避开形变雷区了吗？无手部特写、无指尖精细动作、无手对手递接、无要求可读多行文字？ | `spatial-anchor-and-hold.md §五` | — |
| **E35** | 锚点里的每项家具/装饰都是**单数**吗？无 `wall of` / `rows of` / `dozens of` 复数扩建词？ | `spatial-anchor-and-hold.md §六` | `H28` |
| **E36** | **一段只有一块空间**吗？特写镜带了 1–2 个资产可识别特征吗？中景补了 `cut at the waist` 吗？ | `spatial-anchor-and-hold.md §六` | — |
| **E37** | **没有写人物穿过门洞/窗洞/开口**（`steps out through the door` → 会导致人物半透明融化）？ | `spatial-anchor-and-hold.md §7.1` | `H29` |
| **E38** | **段内无走位时，同一角色的依托物与左右位置从 Shot 1 到末镜完全一致吗？**（严禁 Shot 1 在右侧电表箱、Shot 4 无走位写到左侧鞋柜旁，否则必出左右双分身！） | `spatial-anchor-and-hold.md §7.2` | `H32` |
| **E39** | **门外敲门（`knocks`）等画外动作没有写进画面正文吗？**（写进正文会导致门内主角自己转身敲门！画面只写门震动/铁链响，敲门声进 `overall_soundscape`） | `spatial-anchor-and-hold.md §7.3` | `H31` |
| **E40** | **未开门段全程锁死 `closed/shut`、开门段标了 `partially_preserved` 且未把门死锁在 `stay in place for every shot` 吗？**（防背景门提前自开与“双扇门”分裂） | `spatial-anchor-and-hold.md §7.4` | `H31` |
| **E41** | **避开了「全蹲 `crouches on his heels` + 低角度」和「窄缝穿物过程 `slides through the gap`」吗？**（防卡 76% 与成片冻帧） | `spatial-anchor-and-hold.md §7.5` | `H33` |

---

## F · 表演组（5 项 · H3 最吃这块）

| # | 一句话自检 | 规则源 | 机检 |
|---|---|---|---|
| F42 | 情绪都落成**肌肉动作**了吗？还有"紧张/不甘/压抑"这类心理词吗？ | `acting-facs.md §二` | `H13` |
| F43 | 幅度用**可见计数**（几颗牙 / 一指宽 / 两道竖纹）而不是"微微/非常"？ | `acting-facs.md §三` | `H13` |
| F44 | 在本段**不说话**的人，有没有听戏反应？（听见→眼神→呼吸→身体泄漏） | `acting-listen.md §一` | — |
| F45 | 说话镜写了**视线落点**吗？把玩道具时补了"眼睛不看道具"？ | `acting-listen.md §三` | — |
| F46 | 台词标点落到身体上了吗？ | `acting-listen.md §四` | — |

---

## G · 声音组（7 项）

| # | 一句话自检 | 规则源 | 机检 |
|---|---|---|---|
| G47 | 台词全在 `<d>[Chinese]…</d>` 里，带语言标签？ | `h3-format.md §四` | `H4` |
| G48 | `overall_soundscape` 里**没有台词**、**没有音乐**？ | `h3-format.md §四` | `H10` |
| G49 | 每个说话人首次出场带**语气/音色/语速描述**？ | `h3-format.md §四` | `H11` |
| **G50** | **同段同性别 ≥2 个开口者时，音高/音质/语速反着写了吗？**（一低冷慢、一高亮快） | `h3-format.md §4.4` | `H26` |
| G51 | 画外声用了官方短语 `says in an off-screen voiceover` + **闭口证据**？且门外角色未写 `<Subject N>` 标签？ | `h3-format.md §4.3` | `H9` |
| **G52** | **台词密度够吗？**填充率 80–90%、每镜一句、无纯展示冷场段？ | `dialogue-density.md` | `H20` |
| **G53** | **切镜点落在换嘴处了吗？**相邻两镜无同一说话人站桩连说？ | `dialogue-density.md` | `H21` |

---

## H · 词根组（4 项 · 最高危）

| # | 一句话自检 | 规则源 | 机检 |
|---|---|---|---|
| H54 | 镜行正文有没有否定词？（`no` / `not` / `without` / `never` / 不要 / 没有） | `h3-lexicon-cleanup.md §一` | `H13` |
| H55 | 镜行正文有没有元描述词？（`composition` / `axis` / `framing` / 构图 / 景别） | `h3-lexicon-cleanup.md §二` | `H13` |
| H56 | 有没有"线/框/轴"这类**会被画出形状**的词？`line` / `frame` / `axis` | `h3-lexicon-cleanup.md §三` | `H13` |
| H57 | 过了黑名单 Ctrl+F？（`h3-lexicon-cleanup.md §十二`） | `h3-lexicon-cleanup.md §十二` | `H13` |

---

## I · 交付与投喂包组（5 项）

| # | 一句话自检 | 规则源 | 机检 |
|---|---|---|---|
| **I58** | **道具首现写了支撑吗？**（`seated on the stove` / `in her right hand`） | `SKILL.md` 铁律 14 | `H22` |
| **I59** | **末镜有定格句吗？**（`the movement stops and the picture holds still for the last second`） | `gates.md` P0-18 | `H27` |
| I60 | 跑了 `python scripts/h3_lint.py`？`FAIL` 清零、`WARN` 逐条说明或已修？ | `gates.md §四` | `H1–H36` |
| I61 | 剥壳干净了吗（无 `**`、无围栏、UTF-8 无 BOM）？图槽表与 `images` 数组顺序一致、无越界、人景未贴反？ | `delivery.md §一~三` | `H36` 越界 / `H34` 跨段类型 |
| **I62** | **跨段连续性对过账吗？**（上一段末镜的服装/道具/门窗开闭/位置，下一段首镜是否一致） | `gates.md` P1-12 | `H34` |
