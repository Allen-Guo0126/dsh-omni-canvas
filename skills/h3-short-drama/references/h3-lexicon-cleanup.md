# 词根清洗（H3 Lexicon Cleanup）★ 本包最高优先级

> **原理**：H3 不是在"理解导演意图"，是在**按词逐个找视觉元素**。
> 你写"不要越轴"，它丢掉"不要"，去找"轴"——然后画一条轴出来。
> 你写"气质阴郁"，它丢掉"气质"，去找"阴郁"——然后给你一张通用阴沉脸。
>
> **所以：任何进入正文的词，都必须是能被画出来的东西。**

---

## 零、一条分界线：镜行头 vs 镜行正文

```
[Shot 2] Medium shot, 45-degree side angle, slow push in; she walks three steps to the desk.
         └────────── 镜行头（允许镜头语法）──────────┘ └──── 镜行正文（只许人和物）────┘
```

| 区域 | 允许 | 禁止 |
|---|---|---|
| **镜行头**（第一个分号之前） | 景别 / 机位角度 / 运镜 / static | 形容词、情绪词、比喻 |
| **镜行正文**（分号之后） | 人物动作、表情肌肉、道具状态、空间位置、光的方向 | **任何镜头术语、摄影术语、抽象评价、心理动词、比喻、声音词、否定词** |

这条线是**可机检的**（H13 只扫分号后）。守住它，80% 的词根污染就没了。

---

## 零之二、唯一豁免区：开场风格句

`[Shot 1]` **之前**的 1–2 句影像风格描述，是唯一允许出现摄影术语的地方。这不是漏洞，是官方允许的表达位：它不进镜行、不参与逐镜渲染，只定整体质感。

```
Cinematic realism, shallow depth of field, fine film grain, low-key warm lighting.

[Shot 1] Wide shot, 45-degree side angle, static; ...
```

**豁免边界（三条，缺一条就不豁免）**

| 条件 | 说明 |
|---|---|
| 只讲**整体质感** | `shallow depth of field` / `fine film grain` / `35mm` / `high contrast` / 色温 / 胶片颗粒 → 放行 |
| **不掺否定根** | `no grain` / `without distortion` / `not blurry` → 照样 FAIL，词根会被渲染 |
| **不掺元描述根** | `composition` / `framing` / `axis` / `shot list` → 照样 FAIL，会画出框和线 |

**位置必须对**：Ref2VA 在 `[Shot 1]` **之前**；T2VA 在 `[Shot 1]` **之后**（T2VA 没有前置正文区）。位置错了，风格句会混进第一镜被逐条渲染。

**监控项**：如果实测发现某个风格术语会让 H3 硬做效果（`depth of field` 导致全片死虚焦、`film grain` 导致噪点过重），就把该词降级为硬根、连豁免区一起清，改用等效可见事实（`the background falls into soft focus`）。**豁免是默认放行，不是永久许可——以实测为准。**

---

## 一、否定根（最高危 · FAIL 级）

| 禁写 | H3 会怎么做 | 改成 |
|---|---|---|
| 不要越轴 / 禁止越轴 | 丢掉"不要"，画出轴线 | 段首正向不变式（见 §三） |
| 没有眼泪 | 丢掉"没有"，给眼泪 | `her eyes are dry, her face still` |
| 不看她 | 丢掉"不"，给"看她" | `her eyes stay on the window` |
| 不要出现手机 | 丢掉"不要"，给你一部手机 | 只写出场物：`a teacup, a folded letter` |
| 不许笑 | 丢掉"不许"，给笑 | `her mouth stays flat` |
| 无人 / 空无一人 | 丢掉"无"，可能给你人 | `the room holds one chair and one lamp` |
| `no zoom` | 丢掉 `no`，去找 zoom | `the camera slides forward 12 cm over three seconds on a rail` |
| `without moving` | 丢掉 without | `he holds still` |
| `never smiles` | 丢掉 never | `her mouth stays flat` |
| `nothing on the desk` | 丢掉 nothing | `the desk is bare wood` |

**总原则**：**只写"存在的"。要表达"没有 X"，就写"有什么"来占满那个位置。**

---

## 二、元描述根（描述"我怎么写"，不是"画面有什么" · FAIL 级）

| 禁写（出现在镜行正文里） | 原因 |
|---|---|
| 轴线 / 180度 / 越轴 / 轴线锁定 | 会被画成一条线 |
| 构图 / 取景 / 画幅 / 景别（作为叙述词） | 抽象，模型无从落笔 |
| 焦平面 / 景深 / 焦外 / 光位 / 色温 / 镜头质感 | 摄影说明书，会被当画面内容 |
| 分镜 / 镜号 / 镜头切至 / 转场 | 工作流词，非画面 |
| 呼吸式微动 / 构图平整 / 毫米级补偿 / 焦平面死锁 | 纯说明书 |
| 为了表现… / 用来突出… / 意图是… | 意图不是画面 |

> **注意**：景别与机位角度**写在镜行头里是合法的**（`Medium shot, 45-degree side angle`），因为那是官方镜头语法。**写在正文里**就变成污染。

**换法**：把"想达到的效果"翻译成"看得见的结果"。

| 想表达 | 不要写 | 写这个 |
|---|---|---|
| 浅景深突出她 | 用浅景深突出她 | 镜行头写 `close-up`；正文写 `the bookshelf behind her blurs into flat brown` |
| 冷色调压抑 | 冷色调，压抑氛围 | `grey daylight, no warm source in the room` → 改 `grey daylight from one window, the lamp unlit` |
| 高机位显弱小 | 用高机位表现她的弱小 | 镜行头 `high angle`；正文写 `she stands with her shoulders turned in, looking up` |

---

## 三、"线"这个词本身也要绕开

**越轴不变式**的第一版写法是 `The camera stays on one side of the line between them`——**`line` 有被画成一条线的风险**。

**改用**：
```
The camera stays on the same side of them throughout; she is on the left, he is on the right.
```

- 不出现 `line` / `axis` / `180`
- 不出现 `frame`（`left of the frame` 里的 frame 也可能被画成画框）→ 直接 `on the left`
- 三条合法越轴照旧（见 `h3-shot-grammar.md §二`），但**全部用人和物的位移来表达**

---

## 四、抽象评价根（WARN 级，但会直接毁质感）

| 类 | 词根 | H3 的默认落法 | 改成 |
|---|---|---|---|
| 质感 | 电影感 / 高级感 / 唯美 / 氛围感 / 质感 | 套一个通用滤镜 | 写出可见要素：光从哪来、什么颜色、有什么在动 |
| 气场 | 气势 / 气场 / 压迫感 / 威严 / 阴险 / 城府 | 皱眉 + 阴影 + 眯眼（刻板脸） | `he sits, everyone else stands` / `his hand rests flat on the table` |
| 情绪 | 悲伤 / 绝望 / 孤独 / 宿命 / 压抑 / 暧昧 | 夸张表情 | 生理证据（见 §五） |
| 判断 | 显然是 / 看得出 / 似乎 / 大概 | 无视觉 | 删 |

**唯一有效的换算**：**抽象词 → 谁在什么位置 / 谁做了什么 / 光落在哪 / 什么东西在动。**

---

## 五、心理与不可见动作根（WARN 级 · 最容易变成表情包）

| 禁写 | 改成（生理证据） |
|---|---|
| 她很紧张 | `her breathing turns shallow, her thumb presses into her index finger` |
| 他犹豫了 | `his hand stops halfway to the cup, then pulls back` |
| 她心里一沉 | `her shoulders drop a centimetre, her chin lowers` |
| 他强压怒火 | `his jaw shifts once, his nostrils widen, he exhales through the nose` |
| 她回忆起往事 | `her eyes lose focus on the letter, her thumb stops on the fold` |
| 他假装镇定 | `he sets the cup down and the tea moves, he steadies it with two fingers` |
| 她意识到 | `her head turns a few degrees toward the door, she stops moving` |
| 他试图开口 | `his mouth opens, no sound, he closes it` |

**换算公式**：**心理词 → 三个以下的身体部位的具体变化。**

呼吸、喉结、下颌、鼻翼、眼睑、指尖、肩线、重心——这八个部位能表达 90% 的情绪。

---

## 六、比喻与程度根（WARN 级 · 喻体会被画出来）

| 禁写 | 原因 | 改成 |
|---|---|---|
| 像被抽走灵魂 | 可能画出"灵魂" | `she stands without moving, her arms loose at her sides` |
| 如坠冰窟 | 画出冰 | `her hands go white at the knuckles` |
| 宛如一尊石像 | 画出石像 | `she does not blink for three seconds` |
| 仿佛时间静止 | 画出静止的时间（可能给你定格） | `no one in the room moves; the lamp flame stands straight` |
| 非常慢 | 程度空转 | `three seconds, twelve centimetres` |
| 猛地 | 空转 | `in one motion` / `within half a second` |
| 微微 / 略微 | 空转 | 给量：`a centimetre` / `half a step` |

**英文同源陷阱**：`as if` / `like a` / `seems to` / `appears to` —— 全部删掉，改直陈。

---

## 七、声音词混进画面段（FAIL 级）

| 禁写（在镜行正文里） | H3 会怎么做 |
|---|---|
| 声音 / 响声 / 传来 / 回荡 / 响起 / 静得能听见 | 诱发人物张嘴、或凭空加字幕/音效字 |
| `a sound of…` / `is heard` / `echoes` | 同上 |

**规则**
- **声音只进 `overall_soundscape`**，画面段只写**声源动作**：
  - ❌ `外面传来雨声` → ✅ 画面：`water runs down the window glass`；声音：`rain on roof tiles, steady`
  - ❌ `门响了` → ✅ 画面：`the door swings inward`；声音：`a hinge creaks once`

---

## 八、光效词叠在反光物上（WARN 级）

| 禁写 | 改成 |
|---|---|
| 玉牌闪着光 / 光斑落在镯子上 / 银器受光发亮 | 只写材质本色 + 位置朝向：`the jade pendant, pale green, turned toward the window` |
| 刀锋寒光一闪 | `the blade edge catches a thin white line of daylight` |

要让"闪"，就写**谁转动了它、朝向哪里**，不写"光"这个词。

---

## 九、群体与不定指（WARN 级）

| 禁写 | 改成 |
|---|---|
| 众人 / 大家 / 人群 / 有人 / 某人 / 远处的人 | 数量 + 位置 + 状态：`three servants in grey stand along the wall, still` |
| `someone` / `people` / `a crowd` | 同上；或让它**不入画** |

**具名上限**：一个 15s 段里有外观描述的角色 ≤3 人；第 4 人起只给"数量+位置+状态"。

---

## 十、改写九公式（背下来就够用）

| # | 公式 | 例 |
|---|---|---|
| 1 | **否定 → 正向占位** | 不要抬头 → `his head stays down` |
| 2 | **心理 → 生理** | 她很紧张 → `her breathing turns shallow` |
| 3 | **抽象 → 物理证据** | 他很威严 → `he sits, everyone else stands` |
| 4 | **比喻 → 直陈** | 如坠冰窟 → `her knuckles go white` |
| 5 | **程度 → 量词** | 非常慢 → `twelve centimetres in three seconds` |
| 6 | **声音 → 声源** | 传来哭声 → 画面写 `the door across the hall stands ajar`，声音进 soundscape |
| 7 | **群体 → 计数** | 众人哗然 → `three people turn their heads at once` |
| 8 | **元描述 → 可见结果** | 用浅景深 → 镜行头 `close-up` + 正文 `the shelf behind her blurs into flat brown` |
| 9 | **被动 → 主动** | 她被推倒 → `he shoves her shoulder, she falls back onto the chair` |

---

## 十一、清洗流程（五遍，顺序不能换）

```
第 1 遍 · 删否定：所有 不/没/无/未/别/勿/避免/禁止 + no/not/never/without/avoid
第 2 遍 · 删元描述：轴线/构图/景别/焦平面/景深/分镜/镜号/为了表现
第 3 遍 · 换抽象：情绪/气场/氛围/质感/判断词 → 物理证据
第 4 遍 · 心理转生理：想/觉得/意识/犹豫/压抑 → 八个部位的具体变化
第 5 遍 · 拆比喻与程度：像/如/仿佛/非常/微微 → 直陈 + 量词
```

每遍过完，把稿子当"陌生人能不能照着画出来"读一次。**画不出来的句子，就是污染。**

---

## 十二、可搜索黑名单（直接 Ctrl+F 用）

**中文**
```
不要 禁止 避免 切勿 勿 别 无需 不准 不许
没有 无 未 非 否
轴线 180度 越轴 构图 景别 机位 焦平面 景深 焦外 光位 色温 分镜 镜号 画幅
电影感 高级感 唯美 氛围 质感 张力 气场 气势 压迫感 宿命 孤独 压抑 暧昧
情绪 内心 心理 回忆 往事 五味杂陈 心如死灰 阴险 城府 深沉 沧桑
想 觉得 意识到 明白 回忆起 犹豫 挣扎 心动 心痛 不甘 假装 故作 压抑 克制 试图 尝试
像 如 似 仿佛 宛如 犹如
非常 极其 十分 格外 略显 微微 略微 突然 猛地 渐渐 缓缓 一直 始终
声音 响声 传来 回荡 响起
光斑 受光 照耀 亮起 闪烁 反光 映出
众人 大家 人群 有人 某人 远处的人
```

**英文**
```
no not never without avoid lack none nothing nobody
no one free of
axis line frame (作名词时) composition framing depth of field focal plane
cinematic high-end atmospheric vibe tension aura presence
as if like a seems appears
very extremely slightly somewhat suddenly slowly (作程度副词时)
a sound of is heard echoes
someone people a crowd
```

> `slowly` 在**运镜**里合法（`slowly pushes in`），在**动作**里是程度空转（`slowly raises her hand` → 改 `raises her hand over three seconds`）。

---

## 十三、自检（每段必过）

- [ ] 正文分号后**没有一个**镜头/摄影术语
- [ ] 正文**没有一个**否定词（`no/not/never/without` 全清）
- [ ] 正文**没有一个**"像/如/仿佛/as if"
- [ ] 心理动词全部换成了身体部位动作
- [ ] 声音词全部在 `overall_soundscape`，画面只有声源动作
- [ ] 反光道具没有"光"字
- [ ] 群体都有数量
- [ ] 每个形容词都能回答"镜头里看到的是什么"
