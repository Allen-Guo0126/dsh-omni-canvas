# dsh-omni-canvas

DSH Desktop 右侧面板里的**全能画布**（画布即工作台），直接驱动本地 **ComfyUI**（默认 `http://127.0.0.1:8188`），不做云端上传。

一个画布 = 一个项目。AI 和人都能操作同一个画布：图片 / 视频 / 文本 / 音频节点、分镜脚本卡、资产库。

## 功能

| 能力 | 说明 |
|---|---|
| **图片** | 文生图（Qwen-Image 2.1）、图生图（**多参考图**编辑，`<image1>`…指认） |
| **视频** | 文生视频 / 图生视频 / 参考生视频（MiniMax H3，AV 模型自带声音），默认 480p |
| **语音** | 文字 → 语音（edge-tts 神经音色，离线回退 Windows SAPI） |
| **后期** | 图片 4× 超分（4x-UltraSharp）、视频 2× 放大（ffmpeg）、视频抽帧 |
| **文本节点** | 剧本 / 设定，可编辑，双击进入编辑；可一键朗读成语音 |
| **音频节点** | 承载与播放 |
| **分镜脚本卡** | 场 → 镜头两层，逐镜出片 / **一键关键帧** / 按脚本顺序拼接 |
| **卡片操作** | 高清、编辑、抽帧、接一镜、取消、重试（按节点状态自动出现） |
| **队列** | 画布底部显示"正在跑哪一镜 + 排队数"，可逐条取消 |
| **资产库** | 永久归档、跨项目搜索（名称/提示词/模型）、点一下放回所属画布 |
| **生成历史** | 每个任务记录类型/提示词/耗时/状态（最多 100 条） |
| **项目导出** | 一键打包 zip（project/canvas/assets + media） |
| **设置页自检** | 发现本地 ComfyUI、一键启动、扫描工作流、能力 → 实现对应关系 |
| **工作流绑定** | 把自己的 ComfyUI 工作流接成插件实现（由 Agent 完成参数绑定 + 试跑） |

### 快捷键

`Delete` 删除选中节点 · `Ctrl+D` 复制 · `Ctrl+Z` 撤销 · `Ctrl+Shift+Z` 重做 · `Esc` 取消选中

## 环境要求

- DSH Desktop（宿主 + 客户端插件）
- 本地 ComfyUI（已启动，或允许插件启动）
- 模型：Qwen-Image 2.1（图片）、MiniMax H3（视频）、4x-UltraSharp（超分）
- **ffmpeg**：视频放大 / 抽帧需要（按 `config.ffmpegPath` → `ffmpeg` → `E:/Allen/tools/bin/ffmpeg.exe` 查找）
- **edge-tts**：语音合成需要（`python -m pip install edge-tts`；不装则回退 Windows SAPI）

## 安装

以 DSH profile 依赖方式加载：

```powershell
# 在 DSH profile 目录执行
pnpm add "file:E:\path\to\dsh-omni-canvas"
```

或把本仓库软链到 profile 的 `node_modules/@local/dsh-omni-canvas`。

安装后**重启 DSH**；后续纯客户端改动只需刷新页面（F5）。

## 快速开始

1. 打开右侧「画布」标签 → 新建项目
2. 双击空白处，或点底部 `＋ 添加`
3. 选图片 / 视频 / 文本 / 脚本节点，写提示词，`Enter` 生成
4. 产物落进节点，同时进资产库

## 能力与实现

插件按「能力 → 实现」解析，默认实现是**插件自带模板**：

```
文生图      → 插件自带 · 文生图（快速 / 高清）
图生图      → 插件自带 · 图生图（支持多参考图）
文生视频    → 插件自带 · H3 文生视频（480p 默认）
图生视频    → 插件自带 · H3 图生视频（首帧驱动，已验证）
参考生视频  → 插件自带 · H3 参考生视频
首尾帧      → 需工作流（内置 fl2v 尚未验证，生成时会给出提示）
语音合成    → 插件自带 · Edge 神经音色（回退 SAPI）
```

也可以把**自己的 ComfyUI 工作流**接成实现：设置页扫描 → 「自动配置」复制指令 → 发给 Agent → Agent 绑定参数、试跑、设默认。

工具集（27 个）包括：

```
cnv_generate_image / cnv_generate_video / cnv_generate_node
cnv_workflow_inspect / cnv_binding_save / cnv_binding_list / cnv_binding_test / cnv_binding_run
cnv_script_create / cnv_script_set_rows / cnv_script_generate
cnv_canvas_get / cnv_canvas_add_node / cnv_canvas_link / ...
```

## 工作流绑定（Agent 侧）

仓库内含技能：`skills/comfy-workflow-binding/SKILL.md`。机制见 [docs/绑定机制与多参考图.md](docs/绑定机制与多参考图.md)：

- **绑定只记"入口位置"**（节点 id + 字段名），**不改工作流文件、不生成 API 文件**；
- 转换在**每次执行时于内存中完成**；
- 工作流被改动 → hash 变化 → 标记失效。

参数映射三条硬规则（踩坑记录）：

1. `widgets_values` 必须按**完整控件顺序**赋值（含已连线控件的位置）；
2. 已连线控件**只消耗位置、不写值**（否则覆盖上游连线）；
3. 动态下拉的子输入要用**带点全名**（`format.bit_depth`）。

支持**子图（subgraph）**展开：`-10` 为输入、`-20` 为输出，字段名取 `inner.inputs[slot].name`。

## 目录结构

```
lib/index.js         宿主：项目存储、ComfyUI 调用、27 个工具、HTTP API
lib/client.js        客户端：画布 / 首页 / 项目 / 资产 / 设置
templates/*.json     API 格式工作流模板（内置实现）
tools/selftest.mjs   自测（--smoke 会真实出图+超分）
skills/              随插件分发的技能
docs/                设计文档、绑定机制、实测记录
```

## 数据位置

```
项目     ~/.dsh/projects/<id>/{project.json,canvas.json,media/,assets/}
设置     ~/.dsh/omni-canvas.settings.json
绑定     ~/.dsh/omni-canvas.bindings.json
适配器   ~/.dsh/omni-canvas.adapters.json
历史     ~/.dsh/omni-canvas.jobs.json
导出     ~/.dsh/exports/omni-<项目id>-<日期>.zip
```

## 依赖一键准备

`powershell
node tools/setup.mjs            # 只检查
node tools/setup.mjs --ffmpeg   # 缺则下载 ffmpeg 到工具的 bin 目录
node tools/setup.mjs --tts      # pip install edge-tts
node tools/setup.mjs --all      # 全部
`

## 自测

```powershell
cd E:\path\to\dsh-omni-canvas
node tools/selftest.mjs          # 探活 + 绑定 dry + 工作流 inspect + 模板完整性
node tools/selftest.mjs --smoke  # 额外真实出图 + 超分
```

## 已知问题

- 首尾帧（fl2v）实测输出与输入图无关，暂不推荐（生成时会给提示）
- 含子图的工作流已支持，但特殊自定义节点仍可能映射不准（会给出 warnings）
- 6 个工作流依赖未安装节点（KJNodes / Nunchaku），扫描时会标"缺节点"
- 内置模板的模型名可自动匹配（同族 + 精度标签），但保真度不保证

## License

MIT
