# 分镜 JSON 契约 v2（容器制）

> 2026-11-02 起：**Segment（段）是唯一生成单元**，段内装 2–5 个 beat。
> 生成前必须先出**每段一张四宫格故事板**（CLEAN_GRID，构图钉住才许生成）。
> v1（beat=生成单元）废弃——它导致 90s 被切成 16 次独立生成，穿帮随刀数线性增加。

## 1. 顶层

```json
{
  "ep": "EP002",
  "title": "集名",
  "total_dur": 90.0,
  "style_lock": "陈可辛向：暖调柔光、生活实景、中近景为主、手持轻晃、情绪特写",
  "scenes": [ Scene, ... ]
}
```

## 2. Scene（场）

```json
{
  "no": 1,
  "place": "公寓浴室",
  "period": "清晨",
  "plate": "公寓浴室",
  "visual_lock": "光照、时间、色温、灯态都沿用场景图；人脸始终可辨。",
  "voice_cast": [{"id": "S1", "who": "沈知微", "timbre": "中低音、慢、句尾干净", "onscreen": "画内"}],
  "established": false,
  "segments": [ Segment, ... ]
}
```

## 3. Segment（段 = 唯一生成单元，≤15.0s）

```json
{
  "id": "EP002-SG01",
  "dur": 15.0,
  "board": "EP002-SG01-board.png",
  "board_status": "pending|done|accepted",
  "camera_default": "手持轻晃，中近景为主",
  "beats": [ Beat, ... ],
  "why_no_cut_between_scenes": "段间硬切；段内由模型按节拍表推拉"
}
```

- `dur` ≤ 15.0（H3 单段上限）；一段装 **2–5 个 beat**
- `board_status` 必须为 `accepted` 才允许生成视频（故事板先行门）
- 段与段之间硬切；**上一段尾帧可作下一段首帧**（尾帧链）

## 4. Beat（段内节拍，不再是生成单元）

```json
{
  "id": "EP002-01",
  "dur": 4.0,
  "coverage": "big-close-up",
  "camera": {"position": "贴地、与地面齐平", "move": "固定", "height": "地面"},
  "body_task": "手指悬在接听键上方两秒，按下",
  "coverage_why": "水滴是唯一的声音，也是时间的刻度",
  "people": [{"ref": "沈知微", "role": "active", "facing": "侧俯压低，不看向镜头", "visible": "半边脸贴地"}],
  "crowd": {"exists": false},
  "action_chain": "水滴三下 → 猛睁眼 → 睫毛颤",
  "lines": [],
  "snd": "水滴声（唯一声音，放大）"
}
```

### 4.1 必填字段（缺一退回）

Beat：`id / dur / coverage / camera.position / body_task / people / action_chain / lines / snd`
Segment：`id / dur / board_status / beats`
Scene：`no / place / plate / visual_lock / voice_cast / segments`

### 4.2 字段规则

| 字段 | 规则 |
|---|---|
| `body_task` | **每镜必填**：手在干什么（手是意志显示器）；没有人的镜写「无人物」 |
| `dur`（beat） | 2.0–5.0；一段内之和 = 段 dur |
| `dur`（segment） | ≤15.0 |
| `camera.position` | 写**身体姿态与空间关系**（贴地/侧俯/齐腰跟移/长桌一端略俯），禁止只写 master-2/OTS 这类抽象代号 |
| `coverage` | 中近景类 ≥75%（画风锁配额）；全景每场最多 1 个（定场一次） |
| `action_chain` | 起点→触发→终点，终点在画面内 |
| `lines` | 台词逐字保留；说话镜必须有可见神态或动作（禁站桩念白）|
| `crowd` | 群体镜写机位端+正面/背面+no_face；群演永不给卡 |

## 5. 故事板先行门（新增，硬门）

1. 每段出一张 **16:9 四宫格故事板**（2×2，CLEAN_GRID：零文字、零格号、零箭头）
2. 四格 = 该段 4 个 beat 的关键帧（beat ≤4 时按实有格数；5 beat 时合并最相邻两个）
3. 统一行写明：同一人物、同一服装、同一空间；无字幕无水印
4. 故事板**接受后**才允许生成该段视频；不接受则改提示词重出板

## 6. 主 Agent 校验清单（收到 JSON 后）

1. 必填字段齐全（含每 beat 的 `body_task`）
2. 段 dur ≤15；段内 beat 之和 = 段 dur；beat 数 2–5
3. 中近景配额 ≥75%；每场全景 ≤1
4. 台词容量：每条 台词字数/4.0+0.5×句数 ≤ 所在 beat 的 dur − 0.5（段内不重复计开销）
5. 群体镜自洽；双人镜三句朝向
6. 动作链矛盾扫描
7. `board_status` 全部 accepted（生成前）
8. 渲染后每段提示词长度与 `<Picture N>`/refs 一致

## 7. 剪辑与拼接

- 按段顺序拼接；**段内不再剪切**
- 一致性测量按**场**做（G11），校正只做段级
- 成片时长 = Σ段长（目标 ±2s）
