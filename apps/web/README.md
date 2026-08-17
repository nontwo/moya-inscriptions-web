# Public web application

公开站点现已具备第一个formal Home orchestration和可替换presentation
seam。T02的组件目录与响应式原型仍位于`docs/`，不是这里的正式页面。

T06-A建立了presentation-independent Public HTTP data boundary：

- `lib/public-api/catalog-list.ts`只通过`GET /v1/catalog`读取Public
  Catalog，并以 `@moya/contracts`的runtime schemas验证query和successful
  response。
- `lib/public-api/server.ts`是server-only wiring，只读取
  `MOYA_PUBLIC_API_BASE_URL`并注入server-side `fetch`。
- `features/home/catalog-state.ts`只把validated transport
  result映射为Home的populated、empty、unavailable或unexpected-error状态，不执行HTTP请求。

`MOYA_PUBLIC_API_BASE_URL`必须是无credentials、query和hash的absolute HTTP(S)
URL；允许`/api/`等固定path prefix。T06-A不冻结cache/revalidation策略。

T06-B.1通过`features/home/load-home-catalog.ts`调用该boundary并复用现有Home
semantic mapper。根`app/page.tsx`先`await connection()`，再在request
time加载Catalog状态，因此build不读取runtime API configuration或固化API失败状态。
`HomeScreen`只接收`HomeCatalogState`并渲染populated、empty、unavailable和unexpected-error四种最小语义状态。它不执行HTTP或业务映射，后续T06-B.2可在不改动transport和loader的情况下替换视觉实现。

当前没有冻结cache/revalidation策略，也没有最终phone/tablet/desktop
layout、navigation、Glass、animation、card geometry或image cropping决策。

Web business
HTTP请求必须位于`lib/public-api/`。Frontend不得导入backend、PostgreSQL、Importer、storage
internals或raw datasets；runtime Media URL只来自`PublicMedia.src`。
