# 分镜设计：从「一段画面」到「可拍的镜头」

> 2026-11-10 新增。**这份文件回答的是"怎么把一段剧情写成镜头"**——不是"什么时候该用什么运镜"。
> 已有 `camera-four-axis-h3.md`（四轴整行取齐）、`h3-shot-grammar.md`（机位四要素）、`camera-movement.md`（22 种运镜刻度）。本文件是**上游**：先把画面拆成镜，再谈运镜。

---

## 一、一句话原则

**分镜不是"把发生的事写下来"，是"设计观众依次知道什么"。**

写不出来的时候，问自己一句：**这段我要观众先看见什么、再看见什么、最后看见什么？** 这三个答案就是三个镜头。

---

## 二、五步法（写每一段都走一遍）

### 第 1 步 · 一句话定这段

只写三样：**谁** + **机制** + **落点**。

```
云只跟着他下雨，他撑了伞也没用。
```

机制 = 这段的笑点/冲突靠什么成立；落点 = 最后停在什么状态上。
**一句话写不出来，说明这段还没想清楚，别急着写镜头。**

### 第 2 步 · 拆「信息点」，不是拆事件

观众必须**依次**知道的事，通常 3 个：

| # | 信息点 | 观众心里的反应 |
|---|---|---|
| 1 | 整条街干的，只有他头顶一片云 | "就他？" |
| 2 | 一撑伞，水顺着伞沿全浇自己肩上 | "白撑" |
| 3 | 他挪一步，云也挪一步 | "躲不掉" |

**一个信息点 = 一个镜头。**（这是本文件最重要的一条）
按"事件"拆，会出现"乌云→撑伞→断骨→翻面→打脸"塞进 2.5 秒的写法；按"信息点"拆，每个镜头只需要说清一件事。

### 第 3 步 · 信息点 → 镜头（配功能、景别、机位、接法）

| 镜 | 功能 | 景别/机位 | 接法 | 秒 |
|---|---|---|---|---|
| 1 | 建立 + 铺垫 | 广角 35、平视、固定 | —— | 3.5 |
| 2 | 动作 | 中景、侧 45°、固定 | 硬切（切在动势中） | 3.5 |
| 3 | 反应 | 中近景 85、微仰、固定 | 硬切 | 4 |

### 第 4 步 · 每镜写三样

1. **首帧状态**：谁在哪、手里什么、环境什么状态（干/湿、暗/亮）
2. **动作链**：≤3 个节点，挂在具体身体部位上
3. **反应拍**：他的回应（`for a beat`、`stops`、`does not move`）

### 第 5 步 · 合句（一镜一句）

```
[Shot N] At MM:SS.mmm, the camera cuts to <景别>, <角度>, <固定/运镜+位移量>;
<谁> <在哪>, <首帧状态>, <动作1>, <动作2>, <反应拍>.
```

首镜无时间戳，且**首句里就要有人和位置**，不另起"首帧"句。

---

## 三、选材：能用「关系」演的，不用「形变」演

**这是决定成败的第一步，比运镜重要一百倍。**

| 关系型（推荐） | 形变型（慎用） |
|---|---|
| 云只跟着他下雨 | 伞骨折断、伞面外翻 |
| 鸟屎只落他头上，旁边路人没事 | 鸟屎把镜头盖砸出裂缝 |
| 砖下陷一指，水挤出来糊一脚 | 砖翘起，泥水喷到大腿 |
| 瓶盖永远不中奖 | 瓶盖崩开 |
| 电梯门每次都在他面前关上 | 电梯门变形卡死 |

**判据一句话：这件事换一个路人也会发生吗？**
- 不会 → 关系型，是"他的倒霉"，好拍、好懂、好笑
- 会 → 那只是"事故"，跟人物没关系，还多半要物体形变

**为什么形变型危险**：AI 视频模型对"多物体同时形变+破碎"极其不稳，十次里九次给你一个静止的结果状态。关系型只是"位置/时机/范围"的调度，模型做得好。

**第二条判据：变化幅度要可信。**
`dips a finger-width`（下陷一指）可信；`sprays up to the thigh`（喷到大腿）需要的水压不存在，观众不信、模型也画不出。

---

## 四、接法：硬切是默认，运镜要有动机

### 4.1 什么时候硬切

| 观众需要 | 用什么 |
|---|---|
| 注意一个**新东西** | 硬切（切到插入镜 / 切到反应） |
| 跟着一个东西移动 | 摇 / 跟移 |
| 情绪**加强** | 推（一段最多一次） |
| 揭示环境、制造孤立 | 拉 |
| 揭示上下/尺度关系 | 升降 / 俯仰 |

**喜剧点用硬切，越干脆越好。** 运镜会稀释笑点——倒霉戏、反应戏，90% 应该固定机位。

### 4.2 切点选在「动势中」

- 手抬到一半、脚将落未落、伞即将弹开 → 切
- 完全静止时切，会显得生硬

### 4.3 跳级与换角

- **景别跳级**：广角 → 特写，不要中景接中景
- **角度换边 ≥30°**，否则像跳帧
- **不越轴**；非要越，插一个中立镜（正面/背面）过渡

### 4.4 一镜不既切又摇

切 = 换信息；摇 = 同一信息内移动。写"中景当场切微距"这种，模型只会取一个。

### 4.5 运镜四要素

写运镜必须给：**方向 / 距离 / 时长 / 依托**

```
✅ sliding forward 12 cm over three seconds on a rail
✅ panning right 40 degrees over two seconds, following his shoulder
✅ tilting up 30 degrees as the tube leaves the ceiling
❌ slow push in / camera moves slightly / cinematic movement
```

---

## 五、每镜八项填词清单

缺一项就是没写完。

| # | 项 | 要点 | 反例 |
|---|---|---|---|
| 1 | **景别 + 焦段** | 一镜只一个 | 中景切微距 ❌ |
| 2 | **机位高度 / 角度** | 平视 / 膝高 / 仰 30° | 只写 85mm |
| 3 | **运镜 + 位移量** | 见 §4.5 四要素 | slow push ❌ |
| 4 | **空间参照** | 相对物体，不写画框左右 | "画面左侧" ❌ |
| 5 | **首帧状态** | 谁在哪、手里什么、环境干湿 | 只写"他走过来" |
| 6 | **动作链 + 反应拍** | ≤3 节点，末端必带一拍 | 五个动作塞一镜 ❌ |
| 7 | **可见证据（the tell）** | 观众先看懂的那个细节 | 说"砖松"却不给缝 ❌ |
| 8 | **声/对白时机** | 挂在哪一拍上 | 只写在 soundscape 里 |

---

## 六、让观众「看得清」的三条

1. **一镜一个信息**——不要让观众在同一个镜头里算两件事。
2. **先给证据，再给结果**——观众先看见破绽（缝宽一点、地面只湿他脚下），才有"要出事"的预感；直接给结果，只剩事故。
3. **反应拍是给观众的**——观众看的不是"水溅到腿上"，是"他什么时候发现"。**没有延迟，就没有喜剧。**

---

## 七、完整范例：云和雨（13s · 三镜）

### 中文审稿版

```
summary：
reference generation —— 一片云停在他头顶，只对他一个人下雨；他撑开伞，水顺着伞沿
全浇在自己肩上；他抬头看云，往旁边挪了一步，云也跟着挪了一步。

detailed_description：
镜头全程在街道同一侧；砖墙在画面左边，行道树在右边。

[Shot 1] 广角 35mm，平视，固定。
首帧：人行道是干的，远处一个拎购物袋的女人从灰白的天空下走过；他站在离墙三步
处，头顶悬着一片轿车大小的黑云，脚边一圈地砖已经湿了。
1.5 秒：那片云开始只朝他一个人落雨。

[Shot 2] 00:04.000，硬切到中景，侧 45°，固定。
他的右手"啪"地把伞撑开，伞面接住雨，四道细水线从伞沿往下淌，全落在他的肩膀和
外套前襟上；左手还垂在身侧。

[Shot 3] 00:08.000，硬切到中近景，85mm，微仰，固定。
他仰头看那片云，水从发际线顺着脸往下淌；11.0 秒他往旁边挪了一步，云也跟着挪了
一步，把他重新罩住；他低下头，不再动。
```

### 英文投喂版（六段式）

```
subject_definitions:
<Subject 1> is Lu Yuan, the young Chinese man in Picture 1: mid-twenties, short slightly messy black hair, olive-green work jacket worn open over a plain white cotton T-shirt, dark indigo straight jeans, white low-top canvas shoes.
<Subject 2> is the street outside a convenience store in Picture 2: a red brick wall with grey coping along one side of the pavement, dry grey paving tiles, a row of plane trees, a small store front with a plain dark-grey fascia, an even overcast morning sky.

summary:
[reference generation] A single dark cloud parks above his head and rains on him alone; he opens an umbrella and the water runs straight off its rim onto his own shoulders; he steps sideways and the cloud slides with him.

retention_analysis:
<Subject 1> (image): fully_preserved — face, hair and clothing retained.
<Subject 2> (image): fully_preserved — wall, paving, trees and store front retained.

detailed_description:
The camera stays on the same side of the street throughout; the brick wall runs along the left of frame and the trees along the right.

[Shot 1] Wide shot, 35mm, static, inside <Subject 2>; at the first frame the pavement is dry and a woman carrying a shopping bag crosses the background under an even grey sky, while <Subject 1> stands three steps from the wall with a dark cloud the size of a car hanging directly above his head and a ring of wet tiles already dark around his shoes, and at 1.5 seconds the cloud begins to rain on him alone.

[Shot 2] At 00:04.000, the camera cuts to a medium shot, 45-degree side angle, static; his right hand snaps the umbrella open above his head, the canopy catches the downpour, and four thin streams run off the rim and land on his shoulders and the front of his jacket, his left hand staying at his side.

[Shot 3] At 00:08.000, the camera cuts to a medium close-up, 85mm, slight low angle, static; <Subject 1> tilts his head back to look up at the cloud, water running from his hairline down his face, and at 11.0 seconds he takes one step sideways and the cloud slides one step with him, putting him back under it; he lowers his head and stops moving.

overall_soundscape:
A quiet morning street with distant traffic, then the hiss of rain confined to a small patch, the snap of an umbrella opening, four thin streams tapping on a jacket shoulder, and one wet step on dry tiles.

non_diegetic_music:
none
```

**这段做对了什么**

- 镜 1 里的**路人**是"关系型"的证据：她在干地上走，他在雨里站
- 伞**不断**，只是没用——形变型换成关系型，好拍十倍
- 每镜都有反应拍：`his left hand staying at his side`（没有补救）、`lowers his head`（认了）
- 切点都在动势里：云开始下雨时切走、水已经浇下来后切走

---

## 八、反例解剖（真机踩过）

| 写法 | 结果 | 病根 |
|---|---|---|
| 一镜内：`umbrella opens, two ribs snap, canopy flips out, rain hits his face`（2.5s） | 只给了一把**撑着的完好黑伞** | 5 个动作塞一镜 |
| `中景 50mm 拍猫 → 段内切 100mm 微距` | 只取了其中一个景别 | 一镜两景别 |
| `right foot on a loose brick, the brick tips, muddy water sprays up to the thigh` | 画面只有"裤腿上有泥" | 尺度不可信 + 缺 the tell + 缺反应拍 |
| 全片固定 9 图槽、每段全挂 | 模型以为每张图都要用 | 应按段挂图 |

---

## 九、冷开场禁令（前 30 秒）

> 2026-11-10 返工：开头四镜里我给了两段静默（S1-02、S1-04），等于在留存窗口上开了两个洞。

**前 30 秒禁止静默。** 每一段都必须有旁白或对白输出，不许出现纯音效段。

为什么：

1. **观众前 3 秒决定走不走，前 30 秒决定留不留**；平台也是按 3s / 5s / 10s 留存判的。静默的那几秒就是在往外推人。
2. **静默要靠画面自己撑住**——强冲突、强动作、强视觉。开头的"猫、下雨、踩水"画面不炸，一旦没声，就像测试片。
3. **开头旁白还兼"信息投喂"**：他是谁、什么处境、什么调性。不说，观众就得猜；猜的过程就是划走的过程。

**开头旁白要连成一条**，不是每段一句散话：

| 反例（配额式） | 正例（一条线） |
|---|---|
| 段1：我叫陆远。／段2：天煞孤星。／段3：我倒霉。／段4：谢谢惠顾。 | 段1：我叫陆远，今年二十五岁。／段2：算命的说我是天煞孤星转世。／段3：别人出门捡钱，我出门倒霉。／段4：……连瓶水都不让我中。 |

四个镜头是一条完整的自嘲式自我介绍，每个镜头都有声音输出，一秒空档都没有。

**30 秒之后的静默要过三关**（三关缺一不许静默）：

| 关 | 判据 |
|---|---|
| 强音效托底 | 狗低吼、袋子撕裂、灯泡爆掉、灯管脱钩——声音本身在推进剧情 |
| 有听戏链 | 他在看什么 → 呼吸怎么变 → 身体哪一处泄漏 → 停在哪（见 `camera-four-axis-h3.md §五`） |
| 有明确理由 | 能一句话说清"为什么这里不说话"，说不清就是漏写台词 |

---

## 十、自查五问（每段写完过一遍）

1. 这段的**一句话**是什么？写不出来 → 回第 1 步
2. 有几个**信息点**？和镜头数对得上吗？
3. 每镜是不是**一个信息、一个景别、一个动作链 + 一个反应拍**？
4. 倒霉/冲突靠的是**关系**还是**形变**？形变 → 换掉
5. 观众**先看见**的那个证据（the tell）在哪一镜？
6. **这段在第几秒？** 前 30 秒内有没有静默？（有 → 补一句旁白或对白）
7. 如果这段静默：强音效有了吗？听戏链写了吗？理由说得出吗？
