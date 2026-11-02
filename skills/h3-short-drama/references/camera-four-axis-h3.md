# 四轴镜头档位 × 回合制对话 · H3 转化规程

> 规则源：用户技能包 `manju-laoli-skill-V7.4.25`（`sd-storyboard-engine/references/short-drama-camera-system.md` §三/§四/§七 + `shot-economy-and-acting.md` §五·五~§五·七）。
> **权威关系：分镜设计按 V7.4.25 原体系执行，本文只规定"转成 H3 六段式时怎么落字"。冲突处以 V7.4.25 原文为准。**
> 2026-10-20 第 07 集实测：v2 稿（无回合制）被用户判"提示词有问题"；v3 稿（八档+回合制）为当前标准。

---

## 一、八档镜头档位 → H3 shot 头转化表

**用法：每镜先按情绪/信息任务选一行档位 → 四轴整行取齐 → 再按下表落成 H3 英文。** 不要逐轴临时拼。

| # | 档位 | 景别 | 焦段 | 机位（方向×高度） | 运镜 | 景深 | H3 落字（shot 头写法） |
|---|---|---|---|---|---|---|---|
| 1 | **定场** | 全景/中全景 | 广角 | 侧45°×平视或微俯 | 缓慢横移/升降 | 深 | `Wide shot, 45-degree side angle, the camera sliding sideways 10 cm over three seconds on a rail` |
| 2 | **常规对话** | 中景/中近景 | 标准 | 侧45°×平视 | **固定** | 中深 | `Medium shot, 45-degree side angle, static` |
| 3 | **过肩关系** | 中近景 | 中长焦 | 过肩×平视 | **固定** | 浅 | `Medium shot from behind her left shoulder, 45-degree side angle, static` |
| 4 | **情绪逼近** | 近景 | 中长焦 | **带角度**×微仰/微俯 | **缓推** | 浅 | `Medium close-up, 45-degree side angle with the camera a touch below her eye line, the camera sliding forward 10 cm over two seconds on a rail` |
| 5 | **情绪爆点** | 特写 | 中长焦 | **带角度**×微俯/微仰 | 固定（H3 禁滑动变焦） | 浅 | `Close-up, slightly high angle, static` + 震惊标准式（见 §四） |
| 6 | **权力顶点** | 中景/全景 | 广角 | 大仰/大俯角 | 升降/摇臂 | 依任务 | H3 大角度易崩，降级为 `slightly low angle` / `slightly high angle` |
| 7 | **动作主体** | 全景/中景 | 广角 | 低机位×仰 | 跟拍/手持 | 深 | `Medium shot, side angle, hand-held, the camera jolts once` |
| 8 | **极致细节** | 特写/微距 | 微距 | 俯拍/平视 | 固定/极缓推 | 极浅 | `Insert close-up, top-down angle, static` |

**转化纪律：**

1. **焦段/景深是"设计意图"，不进 H3 正文**（`85mm`、`F1.4` 属工程词，H8 拦截）。浅景深转成画面语言：`the background falling soft behind him`。
2. **大仰/大俯角（档6）在 H3 降级**：写 `slightly low angle` / `slightly high angle`，H3 对 extreme angle 易把机位甩到天上。
3. **H3 禁滑动变焦**（档5 的变焦分支不可用），情绪爆点一律固定 + 表演扛。
4. **每镜必带厘米限位**：所有位移写 `10 cm over two seconds on a rail` 口径（10–15cm / 2–3s）。
5. 档2（固定）在对话段是**主力**而非偷懒——正反打的标准形态就是"固定机位 + 切镜换嘴"。

## 二、三条组合级禁令（H3 口径）

1. **紧景别（近景/特写）× 平视正面 → 换带角度**：特写默认 `slightly high angle` 或 `45-degree side angle`，平视正面只留给"正面对峙/摊牌"且情绪站得住的一瞬。H3 的正脸平视特写易出"证件照脸"。
2. **大景别 × 长焦**：H3 无焦段控制，等效禁令 = 全景/远景镜头里**禁止**再叠 `the background falling soft`（虚化大景别会连人物一起糊）。
3. **位移 × 变焦同镜**：H3 无光学变焦，此禁令自动满足；但**禁止**在同一镜里既写位移又写 `zoom`（H19 已拦）。

## 三、回合制切镜（对话段 · 三条硬指标）

> 规则源：shot-economy-and-acting.md §五·七（用户 2026-10-13 实测裁定：站桩式对话 = 一人说完另一人说，缺快速正反打）。

1. **切镜点 = 说话人切换点。** 每切一次至少换一个变量：换说话人 / 换景别档 / 换机位角度 / 换主体。只为"这句说完了"而切、其余全不变 = 废切。
2. **同一说话人连续占据 ≥2 个相邻镜行 = 站桩，重切**（机检 H21 按性别词判：`the man/ the woman` 连续相邻两镜开口 → WARN）。中间插一个**无台词的反应镜**即打断。
3. **开口密度（对话段）**：15s ≥6 次 → **12s ≥5 句、14s ≥6 句**。混合段减半；空镜/打斗/静场/留白段不设下限（稿中显式说明"本段为留白段"）。
4. **短句化**：单次开口 ≤15 字，超 20 字拆两次开口中间插反应镜。**OS（画外独白）是零口型成本的密度来源**，H3 用 `says in an off-screen voiceover` + `lips remain completely closed`（H9）。

**例外（该慢的戏不许逼快）**：沉默对峙/宣判/摊牌前静场/留白段——靠沉默演满更有力，切碎反而毁。写稿时在该段 summary 里标 `this segment plays as a held-breath standoff` 之类说明。

## 四、台词镜神态双挂（每句台词必过 · 一票否决）

每句台词所在镜行**必须同时**有：①具体可见神态（肌肉级，禁"表情平静"）②具体身体动作（手/重心/走向/与物件交互）③两者同镜行。

**震惊/顿悟反应标准式**（Lubezki 物理锁 · H3 落字）：

```
... the camera holding still for a beat and then sliding forward 10 cm over two seconds on a rail; her pupils pulling tight, her lips parting with the breath going out of her, ...
```

即：**先静止半拍 → 极缓推 10–15cm → 神态写在推的同一镜里**。

神态-动作供给库（按情绪取一，同场戏不重复）——完整表见 V7.4.25 `shot-economy-and-acting.md` §五·五：

| 情绪 | 神态 | 动作 |
|---|---|---|
| 隐忍 | 下颌绷紧、喉结滚动一下 | 指节捏紧又松开、重心后压半步 |
| 震惊 | 瞳孔收缩、呼吸乱半拍、睫毛颤动 | 手中物件停住、身体几不可察后仰 |
| 心虚 | 视线游移又移回、咽了口唾沫 | 手指摩挲衣角、身体转向光源背侧 |
| 决绝 | 眼神定住、下颌线绷直 | 把物件推到对方面前、起身 |
| 威胁 | 眉头压低、目光钉住 | 上身缓慢前倾 |
| 轻蔑 | 嘴角平直、目光越过对方 | 边说边收拾东西、转身要走 |

## 五、听戏反应（无台词镜必须活）

无台词角色**不得表情清零站着等**。五步链：**听见什么后停住 → 眼神路径 → 呼吸变化 → 身体哪一处泄漏 → 余味停在哪**。

H3 落字示例（反应镜）：

```
[Shot 2] ... her step stopping mid-stride, her eyes going to the right edge of the picture and fixing there, her grip on <Subject 4> tightening until the knuckles pale;
```

（停住 → 眼神路径 → 身体泄漏：手。）

## 六、状态账与站桩三秒铁律

1. **已完成动作不得重演**（状态账）：上一镜"房本已翻开"，下一镜只能从"翻开的页面"起手，禁再写"翻开"。跨镜只写结果不写过程。
2. **站桩三秒铁律**：说话超 3 秒必须二选一——持续可见动作，或切镜。例外：刻意静止是表演（对峙凝视、宣判定住），写明意图。
3. **禁止纯站桩正反打**：两人对话禁止"A 静止说一句→切 B 静止说一句"。每句台词要么带动作，要么镜间插反应镜。
4. **单镜动作链 ≤2 个动作**（2026-10-20 段7 实测）：H3 单镜只能完成约 2 个连续动作（`turns her shoulder and pulls the door open` ✅）。超过就摊掉——实测 5 连动作（转身→开门→跨出→门摆回→独站）被渲染成"两人对峙"。复合收尾拆两镜：镜A = 她转身拉门跨出；镜B = 门摆回、他独站（或固定他脸 + 画外关门声）。

## 七、写稿自检清单（每次出稿过一遍）

- [ ] 每镜四轴来自八档表的同一行（没有临时拼轴）
- [ ] 切镜点全部落在换嘴处（相邻台词镜说话人不同，机检 H21）
- [ ] 对话段 12s ≥5 句、14s ≥6 句；静场/留白段已标注
- [ ] 每句台词 = 神态 + 动作同镜（无一票否决项）
- [ ] 无台词镜全部带听戏五步链
- [ ] 震惊镜用了"静止半拍 → 缓推 10–15cm"标准式
- [ ] 跨镜无重演已完成动作（状态账）
- [ ] 特写全部带角度（无平视正面特写，除非对峙豁免）
- [ ] 推拉全部 10–15cm / 2–3s / on a rail
- [ ] 机检 FAIL 0（H20/H21 WARN 需逐条说明或修正）
