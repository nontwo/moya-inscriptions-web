# Public API service

公开 API 的无数据库 TypeScript 骨架，由 T04 负责。当前仅导出等价于 `GET /health`
返回值的纯函数，避免为了占位健康检查提前引入 HTTP 框架。后续任务可以在明确需求后添加轻量 HTTP 适配层。
