# ADR 0002：Public contracts 与 OpenAPI

- 状态：Superseded by ADR 0003
- 日期：2026-08-08
- 范围：来源无关 T04 v2 公共查询与 transport contract

## 决策

> 本 ADR 保留为 T04 v2 的历史记录。搜索、分类、图片和五路由边界已由
> [ADR 0003](0003-inscription-first-public-archive-boundary.md)
> 取代，不再是当前实施依据。
>
> T04.2进一步完成Catalog canonical
> migration；下文Archive路径与contract仍按原样保留为当时的历史决策，不代表当前公开API。

公共契约遵循单向生成链：

```text
Zod 4 runtime schema
→ inferred TypeScript type
→ JSON Schema Draft 2020-12
→ OpenAPI 3.1.1 components
```

Repository 接收 parse/coerce 后的规范化查询，不接收 HTTP query string。分页默认
`page=1`、`pageSize=20`，最大 `pageSize=100`；越界页由未来实现返回空
`items`。公开错误代码固定为
`INVALID_QUERY`、`ITEM_NOT_FOUND`、`SERVICE_UNAVAILABLE` 和 `INTERNAL_ERROR`。

OpenAPI v1 只包含：

- `GET /health`
- `GET /v1/items`
- `GET /v1/items/{id}`
- `GET /v1/search`
- `GET /v1/categories`

本阶段不建立地区路由、Importer、数据库、Admin
CRUD、Router 或 handler。公开 DTO 不暴露内部生命周期、时间戳、审核、删除或持久化信息，图片只使用 object
key。

## 后果

OpenAPI artifact 可以确定性重建并由测试与 contract
schema 比较。新增或破坏性修改公共路由必须更新本 ADR 或新增 ADR；不能通过恢复旧来源模型绕过 T01 的来源无关边界。
