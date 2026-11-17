/** 模型与实践的静态配置（双端共用） */

export const MODELS = {
  "qwen-t2i-fast": { template: "t2i-fast.json", label: "Qwen-Image 2.1 加速版", longEdge: 1024,
    bind: { prompt: "4", latent: "5", seed: "13", save: "16" } },
  "qwen-t2i-hq": { template: "t2i-hq.json", label: "Qwen-Image 2.1 高清版", longEdge: 1024,
    bind: { prompt: "5", latent: "6", seed: "8", save: "13" } },
  "h3-director": { template: "h3-director-api.json", label: "H3 导演台（全模式）", kind: "video",
    taskTypeByMode: true, bind: { director: "18", save: "7", vhs: "34" } },
  "qwen-edit": { template: "edit.json", label: "图生图（参考图编辑 + 提示词优化）", longEdge: 1024,
    bind: { promptText: "5", selector: "6", seed: "19", save: "24", linkImages: "17", batchImages: "27", useSizedLatent: "29", latent: "7" } },
};

export const MODE_TASK = {
  t2v: "t2v — 文生视频(Text to Video)",
  i2v: "i2v — 图生视频(Image to Video)",
  r2v: "r2v — 参考主体生视频(Reference to Video)",
  fl2v: "fl2v — 首尾帧生视频(First-Last Frame)",
  v2v: "v2v — 视频转视频(Video to Video)",
  rv2v: "rv2v — 参考素材改视频(Reference Video Edit)",
};

export const PROMPT_TEMPLATES = {
  t2v: `subject_definitions:
<Subject 1> is …

summary:
一句话概括这个镜头要发生什么。

retention_analysis:
<Subject 1>: fully_preserved - 哪些特征必须保持不变。

detailed_description:
[Shot 1] 景别、机位、光线、环境；按时间点写动作（At 0.8 seconds …）。
台词写成：<d>[Chinese] 不超过16个字。</d>

overall_soundscape:
环境声、人声远近、有无音乐。

non_diegetic_music: N/A`,
  r2v: `subject_definitions:
<Picture 1> is the person/product in the reference. 身份、发型、服装、配饰只来自参考图，不要重新设计。
<Subject 2> is the environment in <Picture 2>：窗位、墙面、光向保持一致。

summary:
一句话概括镜头。

retention_analysis:
<Picture 1>: fully_preserved - 只允许表情、呼吸、衣角等小幅度变化。
<Subject 2>: fully_preserved - 不新增家具、不重新打光。

detailed_description:
[Shot 1] 竖屏/横屏、景别、机位；按时间点写动作与台词（<d>[Chinese] …</d>）。

overall_soundscape:
环境声与近场人声。

non_diegetic_music: N/A`,
  i2v: `subject_definitions:
<Picture 1> 是首帧，画面从这一帧开始；身份与构图只来自它。

summary:
一句话概括镜头。

retention_analysis:
<Picture 1>: fully_preserved - 首帧的人物、服装、环境布局保持不变。

detailed_description:
[Shot 1] 说明镜头如何从首帧运动（推/拉/摇/人物动作），按时间点写。

overall_soundscape:
环境声。

non_diegetic_music: N/A`,
};
