# 空间锚点 · 维持句 · 动作预算 · 门窗与分身防崩（H3 空间层唯一权威）

> 来源：MiniMax Hailuo 官方 prompt 模板（`[HOLD]` 维持逻辑、40–70 词上限）、官方多人动效指南（`one featured action, small everything else`）、以及 2026-10-21《门后》4 段成片（`p6_段01_规矩` ~ `p6_段04_门开了`）与《凶宅试睡员》6 段真机逐帧复盘。

## 一、为什么站位、门窗和人数会崩（机制，不是运气）

H3 **每段独立生成、零记忆**，且**按词根触发视觉图层**。它的四大底层习性决定了空间层的写法：

1. **零记忆自造家具**：参考图里没有、正文也没写的东西，它会自己造（沙发、吊灯、茶具）。
2. **跨镜预演与词根激活**：如果 Shot 4 写了开门/出门，或者前镜出现了 `gap / doorway / knock`，后面切机位如果不显式锁死 `the door stays shut`，它就会提前把门打开（段01 Shot 3 末尾提前压门把手、段03 Shot 3 反打背景门大敞四开）。
3. **段内坐标冲突 = 分身复制**：如果同一角色在 Shot 1 绑定在右侧电表箱旁，Shot 4 没写走位却写他在左侧鞋柜旁，H3 不会让他“瞬移”，而是**在右边保留一个旧的他，同时在左边鞋柜旁再画一个新的他**（段01 Shot 4 左右两个林昭夹住老周）！
4. **画外动作词根张冠李戴**：如果门外有人敲门，你在门内单人镜头的画面正文里写 `three knocks landing on the far side`，H3 看到动词 `knocks` 就会让**屋里的主角自己转过身去举拳敲自己家的门**（段02 Shot 1 真机实证）！

---

## 二、第一件必做：全片一张「空间锚点卡」（区分全程闭合段 vs 状态变化段）

开写前先钉死全片空间锚点卡，在每段 `detailed_description` 开头复述：

### 2.1 全程无门窗开闭变化的段落（如《门后》段02、段03）

**必须显式写死 `closed`（闭合态）**，不能只写 `one dark green steel door`：

```text
The entrance hall holds one closed dark green steel door with its latch chained facing the viewer,
one low wooden shoe cabinet at the left of the door, one grey meter box on the right wall
and one bare warm bulb overhead; these pieces stay in place for every shot.
```

### 2.2 段内发生开门/关门状态变化的段落（如《门后》段01、段04）

> **★ 2026-10-21《门后》段04 真机血泪教训（防“双扇门/门中门”分裂）**：
> 段04 在 `retention_analysis` 把门厅图 `<Subject 3>` 标为 `fully_preserved`，又在段首写死 `one dark green steel door facing the viewer... stay in place for every shot`，结果到了 Shot 4 写 `the steel leaf swings toward the viewer on its own` 时，H3 为了同时满足“参考图里正中带猫眼的关着的门不动”和“门扇向内打开露出走廊”，把单扇门硬生生分裂成了**左扇关闭（带猫眼）+ 右扇打开**的诡异双扇门！

**正确规程（H31 机检兜底）**：
1. **`retention_analysis` 改标 `partially_preserved`**：
   `<Subject 3> (image): partially_preserved — hall walls, shoe cabinet, meter box and bulb retained; the dark green steel door stays closed in Shots 1 to 3 and swings open in Shot 4.`
2. **段首锚点句只锁死不动的固定物，门标明“初始闭合”**：
   `The entrance hall holds one low wooden shoe cabinet at the left wall, one grey meter box on the right wall and one bare warm bulb overhead staying in place throughout; the dark green steel door at the centre starts closed and latched.`
3. **开门前的所有镜头（Shots 1–3）末尾维持句显式写 `the dark green steel door stays shut`**，严禁在 Shot 3 末尾提前抢跑压门把手；直到 Shot 4 才写门扇开启。

---

## 三、第二件必做：每镜一句维持句（HOLD · 落地在镜行末尾）

> **口径澄清**：`[HOLD]` 是 Hailuo Web 模板的概念，H3 Ref2VA 六段式没有独立 `[HOLD]` 字段，因此**一律写成每镜正文末尾的最后一句话**（机检 H24）。

| 治什么 | 正向维持句模板（挑 1–2 项，禁写否定词） |
|---|---|
| **门提前自开（段03 反打穿帮）** | `the dark green steel door and its iron chain stay shut behind him` |
| **站位/座位漂移** | `the two stools stay at the two ends of the table` |
| **家具乱造** | `the low wooden shoe cabinet and the grey meter box stay unchanged` |
| **服装/道具变形** | `the square white photograph stays flat in his left hand` |

---

## 四、第三件必做：动作预算与同框硬锁（一镜一主角动作 · H23/H30）

官方多人指南原话：
> `one featured action, small everything else`
> `five people doing five things reads as chaos and melts the weakest face first`

1. **单镜正文 ≤70 词**（>75 词 WARN，>100 词 FAIL——超 100 词必先丢机位再丢后半动作）。
2. **一镜最多两个人物 `<Subject>`，且只给其中一个人写动作**：
   - 同框第二人**只能写纯静态维持**（`<Subject 1> stands still by the right wall with both hands in his pockets`）；
   - **严禁给第二人写旁观动态词**（如 `watches him go` / `looks on` / `waits and watches`）——实测段01 Shot 4 写 `watches him go` 直接诱发 H3 把第二人再画一遍凑数（机检 H30）。

---

## 五、形变专治清单

| 病灶 | 原因 | 处方 |
|---|---|---|
| 递接物件时手穿模 | 手对手接触 | 改**放置式**：`she sets the cup down on the table` |
| 纸张/账本文字乱码 | 要求可读多字文本 | 写 `ink strokes standing in rows`（若需单字特写如`"允"`，须挂道具参考图或锁死单字微距） |
| 两人特征互换/融合 | 描述对称 | 服装/年龄/发型硬差异化，各自绑定固定方位 |

---

## 六、真机复盘一 · 《凶宅试睡员》6 段空间层规程（H28）

1. **空间描述过载 → 空间尺度膨胀（机检 H28）**：
   - 锚点写 `a wall of framed sepia photographs`，成片把一面木格栅铺成几百张照片的祠堂展厅，房间纵深翻倍。
   - **铁律**：家具/装饰一律**单数 + 限定位置**（`one tall framed photograph on the left panel`），严禁 `wall of / rows of / dozens of / hundreds of / grid of`。
2. **一段一景**：一段只允许一块空间；本段不用的空间图照样原槽位挂着（保图槽顺序），但正文不引用。
3. **特写镜带 1–2 个资产可识别特征**（`the iron chain on the steel latch`），防材质漂移；中景补可视裁切锚（`cut at the waist`）。

---

## 七、真机复盘二 · 《门后》4 段成片逐帧取证与五大硬伤根治（2026-10-21 · H29–H33）

对上传的 4 段成片（`p6_段01_规矩.mp4`、`p6_段02_敲门.mp4`、`p6_段03_背面_r1.mp4`、`p6_段04_门开了.mp4`）逐秒抽帧拉片后，定位出以下五大模型级病根及根治铁律：

### 7.1 病根一：人物穿过门洞/开口 → 半透明 alpha 融化蒸发（段01 末镜 · 机检 H29）

- **成片现象**：`p6_段01_规矩.mp4` 第 13.3s–15.0s，老周（`<Subject 2>`）往门外走时，身体越过门框线立刻变成半透明鬼影逐渐溶解消失。
- **文本病灶**：Shot 4 写了 `he steps out through the dark green steel door`。H3 把“穿过有框开口（`through the door / doorway / opening`）”当成图层透明度淡出（alpha transition）。
- **根治铁律（H29）**：**人绝不穿过门洞、窗洞、门帘、栅栏或任何有框开口。**
  - 安全替代 A（停在出门前）：`he turns toward the dark green steel door and rests his right hand on the latch`
  - 安全替代 B（只拍门合上，人已不在画内）：`the dark green steel door swings shut into its frame and the latch clicks into place`

### 7.2 病根二：段内依托物跳变 + 双人同镜动态 → 左右两个林昭分身（段01 末镜 · 机检 H30 + H32）

- **成片现象**：`p6_段01_规矩.mp4` 第 11.5s–14.0s（Shot 4），画面左右两边**同时站着两个一模一样的深灰连帽衫男主林昭（`<Subject 1>`）**，一左一右夹着中间的老周！
- **文本病灶（双重叠加）**：
  1. **段内坐标自相矛盾（主因 · H32）**：Shot 1 写老周 `<Subject 2>` 站在左侧鞋柜旁（`stands beside the low wooden shoe cabinet`），林昭 `<Subject 1>` 站在两步外的右侧（电表箱下）。到了 Shot 4，中间没有任何走位镜头，却突然写 `<Subject 1> stands beside the low wooden shoe cabinet`（把林昭写到了左边鞋柜旁）！H3 既保留了 Shot 1 右侧插兜的林昭，又按 Shot 4 指令在左侧鞋柜旁新画了一个插兜的林昭，于是出现左右双胞胎分身！
  2. **双人同镜加旁观动词（次因 · H30）**：Shot 4 同时写了老周出门 + 林昭 `and watches him go`。
- **根治铁律（H30 + H32）**：
  - **同一段内若无显式走位（`walks from A to B`），每个角色的依托物与左右位置必须从 Shot 1 到末镜 100% 锁定不变**（林昭在 Shot 1 靠右侧电表箱，Shot 4 就必须写 `stands still below the grey meter box on the right`）；
  - 同框第二人只准写 `stands still`，禁写 `watches him go`。

### 7.3 病根三：画外敲门写进画面正文 → 屋里男主自己转身敲自己家的门（段02 首镜 · 机检 H31a）

- **成片现象**：`p6_段02_敲门.mp4` 第 0.0s–2.5s（Shot 1），剧情是半夜门外女声敲门喊“水管漏了”，屋里只有男主林昭一人；但成片画面却是**林昭背对镜头，自己举起右手握拳在屋里敲自家的绿铁门**！
- **文本病灶**：`case15` Shot 1 在画面正文（分号后）写了：`he stops one step short of the steel door, his head tilted toward it, three knocks landing on the far side`。H3 的视觉渲染器不理解 `on the far side` 的空间阻隔，它只看到当前镜头唯一人物 `<Subject 1>` 和动作词根 `knocks`，于是直接驱动 `<Subject 1>` 举手敲门！
- **根治铁律（H31a）**：**凡隔着门/墙发生的画外声源动作（`knocks / knocking / pounding / footsteps outside`），严禁写进 `detailed_description` 的镜行正文！**
  - **画面正文只写门内可见的受迫物理结果**：`he stops one step short of the closed steel door, his head tilted toward it, the steel door vibrating three times in its frame and the iron chain clinking once on its hook`；
  - **敲门动作词只放进 `overall_soundscape`**：`Three heavy knocks sounding on the outer side of the steel door`。

### 7.4 病根四：跨镜开门抢跑、未开门段背景门自开、开门段分裂“双扇门”（段01/03/04 · 机检 H31b）

- **成片现象**：
  - `p6_段01_规矩.mp4` 第 10.5s（Shot 3 铁链特写末尾）：画面左侧突然伸出一只手把门把手压下（为 Shot 4 出门提前抢跑）；
  - `p6_段03_背面_r1.mp4` 第 7.5s–11.5s（Shot 3 男主正面低机位）：男主蹲在地上看照片，**他身后的绿铁门竟然大敞四开**（而剧情里门根本没开）；
  - `p6_段04_门开了.mp4` 第 11.5s–15.0s（Shot 4 门自己打开）：原本的一扇绿铁门分裂成了**左边一扇关着的带猫眼铁门 + 右边一扇向内打开的铁门**（门中门）。
- **根治铁律（H31b）**：
  - 未开门段（段02/03）：段首锚点与每个带门镜头的维持句必须显式写 `the closed dark green steel door stays shut and latched`；
  - 开门段（段04）：`retention_analysis` 场景标 `partially_preserved`（说明门从关变开），段首锚点不把门放进 `stay in place for every shot` 死锁列表，且开门前的 Shot 1–3 显式写 `the steel door stays shut`。

### 7.5 病根五：全蹲低姿态 + 窄缝穿物过程 → 渲染卡 76% 与成片冻帧 1.7s（段03 · 机检 H33）

- **成片现象**：`p6_段03_背面_r1.mp4` 投喂时连续三次卡死在 76%；跑出的成片在 `00:01.6–00:03.3`（Shot 1 全蹲）和 `00:05.8–00:07.4`（Shot 2 照片从门缝塞入）出现长达 1.7 秒的完全静止死机冻帧！
- **文本病灶**：Shot 1 `crouches on his heels`（全蹲折叠肢体 + 低角度）与 Shot 2 `slides through the gap under the door`（薄片穿过极窄门缝的物理过程）超出 H3 物理扩散收敛能力。
- **根治铁律（H33）**：
  - 禁写 `crouches on his heels` 全蹲，改为弯腰或半屈膝：`he bends from the waist with his right hand braced on the low wooden shoe cabinet`；
  - 禁写物品从门缝穿过/塞入的动态过程（`slides through the gap`），直接写**已进入门内的地面静置结果态**：`a white square photograph lies flat on the concrete sill just inside the closed steel door`。
