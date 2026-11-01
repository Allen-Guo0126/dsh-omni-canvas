# 分镜 JSON 契约（v1）

> 分镜由**子 Agent** 以本文件的 JSON 结构交付；主 Agent 只校验、生成、拼接。
> 字段缺失 = 退回重写，不进入提示词渲染。

## 1. 顶层

```json
{
  "ep": "EP3",
  "title": "集名",
  "total_dur": 95.0,
  "scenes": [ Scene, ... ]
}
```

## 2. Scene（场）

```json
{
  "no": 3,
  "place": "考场",
  "period": "2003 · 考前",
  "plate": "高考考场板",
  "plate_file": "media/xxx.png",
  "visual_lock": "光照、时间、色温、灯态都沿用场景图；人脸始终可辨。",
  "voice_cast": [
    {"id": "S1", "who": "王三合", "age": "25", "timbre": "平、偏沉", "onscreen": "画内/旁白"},
    {"id": "S3", "who": "广播", "age": "中年男声", "timbre": "广播腔", "onscreen": "画外"}
  ],
  "beats": [ Beat, ... ]
}
```

## 3. Beat（刀，= 一个生成单元）

```json
{
  "id": "EP3-03",
  "dur": 12.0,
  "camera": {
    "size": "wide",
    "lens": "28mm",
    "height": "chest",
    "move": "static",
    "position": "教室后方，朝黑板方向"
  },
  "coverage": "wide",
  "coverage_why": "要让人先看清整个考场，再进入他的主观",
  "crowd": {
     "exists": true,
     "count": 40,
     "facing": "全部朝黑板",
     "camera_sees": "背面（后脑与肩）",
     "no_face": true
  },
  "people": [
    {"ref": "王三合", "role": "active", "facing": "背对镜头", "visible": "背影与侧后"},
    {"ref": "群演", "role": "passive", "facing": "朝黑板", "visible": "后脑，虚焦"}
  ],
  "action_chain": "考生坐定 → 广播响 → 全场坐直 → 监考发卷",
  "why_no_cut": "广播与骚动是一口气，切成两刀会碎",
  "lines": [
    {"speaker": "S3", "text": "因试卷失窃，经批准，启用备用试卷。", "onscreen_speaker": false}
  ],
  "snd": "吊扇、翻纸、广播电流声",
  "props": ["试卷（可读字为 illegible）", "红条幅（无字）"]
}
```

### 3.1 必填字段（缺一退回）

`id / dur / camera.size / camera.lens / camera.position / coverage / coverage_why / crowd / people / action_chain / lines / snd`

### 3.2 字段规则

| 字段 | 规则 |
|---|---|
| `dur` | ≥3.0，≤15.0 |
| `camera.position` | 必须写“在空间哪一端、朝哪个方向” |
| `crowd.camera_sees` | 必须是 `正面` / `背面` / `侧面` 之一 |
| `crowd.no_face` | 为 true 时，`people[].visible` 不许出现“脸” |
| `people[].role` | `active` 只能有一个；其余为 `passive` |
| `people[].facing` | 双人镜必须写“对方面对面、各偏 45°”；群体写“朝黑板” |
| `lines[].onscreen_speaker` | false 时，画面里不许有正脸人物（G6） |
| `action_chain` | 写成“起点 → 触发 → 终点”，终点在画面内 |
| `why_no_cut` | `dur > 6` 时必填 |

## 4. 主 Agent 校验清单（收到 JSON 后，逐条）

1. 必填字段齐全
2. `dur` 与台词容量：汉字数/4.0 + 0.5×句数 ≤ dur − 0.7
3. 群体镜：`crowd.camera_sees` 与 `crowd.no_face` 是否自洽；与 `people[].visible` 是否矛盾
4. 双人镜：`people[].facing` 是否写了面对面 + 45°
5. `lines[].onscreen_speaker == false` 时，`crowd.no_face` 或 `people[].visible` 里不得出现正脸
6. `action_chain` 是否含矛盾组合（出画+回头、背对+表情…）
7. 每段提示词渲染后 900–1400 字符
8. 渲染结果抽查 2 段，与 JSON 逐字比对

任一条不过 → 退回子 Agent 重写，不进入生成。
