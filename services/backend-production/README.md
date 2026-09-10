# `@moya/backend-production`

唯一 Public Backend composition，组合现有 HTTP
runtime、CatalogQueryPort、PostgreSQL published-read adapter、Search
V1 与 Production COS resolver。Public
API 和已验收前端行为保持原样；Pilot 上传与 manifest 保护留在 Pilot 模块。非 Pilot
composition 将 published projection 的 opaque key 解析为短时签名 COS URL，经既有
`PublicMedia.src` 由浏览器直接读取。Local development 使用 Backend local
resolver 和 Payload 原生文件路由；不新增公开媒体 Contract 或字节代理。

`MOYA_CONTENT_SOURCE=legacy|payload`
明确内容源。启动前在独立授权的 migration 步骤执行
`pnpm db:migrate`；普通启动仅检查对应 schema
readiness，不执行 DDL。正式配置缺失时 fail
closed。数据库与 COS 配置只存在于 Backend runtime。

本地三进程与数据库操作见
[development](../../docs/development.md)；伙伴账号未来 CVM/TencentDB/COS 拓扑、权限、TLS 和模板见
[production](../../infra/production/README.md)。

`GET /health` 是 readiness，不是 process liveness；PostgreSQL 不可用时返回既有
`SERVICE_UNAVAILABLE` 503。Production 发布和真实迁移不属于本轮准备工作。
