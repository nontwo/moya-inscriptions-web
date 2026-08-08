# ADR 0002：Runtime contracts 与 OpenAPI

- 状态：Accepted
- 日期：2026-08-08
- 范围：T04.0 公共契约与 HTTP 描述

## 背景

T01 当前同时维护 TypeScript 类型和依赖无关的手写 JSON
Schema。测试包含最小 Schema
validator，但正式运行时代码没有统一的 parse/validation 入口。Public
API 也没有语言无关的 path、query、response 和 error 描述。

## 决策

T04.0 采用以下单向事实链：

```text
Zod 4 runtime schema
→ inferred TypeScript type
→ JSON Schema Draft 2020-12
→ OpenAPI 3.1.1 components
```

- 不再独立手写同一模型的 TypeScript interface 与 JSON Schema。
- T01 已有公共类型名称及 source/raw/candidate 事实语义保持不变。
- 无法完整表示为 JSON Schema/OpenAPI 的跨字段 invariant 使用 Zod semantic
  refinement 和测试保证。
- OpenAPI 的 path、method、parameter 位置、HTTP status 和 transport
  semantics 由 Public API 层定义；component data schemas 必须由 contracts 派生。

## Package 与 bundle 边界

- `@moya/contracts` 根入口只导出类型，编译后的 JavaScript 不加载 Zod。
- runtime schemas 只从 `@moya/contracts/schemas` 显式导入。
- JSON Schema 只从 `@moya/contracts/json-schema` 显式导入。
- Web Client Component 对 DTO 只能使用 type-only import，不得导入 runtime
  schema。

## Query、分页与错误

Transport
query-string 先 parse/coerce/validate，再产生 Repository 接收的 normalized
query。Repository 不接收 HTTP string representation。

- `page` 默认 1。
- `pageSize` 默认 20，最大 100。
- 非法输入返回 400 `INVALID_QUERY`。
- 越界页返回 200 和空 `items`。
- `total=0` 时 `totalPages=0`。
- `PaginatedResponse<T>` 一次性使用 `items`，不保留 `data` alias。

公共错误代码固定为：

- `INVALID_QUERY`：400
- `SITE_NOT_FOUND`：404
- `SERVICE_UNAVAILABLE`：503
- `INTERNAL_ERROR`：500

错误只公开稳定 code、安全 message、requestId 和显式允许的安全 details。

## OpenAPI 范围

T04.0 使用 OpenAPI 3.1.1 描述：

- `GET /health`
- `GET /v1/sites`
- `GET /v1/sites/{id}`
- `GET /v1/regions`
- `GET /v1/categories`
- `GET /v1/search`

T04.0 不选择或安装 Router。公开 DTO 不暴露内部审核字段，也不暴露
`createdAt`、`updatedAt` 等内部持久化时间。

## 地区过滤边界

当前 v1 list/search query 只冻结已经允许公开的 province-level
filter，不包含 city/county public filters。lower-level region filter 在 D01.2
pilot 后、T04.4 正式 HTTP
API 实现前重新评估。D01.1 已批准的 internal 行政区与证据语义不自动进入 public
DTO/OpenAPI。
