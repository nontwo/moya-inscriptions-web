# T06—T09 接入指南

1. 在应用全局样式中依次导入 design token 和 UI CSS。
2. 不在页面内重新声明颜色、间距、字体或 animation duration。
3. 使用 `ResponsiveNavigation`，由页面传入 href 与 active
   id；UI 包不感知 Next 路由。
4. 首页使用 `DiscoverNearbyTabs`、`DiscoveryCard` 和 `DiscoveryGrid`。
5. 碑刻检索使用 `SearchHeader`、`InscriptionListItem` 和
   `InscriptionList`，不复用首页瀑布流。
6. 书帖使用配置驱动的
   `CalligraphyCategoryTabs`、`CalligraphyCard/Grid`；URL 参数同步属于页面层。
7. Object key 只留在后端；页面接收未来 `PublicMediaDTO.src` 中由 backend
   `StorageUrlResolver` 生成的 public/signed runtime URL，再传给
   `UiImage`。页面不得自行拼接 CDN URL。
8. 用户显式主题偏好由应用在首屏前写入 `data-theme`；`system`
   对应移除属性。持久化与账号同步属于应用层，公共 UI 包不得直接访问浏览器存储。
9. 首页单/双列是展示偏好，只作用于发现和附近的信息流，不改变碑刻列表或书帖卡片。
10. 不把本包的 UI-only 类型提升为业务契约，也不在功能模块重新定义契约。
