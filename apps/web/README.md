# Public web application

公开站点现已具备第一个formal Home vertical
slice。T02的组件目录与响应式原型仍位于
`docs/`作为设计权威和非生产参考；正式页面通过Public HTTP API读取Catalog。

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
`HomeScreen`只接收`HomeCatalogState`并渲染populated、empty、unavailable和unexpected-error四种语义状态。它不执行HTTP或业务映射。

T06-B.2在不改动transport、loader或Catalog Server
Component数据流的前提下，生产化了T02
Home：响应式内容墙、主题与手机/平板单双列偏好、全屏设置、浮动Glass导航及品牌加载状态。Catalog
cards仍为server-rendered、按API顺序排列且不可点击；附近、专题、碑刻和书帖仅保留disabled
presentation，不创建未来route或业务能力。当前仍没有冻结cache/revalidation策略。

Web business
HTTP请求必须位于`lib/public-api/`。Frontend不得导入backend、PostgreSQL、Importer、storage
internals或raw datasets；runtime Media URL只来自`PublicMedia.src`。
