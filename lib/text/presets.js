/**
 * 提示词模板（文生图 / 视频通用）。前端一键插入。
 * 都是中文，和现有卡片里的写法保持一致。
 */
export const PROMPT_PRESETS = [
  {
    id: "character-card",
    name: "角色卡（16:9）",
    text:
      "人物的角色卡，16:9 横版，左侧三分之一是人物的半身大头照（正面看镜头、表情neutral），" +
      "右侧三分之二是同一人物的三视图：正面全身、侧面全身、背面全身；不展示头部以上重复部分。" +
      "要求：五官清晰、皮肤干净、无文字无水印；背景为纯浅灰，光线均匀，方便后期抠图。",
  },
  {
    id: "scene-board",
    name: "场景板（空镜）",
    text:
      "电影写实质感场景板，16:9 横版空镜，无人物。要求：空间关系清楚（前景/中景/背景层次分明）、" +
      "光源方向明确、色温统一；画面干净好看，可作为后续镜头的空间基准；不要文字、不要水印。",
  },
  {
    id: "prop-shot",
    name: "道具特写",
    text:
      "单件道具特写，16:9 横版，产品级打光，材质细节清晰（磨损、指纹、反光都要真实）；" +
      "背景简洁略虚化，主体居中偏左；不要文字、不要水印。",
  },
  {
    id: "multi-view",
    name: "人物三视图",
    text:
      "人物三视图设定稿，16:9 横版：左起正面全身、侧面全身、背面全身，三视图同一人物、同一服装、同一比例；" +
      "背景纯白，均匀平光，无阴影干扰；不要文字标注。",
  },
  {
    id: "video-six",
    name: "视频六段式骨架",
    text:
      "subject_definitions:\n<Subject 1> is ……（人物：年龄、发型、服装、标志物）。Image used to lock his appearance.\n" +
      "<Subject 2> is ……（场景：空间布局、关键物件）。Image used to lock the space.\n\n" +
      "summary:\nreference generation — 一句话说清这段镜头发生了什么。\n\n" +
      "retention_analysis:\n<Subject 1> (image): fully_preserved — 说明哪些特征必须保留。\n" +
      "<Subject 2> (image): fully_preserved — 说明场景哪些部分必须保留。\n\n" +
      "detailed_description:\n画风与质感（第一句）。\n光影与环境细节。\n" +
      "[Shot 1] 景别、角度、运镜、起始动作；台词写 <d>[Chinese] 台词</d>。\n\n" +
      "overall_soundscape:\n环境音清单。\n\n" +
      "non_diegetic_music:\n配乐风格与进出点。",
  },
  {
    id: "voice-note",
    name: "音色做法提醒",
    text:
      "（音色用法：不要写嗓音形容词。台词的说话人只用 <Audio 1> / <Audio 2> 指认，" +
      "并在 subject_definitions 里写 <Audio 1> is the voice of <Subject 1>. Audio used as-is for every line he speaks.）",
  },
];
