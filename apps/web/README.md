# Public web application

公开站点现已具备第一个formal responsive
Home。它复用T02的token、共享UI和视觉语言，但仍通过正式Public HTTP
runtime读取Catalog；`docs/`中的响应式原型不是正式页面或数据源。

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
`HomeScreen`只接收`HomeCatalogState`并渲染populated、empty、unavailable和unexpected-error四种正式视觉状态。它不执行HTTP或业务映射；视觉替换没有改变transport、mapper或loader。

T06-B.2使用`@moya/design-tokens/theme.css`、`@moya/ui/styles.css`和共享
`ResponsiveNavigation`的`floating-bottom`
composition。手机、平板和PC均显示底部浮动主导航；首页可用，碑刻与书帖在对应任务开始前保持原生disabled。Search、Detail与客户端Catalog
fetch均未引入。

Web通过`@moya/ui`的workspace source export消费本地共享组件；CSS同样使用package
exports。UI源码使用TypeScript的relative-import extension
rewriting，Web只transpile `@moya/ui`这一个本地包。这样fresh
`pnpm --filter web dev`不依赖ignored `dist/`，而完整`pnpm build`仍按Turbo
workspace dependency graph构建共享包。

Catalog卡片保持API顺序、不可点击并只读取Public
DTO。代表图只使用`PublicMedia.src`与intrinsic
dimensions；缺图和加载失败均在card内安全退化，不组合object key或storage URL。

当前仍不冻结cache/revalidation、retry或timeout策略。

Web business
HTTP请求必须位于`lib/public-api/`。Frontend不得导入backend、PostgreSQL、Importer、storage
internals或raw datasets；runtime Media URL只来自`PublicMedia.src`。
