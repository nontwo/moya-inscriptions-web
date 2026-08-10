# `@moya/data-access`

T04.2按Owner批准的最小清理策略保留的空backend workspace。T04.0-R的临时Archive
Reader已作为historical compatibility
artifact删除；本包当前不导出port、repository、adapter或runtime实现，也不依赖`@moya/contracts`。

Canonical Catalog read abstraction由`@moya/api` application boundary拥有，名称为
`CatalogQueryPort`。不得在本包建立第二套Catalog
port，也不得加入PostgreSQL/SQL、HTTP、runtime
schema、环境变量、数据文件读取、Importer或mutation。

Frontend不得依赖本包。未来若要为本workspace赋予新职责或删除整个workspace，必须由独立任务重新审查；T04.2不删除本workspace。
