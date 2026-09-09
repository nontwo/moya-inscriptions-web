# P2-04 部署、恢复与日常操作

状态：本地实现进入最终验证与独立复核；真实资料迁移、COS 实测及切换尚未执行。这份说明是唯一运行交接文档；实现范围及逐项证据见
[实施记录](p2-04-implementation.md)。所有示例均为占位符或虚构数据。

## 日常使用

Owner 在 Payload 原生后台编辑资料、保存草稿、比较版本及发布/撤回。未完成资料可以保存；发布前会列出缺失或不合法字段。释文使用纯文本，状态切换与文字必须一致。沿用既有契约的长度和首尾空白限制；非法输入会被拒绝，程序不会自动 trim 或改写原文，合法内部空白和换行按原值保存。媒体从原生上传/选择窗口加入有序快照，无需手工填写媒体身份或对象键。原图替换、删除和既有权利/顺序置信度修改被禁用；LOW 保留为提示，不由程序推测提升。

“批次审核”页列出草稿与公开版本的字段差异、缺项和修订号。Owner 选择已经检查的记录及受限自动化身份，一次批准一个明确批次。Codex 执行批准时，变化的条目单独冲突，其他仍符合批准的条目可以完成。历史恢复产生新的草稿；恢复后需重新检查并发布才影响公众。

自然语言入口示例：“把这批获准资料录入为草稿，保留原文与不确定性”；“修订这几条资料的来源说明，先让我看差异”；“上传这批已批准原图并关联到已有记录”；“执行后台已经批准的批次并报告失败项”。项目 Skill 位于
`.agents/skills/yoyi-editorial/SKILL.md`。模型负责范围、问题汇总及少量必要字段，确定性程序负责全文和文件字节。Owner 无需制作 JSON、CSV、XLSX、计算哈希或逐张执行技术操作。

## 应用与配置

保留现有 Next 16.3.0、React 19.2.8、TypeScript
6.0.3。Payload 及官方 PostgreSQL、MCP、S3、UI、翻译包固定为 3.88.0（MIT）。新增 GraphQL 仅满足官方依赖，GraphQL 管理路由关闭。Sharp
0.35.4（Apache-2.0）只用于文件核验；不配置 Payload 全局 Sharp，避免对已批准 WebP 自动再编码。Zod
3 别名用于官方 MCP 参数类型，不替换既有 Zod
4 公开契约。直接及传递版本以锁文件为准。

新增运行配置仅放在受控服务端文件/秘密管理中：
`CMS_SECRET`、`CMS_DATABASE_URL`、`CMS_MEDIA_DIR`、`CMS_STORAGE_MODE`。COS 模式另需
`CMS_COS_ENDPOINT`、`CMS_COS_REGION`、`CMS_COS_BUCKET`、
`CMS_COS_ACCESS_KEY_ID`、`CMS_COS_SECRET_ACCESS_KEY`。浏览器不接收这些值。
`CMS_ENVIRONMENT=synthetic` 只用于隔离的回环数据库验收。

预览使用 `CMS_PUBLIC_URL`（Admin 对外入口）、`CMS_PREVIEW_WEB_URL`
（Web 对外入口）和
`CMS_INTERNAL_URL`（Web 服务端到 CMS 的固定入口）。Admin 与 Web 的对外主机名必须一致，以共享 Payload
host-only 会话 Cookie；本地合成验收可使用不同端口。真实入口通过现有受限 HTTPS 反向代理分流，保持 TLS、期限和访问保护。预览不缓存，不发送公开链接或独立预览令牌。

数据库使用新数据库或事先明确隔离的结构。Payload adapter 的
`push:false`；仅运行提交的官方迁移。CMS 数据库连接上限为 5。普通用户驱动 Local
API 显式传递可信 req/user、`overrideAccess:false`，更新同时使用
`overrideLock:false`。业务修订检查使用同一 PostgreSQL 事务中的锁。

常用受控命令：`pnpm --filter admin cms:migrate`、
`pnpm --filter admin cms:types`、`pnpm --filter admin cms:importmap`、
`pnpm --filter admin build`。构建使用临时无效数据库参数，不连接运行库。部署制品须在目标平台或相同平台的构建环境生成；不能把本机 macOS 的 Sharp/Node 依赖复制到 Linux。生产运行加载真实受保护配置再启动；禁止向生产调用开发 schema
push 或合成 bootstrap。新目标先在受限网络内完成 Owner 初始化，再开放受保护入口。部署身份、内容操作身份、Public
API 只读身份与 COS 权限分别保持最小范围。

## Codex MCP 与批处理

官方 MCP 路由为
`/api/mcp`。自动化只授予查询、必要字段读取、草稿保存、批次结果及执行已有批准的工具权限；普通集合 CRUD 不暴露。原生 Users
REST API key 用于确定性批处理，官方 MCP key 用于 MCP
Bearer，两者与部署凭据分离。Owner 创建账号及工具范围，自动化不能解锁/管理其他账号。

客户端仅新增本任务服务器项；先核对并保留其他配置。模板：

```toml
[mcp_servers.yoyi_editorial]
url = "<AUTHORIZED_MCP_ENDPOINT>"
bearer_token_env_var = "YOYI_EDITORIAL_MCP_TOKEN"
enabled_tools = ["editorial_query", "editorial_read", "editorial_save_draft", "editorial_publish_approved", "editorial_batch_results"]
startup_timeout_sec = 45
tool_timeout_sec = 30
```

真实 URL/令牌不写入仓库；令牌由受控启动环境注入。持久客户端修改须有本任务的具体授权，修改后新开 Codex 会话/重启客户端，使服务器配置重新加载。工具许可提示仍须按当前客户端策略处理；不得用关闭审批绕过失败。MCP 初始化、REST 成功与 Codex 实际工具调用分别记录。

现有 HTTPS 入口若也占用 `Authorization` 做 Basic 身份验证，会与 MCP
Bearer 冲突。具体目标需核实代理配置；保留现有入口保护，把 CMS
Bearer 透传至 CMS，必要的上游身份验证使用已批准的兼容通道。不得取消 CMS 鉴权、开放原始管理端口或改用新网络平台来绕过冲突。

程序准备受保护清单后运行 `scripts/editorial/batch.mjs`：默认 dry-run；执行时增加
`--execute --config <PROTECTED_CONFIG> --receipt <PROTECTED_RECEIPT>`。每项稳定 replay
key 与业务身份分离；默认 2 并发、3 次尝试、30 秒请求超时、120 秒批次预算、最多 10000 项。成功项在恢复时跳过；失败项有限重试。正文通过文件读取原样传递，媒体通过官方 multipart 上传；不从清单 URL 取文件。回执以 0600 日志逐项同步后压缩成快照。非正常终止后，先确认记录进程已结束，再移除该回执的残留锁并续接；不自动删除对象或替换业务身份。

## 迁移与切换

离线转换器只接受现有表的明确导出及已有身份/媒体元数据。缺少来源映射、权利、字节校验或顺序置信度时阻断；不会从摘要重建原文或推导 SourceId。单一已存来源可直接承接；多来源需要已知主来源映射。报告只含计数、固定字段名和错误类别。真实导出、草稿内容和映射计划留在受控私有位置。

通过 `pnpm --filter admin cms:legacy`
的显式 dry-run/apply 操作执行：先验证完整输入，再检查目标 Owner 身份及既有映射；原媒体只登记元数据，不调用上传。资料默认草稿；完整正文和关系经同一服务端校验保存。重跑必须命中相同身份/内容或稳定回执；有差异时停止相关项，不覆盖未知编辑。

```sh
pnpm --silent --filter admin cms:legacy --mode dry-run --source "$CMS_LEGACY_EXPORT"
pnpm --silent --filter admin cms:legacy --mode apply --source "$CMS_LEGACY_EXPORT" --target "$CMS_LEGACY_TARGET" --settings "$CMS_LEGACY_SETTINGS"
```

上述变量由受控程序指向已批准的受限文件和目标别名，不在聊天或日志打印。
`--silent` 避免包管理器回显私有文件路径；包脚本已包含 Payload 所需的 `--`
分隔符，调用者无需再加。源文件和设置文件须由当前用户持有、权限 0600，禁止符号链接。设置格式为
`{target, baseURL, ownerApiKey, environment}`，真实值仅放在受限设置文件；
`environment` 为 `production` 或回环合成环境
`synthetic`。dry-run 不需要运行库或凭据，不会连接数据库；READY 返回 0，BLOCKED 返回非零。apply 必须先取得本节所列真实环境授权。

切换前一次确认：明确源/目标和受保护验收入口；源备份与目标恢复证据；三条资料/20 张媒体范围及逐项文本/映射/字节核验；旧写身份冻结方式；预期影响和停写窗口；回退期限、增量保存及费用。既有权利和身份无需重批。在批准前不读取未知远端库、不复制真实数据到合成库、不改真实云权限。

发布读取选定 `MOYA_CONTENT_SOURCE=payload` 后使用同库只读视图；原 Public
DTO、列表/详情/搜索/计数由已发布快照提供。Public
API 身份仅获这些视图 SELECT 权限，另仅授予 `payload_migrations` 的 `name`
列 SELECT 用于启动版本核对；不能读原生草稿表或写表。启动会检查视图及迁移版本。切换同时冻结旧导入操作身份的写权限并检查它实际不能继续写；线上依赖确认结束后才移除仅服务旧入口的正常命令/依赖。当前仍保留 legacy 默认运行路径。

## COS、备份与恢复

S3 adapter 使用 COS virtual-host
addressing、服务端上传和官方签名协议；管理侧文件由受保护接口读取。原 key 归一化或原生 filename 唯一约束不兼容时明确阻断并保留原对象，不能靠改名/重传使迁移成功。实际 COS 验收覆盖匿名拒绝、旧对象 GET/字节一致、新对象授权写入、失败恢复和 HTTPS；本地存储测试不能代替。上传与数据库不是跨系统原子事务。未知云端上传结果按同一业务身份核对续接，不能声称所有失败都没有产生对象，也不能擅自批量删除孤立对象。

备份包含一致 PostgreSQL
dump（含账号、修订、身份占用和回执）与配置版本；对象字节独立保留。备份文件、账号及配置不得进入 Git、CI 附件或诊断输出。目标恢复到隔离库，核对迁移、计数、正文、身份、修订及媒体关联后重启并实测。回退时先暂停 CMS 写入、保全切换后增量及相关对象，再恢复旧读取入口和明确批准的旧写权限。不能只恢复旧备份而丢弃新编辑。旧库删除另行授权。

## 尚待验证与 Owner 介入

真实三条资料/20 媒体与 COS 目标、受限入口认证、持久客户端接入、切换和费用，以及机器验证/独立审查后的 Owner 后台工作流验收尚待完成。本机打包运行预热后约 405
MiB RSS；整仓并行构建子进程合计峰值约 3.39
GiB。四并发写入 10000 条合成草稿用时约 33.4 秒、进程峰值约 691
MiB、数据库增长约 21.5
MiB，连接池上限 5。现有 2GB 机器容量不能由这些数值推断；构建应在已授权且有足够内存的环境完成，目标机仍需留出 PostgreSQL、Web、代理和系统余量后再决定容量。未购买任何新服务。尚未完成表格入口实际退役。

参考：[Payload 文档](https://payloadcms.com/docs/getting-started/installation)、
[官方 MCP](https://payloadcms.com/docs/plugins/mcp)、
[Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)、
[客户端配置](https://learn.chatgpt.com/docs/config-file/config-reference)。

## 可重复检查与依赖限制

日常验收仍使用 `pnpm verify`，总执行预算不变（120 秒）。CMS 专项另用
`CMS_TEST_DATABASE_URL` 明确指定隔离的回环测试数据库，运行
`pnpm test:cms`；只接受专用测试参数，不回退普通运行库。首次原生浏览器验证在该库的迁移/集成检查及 Admin 构建完成后运行
`pnpm test:cms:browser`。脚本创建虚构账号及本地媒体，首次运行要求这些账号不存在；重跑使用新的隔离数据库，不能对真实库调用。CI 中的独立
`cms` job 执行这套链路，完整公开端浏览器回归仍由既有 CI 运行。

官方 MCP SDK 的真实协议查询、草稿创建、必要字段读取和重放已经通过。实际 Codex
CLI 两次尝试均在工具审批处被拒绝：非交互执行的有效策略为
`never`，尚无成功工具调用证据。需要在获准的客户端环境完成工具许可与新会话接入；不会通过关闭审批来补证据。

最终锁文件审计仍有三个 moderate，high/critical 为零：

- Payload
  3.88.0 的账号 unlock 权限公告：目前注册表无可安装的 3.88.1；已显式限制 Users
  unlock 为 Owner，MCP
  key 禁止 unlock，并用真实数据库验证匿名/自动化/跨账号解锁拒绝。保留上游风险，更新可用后需独立评估补丁。
- 旧 esbuild CLI
  loader 的开发服务器公告：来自官方迁移工具链，不作为公开开发服务器运行；不伪造不可安装的补丁版本。
- 既有 ExcelJS 链路的 uuid 公告：保留旧入口直到批准切换，不跨范围升级依赖主版本。

官方 MCP 包与 mcp-handler 的 SDK
peer 声明仍不完全匹配；锁定官方稳定版本后的构建和真实协议检查已通过，但 peer
warning 仍保留。Sharp 已修补至 0.35.4；DOMPurify/Nanoid 采用锁定的小版本修补。审计不是零风险证明。

公告：[Payload unlock](https://github.com/advisories/GHSA-jg8r-5jh2-v2xj)、
[esbuild](https://github.com/advisories/GHSA-67mh-4wv8-2f99)、
[uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq)。
