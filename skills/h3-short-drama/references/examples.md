# 完整样例

> 三个例子：① 12s 双人对峙（Ref2VA 六段式）② 8s 单人揭示（I2VA 三字段）③ 越轴专项（中立镜头过渡）
> 全部按官方格式写，可直接对照抄结构。
>
> **画幅说明（v2.0）**：下面三个样例都按 **9:16 竖屏（推荐档）** 写，站位与运镜用的是竖屏逻辑（前后错位、竖移优先）。
> 如果做 **16:9 横屏**，只改两处：① 载荷 `aspect_ratio` 换 `"16:9"`；② 双人摆位可改回左右并排、运镜按 `camera-movement.md §5.4`（横向优先，竖移压 0.6 倍）。
> 六段式字段、词根纪律、图槽规则**一个字都不用改**。

---

## 样例一 · 12s 双人对峙（Ref2VA · 六段式）

**锁**：Ref2VA ｜ 9:16 ｜ 12s ｜ BASE_ANIME（3D 半写实）｜ M2 有图
**参考图**：图1 女主 3View · 图2 男主 3View · 图3 书房主视角 · 图4 帕子（4/9）

### subject_definitions

```
<Subject 1> is the young woman in Picture 1: late twenties, shoulder-length black hair parted on the left, pale skin, a grey linen shirt with the top button open, a thin silver chain on her right wrist. Image used to lock her appearance.

<Subject 2> is the man in Picture 2: early thirties, short black hair, a pale scar at the tail of his left eyebrow, lean build, a dark grey high-collar jacket buttoned to the throat. Image used to lock his appearance.

<Subject 3> is the study in Picture 3: a dark wooden desk at the centre of the room, a tall bookshelf behind it, a wooden lattice window on the right with bamboo shadow outside, a folding screen on the left. Image used to lock the space.

<Subject 4> is the handkerchief in Picture 4: off-white cotton, frayed along the edges, a faded red plum blossom embroidered in one corner. Image used to lock the prop.
```

### summary

```
reference generation — She comes in with a handkerchief and sets it on his desk; he keeps writing; she says a name; he raises his head at last.
```

### retention_analysis

```
<Subject 1> (image): fully_preserved — face, hairstyle, clothing and the silver chain all retained.
<Subject 2> (image): fully_preserved — face, the scar on the eyebrow, hairstyle and jacket retained.
<Subject 3> (image): partially_preserved — desk, bookshelf, window and screen retained; camera angles are free.
<Subject 4> (image): fully_preserved — colour, frayed edge and the embroidered corner retained.
```

### detailed_description

```
The camera stays on the same side of them throughout; she is on the left, he is on the right.

[Shot 1] Wide shot, 45-degree side angle, static; inside <Subject 3>, <Subject 1> stands in the doorway on the left with a handkerchief held in her right hand, <Subject 2> sits behind the desk on the right with his head down over a letter, a single oil lamp on the desk throws warm light from the right side of the room, the bookshelf stands dark behind him.

[Shot 2] At 00:03.000, the camera cuts to a medium shot, 45-degree side angle, sliding forward 12 cm over three seconds on a rail; she walks three steps to the front of the desk and sets <Subject 4> down on the bare wood, her fingers staying on the cloth for a beat before she pulls her hand back.

[Shot 3] At 00:06.500, the camera cuts to a close-up, slightly low angle, static; his right hand stops moving on the paper, the brush tip rests against the page, and a small dark blot of ink spreads outward from the tip.

[Shot 4] At 00:09.000, the camera cuts to a medium close-up, 45-degree side angle, static; she stands at the near edge of the desk with her chin lifted and her arms loose at her sides, and he raises his head at last, his eyes moving to her face and staying there; the young woman with a low, flat, cool voice (S1) says at an even pace: <d>[Chinese] 你认识她。</d>
```

**这一段做对了什么**
- 段首一句正向越轴不变式，后面 4 镜全部在同一侧；**不写 `line` / `axis` / `frame`**（都会被画出形状）
- 3D 基底 → 两个近景都用 45° 侧角，**没有正面平视脸特写**
- 推镜给**明确位移量**（`sliding forward 12 cm over three seconds on a rail`），不用 `slow` 糊过去、也不写 `no zoom`（否定词根同样会被渲染）
- 四个 `<Subject>` 在正文**全部被引用**过（`<Subject 1>`/`<Subject 2>` 首镜入场、`<Subject 3>` 作空间、`<Subject 4>` 在镜2 落地）→ H5 不告警
- 每个镜都点名在场者（她/他），无丢人风险
- 只一个开口者（S1），且她说完就收段 → 不触发多说话人互串
- 正文分号后**零抽象词**：没有"对峙感/紧张/压抑"，只有手停、笔停、墨洇、抬眼

### overall_soundscape

```
A wooden door hinge creaks once and stops; three footsteps on a bare wooden floor, then silence; the soft rustle of cotton as the handkerchief meets the desk; the thin scrape of a brush being set down; the low steady hiss of the oil lamp wick; outside, rain on roof tiles, distant and even.
```

### non_diegetic_music

```
None.
```

### 载荷

```json
{
  "task": "ref2va",
  "prompt": "<上述六段全文>",
  "conditions": [
    {"type": "image", "uri": "pic1_female_4view.png", "role": "reference"},
    {"type": "image", "uri": "pic2_male_4view.png", "role": "reference"},
    {"type": "image", "uri": "pic3_study_grid.png", "role": "reference"},
    {"type": "image", "uri": "pic4_handkerchief.png", "role": "reference"}
  ],
  "target": {"short_edge": 768, "aspect_ratio": "9:16", "duration_seconds": 12},
  "seed": 0
}
```

---

## 样例二 · 8s 单人揭示（I2VA · 三字段）

**锁**：I2VA ｜ 9:16 ｜ 8s ｜ BASE_LIVE（真人）｜ M2
**参考图**：首帧 1 张

### 指令行（正文第一行，后跟空行）

```
For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.
```

### integrated_multimodal_description

```
Cinematic realism, cool daylight from a window on the left, shallow depth of field, fine film grain.

[Shot 1] Medium close-up, 45-degree side angle, static; the woman stands at the window with a folded letter held in both hands, her thumbs pressing a crease flat, daylight falling across the left side of her face.

[Shot 2] At 00:03.000, the camera cuts to a close-up, slightly high angle, static; her thumbs stop on the fold, the paper bends a little under the pressure, and her lower lip pulls inward for a moment.

[Shot 3] At 00:05.500, the camera cuts to an extreme close-up, side angle, static; her eyes move across the handwriting once, left to right, and then stop at the bottom of the page; the woman with a soft, breathy, uneven voice (S1) says quietly: <d>[Chinese] 原来是这样。</d>
```

**这一段做对了什么**
- 首镜有**具名主体**（the woman），不是空镜
- 真人基底：一个脸部近景用 45°，允许；全段只有一个脸部特写，配额不超
- 无对白冲突，单开口者
- 三镜景别递进（中近 → 近 → 极近），无同景别连排
- 8s / 3 镜，符合 2–4 镜区间

### overall_soundscape

```
Paper fibres creaking faintly under her thumbs; a soft inhale; birds outside the window, sparse and distant; the room quiet enough to hear the letter move.
```

### non_diegetic_music

```
Solo piano, three sustained notes, entering at 00:03.000 and fading out at the end of the segment.
```

### 载荷

```json
{
  "task": "i2va",
  "prompt": "<指令行 + 三字段>",
  "conditions": [{"type": "image", "uri": "pic1_firstframe.png", "role": "reference"}],
  "target": {"short_edge": 768, "aspect_ratio": "9:16", "duration_seconds": 8},
  "seed": 0
}
```

---

## 样例三 · 越轴专项：中立镜头过渡

**场景**：需要从"她的反打"切到"他的反打"（跨到轴线另一侧）。**不写"越轴"，用中立镜过渡。**

```
The camera stays on her side throughout; she is on the left, he is on the right.

[Shot 6] Medium shot, 45-degree side angle, static; he sits at the desk, his hand flat on the letter, his jaw tight.

[Shot 7] At 00:04.000, the camera cuts to a frontal medium shot, eye level, static; both of them are in frame, facing the camera, three metres of bare floor between them, neither moving.

[Shot 8] At 00:06.500, the camera cuts to a medium shot, 45-degree side angle, static; the camera is now on his side, so he is on the left and she is on the right; she looks at him without blinking.
```

**关键点**
- `[Shot 7]` 是**中立镜**：正面、双人同框、静止、无台词——它的唯一功能是"把观众的空间感重置"
- `[Shot 8]` 明写**新关系**（he left / she right），不写"反打""越轴""切到对面"
- 全段没有出现"轴线""180度""禁止"任何一个词

**另外两种越轴的写法**

镜头内过轴：
```
The camera arcs around them as she walks past him; the shot ends with her on the right and him on the left.
```

受击重建：
```
He is knocked back against the bookshelf; now she stands on the left and he is on the right, half bent over the fallen books.
```

---

## 反例对照（这些写法必崩）

| 错误写法 | 问题 | 改成 |
|---|---|---|
| `不要越轴，保持180度轴线锁定` | 否定式 + 工程术语，两个词根都会被渲染 | 段首正向不变式 |
| `镜头切至她的脸` | 中文切镜不被绑定 → 叠化成融脸 | `the camera cuts to` |
| `缓慢推进` | 无物理限位 → 推猛脸变形 | `slow push in, camera sliding forward 12 cm over three seconds on a rail` |
| `她冷笑一声说` | 语气写进画面 → 表情夸张成表情包 | 语气放 `(S1)` 外，画面只写肌肉动作 |
| `@林越 站在门边` | `@` 锚点 | `She stands in the doorway` |
| `特写 · 正面 · 平视`（3D 基底） | 组合致命 → 塑料感 | `close-up, 45-degree side angle` |
| `画外音响起：别回头` | 缺固定短语 + 缺 `(Sx)` → 角色张嘴 | 官方画外声公式三要素 |
| `她心里一沉` | 不可见 | `她的手指在袖口收紧` |
| `远处站着几个人` | 弱指令 → 模糊鬼影 | `three servants in grey stand along the wall, still` |
| `她和他在画面里` | 并列主体 → 手脸变两张脸 | 单主体统摄：`she stands ... ; he sits ...` 分句写 |
