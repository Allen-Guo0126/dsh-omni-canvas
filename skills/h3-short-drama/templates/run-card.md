# RUN · <项目名>

> **开工即建，每格必须填「产出文件」才算过。空着的行 = 没做，不许跳。**
> 写文件是动作，记忆不是——**跳步会在表里留空，一眼可见**。

| # | 门 | 状态 | 产出文件 | 出口判据（自查） |
|---|---|---|---|---|
| 0 | **G0 六项锁** | ⬜ | `00_锁卡.md` | 模式/时长档/画风/素材形态/段缝/空间锚点 六项齐全；画幅已定（禁 `auto`） |
| 1 | **① 剧本** | ⬜ | `01_剧本.md` | 每场有冲突目标；台词密度 80–90%；**用户确认过** |
| 2 | **② 资产** | ⬜ | `assets/` | 图 ≤9；**生图提示词用中文**；每个角色 ≥3 个记忆点、每个场景 ≥3 个记忆点（`asset-layer.md §1.4/1.5`）；角色卡 16:9 零文字；**全片 9 槽一次钉死**；**场景状态表已出**（门开/门关各一张） |
| 3 | **③-0 事件分解** | ⬜ | `03_事件卡.md` | 每场标了事件类型（动作/信息/物件/关系/错位）；**每场数出了状态变化个数** |
| 4 | **③-1 拆镜** | ⬜ | `04_拆镜稿.md` | **没有任何一镜同时有「动作 + 结果」**；戏核句标了「不切」 |
| 5 | **③-2 景别机位** | ⬜ | `05_镜行表.md` | 连戏表闭合；无「画面左/右」；每镜有维持句；多人在场有三件套 |
| 6 | **③·补 表演** | ⬜ | （并入镜行表） | 零心理结论词；四区肌肉 + 听戏反应同镜双挂 |
| 7 | **④ 编译** | ⬜ | `06_投喂稿/` | 六段式字段齐、顺序对；动态门窗标 `partially_preserved` |
| 8 | **⑤ 清洗机检** | ⬜ | `07_检查报告.json` | **`h3_lint.py` FAIL = 0**；WARN 已说明 |
| 9 | **⑤.5 拆镜复核** | ⬜ | `08_复核.md` | 回查单镜状态变化 ≤1；戏核句没被切；每句台词配了动作 |
| 10 | **⑥ 交付** | ⬜ | `09_交付包/` | 图槽语义零错位；剥壳干净；清单与稿一致 |

---

## 阶段入口必读（一次最多 3 个文件，别一次全灌）

| 门 | 只读这些 |
|---|---|
| G0 | 本技能 `SKILL.md §四` |
| ① | `references/script-layer.md` |
| ② | `references/asset-layer.md` |
| ③-0 / ③-1 | **`references/event-decomposition.md`**（就这一个） |
| ③-2 | `references/shot-design.md` + `references/camera-four-axis-h3.md` |
| ③·补 | `references/acting-facs.md` + `references/acting-recipes.md` + `references/acting-listen.md` |
| ④ | `references/h3-format.md` + `references/spatial-anchor-and-hold.md` |
| ⑤ | `references/checklist.md` + `references/h3-lexicon-cleanup.md` |
| ⑥ | `references/delivery.md` |

---

## 出问题去这里

| 症状 | 文件 |
|---|---|
| 生成卡在 0% / 76%、成片崩坏 | `references/diagnose.md` |
| 站位错、门窗自开、人物分身 | `references/spatial-anchor-and-hold.md` |
| 画面平、没氛围、塑料感 | `references/atmosphere-and-light.md` |
| 词根被拒、META 报错 | `references/h3-lexicon-cleanup.md` |
