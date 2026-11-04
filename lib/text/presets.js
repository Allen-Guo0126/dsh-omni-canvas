/**
 * 提示词模板（文生图 / 视频通用）。前端一键插入。
 * 只保留两条：角色卡（用户指定文案，逐字不改）+ 视频六段式骨架。
 */
export const PROMPT_PRESETS = [
  {
    id: "character-card",
    name: "角色卡（16:9）",
    text: [
      "画面左侧三分之一是这位人物的半身大头照，胸像构图，头部、颈肩与上胸完整入镜。",
      "画面右侧三分之二是同一位人物的上半身与下半身三视图，从左到右为正面、侧面、背面；",
      "三视图一律从上胸线开始裁切，头部与颈部不在画面内，只呈现肩线、衣领、袖子、手臂、腰胯、下装与鞋；",
      "三块视图等高、穿着同一套服装，正面看到前襟，侧面看到外套垂坠与手臂外侧轮廓，背面看到后领与后摆结构。",
    ].join("\n"),
  },
  {
    id: "video-six",
    name: "视频六段式骨架",
    text: [
      "subject_definitions:",
      "<Subject 1> is the person in <Picture 1>.",
      "<Subject 2> is the space in <Picture 2>.",
      "<Audio 1> is the voice of <Subject 1>.",
      "",
      "summary:",
      "reference generation — 一句话说清这段镜头发生了什么。",
      "",
      "retention_analysis:",
      "<Subject 1> (image): fully_preserved.",
      "<Subject 2> (image): fully_preserved.",
      "<Audio 1> (audio): timbre source only, copied verbatim.",
      "",
      "detailed_description:",
      "画风与质感（第一句）。",
      "光影与环境细节。",
      "[Shot 1] 景别、角度、运镜、起始动作；台词写 <d>[Chinese] 台词</d>。",
      "",
      "overall_soundscape:",
      "环境音清单。",
      "",
      "non_diegetic_music:",
      "配乐风格与进出点。",
    ].join("\n"),
  },
];
