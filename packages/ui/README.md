# `@moya/ui`

“由艺”公共 React UI 组件、导航、内容展示和 SVG 资产。

应用入口加载一次 token 和组件样式：

```css
@import "@moya/design-tokens/theme.css";
@import "@moya/ui/styles.css";
```

```tsx
import {
  DiscoveryCard,
  MobileBottomNavigation,
  ThemeCycleButton,
  type NavigationItem,
} from "@moya/ui";
```

组件不绑定路由、API、数据库或业务契约。图片 URL 必须直接使用 Public
API 提供的已解析运行时值（例如 `PublicMedia.src`）再传入
`UiImage.src`；UI 消费端不得接收 object key，也不得自行拼接 provider 或 CDN
URL。分类和导航均由配置数组驱动。底部固定导航项可通过 `labelMark`
显示用户提供的透明图片字标；真实 `label`
始终保留为无障碍名称。其他标签默认使用系统字体文本。

`DesktopTopNavigation` 的品牌链接必须由调用方通过 `brandHref`
显式传入；未传入时只显示品牌，不推断应用路由。包内仅包含正式品牌、图标、字标和纹理资产，不携带虚构藏品图或完整应用状态。
