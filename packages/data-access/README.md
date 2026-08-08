# `@moya/data-access`

公开档案的只读查询 Port。当前只定义 `ArchiveCatalogReader`：

- `listItems`
- `getItemById`

Reader 接收规范化查询并只返回 `@moya/contracts` 的 Public
DTO。它是面向公开读模型的 Query Port，不是加载或保存领域聚合的 Repository。

实现必须过滤非公开条目，但本包不包含实现、PostgreSQL/SQL、HTTP、runtime
schema、环境变量、数据文件读取或导入逻辑。未找到档案时返回
`null`，由未来的 application/transport adapter 映射为 HTTP 404。
