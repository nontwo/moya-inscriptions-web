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

组件不绑定路由、API、数据库或业务契约。调用方只向`UiImage.src`传入已经可公开渲染的runtime
URL；组件不接触、派生或组合object
key与storage配置。分类和导航均由配置数组驱动。底部固定导航项可通过 `labelMark`
显示用户提供的透明图片字标；真实 `label`
始终保留为无障碍名称。其他标签默认使用系统字体文本。

`DesktopTopNavigation` 的品牌链接必须由调用方通过 `brandHref`
显式传入；未传入时只显示品牌，不推断应用路由。包内仅包含正式品牌、图标、字标和纹理资产，不携带虚构藏品图或完整应用状态。

`ResponsiveNavigation composition="floating-bottom"`只渲染同一底部浮动主导航并保持其在phone、tablet和PC可见，不渲染desktop
top-nav或Search。该导航保留独立active
bubble；`minimizeBehavior="on-scroll-down"`提供domain-neutral的滚动收拢、向上/idle恢复和点击当前项恢复。默认`responsive`模式与
`DesktopTopNavigation`继续作为向后兼容API保留。

workspace应用通过package source
export消费组件，无需先手工生成`dist/`；包自身的TypeScript build仍会把relative
source extensions重写为可执行的`.js`输出。
