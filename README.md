# dsh-comfy-canvas（M1）

DSH 右侧面板里的无限画布，**直连本地 ComfyUI**（默认 `http://127.0.0.1:8188`）。

- 一个画布 = 一个项目（可新建 / 切换 / 重命名 / 删除）
- 底部输入条：提示词 + 模型 + 画幅 + 张数，`Enter` 生成
- 产物写入节点，并**永久归档到项目资产库**（`assets/index.json`）
- 顶部状态点：绿=ComfyUI 连通 / 红=未连接

## 现在支持（M1）

| 能力 | 模型 | 说明 |
|---|---|---|
| 文生图（加速） | `qwen-t2i-fast` | Qwen-Image-2.1 viggle 6 步，约 6–9 秒 |
| 文生图（高清） | `qwen-t2i-hq` | bf16 + viggle LoRA，约 12–20 秒 |

M2 加：视频（H3 导演台参考生视频）、队列、取消、重试。

## 安装 / 更新

```powershell
# 1. 同步到 profile
powershell -ExecutionPolicy Bypass -File E:\Allen\plugins\dsh-comfy-canvas\sync.ps1

# 2. 重启 DSH（右侧面板出现「画布」tab）
```

首次安装还要在 `C:\Users\Administrator\.dsh\profiles\desktop\package.json` 的
`dsh.profile.bundles` 里加入 `@local/dsh-comfy-canvas`（已加过则无需重复）。

## 目录结构

```
~/.dsh/projects/<项目id>/
├── project.json          名称、时间
├── canvas.json           节点 / 连线 / 视口
├── media/                生成产物
└── assets/index.json     资产库索引（永久保留）
```

## 数据流

```
画布 UI ──POST /comfy-canvas/api/gen.image──▶ 宿主插件
                                              ├─ 读 templates/t2i-*.json
                                              ├─ 打补丁（prompt/尺寸/种子）
                                              ├─ POST /prompt ─▶ ComfyUI 8188
                                              ├─ 轮询 /history/{id}
                                              ├─ GET /view 下载图片
                                              └─ 写 media/ + assets/index.json + 节点状态
画布 UI ◀──GET /comfy-canvas/api/job.get───┘
```

## 模板

`templates/t2i-fast.json`、`templates/t2i-hq.json`、`templates/edit.json`、`templates/h3-r2v.json`
（API 格式工作流，来自本机实测可用的图）。

**模型文件名是与本机绑定的**——换机器若报 `value not in list`，改模板里的
`UNETLoader.unet_name` / `CLIPLoader.clip_name` / `VAELoader.vae_name` 即可。

## 内置工具（给对话里的 Agent 用）

| 工具 | 作用 |
|---|---|
| `comfy_self_check` | 检查 ComfyUI 连通性、队列、可用模型 |
| `comfy_generate_image` | 提交文生图任务，返回 jobId |
| `comfy_job_status` | 查询任务状态与产物 |
| `comfy_prompt_template` | 返回 H3 六段式骨架（t2v / r2v / i2v） |

## 已知限制（M1）

- 不支持撤销/重做（M2 之后）
- 视频节点按钮占位不可用（M2）
- 生成中不能取消（M2）
- 单画布单 tab，项目切换代替多开
