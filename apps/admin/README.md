# 由艺（Yoyi）Admin

Admin 是独立的最小 Next.js App
Router 工程骨架，当前不包含登录、内容管理、地区候选审核、图片上传、数据库连接或其他管理业务。这些能力需要后续独立批准，不能从当前 placeholder 推断。

从 repository root 显式启动：

```sh
pnpm dev:admin
```

Admin development 与 production start 的固定端口均为 `3002`。根 `pnpm dev`
不启动 Admin；`pnpm dev:all` 才同时启动 Web `3000` 与 Admin `3002`。Backend
Runtime/API 独占 `3001`。
