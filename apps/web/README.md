# Public web application

公开站点仍是最小 Next.js App
Router骨架，仅包含根布局、metadata、全局样式入口和占位首页。T02的组件目录与响应式原型位于
`docs/`，不是这里的正式页面。

T06-A建立了presentation-independent Public HTTP data boundary：

- `lib/public-api/catalog-list.ts`只通过`GET /v1/catalog`读取Public
  Catalog，并以 `@moya/contracts`的runtime schemas验证query和successful
  response。
- `lib/public-api/server.ts`是server-only wiring，只读取
  `MOYA_PUBLIC_API_BASE_URL`并注入server-side `fetch`。
- `features/home/catalog-state.ts`只把validated transport
  result映射为Home的populated、empty、unavailable或unexpected-error状态，不执行HTTP请求。

`MOYA_PUBLIC_API_BASE_URL`必须是无credentials、query和hash的absolute HTTP(S)
URL；允许`/api/`等固定path
prefix。T06-A不冻结cache/revalidation策略，也尚未把该边界接入
`app/page.tsx`。正式视觉composition仍属于后续独立T06任务。

Web business
HTTP请求必须位于`lib/public-api/`。Frontend不得导入backend、PostgreSQL、Importer、storage
internals或raw datasets；runtime Media URL只来自`PublicMedia.src`。
