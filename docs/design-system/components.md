# 公共组件 API

所有组件支持 `className` 或对应的原生 HTML 属性，不调用 API、不绑定路由。

## 基础组件

- `Button`：primary、secondary、quiet、danger；sm、md、lg；支持 loading。
- `IconButton`：必须提供可访问 `label`。
- `Input`、`Textarea`：原生属性加 `invalid`。
- `SearchInput`：必须提供 `label`，可配置 clear 回调。
- `Card`、`ImageCard`：图片 URL 直接使用 Public API 提供的已解析运行时值（例如
  `PublicMedia.src`）；消费端不得接收 object key 或自行拼接 provider/CDN URL。
- `ListItem`、`ThumbnailListItem`：标题、描述、元信息和首尾插槽。
- `Tag`、`CategoryTag`、`Badge`、`Divider`、`Skeleton`、`Spinner`。

## 浮层与反馈

`Dialog`、`Drawer`、`Sheet` 都使用受控
`open/onOpenChange`，共享 Esc、遮罩关闭、标题/描述关联和焦点恢复。`Tooltip`
同时支持 hover 与键盘 focus。 `LoadingScreen`
默认延迟 160ms，避免短加载闪烁；延迟后显示正式 Logo 与文言「志于道，据于德，依于仁，游于艺」，进入主界面后不再显示 Logo。

## Tabs 与分类

`Tabs` 接收 `TabOption[]`、`value`、`onValueChange` 和
`ariaLabel`，支持 Arrow、Home、End，以及 manual 模式的 Enter/Space。`CategoryTabs`、
`CalligraphyCategoryTabs` 与 `ContentCategorySelector`
只包装该通用行为。“全部/墨迹/拓本”不是组件默认值。

## 导航

`NavigationItem` 包含 id、label、可选 labelMark/href/icon/disabled；`TabOption`
同样支持可选
`labelMark`。存在字标时，真实文字仍作为交互元素的无障碍名称，视觉层显示对应透明 PNG；该能力只用于首页、碑刻、书帖三个底部固定导航项。顶部标签默认显示系统字体文本。组件不导入任何路由库。`ResponsiveNavigation`
在 896px 以下显示底栏（平板横屏可由布局层将同一批入口改为侧轨），以上显示带 Logo 和搜索入口的顶部导航。桌面品牌链接由调用方通过
`brandHref` 显式传入；省略时 Logo 不产生链接，组件不会擅自选择 `/`
或其他路由。内容容器遵循1200px / 760px token，不因宽屏新增导航入口或业务字段。

`MobileBottomNavigation` 与 `ResponsiveNavigation` 提供兼容的
`minimizeBehavior="never|on-scroll-down"` 和可选
`scrollContainerRef`。手机可在向下滚动时收拢为当前栏目胶囊；平板与 PC 使用
`never`。滚动策略由导航或应用壳统一管理，页面不得重复注册显隐 listener。主导航是 Functional
Glass regular 的唯一当前消费者；选中项使用印泥 tint，不叠加第二层 Glass。

`ThemeCycleButton` 是受控图标按钮，接收 `ThemePreference` 与
`onValueChange`，按 system、light、dark 顺序循环；主题属性仍由消费端设置。该组件为公共 API 兼容保留，移动预览改用设置页中的明确单选项。

## 内容展示

- `DiscoveryCard/Grid`：图片优先的信息流。
- `InscriptionListItem/List`：带缩略图的纵向学术浏览列表。
- `CalligraphyCard/Grid`：独立于碑刻列表的卡片布局。

这些类型都是 UI 展示类型，不代表 `packages/contracts` 中的业务模型。其中
`UiImage.src` 只是渲染边界属性：正式应用必须先由图片适配器根据 object
key 派生 URL，再把结果传给组件。

内容卡片、碑刻图片与专题内容不得默认使用 Functional Glass。
