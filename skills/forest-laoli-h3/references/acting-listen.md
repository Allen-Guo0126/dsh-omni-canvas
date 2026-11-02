# 听戏 · 视线 · 标点（不说话的人怎么演）

> **短剧里 70% 的镜头里没人在说话**：反应、听、忍、看。H3 不知道"这个人应该听出什么意思"，它只会渲染你写的肌肉。
> 本文件专治三种废镜：**木头人（站着等台词）、死鱼眼（看着但不聚焦）、假反应（所有人同一帧同一动作）**。

---

## 一、听戏五步链（在场不说话的人必走一遍）

不是每一步都写，但**至少走三步**，只写"看着他"等于没写。

```
① 听见（触发）→ ② 眼神移动 → ③ 呼吸变化 → ④ 身体泄漏 → ⑤ 余味（收住）
```

| 步 | 写什么 | H3 写法 |
|---|---|---|
| ① 听见 | 动作停顿（手停在半空）/ 头微转 | `his hand stops over the cup` / `his head turns a few degrees toward her` |
| ② 眼神 | 看向发出声音的人/物，焦点收紧 | `his eyes move to her face and stay there` |
| ③ 呼吸 | 吸气/屏住/变浅（肩、锁骨、鼻息） | `his shoulders rise with a breath and stay up` |
| ④ 身体泄漏 | 手指收紧、喉咙吞咽、下颌绷、眼皮跳 | `his thumb presses into his knuckle until the skin whitens` |
| ⑤ 余味 | 眼睛移开 / 嘴角落下一点 / 呼出气 | `he looks away and lets the breath out` |

**常见组合（可直接用）**

| 听到的是 | 反应链 |
|---|---|
| 坏消息 | 手停 → 眼睛定住 → 屏住呼吸 → 手指收紧 → 缓缓呼出 |
| 被冤枉 | 头抬起 → 眼睛睁大 → 吸气到一半停住 → 嘴唇张开又闭上 |
| 意料之中 | 不抬头 → 眼睛斜看向说话人 → 嘴角落一点 → 手里动作继续 |
| 被戳中 | 动作僵住 → 眼睛不动 → 喉咙吞咽 → 手收回 |

---

## 二、反应成「波」不成「排」

三个以上的人在同一镜里反应，最容易写成齐刷刷（一排）。**波**＝有三样东西不一样：

| 维度 | 怎么错开 |
|---|---|
| **时间** | 主焦点先反应，次焦点慢 0.5 拍，背景最后 |
| **强度** | 一人明显、一人只有眼睛动、一人只停手 |
| **方向** | 一人看向说话人、一人看向地面、一人看向第三人 |

`everyone turns to look at her` —— 这句会出"一排人同时转头"，是典型的群戏崩法。

改为：
```
one man in the foreground turns his head toward her, the woman behind the desk keeps her eyes down, a third figure at the door stops mid-step
```

---

## 三、视线规则（五条）

| 情境 | 规则 | 为什么 |
|---|---|---|
| 说话时 | 视线在对方**脸上**（不是身上、不是身后） | 写"看着她"太泛，模型给侧脸 |
| 说谎时 | 视线会**移开一次再回来** | 这是最省力的"心虚"信号 |
| 听的时候 | 视线在对方**嘴或眼睛**，二选一 | 两者都写会散 |
| 手里有道具 | 必写 `her eyes stay on his face, not on the cup` ← **注意含否定** | **改**：`her eyes stay on his face; the cup sits untouched in her hand` |
| 心死/麻木 | 视线**落在地上或空处**，不对焦 | `her eyes rest on the floor, her pupils stay wide and still` |

**道具镜的高发错误**：写"她转着杯子说话"却没写视线 → 模型让她一直低头看杯子，观众以为她在跟杯子说话。

---

## 四、标点 → 表演（中文标点必须翻译成身体）

台词里的标点不是语法，是**呼吸与肌肉的时间表**。

| 标点 | 身体上是什么 | H3 写法（写在镜行正文，不进 `<d>`） |
|---|---|---|
| `，` | 半口气、视线可能落到某处、手指停一下 | `she breaks off for half a breath, her eyes drop to the table` |
| `。` | 说完不立刻收表情，留一拍 | `her lips stay parted after the last word` |
| `？` | **先判"要的是什么"**：要答案→前倾；要人认错→下巴抬；不信→眉挑 | `her chin lifts as she waits for his answer` |
| `！` | 能量上冲、**不默认吼**（吼是结果不是写法） | `her shoulders lift with the last word` |
| `……` | 气断在喉咙、话没说完就停 | `her breath catches, the words stop in her throat` |
| `——` | 急刹改口、肌肉先收再转 | `her mouth closes mid-word, then she starts again` |
| `（沉默）` | 不能只写"沉默"——要眼神路径 + 呼吸 + 身体泄漏 + 余味 | `she holds his eyes, her jaw tightens, then she turns her face away` |

**禁令**：不写"说到逗号时停顿"——标点是语义标记，不是时间点。H3 会把它当时间码，切出奇怪的停顿。

---

## 五、不说话的人的「份额」

| 段型 | 无台词角色的最低出场 |
|---|---|
| 双人对话段 | 每 2 镜至少 1 镜带到（正拍/过肩前景/反应） |
| 三人以上 | 主要配角每段 ≥2 镜；背景人每段 ≥1 镜（可焦外） |
| 单人戏里的旁观者 | 至少 1 个反应镜（否则观众忘记他在场） |

**摆位必入画**的实操口径：站位声明里写了的人，**本段至少被一个镜行点到**。给不了镜头的，明写离画：

```
she steps out of the room and the door closes behind her
```

---

## 六、自检四问

1. 这段里**不说话的人**，有没有一个镜写了他在干什么？
2. 三个人以上同镜，反应**时间/强度/方向**有没有错开？
3. 每句台词的标点，有没有落到一个身体动作上？
4. 有道具的镜，视线写清楚了吗？（写清"看哪"，不要写"没看道具"）
