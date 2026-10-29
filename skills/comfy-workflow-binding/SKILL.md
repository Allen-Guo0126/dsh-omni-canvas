# comfy-workflow-binding

把一个本地 ComfyUI 工作流接入 dsh-omni-canvas 插件，成为某个能力的实现，并**端到端验证能出图/出片**。

## 何时使用

- 用户说「用我的工作流」「把这个工作流接进来」「设为默认工作流」
- 设置页里点了某个候选的「设为默认」（会复制一段指令给你）

## 可用工具

| 工具 | 用途 |
|---|---|
| `cnv_workflow_inspect` | 读节点表 + 猜参数位置（prompt / seed / 尺寸 / 参考图 / 输出） |
| `cnv_binding_save` | 保存绑定（校验节点与字段，不通过不落库） |
| `cnv_binding_list` | 列出绑定与状态（ok / changed / missing-nodes / missing-file） |
| `cnv_binding_test` | `mode:"structure"` 结构校验；`mode:"run"` **真跑一次** |
| `cnv_binding_run` | 用绑定执行：UI→API 转换 + 参数回填 + 提交 + 等产物；`dry:true` 只转换不提交 |

## 流程

1. **确认目标**：接到哪个能力（`image-t2i` / `image-edit` / `video-r2v` / `video-t2v`）。
2. `cnv_workflow_inspect({file})` → 看 `guesses`。
3. 定绑定（挑不准就问用户）：

```json
{
  "capability": "image-t2i",
  "name": "z-image 文生图（本机）",
  "workflow": { "file": "user/default/workflows/xxx.json" },
  "inputs": {
    "prompt": { "node": "70", "field": "text" },
    "seed":   { "node": "69", "field": "seed" },
    "width":  { "node": "76", "field": "width" },
    "height": { "node": "76", "field": "height" }
  },
  "outputs": { "image": { "node": "67" } }
}
```

4. `cnv_binding_save({binding})` — 失败会返回 `problems`。
5. **先 dry 再 run**：
   - `cnv_binding_run({id, dry:true})` → 看 `nodeCount` 和 `issues`；
   - `cnv_binding_run({id, prompt:"…", seed:123})` 或 `cnv_binding_test({id, mode:"run"})` → 真跑，成功会自动把 `verified.mode` 记成 `run`。
6. **回报**：产物路径 + 耗时 + `issues`（跳过静音节点是正常的）。

## 转换器做了什么

- `nodes/links`（UI 格式）→ `{id: {class_type, inputs}}`（API 格式）
- **Reroute 穿透**、**Primitive 取值**（`PrimitiveString/Int/Boolean` 直接取 widget 值）
- `widgets_values` 支持数组与对象两种形态；widget 名按 `/object_info` 的 required/optional 顺序对齐，跳过长连接口类型
- **跳过 control 值**（`fixed/increment/decrement/randomize`）
- 静音节点（mode 2/4）跳过并记入 `issues`

## 硬规则

- **空字段也是候选**：提示词入口常是空字符串（如 `global_prompt`），别因为空就跳过。
- **这四种必须问用户**：多个文本节点、prompt 来自 Primitive 连线、含子图（`hasSubgraph:true`）、多个输出节点。
- **必须先 dry 再 run**；`issues` 里有「缺节点类型」就不要跑。
- **校验不过不落库**；跑不通就保留内置模板。
- 一次只接一个能力。

## 已知限制

### H3 导演台：参数被 timeline_data 吞掉（实测，重要）

转换器已被 H3 逼着修了 6 个问题（都已修好并验证）：插槽 vs 控件、按类型匹配、
必填默认值兜底、muted 节点穿透、`BDGROUP` 分组标记、`COMFY_DYNAMICCOMBO_V3`、JSON 内字段注入。

修完之后 H3 **能出片**（91s / 8s 视频 / 672×1216 / h264+aac），但：

```
设置了 node18.width=384, height=384, total_frames=48
实际输出仍是 672×1216 / 8s          → 节点读 timeline.output，不读独立控件
设置了 timeline_data.global.prompt = "沙漠里的年轻男人"
两次不同 seed 出的都是同一画面（差异仅像素噪声）→ r2v 模式下内容不由 global.prompt 决定
```

**结论：`ComfyMiniMaxH3Director` 的所有绘制参数都在 `timeline_data` 这个私有 schema 里**
（`global.prompt` 只在 t2v 下有用；r2v 要 `r2v_groups` + refs），
**外部 H3 工作流不适合走"绑定 + 回填"这条路**。

视频能力的正确做法：

1. **用插件内置的 H3 模板**（`templates/h3-r2v.json`），我们本来就直接构造 `timeline_data`；
2. 绑定机制留给**参数简单**的工作流：图片（已验证 z-image）、图生图、普通视频（Ex `WanVideo` 的 prompt/length）。

### 其它工作流：widget 顺序不可靠

`ComfyMiniMaxH3Director` 这类节点有大量条件控件（`bd_grp_*` 分组），
`widgets_values` 数组与 `/object_info` 声明顺序**不一致**，按顺序映射会把
`r2v_groups` 写成字符串，执行时报：

```
Expected MMX_DIR_GROUPS list, got <class 'str'>
```

**结论：复杂自定义节点不要靠 UI 顺序猜参数，改用 API 格式工作流。**

处理办法（按优先级）：

1. 让用户在 ComfyUI 里「导出 → API 格式」得到 `*_api.json`，我们直接把该文件当工作流绑定
   （API 格式跳过转换，字段名由 ComfyUI 自己给出，100% 正确）；
2. 若只有 UI 格式，且节点控件很多 → 明确告知用户"这个工作流需要 API 导出"，不要硬试；
3. 标准节点（CLIPTextEncode / KSampler / EmptyLatentImage / SaveImage）顺序映射是可靠的，
   本机 `z-image 文生图` 已验证通过。


- **子图（subgraph）还没展开**：`hasSubgraph:true` 的工作流 dry 可能通过但 run 会失败。
- H3 导演台这类工作流的台词/分镜在 `timeline_data`（JSON 字符串）里，绑 `prompt` 只能写 `global_prompt`，要写完整分镜得额外构造 timeline JSON。
- 切换默认实现的即时生效（不走 Agent）还没做。
