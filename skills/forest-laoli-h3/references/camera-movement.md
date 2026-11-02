# H3 运镜专论：电影摄影规格 → H3 可执行句式

> 本文件是运镜的**唯一权威**。分镜层的运镜设计全部落在这里，`h3-shot-grammar.md` 只留速查。
> **素材来源**（`short-drama-director-V7.4.20-最新版` / `manju-laoli-V7.4.24` 逐文件吸收）：
> `sd-storyboard-engine/references/short-drama-camera-system.md`（§一~§七 四轴矩阵、§四·二 Lubezki×Deakins 物理运镜规程）
> `short-drama-director/references/camera-specs-15rules.md`（15s 规格、景别阶梯、受击工具箱）
> `sd-real-engine/references/camera-action-specs.md`（机位-动作语义绑定、9:16 构图）
> `sd-xuanhuan-engine/references/camera-specs-15modes.md`（15 种实战运镜、被动运镜）
> `sd-storyboard-engine/references/shot-economy-and-acting.md`（§七 复合运镜、§四 运镜节奏衔接）
> **换算原则**：机制照搬，**参数改成 H3 能吃的物理量**，表达换成**只写看得见的画面事实**。

---

## 零、H3 运镜的四个物理事实

这四条决定了后面所有规则的写法。不认这四条，写出来的运镜规则全是废的。

### 0.1 事实一：H3 不知道"慢"是多慢

「缓慢推进」对 H3 是**无参数指令**。它只知道自己要推，于是按训练数据里最常见的推法推——通常是**推到人脸变形为止**。

**唯一解**：给**距离 + 时长**双锚。只说距离，它会 1 秒推完；只说时长，它会推 2 米。

```
❌ slow push in
✅ the camera slides forward 12 cm over three seconds on a rail
```

> 源：`camera-system.md` §四·二「推拉运镜厘米级物理限位锁（10~15cm）」

### 0.2 事实二：H3 不做时间操控

**升格 / 慢动作 / Hit-Stop 顿挫 / 变速（Time Ramp）—— 全部做不了。**

- 写「升格慢镜」→ H3 要么当静态帧渲染，要么直接忽略（连写两次会得到一个凝固画面）
- 写「命中瞬间定格 1~2 帧」→ H3 没有帧级时间控制，只会把**整镜**变慢或变静

**替代方案**：不写时间，写**受力结果**。想要「顿」的观感，就写接触瞬间身体发生了什么：

```
❌ 命中瞬间顿挫定格
✅ his head snaps back and his shoulder folds inward; the camera holds still
```

> 源（包外溯源）：`short-drama-director/references/camera-specs-15rules.md` §二「慢动作跟镜、升格默认禁用」；`camera-action-specs.md` §六 Time Ramp
> **与 manju 的差异**：Seedance 2.5 有 Hit-Stop 三件套，H3 没有。这条不能照搬，必须换。

### 0.3 事实三：H3 不认「跟随谁」

`跟随 @林越` / `跟拍她` —— H3 没有 `@` 锚点机制，`follow her` 里的 `her` 还可能被解析成一个额外主体。

**替代方案**：把跟随写成**镜头与人的相对位移**：

```
❌ 跟拍 @林越 走过长廊
✅ the camera drifts with her as she walks down the hallway, staying at her shoulder height
```

> 源：`model-adapters.md` §5.1 禁写项 #2「镜行写 `跟随@谁`」

### 0.4 事实四：H3 单镜只做一次运镜

**单镜内「起幅晃 → 中段收 → 收尾稳」这种分阶段演进，H3 做不出来。** 它会把这个演进过程渲染成「画面在晃」——变成一个视觉事件，而不是摄影机状态的变化。

**处理**：按表演节拍**拆成两个 `[Shot N]`**，各自带自己的运镜。

```
❌ [Shot 1] 起幅手持晃，中段渐稳，收尾极稳
✅ [Shot 1] ... hand-held, small sway; he slams the cup down.
   [Shot 2] At 00:03.000, the camera cuts to ... static; he exhales and his shoulders drop.
```

> 源：`camera-system.md` §四·二 第 3 条「单镜内分阶段情绪运镜（Phased Camera Arc）」——**该条对 Seedance 有效，对 H3 不适用，本包改为拆镜**。

### 0.5 三要素必须一次给齐

```
[Shot N] <景别>, <机位角度>, <运镜>; <画面事实>.
```

| 要素 | 缺了会怎样 |
|---|---|
| 景别 | H3 自己选，通常选全景（信息量最大），你的特写意图丢失 |
| 机位角度 | 默认正面平视（3D 基底直接恐怖谷） |
| 运镜 | 默认静止或随机微动（有时会自加建立镜头） |

**五要素（景别/角度/运镜/焦段/景深/光影）是设计检查表，落稿砍到三要素**——焦段与景深移到段首风格句，光影移到段首（见 §五）。

---

## 一、运镜光谱：22 种运镜的 H3 可执行度

### 1.1 四级可执行度

| 级 | 含义 | 处理 |
|---|---|---|
| **A 直接可用** | H3 稳定能做，只要给幅度 | 照写 |
| **B 降级可用** | 能做但幅度必须砍，或只能短时 | 按表给降级参数 |
| **C 改写可用** | 原写法会被误渲染，换句式后才成立 | 用「H3 句式」列 |
| **D 禁用** | H3 做不出来或必崩 | 用替代方案，**不写进稿** |

### 1.2 完整对照表

| # | 运镜 | 级 | H3 句式（照抄改参数） | 幅度上限 | 适用景别 | 备注 |
|---|---|---|---|---|---|---|
| 1 | 固定 | A | `the camera holds still` | — | 全部 | 写 `still` 比 `fixed` 稳；`fixed` 偶尔被读成"修好" |
| 2 | 横移 | A | `the camera slides right 40 cm over two seconds along the wall` | 特写 15cm / 中景 60cm / 全景 1.5m | 中景以上 | **特写禁横移**（会甩出画） |
| 3 | 竖移 | B | `the camera rises 30 cm over three seconds` | ≤50cm | 中景以上 | 竖屏里竖移比横移好用（§5.2）；横屏压到 25cm（§5.4） |
| 4 | 推镜 | A | `the camera slides forward 12 cm over three seconds on a rail` | 10–15cm（特写）/ 30–50cm（中景） | 近景 / 特写 | **必须带 cm + 时长** |
| 5 | 拉镜 | A | `the camera pulls back 20 cm over two seconds` | 同上 | 中景 / 全景 | 收段最好用 |
| 6 | 跟拍 | C | `the camera drifts with her, staying at her shoulder height` | 跟随实际步速 | 中景 / 全景 | 禁写 `follow her` |
| 7 | 摇镜（水平） | A | `the camera pans left, thirty degrees` | ≤45° | 全景 / 中景 | 给**角度**而不是"慢慢摇" |
| 8 | 俯仰 | A | `the camera tilts up, fifteen degrees` | ≤30° | 中景以上 | 竖屏里比横摇自然；横屏可放宽到 20° |
| 9 | 轨道 | A | `the camera tracks 60 cm over three seconds along the table edge` | 按景别 | 中景以上 | 与横移同义，`track` 更精确 |
| 10 | 升降 | B | `the camera rises from waist height to eye level` | 高度差 ≤1m | 全景 / 中景 | 大升降（>1m）H3 容易失焦 |
| 11 | 手持微晃 | B | `slight hand-held sway` | 极轻 | 全部 | 再加"剧烈"会糊片 |
| 12 | 手持晃动 | B | `hand-held, the frame shakes slightly as he turns` | 短时（≤3s） | 中景 / 近景 | 必须**绑一个动作**，否则全程抖 |
| 13 | 手持剧烈晃动 | D | → 改用 `hand-held, the frame jolts once when the door slams` | 单次冲击 | 中景 | 持续剧烈晃动 = 全片糊 |
| 14 | 环绕 / 弧形 | B | `the camera arcs 40 degrees around her` | **≤90°**（manju 允许 180°，H3 砍半） | 中景 | H3 转半圈会丢背景一致性 |
| 15 | 滑动变焦 | D | → 见 §1.3「D 组」替代 | — | — | 位移+反向变焦双重控制，H3 做不稳 |
| 16 | 光学变焦 | B | `the lens zooms in slowly, from a medium shot to a close-up` | 一档景别 | 全部 | 只能变**一档**，变两档会失焦 |
| 17 | 急速变焦 | D | → 改用 `the camera cuts to a close-up` | — | — | 0.2s 冲到位，H3 没这个时间精度 |
| 18 | 长镜头 | B | `one continuous shot, the camera moves with him from the door to the desk` | ≤15s 段长 | 中景 | 段内不切镜，靠运镜过渡 |
| 19 | Snorricam | D | → 改用 `hand-held, the frame tilts as he sways` | — | — | 主体锁定背景晃动，H3 不理解 |
| 20 | 摇臂 | D | → 改用 `the camera rises and turns slightly` | — | — | 多向复合运动，H3 容易穿模 |
| 21 | POV 主观 | B | `the shot looks down at her own hands` | — | 近景 / 特写 | 只能用"视角朝向"表达，不能写"我们是她的眼睛" |
| 22 | 焦点转换 | B | `the focus moves from the cup in front to her face behind it` | 一次 | 中景 / 近景 | H3 能做出焦点转移，但只限前后关系清楚的构图 |

### 1.3 变焦族四件套：判据必须分清

> 源：`camera-system.md` §四「变焦族四件套 · 区分口径」——manju 原文是因为"机检把变焦做成错误别名"才补的，这个坑 H3 更严重：**H3 对 `zoom` 词根敏感，写错就是画面里出现一个变焦镜头**（见 `h3-lexicon-cleanup.md`）。

| 名称 | 机位 | 焦段 | 画面特征 | H3 可执行 | 判据 |
|---|---|---|---|---|---|
| **推镜 / 拉镜**（dolly） | **位移** | 不变 | 透视改变、有视差 | ✅ A 级 | 《`slides forward` / `pulls back` + cm》 |
| **光学变焦**（zoom） | 不动 | 变化 | 透视不变、整体等比缩放 | ✅ B 级 | 《`the lens zooms in` + 一档景别》 |
| **急速变焦**（Snap Zoom） | 不动 | 变化（高速） | 0.2–0.5s 冲到位 | ❌ D | 改切镜 |
| **滑动变焦**（Dolly Zoom） | 位移 | 反向变化 | 主体恒定、背景塌陷 | ❌ D | 改「固定 + 主体不动 + 背景被拉开」的不可能三角 → **直接删，用推镜代替** |

**三条纪律**：
1. **机位能移动就用推镜，不要用变焦**——推镜有真实视差，变焦是平的。只有"贴墙 / 狭窄 / 隐蔽观察"才用变焦；
2. **一个镜里不许同时出现位移词和变焦词**——H3 会当成两个指令打架，出片是"推一半又不推"；
3. `zoom` 单独出现时 H3 有时会画出一个**变焦镜头**（物理镜头筒）。安全写法是 `the lens zooms in`，把 `zoom` 绑在 `lens` 上。

### 1.4 D 级禁用清单与替代

| 禁用 | 为什么 | 替代写法 |
|---|---|---|
| 升格 / 慢动作 | 无时间控制 | 删；要强调就加一个特写镜 + 更细的动作 |
| Hit-Stop / 顿挫 / 定格 | 无帧级控制 | 写受力结果：`his head snaps back` / `her hand freezes mid-air` |
| 急速变焦 / 甩镜 | 0.2s 精度做不出 | 直接 `the camera cuts to`（切点给时间戳） |
| 滑动变焦 | 位移 + 反向变焦 | 用推镜；要"崩溃感"就 `the camera holds still` + 背景纵深写清 |
| Snorricam | 主体锁定 | `hand-held, the frame tilts` |
| 摇臂 | 多向复合 | 拆成两个 `[Shot]`，各自单向 |
| 荷兰角持续倾斜 | 静态倾斜可以，动态倾斜会糊 | 写成 `the camera tilts to a slight angle` 并保持整镜 |

### 1.5 官方词表 ↔ 本包句式（2026-10-24 吸收《MiniMax-H3 系统指令》母本）

H3 官方系统指令（各客户端「模式」背后共用同一份母本）给了 15 条运镜关键词。**它是 H3 训练分布上的原生 token，读得懂；但不能照抄成稿**——照抄有两个坑。

| 官方关键词 | 意思 | 本包对应 | 照抄风险 |
|---|---|---|---|
| `Static Shot` | 固定 | `the camera holds still` | 无（写成句子更稳） |
| `Zoom In` / `Zoom Out` | 变焦 | **禁用** | 💥 `zoom` 词根会画出变焦镜头（见 `h3-lexicon-cleanup.md`）；改用 `slides forward … cm` |
| `Push In` / `Pull Out` | 推拉 | 推镜 / 拉镜 | ⚠️ 不带 cm 会被读成变焦而非位移，**必须补距离+时长+`on a rail`** |
| `Pan Left` / `Pan Right` | 摇 | `the camera pans left, thirty degrees` | ⚠️ 必须给角度，否则摇成 180° |
| `Truck Left` / `Truck Right` | 横移 | `slides right 40 cm over two seconds` | ⚠️ 必须给 cm |
| `Tilt Up` / `Tilt Down` | 俯仰 | `tilts up, fifteen degrees` | ⚠️ 必须给角度（≤30°） |
| `Pedestal Up` / `Down` | 升降 | `the camera rises 30 cm` / `rises from waist height to eye level` | ✅ 可用，高度差 ≤1m |
| `Arc Shot` | 环绕 | `the camera arcs 40 degrees around her` | ⚠️ ≤90°，特写禁（H17） |
| `Tracking Shot` | 轨道/跟拍 | `tracks 60 cm over three seconds along the table edge` | ✅ 比 `follow` 好 |
| `Shake Slightly` | 手持微晃 | `slight hand-held sway` | ✅ |
| `Shake Strongly` | 剧烈晃动 | **D 级** | 💥 持续剧烈 = 全片糊，改单次冲击 |
| `POV` | 主观 | `the shot looks down at her own hands` | ⚠️ 只能写视角朝向 |
| `Roll Clockwise` / `Roll Counterclockwise` | 滚转 | **未验证**（见下） | ⚠️ 见补遗 |

**幅度/速度修饰词可以叠加**（官方用 amplitude，本包用 cm，两套不冲突）：
```
the camera slides forward 10 cm at slow speed on a rail, with small amplitude
```
- `with small amplitude` / `with large amplitude` 与「缓动 / 大幅」同义，**给不出 cm 时才用**（例如升降、环绕这类不好量化的）
- `at slow speed` / `at fast speed` 是 CM 的反面证据：本包要求写 `10 cm over three seconds` 而不是 `slowly`（`slowly` 是空词，见 §0.1）
- **修饰词最多挂一个**，同时挂 `small amplitude` + `slow speed` + `gently` = 三个同义词互相稀释

**Roll 滚转（补遗 · 待真机验证）**：官方词表列了 `Roll Clockwise` / `Roll Counterclockwise`，本包 22 种里没有。判断为本包缺口而非能力缺口，但在国风短剧里用途极窄（世界失衡 / 认知崩塌），且与「荷兰角持续倾斜会糊」同源。**未跑真机前不要写进稿**；要试就单跑一条：`the camera rolls clockwise five degrees over two seconds`，跑完把结论回填到本节。

---

## 二、幅度量化：距离 + 时长 + 参照物

### 2.1 为什么必须双锚

| 写法 | H3 的实际行为 |
|---|---|
| `slow push in` | 推到脸变形（1–2 秒推完 1 米） |
| `push in 12 cm` | 推 12cm，但可能 0.3 秒推完（像抖了一下） |
| `push in 12 cm over three seconds` | ✅ 正确：慢推，有视差，不崩构图 |
| `push in 12 cm over three seconds on a rail` | ✅✅ 最稳：`rail` 排除手持，排除变焦 |

**`on a rail` 是关键限定词**——它同时排除了手持晃动与光学变焦，是"纯物理位移"的英文最短表达。

### 2.2 三级刻度表

| 档 | 距离 | 时长 | 画面感受 | 情绪档 |
|---|---|---|---|---|
| **微动** | 5–10 cm | 2–4 s | 几乎察觉不到，但画面"活着" | 平静 / 留白 / 对峙 |
| **缓动** | 12–30 cm | 2–4 s | 明确能感到靠近/远离，构图不变 | 紧张 / 情绪逼近 / 揭示 |
| **运动** | 40 cm–1.5 m | 1–2 s | 明显的空间位移，构图重排 | 爆发 / 转场 / 追逐 |

**判据**：`距离 ÷ 时长` = 速度。**超过 15 cm/s 就不再是"缓"**——写 `20 cm over one second` 等于告诉 H3 "快速推"，会崩。

### 2.3 幅度 × 景别绑定（写超过上限必崩）

| 景别 | 推拉上限 | 横移上限 | 摇/俯仰上限 | 为什么 |
|---|---|---|---|---|
| **大特写 / 特写** | **10 cm** | **0（禁）** | 5° | 画面里只有一个鼻子，移 20cm 就出画 |
| **近景** | 15 cm | 10 cm | 10° | 脸部占 2/3，容错极小 |
| **中近景** | 20 cm | 20 cm | 15° | 半身，可小幅横移 |
| **中景** | 40 cm | 50 cm | 25° | 经典对话档，幅度最自由 |
| **全景 / 中全景** | 80 cm | 1.2 m | 40° | 需要空间感，幅度越大越有效 |
| **远景 / 大远景** | 1.5 m+ | 2 m+ | 60° | 小于 50cm 的移动在远景里**看不出来** |

> 源：`camera-system.md` §一「景别与表演幅度绑定」的反向应用——景别决定**容纳量**，运镜幅度也受同一约束。

### 2.4 五条幅度句式模板

```
极缓推（最常用）
the camera slides forward 10 cm over four seconds on a rail

缓推 + 起幅静止（震惊/顿悟标准式）
the shot holds still for half a second, then slides forward 12 cm over three seconds

缓拉（收段/揭示环境）
the camera pulls back 25 cm over three seconds, the desk edge entering the lower frame

横移（展开空间）
the camera slides right 40 cm over two seconds along the wall, the window coming into view

竖移（竖屏优先；横屏压 0.6 倍）
the camera rises 30 cm over three seconds, her face moving toward the upper third of the frame
```

---

## 三、速度：情绪强度 → 速度档

### 3.1 五档速度表（带物理换算）

| 情绪强度 | 速度档 | 换算 | 稳定性 | H3 写法关键词 | 典型运镜 |
|---|---|---|---|---|---|
| 平静 1–3 | 极慢 | <5 cm/s | 稳如轨道 | `over four seconds` / `barely moving` | 微推 / 微横移 / 几乎静止 |
| 紧张上升 4–6 | 慢–中 | 5–12 cm/s | 微晃 | `over two seconds` / `slight hand-held sway` | 缓推 / 跟拍 / 手持微晃 |
| 爆发 7–9 | 快 | 20–60 cm/s | 手持 | `in one second` / `hand-held` | 快推 / 快横移 / 手持 |
| 沉默留白 | 静止–极慢 | <3 cm/s | 极稳 | `holds still` / `almost imperceptible` | 固定 / 极慢拉 |
| 震撼凝固 10 | 静止 | 0 | 极稳 | `holds completely still` | 固定大特写（**不用升格**） |

**两条禁令**：
- 平静情绪 + 快速运镜 → 观众读到"出事了"，与戏冲突
- 爆发情绪 + 缓慢固定 → 观众读到"结束了"，情绪泄掉
- 例外：**刻意反规则**（见 §3.2），但必须在镜行里让"不动"有意义（如"她说完，镜头不动，只有她的呼吸在变"）

### 3.2 反规则（每段最多 1 个机会点）

> 源：`camera-system.md` §一「景别与情绪反规则」+ §三「机位角度反规则」

| 常规做法 | 反着用 | 效果 |
|---|---|---|
| 情绪越强景别越紧 | 绝望爆发 → **拉远** | 人在环境里变小 |
| 震撼 → 推镜逼近 | 震撼 → **固定大特写** | 无处可逃 |
| 暴力瞬间 → 特写冲击 | 暴力 → **切空镜/拉远** | 留白让观众脑补 |
| 反派 → 仰拍威压 | 阴险反派 → **平视或微仰贴近** | 近在咫尺的威胁比崇高的更阴险 |
| 弱者 → 俯拍 | 失败者的尊严 → **平视** | 绝境里最后的体面 |

### 3.3 一段内的速度曲线（H3 4–15s 怎么分）

H3 段短，**一段只走一个情绪拐点**，不要在一段里塞完整曲线。

| 段长 | 镜数 | 速度安排 |
|---|---|---|
| 4–5s | 1 镜 | 单一速度，一个运镜动作走完 |
| 8s | 2–3 镜 | 慢 → 稍快（或快 → 静收） |
| 12s | 3–4 镜 | 慢 → 中 → 静（三段递进，末镜留白） |
| 15s | 4–5 镜 | 静 → 中 → 快 → 静（完整四拍） |

**判据**：同一段内**不允许全程匀速**（三个镜同速度＝平），也**不允许每镜都变速**（会碎）。

---

## 四、运镜 × 景别：组合合法性

### 4.1 五类组合判定

| 判定 | 含义 |
|---|---|
| ✅ 合 | 官方与实测都稳 |
| ⚠️ 勉强 | 能做，但要砍幅度 |
| ⭕ 无效 | 做了看不出来（白写） |
| 💥 崩 | 出片必崩（构图错乱 / 主体出画 / 失焦） |
| ⛔ 禁 | 不做（H3 能力外） |

### 4.2 矩阵

|  | 固定 | 推 / 拉 | 横移 | 竖移 | 摇 / 俯仰 | 跟拍 | 环绕 | 变焦 |
|---|---|---|---|---|---|---|---|---|
| **大特写 / 特写** | ✅ | ✅ 10cm | 💥 | ⚠️ 10cm | ⚠️ 5° | 💥 | ⚠️ 20° | ⚠️ 半档 |
| **近景** | ✅ | ✅ 15cm | ⚠️ 10cm | ⚠️ 15cm | ✅ 10° | ⚠️ | ⚠️ 30° | ⚠️ 一档 |
| **中近景** | ✅ | ✅ 20cm | ✅ 20cm | ✅ 20cm | ✅ 15° | ✅ | ✅ 45° | ✅ |
| **中景** | ✅ | ✅ 40cm | ✅ 50cm | ✅ 40cm | ✅ 25° | ✅ | ✅ 90° | ✅ |
| **全景** | ✅ | ⚠️ 80cm | ✅ 1.2m | ✅ 1m | ✅ 40° | ✅ | ✅ 90° | ⭕ |
| **远景** | ✅ | ⚠️ 1.5m | ✅ 2m | ✅ 1.5m | ✅ 60° | ✅ | ⚠️ | ⭕ |

### 4.3 三条组合禁令

> 源：`camera-system.md` §7.2「三条组合级禁令」+ 本包 H3 换算

**禁令①：紧景别 × 大幅度**
特写里写 `slides right 50 cm` = 主体直接出画。**紧景别的运镜幅度必须按 §2.3 砍到 10–20cm**。

**禁令②：大景别 × 长焦**
长焦压缩空间，与"交代空间/建立关系"直接相冲。**要宏大用广角 + 低机位仰拍，不用长焦**。（H3 侧：远景镜不要写 `long lens`，写 `wide angle`）

**禁令③：位移 × 变焦同镜**
同时出现 = 无声明滑动变焦 = H3 出片"推一半卡住"。**二选一**。

---

## 五、画幅差异：9:16 竖屏（推荐）与 16:9 横屏（实测可用）

> 源：`camera-action-specs.md` §三「9:16 竖屏」+ §四「16:9 横屏」。
> **本包推荐竖屏**（短剧主流形态，模板默认按竖屏写）；**16:9 横屏实测同样跑得通**，规则见 §5.4，别硬套竖屏那套。
> **一部长片只选一档**，段间不换——换了段缝必崩。

### 5.1 竖屏的物理差异

| 维度 | 16:9 横屏 | **9:16 竖屏** |
|---|---|---|
| 横向空间 | 宽，可容纳双人并排 + 环境 | **窄**，双人并排就满，第三人必被切 |
| 纵向空间 | 有限 | **长**，可容纳高度差（站/坐/跪/倒地四层） |
| 横移价值 | 高（展开空间） | **低**（一移就出画） |
| 竖移价值 | 低 | **高**（揭示高度差） |
| 前后景叠压 | 可选 | **默认手段**（用纵深换宽度） |
| 站位 | 左右并置 | **前后错位**（一前一后，不是一左一右） |

### 5.2 四条竖屏运镜法则

**① 纵向优先**
```
❌ the camera slides right 1.2 m
✅ the camera rises 40 cm over three seconds, her head moving toward the top of the frame
```
竖屏的"展开"是**上下**，不是左右。

**② 前后景叠压代替横移**
不要靠移镜头来交代"还有一个人"，靠**纵深**：
```
前景是他虚焦的后肩，中景是她站在窗前，背景是走廊尽头的门
```
英文：`his shoulder is soft in the near foreground, she stands at the window in the middle distance`

**③ 双人不用并排，用前后**
竖屏里两人"画面左/画面右"会挤成各占一半，脸都不够大。改用**一前一后 + 侧 45°**：
```
她站在桌后，他站在桌前背对镜头（前景虚焦）
```
**这条与越轴规则的关系**：竖屏里"左右不变式"仍要写（防止反打翻人），但**摆位用前后错位**。见 `h3-shot-grammar.md` §二。

**④ 横移幅度砍半，摇镜改俯仰**
`pans left 45°` 在竖屏里会立刻出画 → 改 `tilts up 15°`。横移上限按 §2.3 再乘 0.5。

### 5.3 竖屏 vs 横屏句式改法

| 想要的效果 | 横屏写法 | **竖屏写法** |
|---|---|---|
| 展示完整空间 | `slides right 1.2 m` | `the camera rises from the table to the ceiling beam` |
| 强调两人对峙 | 并排双人中景 | 过肩 + 前景后肩虚焦 |
| 人物登场 | 横向跟入画 | `rises with him as he stands` |
| 压迫感 | 低机位仰拍全景 | 低机位仰拍**中景**（竖屏装不下全景的压迫） |

### 5.4 16:9 横屏的四条法则（用户实测档，别照抄竖屏）

横屏的短板换了个方向：**纵向短、横向长**。竖屏那套"纵向优先 + 横移砍半"在横屏里是反的。

**① 横向优先**
```
✅ the camera slides right 60 cm over three seconds on a rail
❌ the camera rises 1.2 m        （横屏里竖移一大就出画顶）
```
展开空间靠**横移 + 横向铺陈**，不靠上下翻。横移上限可放到 **40–60 cm**（竖屏是 20 cm 再乘 0.5）。

**② 竖移压到竖屏的 0.6 倍**
`rises 40 cm` → 横屏写 `rises 25 cm`。超过 30 cm 的竖移在 16:9 里会把人头顶切掉。

**③ 双人可并排，不用前后错位**
横屏空间够，`she is on the left, he is on the right` 真的能一人一半还给脸。**但越轴不变式照写**——并排不等于可以不锁左右。

**④ 全景/大仰拍解锁**
竖屏装不下的"低机位仰拍全景压迫感"，横屏直接可用。全景比例可以从竖屏的 10–15% 提到 **20–30%**，这正是横屏的价值所在。

> **横屏的代价要认**：竖屏"脸大"的红利没了。同一景别下横屏的人脸像素占比更小，**特写比例要往上提 5–10%**，否则短剧最吃的情感戏会显得远。

---

## 六、运镜节奏：动与静的语法

> 源：`shot-economy-and-acting.md` §四「运镜节奏衔接」

### 6.1 四种衔接的合法性

| 衔接 | 合法性 | 说明 |
|---|---|---|
| 动 → 动 | ✅ | 但要**换方向或换速度**，否则读成一次长运镜 |
| 动 → 静 | ✅✅ | 天然的"句号"，收段最好用 |
| 静 → 动 | ⚠️ | **必须有触发**（门响 / 她起身 / 一句台词），否则像卡了一下 |
| 静 → 静 | ✅（对话段） | 正反打就靠这个；但连续 ≥3 镜全静 → 画面死 |

**H3 特别注意**：H3 是逐镜渲染，**镜头之间没有"运动惯性"**。上一镜快速横移结束、下一镜立刻固定 → H3 会给出一个"急刹车"的观感。所以**快镜后面跟一个慢镜做缓冲**。

### 6.2 留白镜（情绪重锤后必加）

重锤（爆发/真相/死亡）之后**必须**至少 1 个留白镜：
- 环境空镜（雨打窗 / 空椅子）
- 无台词反应镜（他不动，只有呼吸）
- 动作细节空镜（手松开，杯子落地）
- 固定长镜

**景别比爆发镜更松**。不允许连续两个重锤。

**H3 侧注意**：留白镜**不要写成纯空镜**——H3 会给一个"没有人的房间"，观众三秒划走。写**人的局部**：
```
❌ the empty room, rain on the window
✅ her hand on the door frame, still, rain on the window behind it
```

### 6.3 运镜多样性（H3 缩水版）

| manju 原规则 | H3 换算 |
|---|---|
| 禁连续 3 镜同一运镜 | **禁连续 2 镜同一运镜**（H3 段内只有 2–4 镜，3 镜太宽） |
| 同场 ≥4 种运镜 | **一段 ≥2 种；一集累计 ≥5 种** |
| 全片 ≥8 种 | 保留（多段累计） |
| 不硬凑 | 保留。物理条件不足就不凑，**禁止为多样性加无叙事理由的运镜** |

---

## 七、复合运镜：H3 能不能做

> 源：`shot-economy-and-acting.md` §七「复合运镜」

### 7.1 判据三问

1. **时长够吗**？复合需要时间：两个动作各至少 2s → 段长 ≥5s
2. **是同一个目的吗**？"推+横移"如果是为了"逼近同时展开空间"→ 成立；如果只是"两个都想用"→ 拆开
3. **幅度加起来超上限吗**？推 30cm + 横移 50cm 在中景里 = 两个上限都吃满 = 必崩

### 7.2 H3 可接受的三种复合

| 复合 | 句式 | 前提 |
|---|---|---|
| 推 + 微摇 | `the camera slides forward 20 cm while panning slightly right` | 中景以上，摇 ≤10° |
| 移 + 微俯仰 | `the camera slides left 40 cm and tilts down 10 degrees` | 中景以上 |
| 跟 + 微降 | `the camera drifts with her and lowers 15 cm` | 跟拍镜，降幅小 |

### 7.3 必须拆镜的复合

- 升降 + 环绕（两个重技法，H3 会转晕）
- 推 + 拉（自相矛盾）
- 环绕 + 变焦（旋转同时缩放，出片是"漩涡"）
- 任何"三段以上"的连续运动（贴地→抬升→环绕→拉远）→ **拆成 3 个镜**

---

## 八、八档档位：四轴整行取齐

> 源：`camera-system.md` §7.1 主表——manju 的核心设计是「**先选档位，再整行取齐，不要逐轴拼**」。H3 版去掉景深列（移到段首），加上**幅度**列。

| # | 档位 | 景别 | 机位（方向 × 高度） | 运镜 | 幅度 | 典型任务 |
|---|---|---|---|---|---|---|
| 1 | **定场** | 全景 / 中全景 | 侧45° × 平视或微俯 | 缓横移 或 竖移 | 60cm–1m | 交代空间与站位（**禁开场特写**） |
| 2 | **常规对话** | 中景 / 中近景 | 侧45° × 平视（±15°） | **固定** | — | 对话主体、信息交代 |
| 3 | **过肩关系** | 中近景 | 过肩 × 平视 | **固定** | — | 双人关系、正反打 |
| 4 | **情绪逼近** | 近景 | **带角度**（侧45°/侧）× 微仰或微俯 | 缓推 | 15cm | 情绪上升、态度转变前 |
| 5 | **情绪爆点** | 特写 / 大特写 | **带角度**（3D 禁正面平视）× 微俯或微仰 | 固定 或 10cm 微推 | 10cm | 重锤、真相击穿 |
| 6 | **权力顶点** | 中景 | 广角 × **大仰角或大俯角** | 固定 或 竖移 | 30cm | 权力碾压、宿命 |
| 7 | **动作主体** | 全景 / 中景 | 低机位贴地 × 仰 | 跟拍 / 手持 | 实际步速 | 打斗位移、招式（打戏另见 `sd-combat`） |
| 8 | **极致细节** | 特写 / 微距 | 俯拍 或 平视 | 固定 或 微推 | 5cm | 关键道具、泪滴、纹理 |

**用法**：按情绪/信息任务选一行 → **整行取齐** → 再按 §4.3 三条禁令 + §5 画幅规则（竖屏 §5.2 / 横屏 §5.4）复核。

---

## 九、高光时刻三套组合（H3 版）

> 源：`camera-system.md` §四「高光时刻运镜专题」——manju 是 Seedance 版（带升格、摇臂），H3 必须换掉这些手法。

### 9.1 英雄登场（人物首次以强者姿态进入 / 回归救场）

| 镜 | H3 写法 | 作用 |
|---|---|---|
| 1 | 低机位大仰角中景，`the camera holds still`；他从画面下缘站起，逆光轮廓 | 先给"个头" |
| 2 | 中景，`the camera rises 40 cm with him` | 把威压从角度延续成运动 |
| 3 | 近景（带角度），`the camera slides forward 12 cm` | 落到"人"，不落到"神" |

**禁**：3 镜以上连用（变宣传片）；他还没站稳就环绕。

### 9.2 认知颠覆（真相击穿 / 背叛 / 世界观倾覆）

manju 原式：滑动变焦 → 荷兰角定格 → 焦点转移。**H3 没有滑动变焦**，改成：

| 镜 | H3 写法 |
|---|---|
| 1 | 特写（带角度），`the camera holds completely still`；她瞳孔收缩，脸上肌肉不动 |
| 2 | 中景，`the camera pulls back 30 cm over three seconds`；房间在她身后展开，越来越空 |
| 3 | 近景，`the focus moves from her face to the letter in her hand` |

**逻辑**：manju 用"背景塌陷"表达崩，H3 用"**拉远 + 焦点转移**"表达同一件事——她与世界脱开了。

### 9.3 制胜一击（打戏终结帧）

manju 原式：升格 → 螺旋环绕 → 固定大特写 → 缓拉。H3 换：

| 镜 | H3 写法 |
|---|---|
| 1 | 中景，`hand-held, the frame jolts once`；拳面接触，他的头猛地偏过去 |
| 2 | 特写（带角度），`the camera holds still`；他睁着眼，鼻血滴到地上 |
| 3 | 全景，`the camera pulls back 60 cm`；他跪下去，对手站着 |

**禁**：命中帧用晃动（"顿"拍必须稳，观众判断"打到没打到"就看这一帧）。

---

## 十、运镜病根台账（崩了查这里）

| # | 症状 | 根因 | 处方 |
|---|---|---|---|
| M01 | 推镜推猛，脸变形 | 没给距离 | 加 `12 cm` + `over three seconds` + `on a rail` |
| M02 | 推到一半人物站位漂了 | 推幅超景别上限 | 按 §2.3 砍（特写 10cm） |
| M03 | 镜头自己动（你没写运镜） | 缺运镜要素，H3 自由发挥 | 每镜**必须**写运镜，静止也写 `holds still` |
| M04 | 镜头自己加了一个开场全景 | 首镜没给主体锚 | `[Shot 1]` 首句写具名主体（写 `<Subject 1>`） |
| M05 | 横移把主体甩出画 | 竖屏 + 横移幅度过大 | 改竖移或砍半（§5.2）；横屏则查是否超 60cm（§5.4） |
| M06 | 特写里出现两个人的脸 | 特写 + 跟拍/环绕 | 特写只配固定或 10cm 微推 |
| M07 | 画面糊成一片 | 手持剧烈晃动写太长 | 改成单次冲击 `jolts once` |
| M08 | 有"卡帧"感 | 静 → 动 没给触发 | 加触发事件（门响/起身） |
| M09 | 镜头在"绕圈"但不交代关系 | 环绕超 90° | 砍到 40–90°，或改横移 |
| M10 | 变焦后失焦 / 画面变软 | 变焦跨两档景别 | 只变一档 |
| M11 | 一镜里既推又变焦，出片卡住 | 位移 + 变焦叠加 | 二选一（§4.3 禁令③） |
| M12 | 慢动作没出来，得到一张静帧 | 写了升格 | 删升格，改写受力结果 |
| M13 | 画面像监控摄像头 | 全程固定 | 加微动（5–10cm / 4s） |
| M14 | 每个镜都在动，看得很累 | 没有静止镜做呼吸 | 每 3 镜至少 1 个固定 |
| M15 | 段与段之间"跳" | 段缝运镜不接 | 上段末镜拉/固定收束，下段首镜新机位起手 |

---

## 十一、运镜句模板库（可直接抄）

| 场景 | 句式 |
|---|---|
| 对峙（不动，只有呼吸） | `[Shot 1] Medium shot, 45-degree side angle, the camera holds still; <Subject 1> stands at the door with her hand on the frame, <Subject 2> sits behind the desk, neither moves.` |
| 情绪逼近 | `[Shot 2] At 00:03.000, the camera cuts to a close-up, 45-degree side angle, sliding forward 12 cm over three seconds on a rail; her jaw tightens and her eyes stay on him.` |
| 揭示环境 | `[Shot 3] At 00:06.000, the camera cuts to a wide shot, 30-degree side angle, pulling back 60 cm over two seconds; the empty hall opens behind her, chairs pushed back from the table.` |
| 发现（顿悟） | `[Shot 2] Close-up, 45-degree side angle, the shot holds still for half a second then slides forward 10 cm; her pupils narrow and her lips part.` |
| 离开（收段） | `[Shot 4] At 00:09.000, the camera cuts to a medium wide shot, side angle, pulling back 40 cm as she walks out of the lower frame.` |
| 崩溃 | `[Shot 3] Medium shot, 45-degree side angle, the camera holds completely still; she stops mid-step, her shoulders drop, the room stays silent behind her.` |
| 权力压迫 | `[Shot 1] Medium shot, low angle 35 degrees, the camera holds still; he stands with his back to the window, the others sit below the frame line.` |
| 竖屏登场 | `[Shot 1] Medium shot, low angle 30 degrees, the camera rises 40 cm as he stands up; his head moves toward the top of the frame.` |
| 过肩对话 | `[Shot 2] Medium close-up, over-shoulder, the camera holds still; his soft shoulder fills the near left of the frame, she faces him with her hands flat on the table.` |
| 打斗冲击 | `[Shot 2] Medium shot, 40-degree side angle, hand-held, the frame jolts once; his fist meets the jaw and the head snaps back.` |
| 打斗收束 | `[Shot 3] Wide shot, 30-degree side angle, the camera pulls back 80 cm; he drops to one knee, the other man still standing.` |
| 留白（带人） | `[Shot 4] Close-up, 40-degree side angle, the camera holds still; her hand rests on the door frame, rain running down the glass behind it.` |

---

## 十二、机检对照

| 检查 | 级别 | 判定 |
|---|---|---|
| **H15 运镜缺位移量** | WARN | 有 `push/pull/slide/dolly/track` 但没写 cm → 补物理量 |
| **H16 禁用运镜** | FAIL | 出现 `slow motion` / `slow-mo` / `hit-stop` / `snap zoom` / `dolly zoom` / `speed ramp` / 升格 / 顿挫 → H3 做不出来 |
| **H17 运镜×景别矛盾** | WARN | 特写 + 横移/跟拍/环绕；远景 + 微推（<20cm，无效） |
| **H18 连续同运镜** | WARN | 相邻两镜运镜完全相同（`holds still` 在对话段豁免） |
| **H19 位移与变焦同镜** | WARN | 同镜既有位移词又有 `zoom` → 疑似无声明滑动变焦 |

**H3 侧不做机检的三项**（人眼判断）：
- 幅度是否与情绪匹配（机器判不了"这段该不该慢"）
- 反规则是否有理由（反规则必须故意）
- 竖屏构图是否挤压（要看画面）

---

## 十三、一页速查

```
每镜必写：景别 · 角度 · 运镜    （缺一即失控）
每推拉必带：12 cm + over three seconds + on a rail
特写幅度上限 10cm，中景 40cm，全景 80cm
竖屏：纵向优先，横移砍半，双人用前后不用并排｜横屏：横向优先，竖移×0.6，双人可并排
禁：升格 / Hit-Stop / 急速变焦 / 滑动变焦 / 摇臂 / Snorricam
替代：时间操控 → 写受力结果；滑动变焦 → 拉远 + 焦点转移
动→静合法，静→动必须有触发
重锤后必加留白镜，留白镜要带人的局部
一段 ≥2 种运镜，禁相邻 2 镜同运镜
```

---

## 十四、文戏运镜收敛铁律（2026-10-21 吸收 V7.4.26 实测 · 治「运镜穿帮」）

> **血泪实测**：曾有一集 24 镜配了 18 种运镜、0 个固定镜头，结果成片空间全乱、家具穿帮。根因是把「每镜必须标注运镜」误解成了「每镜都必须动摄影机」。

1. **标注运镜 ≠ 移动摄影机**：H3 要求每镜分号前必须有运镜槽位（不写 H3 会乱加摇移），但 **`the camera holds still`（固定机位）本身就是最稳的标准运镜标注**！
2. **15s 对话段（4 镜）黄金配比**：
   - **3 镜写 `the camera holds still`**（定场镜、特写插入镜、末镜收束定格）；
   - **仅 1 镜（最多 2 镜）写 `the camera slides forward 10 cm over two seconds on a rail`**（专门给情绪逼近或顿悟反应的那一镜）。
3. **开门/动作大变形镜优先固定或单轴缓拉**：当画面内已有大面积门扇开启（如《门后》段04 铁门自开）时，摄影机只允许 `holds still` 或单轴 `pulls back 20 cm over three seconds on a rail`，绝不叠加横移或摇镜。

