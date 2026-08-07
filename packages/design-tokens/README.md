# `@moya/design-tokens`

“由艺”视觉系统的颜色、间距、排版、布局和动画 token 唯一入口。

```ts
import { darkTheme, lightTheme, motion, typography } from "@moya/design-tokens";
```

应用入口需要加载主题 CSS：

```css
@import "@moya/design-tokens/theme.css";
```

默认跟随 `prefers-color-scheme`。将 `data-theme="light"` 或 `data-theme="dark"`
写到根元素可显式覆盖；移除属性即恢复跟随系统。

组件只消费 `--yoyi-*` CSS variables，不应在功能模块内另建颜色、间距或排版常量。
