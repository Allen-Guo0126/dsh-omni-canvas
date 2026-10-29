# dsh-comfy-canvas

DSH Desktop 右侧面板里的**无限画布**，直接驱动本地 **ComfyUI**（默认 `http://127.0.0.1:8188`），不做云端上传。

一个画布 = 一个项目。AI 和人都能操作同一个画布：图片 / 视频 / 文本 / 音频节点、分镜脚本卡、资产库。

## 功能

| 能力 | 说明 |
|---|---|
| **图片** | 文生图（Qwen-Image 2.1）、图生图（参考图编辑） |
| **视频** | 参考生视频 / 文生视频（MiniMax H3，AV 模型自带声音） |
| **文本节点** | 剧本 / 设定，可编辑，双击进入编辑 |
| **音频节点** | 承载与播放（音乐生成尚未接入） |
| **分镜脚本卡** | 场 → 镜头两层，一键批量出片，按脚本顺序拼接 |
| **资产库** | 所有产物永久归档，跨项目浏览，按角色 / 场景 / 道具分类 |
| **设置页自检** | 自动发现本地 ComfyUI、一键启动、扫描工作流、能力 → 实现对应关系 |
| **工作流绑定** | 把你自己的 ComfyUI 工作流接成插件实现（由 Agent 完成参数绑定） |

## 环境要求

- DSH Desktop（宿主 + 客户端插件）
- 本地 ComfyUI（已启动，或允许插件启动）
- 对应模型：Qwen-Image 2.1（图片）、MiniMax H3（视频）
- ffmpeg（视频拼接，可选）

## 安装

以 DSH profile 依赖方式加载：

```powershell
# 在 DSH profile 目录执行
pnpm add "file:E:\path\to\dsh-comfy-canvas"
```

或把本仓库软链到 profile 的 `node_modules/@local/dsh-comfy-canvas`。

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
图生图      → 插件自带 · 图生图
参考生视频  → 插件自带 · 参考生视频（H3）
文生视频    → 插件自带 · 文生视频（H3）
```

也可以把**自己的 ComfyUI 工作流**接成实现：设置页扫描到工作流 → 点「设为默认」→ 复制指令发给 Agent → Agent 分析节点、绑定参数、试跑验证。

工具集（27 个）包括：

```
cnv_generate_image / cnv_generate_video / cnv_generate_node
cnv_workflow_inspect / cnv_binding_save / cnv_binding_list / cnv_binding_test / cnv_binding_run
cnv_script_create / cnv_script_set_rows / cnv_script_generate
cnv_canvas_get / cnv_canvas_add_node / cnv_canvas_link / ...
```

## 工作流绑定（Agent 侧）

仓库内含技能：`skills/comfy-workflow-binding/SKILL.md`，安装到 DSH 技能目录后，Agent 可以：

1. 读工作流节点表（UI 或 API 格式）
2. 推断 prompt / seed / 尺寸 / 参考图 / 输出节点的位置
3. 校验后写入 `~/.dsh/comfy-canvas.bindings.json`
4. `dry` 转换检查 → 真跑一次 → 标记已验证

> 已知限制：`ComfyMiniMaxH3Director` 这类节点的绘制参数在 `timeline_data` 私有 schema 里，
> 只绑 widget 不生效（实测：控件改了，输出尺寸/内容不变）。
> 视频能力建议走插件自带模板；参数简单的工作流（图片 / Wan 等）绑定可靠。

## 目录结构

```
lib/index.js         宿主：项目存储、ComfyUI 调用、27 个工具、HTTP API
lib/client.js        客户端：画布 / 首页 / 项目 / 资产 / 设置
templates/*.json     API 格式工作流模板（内置实现）
skills/              随插件分发的技能
docs/                设计文档、实测记录、界面截图
```

## 数据位置

```
项目     ~/.dsh/projects/<id>/{project.json,canvas.json,media/,assets/}
设置     ~/.dsh/comfy-canvas.settings.json
绑定     ~/.dsh/comfy-canvas.bindings.json
```

## 已知问题

- 外部 H3 工作流的参数绑定暂不生效（见上）
- 含子图（subgraph）的工作流还不能执行
- 音乐生成未接入
- 内置模板的模型文件名是写死的，模型改名需要手动调整（自动适配待做）

## License

MIT
