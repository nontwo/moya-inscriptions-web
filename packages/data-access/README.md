# `@moya/data-access`

T04.0-R 的 backend-only transitional package。当前只定义临时只读
`ArchiveCatalogReader`：

- `listItems`
- `getItemById`

Reader 接收规范化查询并只返回 `@moya/contracts` 的 Public
DTO。它是面向公开读模型的 Query
Port，不是加载或保存领域聚合的 Repository。不得加入 create、update、delete、publish、approve、withdraw 或其他 mutation。

实现必须过滤非公开条目，但本包不包含实现、PostgreSQL/SQL、HTTP、runtime
schema、环境变量、数据文件读取或导入逻辑。未找到档案时返回
`null`，由未来的 application/transport adapter 映射为 HTTP 404。

T04.1 Phase 1 已在
`services/api/src/modules/catalog/application/ports/catalog-query-port.ts`
建立 application-owned `CatalogQueryPort`。本包继续保持T04.0-R
compatibility，接口和Public DTO返回shape不变；新Catalog backend
work不得扩展本Reader。Phase
4只有在consumer迁移完成后才能删除本包；Frontend不得在任何阶段依赖本包。
