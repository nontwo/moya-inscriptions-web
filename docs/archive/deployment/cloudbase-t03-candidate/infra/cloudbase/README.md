# Historical T03 CloudBase 候选部署骨架

本目录描述 CloudBase 中国大陆部署的候选资源和配置边界，不是可执行的基础设施即代码，也不会创建或购买任何腾讯云资源。

## 文件

- `deployment.example.yaml`：三套环境、候选组件、路由和交付物的声明式清单。
- `runtime.env.example`：沿用仓库现有变量名称的无密钥运行时示例。

## 使用边界

1. 先复制示例文件到受控的部署配置仓库或密钥管理流程中，再替换尖括号占位符。
2. 不得把 CloudBase 环境 ID、数据库连接串、云 API 密钥或真实域名提交到本仓库。
3. `DATABASE_URL`、对象存储访问凭据等服务端敏感值必须通过部署平台的密钥注入能力提供。
4. `PUBLIC_CDN_BASE_URL` 是保留在示例中的 legacy/deprecated frontend
   convention，不得由 Web/浏览器消费，也不是未来 Resolver 的正式配置名。T05 应以 backend-only 配置和
   `StorageUrlResolver` 生成 runtime URL；Frontend 不得获得 object key。
5. 本骨架不包含 CloudBase
   CLI 登录、资源开通、套餐购买、备案、证书申请或部署命令。

## 当前前置缺口

- `apps/web`
  当前是 Next.js 服务端运行骨架，尚未产出静态导出目录。选择静态网站托管前，应由应用所有者确认纯静态导出可行性；否则使用云托管容器承载 Web。
- `services/public-api`
  当前没有 HTTP 启动入口或容器定义，不能直接部署为 API 服务。
- 仓库尚未提供生产数据库迁移、备份恢复自动化或云端可观测性配置。

这些缺口需要在对应业务路径的后续任务中解决，本任务不修改
`apps/**`、`services/**`、 `database/**` 或 `scripts/**`。

完整历史索引见 [archive README](../../README.md)。
