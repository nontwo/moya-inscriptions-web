# `@moya/search`

Search V1 的后端辅助边界：固定 OpenCC 1.4.1 和
`t2s.json`，统一查询与可重建检索副本的规范化，并从已允许展示的 Catalog 字段构造检索文档。原文、别名和业务身份保持不变。

正式查询、完整结果排序和分页由后端 PostgreSQL 适配层执行。包内匹配函数只用于开发夹具和回归验证，不用于前端过滤或正式结果重排。Web 不得导入本包或 OpenCC。

在目标 Linux 架构中显式验证原生依赖：

```sh
pnpm --filter @moya/search native:check
```

若预构件与目标运行库不兼容，在已具备必要编译工具的受控构建环境执行源码构建，再验证转换一致性：

```sh
pnpm --filter @moya/search native:rebuild
pnpm --filter @moya/search native:check
```

命令不安装系统依赖、不启动服务，只输出固定的安全状态。macOS 或其他 Linux 环境通过不能代替实际目标环境验证。检索副本迁移、权限与显式重建见
[catalog-postgres](../../services/catalog-postgres/README.md)。
