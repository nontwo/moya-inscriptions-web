# 由艺（Yoyi）Public Web

Public Web 是 Next.js App Router 应用。当前 Formal Root 不是已删除的
`app/page.tsx`；`app/route.ts` 是明确的 route handler composition root。

## Formal Root composition

`GET /` 在 `connection()` 之后并行加载三份 validated Public Catalog state：

- 全部 Catalog，用于 Home/Discover；
- `kind=inscription`，用于碑刻 Browse；
- `kind=calligraphy`，用于书帖 Browse。

`features/home/load-home-catalog.ts` 只通过 `lib/public-api/` 的 server-side
HTTP boundary 读取数据。`app/route.ts` 将 populated items 交给
`lib/t02-static-files.ts`，由它把 runtime Catalog cards 组合进当前 T02 authority
document。Development Formal Root 保留明确 QA/Prototype coverage；Production
composition 会先移除 Prototype records，再只追加真实 runtime records。

直接访问 `/docs/prototypes/mobile-preview/` 时使用 Prototype
composition，不加载 Public API，也不构成 Formal Root 的 canonical data
source。两条 route 复用同一份 T02 document，不等于具有相同数据权威。

## React T02P boundary

React `PrimaryShell`、navigation/pager、platform observation 与 Home/Browse
presentation 已在 T02P-01 至 T02P-11 建立。`/dev/t02p` 是 Development-only
acceptance surface；Production 返回 404。Production Formal Root 仍使用上述 T02
document bridge，尚未执行另一个 React Production cutover。

## Public API and Media

`MOYA_PUBLIC_API_BASE_URL` 必须是无 credentials、query 和 hash 的 absolute
HTTP(S) URL；允许固定 path prefix。Web business HTTP 请求必须位于
`lib/public-api/`。

Frontend 不得导入 backend、PostgreSQL、Importer、storage internals 或 raw
datasets。Media 只消费 Public API 已解析的 `PublicMedia.src`；不得接收 object
key，也不得自行推导 provider/CDN URL。

## Local commands

从 repository root 运行：

```sh
pnpm dev
pnpm dev:web
```

两者均只启动 Public Web，端口固定为 `3000`。需要同时启动最小 Admin 时使用
`pnpm dev:all`；Backend Runtime/API 必须单独显式启动在 `3001`。
