# CloudBase 中国大陆候选架构

## 目标与非目标

本方案为移动优先的公开数字档案提供中国大陆访问路径，重点约束 Web、API、对象存储和 CDN 的职责与环境隔离。它不代表已经完成供应商选型，也不包含资源购买、账号开通、正式发布、真实域名、真实密钥或业务代码变更。

## 候选拓扑

```text
中国大陆用户
    │ HTTPS
    ▼
备案域名 + DNS/CNAME
    │
    ▼
CloudBase HTTP 网关（原 HTTP 访问服务）
    ├── /*       ──> Web（优先静态网站托管；需 SSR 时改用云托管容器）
    └── /api/*   ──> API（云托管容器，不启用 CDN 缓存）
                           │
                           ├──> PostgreSQL（仅服务端访问）
                           └──> 对象存储写入/签名访问

Web 中的图片 URL
    └── PUBLIC_CDN_BASE_URL + object key
            │ HTTPS
            ▼
        资源 CDN ──缓存未命中──> CloudBase 云存储/COS
```

CloudBase 的 HTTP 网关可把同一入口的不同路径关联到静态托管、云函数或云托管资源；默认域名只用于开发测试，生产应绑定已备案的自定义域名。云存储底层使用对象存储并集成 CDN。参考 CloudBase 官方的
[HTTP 网关](https://docs.cloudbase.net/service/introduce)、
[静态网站托管](https://docs.cloudbase.net/hosting/introduce) 与
[云存储介绍](https://docs.cloudbase.net/storage/introduce)。

## 组件关系与边界

### Web

- 面向公开用户，只通过 Repository/API 边界读取业务数据，不直接连接 PostgreSQL。
- 优先评估 CloudBase 静态网站托管；只有构建产物为纯静态文件时才采用该模式。
- 如果页面需要 Next.js
  SSR、服务端路由或运行时渲染，改用云托管容器，不为了部署而在本任务中修改应用代码。
- 浏览器访问 API 优先使用同域
  `/api/*`，降低跨域配置复杂度；若使用独立 API 域名，必须设置最小化 CORS
  allowlist。

### API

- API 是数据库、对象存储写入和鉴权的服务端边界。
- 候选运行方式是 CloudBase 云托管容器，通过 HTTP 网关暴露 `/api/*`。
- API 响应默认不经 CDN 缓存；若未来开放可缓存的只读接口，必须逐接口评审鉴权、缓存键、失效时间和隐私泄漏风险。
- 数据库连接串只在服务端注入，Web 构建和浏览器运行时不得获得 `DATABASE_URL`。

### 对象存储与 CDN

- 数据契约仅保存 object key，不保存硬编码完整 URL。
- API 或受控导入流程负责写入；公开派生图可只读，原图、待审核内容和私有内容保持私有。
- Web 使用现有 `PUBLIC_CDN_BASE_URL` 与 object key 派生 HTTPS URL。
- 每个环境使用独立存储桶或 CloudBase 环境内独立存储空间，禁止跨环境共享写权限。
- 资源使用内容哈希或版本化 object
  key，并设置长缓存；元数据变更产生新 key，避免覆盖后 CDN 继续返回旧内容。CloudBase 官方说明了
  [CDN 访问链路与公开资源缓存特性](https://docs.cloudbase.net/storage/pg/cdn)。

## 环境划分

CloudBase 环境是资源隔离单元；不同环境的计算、数据、存储和网络相互隔离。候选方案为开发、测试、生产各使用独立 CloudBase 环境，而不是在同一环境内用路径前缀模拟隔离。参考官方的
[环境介绍](https://docs.cloudbase.net/quick-start/env-overview) 与
[云托管环境隔离说明](https://docs.cloudbase.net/run/limitation)。

| 维度           | 开发 `development` | 测试 `testing`          | 生产 `production`      |
| -------------- | ------------------ | ----------------------- | ---------------------- |
| 用途           | 本地联调、试验     | QA 回归、发布演练       | 正式流量               |
| 数据           | 合成数据           | 合成或脱敏数据          | 正式数据               |
| CloudBase 环境 | 独立 EnvId         | 独立 EnvId              | 独立 EnvId             |
| 数据库/存储    | 独立               | 独立，结构尽量同生产    | 独立，启用备份策略     |
| 域名           | 默认域名或本地域名 | 默认域名/已备案测试域名 | 已备案自定义域名       |
| 发布权限       | 开发者             | QA/发布负责人           | 双人复核的发布负责人   |
| 可观测性       | 基础日志           | 生产同类告警演练        | 日志、指标、告警、审计 |

约束如下：

1. 环境 ID 由部署配置注入，不写入应用代码。
2. 测试环境不得复制未脱敏生产数据。
3. 生产凭据不得用于开发或测试，且各环境凭据应独立轮换。
4. 测试环境应尽量与生产保持同区域、同路由和同缓存策略，但使用独立资源与域名。
5. 环境间数据同步只允许经过审批的脱敏/导入流程，不允许运行时跨环境调用。

示例占位配置见
[`infra/cloudbase/deployment.example.yaml`](../../infra/cloudbase/deployment.example.yaml)。

## HTTPS、域名与中国大陆要求

- 生产 Web、API 和资源域名全部只提供 HTTPS；HTTP 应 301/308 跳转到 HTTPS。
- 生产使用自定义域名与受信任证书。证书到期应至少提前 30 天告警，并验证自动续期后的绑定状态和完整证书链。
- CloudBase 默认域名只作为开发/测试入口。生产自定义域名按控制台返回值配置 CNAME，禁止在代码或示例配置中硬编码真实生产域名。
- 中国大陆节点使用的自定义域名需完成适用的 ICP 备案/接入备案，再绑定到 CloudBase/CDN；主体、域名和接入服务商信息由合规负责人确认。参考腾讯云
  [接入备案说明](https://cloud.tencent.com/document/product/243/37403)
  与 CloudBase
  [自定义域名要求](https://docs.cloudbase.net/service/custom-domain.html)。
- Web、API、资源域名建议分别使用独立子域，以便证书、缓存、安全策略和故障隔离；若 API 使用同域路径，则由 HTTP 网关统一路由，并优先避免宽泛 CORS。
- TLS 最低版本、HSTS、CSP、防盗链、限频和 WAF/安全防护策略应在正式上线评审中确定；在未验证全部子域均支持 HTTPS 前，不启用包含
  `includeSubDomains` 的 HSTS。

## 配置与密钥

仓库只保存变量名称和无效占位值。沿用现有公共变量
`PUBLIC_CDN_BASE_URL`，不另造同义变量，也不把存储凭据暴露为 `NEXT_PUBLIC_*`
或其他浏览器变量。

| 变量                    | 作用域             | 值来源               |
| ----------------------- | ------------------ | -------------------- |
| `NODE_ENV`              | Web/API 运行时     | 构建或运行平台       |
| `DATABASE_URL`          | API 服务端         | 密钥管理/运行时注入  |
| `OBJECT_STORAGE_BUCKET` | API 服务端         | 环境配置             |
| `OBJECT_STORAGE_REGION` | API 服务端         | 环境配置             |
| `PUBLIC_CDN_BASE_URL`   | Web 公开配置       | 环境配置，HTTPS URL  |
| `MAP_PROVIDER_KEY`      | 按后续地图方案确定 | 受限密钥或服务端注入 |

CloudBase 云托管的环境变量与服务版本绑定；平台配置会覆盖容器内同名默认值。正式敏感值只能在平台密钥/环境配置中维护，不能写入镜像、构建日志或 Git。参考官方
[云托管环境变量说明](https://docs.cloudbase.net/run/deploy/configuring/environment/envs)。

## 交付与发布原则

- Web 产物和 API 镜像都绑定完整 Git SHA，并保留不可变摘要。
- 先在测试环境部署同一交付物，通过冒烟与回归后再晋级生产，不在生产重新构建。
- 发布元数据记录 Git
  SHA、Web 产物摘要、API 镜像 digest、配置修订和上一个已知良好版本。
- 对象 key 不随回滚删除；回滚恢复应用版本和配置映射，避免数据二次破坏。
- 实际操作前逐项完成 [部署检查清单](deployment-checklist.md)，失败时执行
  [回滚方案](rollback-plan.md)。

## 上线前必须完成的后续决策

1. Web 采用静态导出还是云托管容器，以及 Next.js 运行能力是否完整。
2. API 的 HTTP 入口、容器端口、健康检查和无状态化约束。
3. PostgreSQL 具体产品、网络路径、连接池、备份保留和恢复目标。
4. CloudBase 中国大陆具体地域、套餐、配额、成本上限和日志保留期。
5. 自定义域名、备案主体、公安备案（如适用）、证书与 DNS 权限归属。
6. 图片公开/私有分级、内容审核、防盗链、缓存 TTL 与流量预算。
