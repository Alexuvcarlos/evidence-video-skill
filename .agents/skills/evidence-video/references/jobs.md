# 工作台任务协议

阶段任务以当前目录的 task.json 为准。它包含创作要求、人工检查档位、可用工具、已确认的简报、预算、所有已有来源、定稿旁白或分镜和本轮批注。projectRoot 下的原资料可读。本轮新增文件只写当前任务目录。在 result.json 的文件字段使用 artifactPrefix 加文件名，已有用户上传资料引用其相对路径。字段内容使用自然中文。项目的提交版本由工作台写入。

完成本阶段实作后写入 UTF-8 result.json。缺少确实必需的资料或工具时，写 `{"blocked":"具体缺口、已尝试办法及恢复步骤"}`。带着原文完成能做的检索，采用短来源标题和可定位的页码、原句或图号。根据出现的事实边界核对，并保留获准的切点和已有资料。

**确认只能由工作台页面发起。** Agent 不调用 `decision`，也不把对话里的同意当批准。审阅页的截帧、区间、圈选和「按批注修改」是唯一修改入口。用户在工作台操作后可能只说「继续」「我已确认」「我已修改」；把它当作读取项目状态的信号，用 `node bin/agent.mjs next` 或 `project.json` 的 `job.taskFile` 继续，不再要求用户复制任务路径。

## brief

开工前唯一一次集中确认。结果为：

```json
{
  "productionMethod": {
    "form": "二维图解",
    "reason": "为什么这个制作方式适合本题，依据是什么",
    "effort": "预计工期",
    "risk": "主要风险"
  },
  "styleDirections": [
    {
      "id": "A",
      "name": "方向名",
      "rationale": "视觉理由",
      "refs": [{ "sourceId": "S00", "use": "这份参考用在哪" }]
    }
  ],
  "recommendedDirection": "A",
  "budget": { "currency": "USD", "cap": 0, "categories": [] },
  "allowPaidGeneration": false,
  "capabilities": [
    {
      "id": "tts-main",
      "kind": "tts",
      "provider": "实际服务名",
      "available": true,
      "note": "授权或限制",
      "cost": "单价"
    }
  ],
  "sources": [],
  "questions": []
}
```

- `productionMethod.form` 取 `原网页、现场影像、二维图解、写实三维、生成示意、混合动画`，并写清理由；不能用「按需」。
- `styleDirections` 给 1–3 个，每个至少一条带图参考（`image`、`imageUrl` 或图片文件），并指定推荐方向。参考来源写在顶层 `sources`。
- `budget.cap` 为 0 表示不付费；`allowPaidGeneration` 为 true 时上限必须大于 0。`categories` 从 `tts、music、image、video` 中选。
- `capabilities` 记录实际探测到的能力，`kind` 取 `tts、music、image、video、screenshot、vision`。
- 用户在简报页仍可修改制作方式、风格方向、预算和备注；保存后以项目里的值为准。
- 进入下一步前必须由用户在工作台确认。

## research

Agent 自己完成实际检索。来源数组 sources 的字段为 id,title,kind,url,creator,date,doi,imageUrl,file,image,rights。至少有 URL 或本地资料 file。image 为项目内图像，imageUrl 为可公开访问图像。对原始材料的其他观点使用另一个陈述。

claims 每项为 `{id,text,type,evidence:[{sourceId,locator,scope}]}`。type 为 fact、interpretation、outlook。事实必须有原文，locator 和 scope 分别写原文位置和该证据实际支持什么。searches 为 `[{query,summary}]`，gaps 可选。连接不上原文时，应查替代的一手资料或如实收窄。

## script

结果为 `{"cues":[{"id":"N01","text":"逐句旁白","claimIds":["F01"]}]}`。设定时长留出画面停顿。没有事实的段落加 purpose，取值为 transition、question、title、opinion。`tools.workbenchVoice` 为 true 时，本阶段提交逐句文本，工作台在提交后用本地语音生成实际音频和时码。已选定外部音色时，可给每段提供 audio 和顶层 voiceProvider。使用已有旁白时，提供顶层同版本的 audio 和 subtitles，字幕文字与段落完全匹配。

## design

查看真实参考及美术参考的实际画面。必要时继续查资料，并以 sources 保存新增来源。提交 `{"rationale":"全片表现理由","sources":[],"shots":[...]}`。每镜为：

```json
{
  "id": "SHOT01",
  "title": "镜头名",
  "cueIds": ["N01"],
  "style": "编辑式工程图",
  "form": "二维图解",
  "visual": "景别、构图、动作和声音安排",
  "mustShow": ["观众能实际看到的验收点"],
  "onScreen": ["准确的上屏文字"],
  "motionPlan": {
    "type": "build",
    "description": "什么元素在动、按什么节奏、怎么转场",
    "beats": ["0.0–1.0s 元素 A 入场", "1.0–2.5s 元素 B 接上", "2.5s–结尾 收束"]
  },
  "references": [
    {"sourceId":"S00","role":"style","locator":"版式/字体/配色","use":"所支持的内容"},
    {"sourceId":"S01","role":"evidence","locator":"正文第一段","use":"所支持的内容"}
  ],
  "realityMatch": {
    "consistent": false,
    "note": "为什么公开资料里没有同源场景",
    "closest": "实际采用的最相近场景"
  }
}
```

- **每镜必须有 `motionPlan`**：`type` 取 `camera / build / kinetic-type / mixed / 3d / footage`，写清动效说明和至少两个节拍。新项目至少一半镜头不能是 `camera`，整片不能只靠静态页推拉；`styleFrame` 只是参考帧，不是交付物。
- **每镜至少要有一条 `role: "style"` 且带图的参考**（`image`、`imageUrl` 或图片文件）。只有文字链接不算美术参考。
- `写实三维` 镜头还必须有带图的 `reality` 或 `asset` 参考。现实参考应尽量和旁白事实同源；不同源时必须给 `realityMatch`，写清不一致原因与最相近场景。
- `原网页` 镜头需要 `asset`，并写明直接入片的使用依据 rights；`现场影像` 用实拍素材作为 `asset`。
- form 必须是原网页、现场影像、二维图解、写实三维、生成示意、混合动画之一。role 为 evidence、reality、style、asset。旁白段按原顺序各用一次。
- 原创原理图可以根据已核对的原文绘制。使用烧录字幕时，画面底部约 15% 留作字幕区域。需要预览定帧时，用 `node <tools.previewStill> 输入.svg 输出.png` 栅格化并打开检查，可以将 PNG 作为该镜的 styleFrame。

## production 与 revision

实际制作镜头并打开输出检查。按 `motionPlan` 做动画：二维分层、逐段描边、数值增长、动态字，三维用 Blender，复杂合成可用 Remotion 或生成视频。**静态 SVG/PNG 加 push/hold 只用于 `motionPlan.type` 为 `camera` 的镜头**，且整片不能全是这种；其余镜头交 MP4 或 MOV。确保成品足以覆盖指定帧数和构图，保留可编辑工程文件和必要依赖，并清楚标注现实与示意。

交 SVG 源图时用 `node <tools.previewStill> 输入.svg 输出.png` 实际查看同一渲染器的画面。合片、配音复用和字幕重排由工作台在验收源画面后执行。配音、音乐、图像若通过付费服务生成，先核对简报预算，调用后用工作台登记花费。

```json
{
  "renders": [
    {
      "id": "SHOT01",
      "file": "runs/当前任务/SHOT01.mp4",
      "referenceIds": ["S00", "S01"],
      "checks": [{ "item": "观众能实际看到的验收点", "frame": 8, "evidence": "镜内第 8 帧看见的对应内容" }],
      "editable": ["runs/当前任务/SHOT01.blend"],
      "tools": ["Blender"],
      "generation": "如有生成画面，记录平台、参考和标识",
      "motion": "hold"
    }
  ],
  "summary": "画面和时间核验简述"
}
```

frame 使用镜内零起算。每项 mustShow 给出能在成片看到对应内容的帧和简短说明。referenceIds 必须覆盖本镜分镜指定的所有参考。只提交 affected 里的镜头，工作台复用其余镜头、旁白、字幕和切点。

## revisionPlan

notes 已包含旧版本、全片帧号、截图、上下文、目标镜头、用户原话；override 是用户明确选择的风格或呈现。先检查批注，再决定是否补查证据或现实与美术参考。提交 `{"sources":[],"changes":[{"id":"SHOT02","instruction":"具体如何修改"}]}`。可在修改项里给出新增完整 references、mustShow、style、form、onScreen。修改旁白事实或时长时，先在回复里指出影响和应由用户回到哪个阶段。

## 预算与花费

- `task.budget` 是简报确认的上限；`task.spend` 是已登记花费。
- 付费调用前确认类别和余额；调用后提交到 `POST /api/projects/<id>/spend`，字段为 `{provider,category,amount,purpose}`。超出上限会被拒绝。
- 交付时必须保证登记总额不超过上限；工作台在合片前也会校验。

## 结束回复

显示实际完成的内容、审阅档位、以及正在继续或等确认的阶段。工作台负责合并项目状态、交付成片、导出逐镜溯源与制作记录。任何替代或缺失应具体说明。
