# `@moya/data-access`

公开页面的数据仓储抽象入口。当前只定义只读的 `ArchiveItemRepository` port：

- `listItems`
- `getItemById`
- `searchItems`
- `listCategoryFacets`

Repository 接收规范化查询并只返回 `@moya/contracts` 的 Public
DTO。实现必须过滤非公开记录，但本包不包含实现、PostgreSQL/SQL、HTTP、runtime
schema、环境变量、数据文件读取或导入逻辑。未找到档案时返回
`null`，由未来的 application/transport adapter 映射为 HTTP 404。
