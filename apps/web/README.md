# Public web application

`apps/web` 是单一、渐进实现的 Yoyi 公开产品，不维护第二套 production / preview
composition。T02 的合成原型是行为与交互权威，P5
28 条内容原型是已批准的真实中文内容密度参考；两者都不是正式 Web 的 runtime 数据源。

## 当前 surface 状态

| Surface                | Product contract | 当前实现                                      |
| ---------------------- | ---------------- | --------------------------------------------- |
| Global Product Shell   | T02 approved     | REAL shell；承载 REAL 与 DEMO surfaces        |
| Home / 发现            | T02 approved     | REAL；Public HTTP Catalog list                |
| 附近 / 专题            | T02 approved     | Synthetic DEMO；不访问 backend                |
| 碑刻 / 书帖 / Search   | T02 approved     | Synthetic DEMO；本地筛选与压力测试内容        |
| Catalog / Topic Detail | T02 approved     | Synthetic DEMO；REAL Home 仅有 summary bridge |
| Settings               | T02 approved     | REAL presentation preferences                 |

未来 T07–T09 在同一应用中逐项把 DEMO capability 替换为 REAL，不预建 provider
registry、双 composition 或未来 surface framework。DEMO 内容集中在
`demo/`，不得成为 Public
Contract、backend、PostgreSQL、Importer、Research 或 Media/storage 的事实来源。

## REAL Home data flow

```text
app/page.tsx
→ features/home/load-home-catalog.ts
→ lib/public-api/server.ts
→ lib/public-api/catalog-list.ts
→ GET /v1/catalog
→ runtime Public Contract validation
→ HomeCatalogState
→ ProductShell / HomeSurface
```

- `lib/public-api/catalog-list.ts` 负责 Catalog list
  query、HTTP 分类、JSON 解析与 `catalogPageSchema` validation。
- `lib/public-api/server.ts` 是 server-only wiring，只读取
  `MOYA_PUBLIC_API_BASE_URL` 并注入 server-side `fetch`。
- `features/home/catalog-state.ts`
  纯映射 populated、empty、unavailable 与 unexpected-error；`features/home/load-home-catalog.ts`
  是薄 loader。
- `app/page.tsx` 在 `connection()` 后 request-time 加载；build 不访问 Catalog
  API。
- REAL Catalog cards 保持 API 顺序，只使用 `PublicMedia.src`。点开后只显示已验证
  `CatalogSummary` 中实际存在的字段，不请求 Detail、也不拼接任何 Synthetic
  facts。

`MOYA_PUBLIC_API_BASE_URL` 必须是无 credentials、query 和 hash 的 absolute
HTTP(S) URL，可包含 `/api/` 等固定 path
prefix。当前任务不冻结 cache/revalidation 策略。

## Product Shell ownership

`product-shell/` 只拥有跨 surface 的 presentation mechanics：primary
navigation、active destination、Settings、theme、共享 content-wall
preference、物理设备/platform 分类、gesture、history/Back、scroll
preservation 与 overlay hosting。Catalog Detail 内容仍在独立 surface 中，Product
Shell 不拥有或制造 Catalog facts。

物理手机任意宽度保持 phone；物理平板只在窄于 768px 时降级为 phone，永不升级为 PC；desktop
UA 在 768 / 896 边界选择 phone、tablet 或 PC。手机/平板共享 single/double
content-wall preference；碑刻列表忽略它，PC 使用自身 content-driven 布局。

## Boundary rules

- Web business HTTP 只能位于 `lib/public-api/`。
- Frontend 不得导入 backend、PostgreSQL、Importer、Research、raw
  datasets、storage internals 或 object keys。
- Client Components 可 type-import approved Public DTO；不得 runtime-import
  schemas。
- DEMO 不得导入 Public HTTP boundary；Public HTTP 与 Home
  loader 也不得反向导入 DEMO。
- 正式 runtime Media URL 只来自 `PublicMedia.src`。
