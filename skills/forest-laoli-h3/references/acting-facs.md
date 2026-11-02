# 表演层 · 四区肌肉（FACS for H3）

> **为什么必须有这一层**：H3 丢弃心理词、渲染词根。"她很紧张"里的"紧张"没有可画的形状，模型只能调出通用模板——皱眉 + 瞪眼 + 抿嘴，一张表情包。
> **解法**：把情绪拆成**看得见的肌肉动作**。这不是电影学院的花活，是 H3 的语法要求。

---

## 一、四区总表

只要写四区，就能覆盖 90% 的情绪。**四区之外不必写**（写多了反而稀释）。

| 区 | 肌肉 | 可见效果（写这个） | H3 英文写法 |
|---|---|---|---|
| **眉** | 皱眉肌 | 眉心下压、眉心挤出竖纹 | `her brows pull together` / `two vertical lines appear between her brows` |
| | 额肌内侧 | 眉毛内侧上抬（委屈、悲伤） | `the inner ends of her brows lift` |
| | 额肌外侧 | 眉毛整体上抬（惊讶、疑问） | `her eyebrows rise` |
| **眼** | 眼轮匝肌 | 眼尾收缩、眼下隆起（**真笑的唯一证据**） | `the outer corners of her eyes tighten` / `the skin under her eyes bunches` |
| | 上睑提肌 | 上眼睑抬高、露出更多眼白（惊恐、瞪） | `her upper lids lift, more white showing` |
| | 眼睑下垂 | 上眼睑压低（疲惫、麻木、轻蔑） | `her lids hang low` |
| **口** | 颧大肌 | 嘴角上提（笑） | `the corners of her mouth lift` |
| | 降口角肌 | 嘴角下压（厌恶、忍住、不悦） | `the corners of her mouth pull down` |
| | 笑肌 | 嘴角横向拉开（**假笑**——只横向不带上眼） | `her mouth stretches sideways` |
| | 口轮匝肌 | 双唇压紧 / 噘起 / 分开 | `her lips press into a thin line` / `her lips part by a finger's width` |
| **颌** | 咬肌 | 腮帮鼓起、下颌咬紧 | `her jaw muscles stand out` / `her teeth are clenched` |
| | 颏肌 | 下巴上顶起皱（忍泪、强撑） | `the skin of her chin creases` |
| | 下颌下落 | 嘴微张（愣住、失神） | `her jaw goes slack` |

**四区速记**：`眉说情绪，眼说真假，口说态度，颌说力度`。

---

## 二、铁律：不写 AU 编号，不写心理词

| ❌ 不能写 | 为什么 | ✅ 改写成 |
|---|---|---|
| `AU4 + AU12` | AU 编号是内部标注，H3 不认识，会当噪声 | `her brows pull together, the corners of her mouth lift` |
| `she is nervous` | 心理词，无可画形状 | `her breathing turns shallow, her thumb presses into her index finger` |
| `she looks sad` | "sad" 是结论不是动作 | `the inner ends of her brows lift, her gaze drops to the floor` |
| `she smiles bitterly` | "bitterly" 是程度形容词 | `only the corners of her mouth lift, her eyes stay flat` |
| `she looks at him coldly` | "coldly" 无形状 | `she looks at him without blinking, her lids low` |
| `her expression is complicated` | 抽象 | 拆成两拍：先 `her brows pull together`，再 `her lips press tight` |

**判据一句话**：写完之后问自己——**这个部位在画面里能被看见在动吗？** 看不见的就是形容词。

---

## 三、幅度怎么写（H3 特有）

H3 对程度副词（`slightly` / `very` / `a little`）不敏感，容易幅度失控。**用可见计数替代**：

| ❌ 程度词 | ✅ 可见计数 |
|---|---|
| `slightly open mouth` | `her lips part by a finger's width` |
| `very tight jaw` | `her jaw muscles stand out, two ridges at the sides` |
| `a little frown` | `a single crease between her brows` |
| `eyes wide` | `more white showing above her pupils` |
| `smile a little` | `only the left corner of her mouth lifts` |
| `breathing hard` | `her shoulders rise and fall with each breath` |
| `hands shaking` | `the teacup rattles against the saucer` |

**原则**：**能量化的量化（几颗牙、几指宽、几道纹），不能量化的换成物理后果（杯子响、肩膀起伏）**。

---

## 四、景别与表演幅度绑定（写多了会被裁掉）

**景别只能写它装得下的东西**。特写里写"她后退两步"——装不下，模型要么改景别要么出怪构图。

| 景别 | 装得下 | 装不下（写了就会崩） |
|---|---|---|
| **大特写**（眼睛/嘴/手） | 眼睑、瞳孔、眼周皮肤、唇线、指尖 | 眉、下颌、肩、任何位移 |
| **特写** | 眉 + 眼 + 唇 + 下颌 + 鼻息 | 肩以下、手部动作（除非手入画） |
| **近景**（胸以上） | 上述 + 肩、颈、耳根、手的起势 | 完整手部动作、腰部以下 |
| **中景**（腰以上） | 上半身、手臂、手势、面前桌面 | 完整腿部、房间全貌 |
| **全景** | 全身、姿态、人物与空间关系 | 面部细节（会糊成一团） |
| **远景** | 空间、人数、规模 | 任何个体表情 |

**短剧实战配比**：
- **9:16 竖屏（推荐档，偏中近）**：中近景 40–50% · 特写 20–25% · 中景 15–20% · 全景 10–15% · 大特写 ≤10%
- **16:9 横屏（实测可用档）**：中近景 35–45% · 特写 25–30% · 中景 15–20% · **全景 20–30%** · 大特写 ≤10%（横屏脸像素占比小，特写要往上提）

---

## 五、四区组合的三种模式

单区只够表达一个瞬间；真正有戏的是**组合 + 时间差**。

| 模式 | 结构 | 用于 | 例子 |
|---|---|---|---|
| **同步** | 四区同时朝一个方向 | 强情绪爆发（一秒到位） | 眉压 + 眼紧 + 唇压 + 颌紧 = 愤怒 |
| **错位** | 口在笑、眼不动 | **假笑、客套、伪装**（最有戏） | `her mouth stretches sideways, the skin around her eyes stays flat` |
| **递进** | 先眉、再眼、后口 | 情绪转折（有过程才可信） | `her brows pull together` → `her eyes stop moving` → `her lips part` |

**注意**：**递进要拆镜**。H3 单镜内不做多阶段演进，串在同一句里会变成同时发生。正确做法——三个阶段各一镜，或第一镜写前两区，第二镜写后两区。

---

## 六、三条禁令

1. **不写"没有"类否定**（`her face shows no emotion` → 会被画出"表情"）→ 改 `her face stays still, her eyes fixed on the wall`
2. **不写比喻**（`like a stone` / `as if frozen`）→ 喻体会被画出来（石头、冰）
3. **写在画面段，不写进声音段**（`her voice is hoarse` 放 `overall_soundscape` 会变成环境音，放画面段会变成表情）→ 语气只在 `<d>` 后的语气位写

---

## 七、自检三问（每写一个表演句必过）

1. **看得见吗**？每个词都能在画面里指出位置吗？
2. **装得下吗**？这个动作在当前景别里能出现吗？
3. **是不是结论**？"她很委屈"是结论；"眉毛内侧上抬 + 下巴起皱"是过程。**只写过程**。

三问有一个"否"，回 `acting-recipes.md` 查对应情绪的四区配方。
