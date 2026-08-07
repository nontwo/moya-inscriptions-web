# “由艺”设计系统

本目录记录摩崖碑刻数字平台的视觉基础、公共组件、视觉资产与交互规范。实现位于
`@moya/design-tokens` 和 `@moya/ui`，不包含正式页面、路由或业务数据。

## 使用

```css
@import "@moya/design-tokens/theme.css";
@import "@moya/ui/styles.css";
```

```tsx
import {
  CalligraphyCategoryTabs,
  DiscoveryCard,
  ResponsiveNavigation,
} from "@moya/ui";
```

根元素没有 `data-theme` 时跟随系统。设置 `data-theme="light"` 或
`data-theme="dark"`
可覆盖系统主题。主题偏好的读取、持久化和账号同步均由应用层负责，设计系统不访问浏览器存储。

## 本地预览

从仓库根目录运行：

```sh
python3 -m http.server 4173
```

打开 `http://localhost:4173/docs/design-system/catalog/`
查看 token、正式视觉资产和公共组件目录。该目录只展示组件，不承担完整应用状态、路由或业务数据。

交互式手机界面不属于公共设计系统。已保存的探索性实现位于
[`docs/prototypes/mobile-preview/`](../prototypes/mobile-preview/README.md)，并明确作为非生产原型隔离。

进一步阅读：

- [视觉基础](./visual-foundations.md)
- [组件 API](./components.md)
- [动画与无障碍](./motion-and-accessibility.md)
- [资产清单](./assets-manifest.md)
- [T06—T09 接入指南](./integration-guide.md)
