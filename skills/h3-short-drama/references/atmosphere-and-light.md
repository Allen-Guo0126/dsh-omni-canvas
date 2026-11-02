# 氛围与光影层：H3 唯一「越细越好」的一层

> 2026-10-24 定稿。治「国漫 3D 直出没氛围感、像在绿幕前演」。核心结论：**氛围感不是形容词问题，是缺失了一整层描述。**

---

## 零、三层分工（先解开「官方说越细越好」与「有图别长写」的矛盾）

用户的原话是「提示词越详细、环境描述越到位，效果越好」。这句话**对**，但只对其中一层。三层的写法是反的：

| 层 | 内容 | 参考图能否覆盖 | 写多细 | 写多了会怎样 |
|---|---|---|---|---|
| **外形层** | 脸 / 发型 / 服装 / 体型 / 饰品 | ✅ 人物图全覆盖 | **一句**（`the man in Picture 1, used exactly as he appears in the image`） | 与图打架，脸被拽跑、风格漂移（2026-10-22 实测） |
| **空间层** | 家具 / 陈设 / 空间尺度 / 门窗 | ✅ 场景图覆盖 | **只写站位与朝向**，物件一律不列 | 尺度膨胀，房间被盖大一倍（H28） |
| **氛围层** | 光位 / 光质 / 色温 / 空气介质 / 景深 / 材质高光 | ❌ **任何参考图都给不了** | **写到死，越长越准** | 不写就等于没有——模型回落到平均先验 |

**判据只有一句：参考图能覆盖的，一个字别写；参考图覆盖不了的，写到死。**

人物三视图和场景图都是**平光、正对、无空气**的资产图。它们能锁住「长什么样」，锁不住「被什么光照着、空气里有什么」。之前把所有字数都花在了外形层（还会被图推翻），氛围层是零——所以出来的画面是「有物件、有动作、没有空气」。

---

## 一、为什么国漫 3D 会「塑料 + 平 + 没氛围」

四个原因叠加，缺一个都还能看，四个全中就必塌：

1. **空词回落平均先验**。写 `cinematic` / `atmospheric` / `moody` / `beautiful` / `high quality`，H3 不会加氛围，它取的是训练集里「cinematic」这个词的**平均值**——均匀三点光、无空气、无前景。**空词 = 平均美学 = 塑料。**
2. **参考图布光被继承**。资产图是平光正对（三视图/场景图基本都是正面平光，不带光位），H3 会把它当作「这个世界的默认光」。不写光位 = 继承平光。
3. **高频增强放大数码感**。`SelfLift` + `dmad` LoRA 补的是边缘与高频，边缘越锐越像 CG 渲染，越不像被空气包裹的实拍。氛围靠的是**中低频的雾与光晕**，正好被这套增强压掉。
4. **没有空气介质 → 没有体积光 → 纵深塌陷**。3D 的「贵」全在光束能看见、尘埃能看见、远处能变淡。没有介质，画面就是多层贴图叠在一起，一眼假。

---

## 二、六件套（段首一次写够，**不占镜行字数**）

镜行有 ≤70 词硬上限（H23），氛围词塞进镜行会把动作挤掉。**全部写进段首**，一次交代完，后面每镜只在动作句上挂一个光/空气短语。

| # | 件 | 必须回答 | 英文句式（照抄改参数） |
|---|---|---|---|
| 1 | **光源与方向** | 光从哪来、几个 | `one warm lamp at the lower left throws a hard pool of amber light across the rug` |
| 2 | **光质** | 硬/软、切不切介质 | `the light is hard-edged and close, everything outside the pool falls into deep blue shadow` |
| 3 | **空气介质** | 空气里有什么 | `thin smoke crosses the beam, its cone visible from the lamp to the floor` |
| 4 | **色板三色** | 全片只用几个色 | `only three colours: deep indigo, warm amber, pale bone white` |
| 5 | **前景遮挡 + 景深** | 镜头前有没有东西挡着 | `a blurred bronze censer sits in the near foreground at the lower right, the room behind it falling soft` |
| 6 | **材质高光点** | 哪两处反光 | `the lacquered table keeps a wet highlight along its edge, one brass fitting gives a small hot glint` |

**最少要写 1/3/5 三件**（光位 + 介质 + 前景）。只写 1 和 4 是「有打光的平片」，仍然没氛围——**介质和前景才是"空气"本体**。

---

## 三、写在哪一行（位置错了等于没写）

| 模式 | 氛围层位置 |
|---|---|
| Ref2VA（六段式，本项目主力） | `detailed_description` 里、`[Shot 1]` **之前**，紧跟段首空间锚点句；RE 顺序：**风格句 → 光位句 → 空气句 → 空间锚点句 → [Shot 1]** |
| T2VA / I2VA（三字段） | `integrated_multimodal_description` 里、`[Shot 1]` **之后**（无前置正文区，放开头即可） |

**反例（真实稿子，2026-10-21《暖阁》段01）**：`detailed_description` 第一句直接是「沙发在左、茶几在中、窗在右」的空间锚点，**全篇没有一句光位、没有一句空气**。四镜全在「45-degree side angle」同一角度，唯一运镜是 12cm 微推。纪律满分，氛围为零——这就是「有物件没空气」的样板。

**镜行里只允许加一个**，且必须挂在这镜的动作句上：

```
✅ he lifts his chin, the lamp light cutting across his lower face, the rest staying in shadow.
❌ he lifts his chin. Warm lighting, shallow depth of field, atmospheric.   ← 关键词堆尾，会被当画面内容
```

---

## 四、国漫 3D 专用正词表（禁作品名，禁空词）

### 4.1 皮肤与着色（治「塑料脸」）

```
shading simplified into clean planes / soft subsurface warmth under the skin /
the skin keeps one broad soft highlight and no pore-level detail /
form defined by two tones with a soft transition between them
```

- **不要写** `subsurface scattering` / `skin texture` / `pores` —— 会推向写实真人。
- 国漫 3D 的脸靠**色块划分**而不是纹理细节，写「两块调子 + 柔和过渡」比写「皮肤细腻」有效。

### 4.2 材质（治「平平的一块色」）

```
lacquer keeps a wet-looking highlight along its edge /
silk catches one thin specular line as she turns /
brass gives one small hot glint, then goes dark /
jade lets light through its thin edge /
wet stone mirrors the lamp in a broken smear
```

国风场景的贵气 = **漆 / 丝 / 铜 / 玉 / 湿石** 五个材质的高光点，写 2–3 个就够。

### 4.3 光（治「平光」）

```
one hard pool of amber light on the floor, the rest in deep blue shadow /
a shaft of light from the high window cuts the smoke at a slant /
he is backlit, his face one tone darker than the light behind him /
the lamp sits low, throwing shadows upward across the wall
```

- **背光 / 侧逆光**是氛围感的最大杠杆：`backlit` + `one tone darker` 一句话就出剪影层次。
- 切忌 `warm lighting`（无方向 = 无信息）。

### 4.4 空气与粒子（治「绿幕感」）

```
thin smoke crosses the beam, its cone visible /
dust motes hang still in the light, only moving when she passes /
steam rises from the cup and breaks the light into a soft column /
raw silk curtains diffuse the window into a pale glowing wall
```

### 4.5 色板（治「颜色脏」）

```
only three colours: deep indigo, warm amber, and pale bone white
```

- 色板写**三色封顶**。写了三色，画面会自动做减法；写「丰富色彩」等于没写。
- 冷暖必须有一组对立：`warm amber` vs `deep blue shadow`。

### 4.6 词表黑名单（在氛围层也不许出现）

`atmospheric` / `moody` / `cinematic` / `filmic` / `beautiful` / `stunning` / `high quality` / `masterpiece` / `volumetric lighting`（元词，会被当画面内容）/ `depth of field`（元词，写景深结果）/ 任何作品名

> 这些词在**开场风格句豁免区**（`h3-lexicon-cleanup.md §零之二`）里可以有限出现，但**不能替代**六件套。豁免区是「允许出现」，不是「写了就够」。实测：只写豁免区那句 `Cinematic realism, shallow depth of field, fine film grain, low-key warm lighting.` → 出来的仍然是平光片。

---

## 五、参考图是平光，怎么救

三个办法，按成本从低到高：

1. **正文强覆盖（首选，零成本）**：段首先行写光位与阴影落点，覆盖掉继承来的平光。写上 2–3 句就够压住。
2. **换一张有光的场景图**：场景图重出时把光写进 prompt——`the room lit by one low lamp at the left, deep shadow at the right, thin smoke in the air`。图里带光，H3 继承的就是有光的世界。
3. **降 LoRA 强度**：`dmad` 0.45 → 0.30，或干脆关掉，让中低频的雾与光晕活下来。实测 0.45 是「风格够但略硬」的平衡点，纯氛围镜头可以再降。

**不要做的事**：不要为了氛围去把人物/场景参考图换掉。图不是氛围的来源，文字才是。

---

## 六、验片：氛围层到底进没进去

抽 3 帧（首、中、尾），问四个问题，中两个以下就是没进去：

1. **空气可见吗**？有没有光束、尘埃、烟、蒸汽的痕迹。
2. **前景有遮挡吗**？画面边缘有没有虚化的近处物体（不是空的）。
3. **暗部有色吗**？暗的地方是深蓝/深褐，还是死黑/灰。
4. **有没有一处硬高光**？漆面、金属、湿石的反光点。

如果三项全无：**先砍镜行动作词，给段首腾字数**——不是加形容词，是把字数从「他已经站了三秒没动」这类填充句里挪到光位和空气上。

---

## 七、机检

**H35**：段内检「光位 / 空气介质 / 前景景深」三类关键词。缺两类以上 → WARN（不会 FAIL，氛围是质量问题不是合规问题）。

机检只能查「有没有写」，查不了「写得好不好」。真判据是第六节抽帧四问。
