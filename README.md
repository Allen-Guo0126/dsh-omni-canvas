# dsh-omni-canvas · 织影

> 一张画布，把「素材 → 分镜 → 生成 → 成片」放回同一张桌子上。
> 本地跑 ComfyUI，零边际成本；AI 通过 Agent 直接操作画布，从剧本走到成片。

**v0.2.0** ｜ MIT ｜ 随附技能：`h3-short-drama` v2.3.1、`comfy-workflow-binding`

---

## 这是什么

DSH Desktop 里的**项目制无限画布**，直连本地 **ComfyUI**（默认 `http://127.0.0.1:8188`），不经过任何云端。

一个画布 = 一个项目。人和 AI 操作同一张画布：

- **节点**：图片 / 视频 / 文本 / 音频
- **连线**：连线即参考关系（谁参考了谁，一眼可见）
- **资产库**：只增不删，改十版也不丢旧版
- **分镜卡**：场 → 镜头两层，逐镜出片、按行拼接

内置 **27 个工具**，Agent 可以自主完成任务拆分、资产创建、分镜编写、提交生成、拼接成片。

---

## 核心能力

| 能力 | 说明 |
|---|---|
| **图片** | 文生图（Qwen-Image 2.1 快速/高清）、图生图（多参考图编辑，`<image1>`… 指认） |
| **视频** | MiniMax H3 全模式：文生 / 图生 / 参考生 / 首尾帧，AV 模型自带声音 |
| **数字人口播** | 一段文案 → 自动按气口切段（每段 ≤15s，总长 ≤120s）→ 逐段生成 → 接成一条 |
| **投喂前机检门** | 提交前跑 39 条规则（格式/密度/台词/运镜），FAIL 直接拒绝提交，废稿不烧算力 |
| **后期** | 图片 4× 超分、视频 2× 放大、抽帧、硬切拼接成片 |
| **分镜卡** | 场 → 镜头两层，逐镜出片 / 一键关键帧 / 按脚本顺序 `cnv_concat` 拼接 |
| **参考图管理** | 最多 9 张，**可拖拽排序**（顺序决定 `<Picture N>` 编号）、单张移除、点击看大图 |
| **多选** | `Shift` / `Ctrl` 点选多张卡片，整组拖动、批量删除 |
| **中文审阅块** | prompt 尾部可附 `<!--zh … -->` 中文注释：提交前与机检前自动剥离，中文永不进模型 |
| **资产库** | 永久归档、跨项目搜索、一键放回画布；**只增不删** |
| **能力 → 实现** | 任意 ComfyUI 工作流可绑成「能力」，设默认后一句话调用；UI 与 Agent 走同一条链路 |
| **任务对账** | 打开项目与每 20 秒核对队列，自动复位"标着排队但没在跑"的幽灵卡片 |
| **设置页自检** | 发现本地 ComfyUI、一键启动、扫描工作流、列出能力包缺哪些模型 |

### 快捷键

`Delete` 删除 · `Ctrl+D` 复制 · `Ctrl+Z` 撤销 · `Ctrl+Shift+Z` 重做 · `Esc` 取消 · `F` 全览 · `G` 定位选中

---

## 环境要求

| 依赖 | 必需 | 说明 |
|---|---|---|
| DSH Desktop | ✅ | 宿主 + 客户端插件 |
| 本地 ComfyUI | ✅ | 已启动，或允许插件拉起 |
| 模型 | ✅ | Qwen-Image 2.1、MiniMax H3（见「模型」一节） |
| ffmpeg | 部分功能 | 视频放大 / 抽帧 / 拼接 |
| edge-tts | 可选 | 文本朗读；不装回退 Windows SAPI |

---

## 安装

以 DSH profile 依赖方式加载：

```powershell
# 在 DSH profile 目录执行
pnpm add "file:E:\path\to\dsh-omni-canvas"
```

或把本仓库软链到 profile 的 `node_modules/@local/dsh-omni-canvas`。

安装后**重启 DSH**；之后纯客户端改动只需刷新页面（F5）。

---

## 快速开始

1. 打开右侧「画布」标签 → 新建项目
2. 双击空白处或点底部 `＋ 添加`，建图片 / 视频 / 文本 / 脚本节点
3. 写提示词，`Enter` 生成；产物落进节点，同时进资产库
4. 要把资产当参考：**从资产卡拖一条线到目标卡**（连线即参考关系）
5. 要接成片：分镜卡按行生成 → `cnv_concat` 拼接

---

## 模型

内置能力包（`packs/builtin/*.pack.json`）声明了每个能力需要的模型文件与目标目录。

设置页 → 「能力包」会列出：缺哪些文件、该放到 `ComfyUI/models/<dir>/`。

### 官方仓库

| 模型 | HuggingFace |
|---|---|
| MiniMax H3 主模型 / VAE / 文本编码器 | `Comfy-Org/MiniMax-H3` |
| MiniMax H3 混合 fl2va+ref2va | `smhfacct/Minimax-H3-fl2va-ref2va-hybrid-models` |
| Qwen-Image 2.1 | `Comfy-Org/Qwen-Image` |
| MOSS Image | `Comfy-Org/MOSS-Image` |

直链格式：`https://huggingface.co/<org>/<repo>/resolve/main/<path>/<file>`
国内可把域名换成 `hf-mirror.com`，路径完全一致。

> **一键下载**：下载器（断点续传 + 进度 + sha256）已内置，地址表仍在补全中。
> 当前版本以「缺件提示 + 官方仓库指引」为主。

---

## 能力与实现

插件按「能力 → 实现」解析，默认实现是**插件自带模板**：

```
文生图      → 自带 · Qwen-Image 2.1（快速 / 高清）
图生图      → 自带 · 多参考图编辑
视频（全模式）→ 自带 · H3 导演台
语音合成    → 自带 · Edge 神经音色（回退 SAPI）
口播        → 自带 · H3 口播链路（分段 + 连续性引导）
```

也可以把自己的工作流接成实现：设置页扫描 →「自动配置」复制指令 → 发给 Agent → Agent 绑定参数、试跑、设默认。

### 工具集（27 个）

```
生成     cnv_generate_image / cnv_generate_node / cnv_job_list / cnv_job_status / cnv_job_cancel
工作流   cnv_workflow_inspect / cnv_binding_save / cnv_binding_list / cnv_binding_test / cnv_binding_run
画布     cnv_canvas_get / cnv_canvas_add_node / cnv_canvas_update_node / cnv_canvas_delete_node / cnv_canvas_link
分镜     cnv_script_create / cnv_script_set_rows / cnv_script_update_row / cnv_script_bind_asset / cnv_script_generate
资产     cnv_asset_list / cnv_asset_place
项目     cnv_project_create / cnv_project_list
其它     cnv_concat / cnv_prompt_template / cnv_self_check
```

---

## 工作流绑定

机制见 [docs/工作流绑定流程.md](docs/工作流绑定流程.md)：

- **绑定只记"入口位置"**（节点 id + 字段名），不改工作流文件、不生成 API 文件
- 转换在**每次执行时于内存中完成**
- 工作流被改动 → hash 变化 → 标记失效（`changed` / `missing-nodes` / `missing-file`）

参数映射三条硬规则：

1. `widgets_values` 必须按**完整控件顺序**赋值（含已连线控件的位置）
2. 已连线控件**只消耗位置、不写值**（否则覆盖上游连线）
3. 动态下拉的子输入要用**带点全名**（`format.bit_depth`）

支持**子图（subgraph）**展开：`-10` 为输入、`-20` 为输出。

---

## 目录结构

```
lib/index.js          宿主入口：项目存储、ComfyUI 调用、27 个工具、HTTP API
lib/client.js         客户端：画布 / 首页 / 项目 / 资产 / 设置
lib/gates/h3-gate.js  H3 投喂前机检门
lib/jobs/             图片 / 视频 / 口播任务执行
lib/workflow/         模板补丁、绑定解析、口播分段
lib/packs/            能力包清单 + 模型下载器
templates/*.json      API 格式工作流模板
packs/builtin/        能力包定义（模型清单 / 目标目录）
skills/               随插件分发的技能
docs/                 设计文档与实测记录
tools/                自测与依赖准备脚本
```

---

## 数据位置

```
项目     ~/.dsh/projects/<id>/{project.json, canvas.json, media/, assets/}
设置     ~/.dsh/omni-canvas.settings.json
绑定     ~/.dsh/omni-canvas.bindings.json
适配器   ~/.dsh/omni-canvas.adapters.json
历史     ~/.dsh/omni-canvas.jobs.json
导出     ~/.dsh/exports/omni-<项目id>-<日期>.zip
```

---

## 依赖准备

```powershell
node tools/setup.mjs            # 只检查
node tools/setup.mjs --ffmpeg   # 缺则下载 ffmpeg
node tools/setup.mjs --tts      # 安装 edge-tts
node tools/setup.mjs --all      # 全部
```

## 自测

```powershell
node tools/selftest.mjs          # 探活 + 绑定 dry + 工作流 inspect + 模板完整性
node tools/selftest.mjs --smoke  # 额外真实出图 + 超分
npm run check                    # 语法 / 符号 / 提示词机检 / 归一化
```

---

## 已知问题

- 首尾帧（fl2v）实测输出与输入图相关性偏弱，暂不推荐
- 含子图的工作流已支持，特殊自定义节点仍可能映射不准（会给出 warnings）
- 内置模板的模型名可自动匹配同族 + 精度标签，保真度不保证
- 数字人口播在 **10 段以上**时，`global_prompt` 会带上多段拼接（已知缺陷，修复中）

---

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。

## License

MIT
