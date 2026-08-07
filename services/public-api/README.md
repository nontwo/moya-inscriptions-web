# Public API service

公开 API 的无数据库 TypeScript 骨架，计划由 T04 实现。当前仅导出等价于
`GET /health`
返回值的纯函数；尚无 HTTP 服务器、Repository、数据库适配器或正式查询接口。T04 必须复用
`@moya/contracts`，不得在服务内重定义公共类型。
