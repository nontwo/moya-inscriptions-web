# 动画与无障碍

## Motion token

- instant：80ms
- fast：140ms
- normal：200ms
- slow：280ms
- loading logo：720ms，一次播放
- standard：`cubic-bezier(0.2, 0, 0, 1)`
- emphasized：`cubic-bezier(0.2, 0.8, 0.2, 1)`
- exit：`cubic-bezier(0.4, 0, 1, 1)`

只为状态理解提供小幅颜色、透明度和 1–4px 位移。卡片不大幅缩放，背景不做视差，Logo 不持续呼吸。Spinner 是唯一必要循环动画。

`prefers-reduced-motion: reduce` 与预览的 `data-motion="reduced"`
会将动画缩至 1ms、取消循环和 transform，同时保留选中、展开、错误等必要状态。

Functional Glass 导航仅通过 transform、opacity 与既有 duration/easing
token 切换状态；reduced
motion 下即时完成。`prefers-reduced-transparency: reduce` 与
`prefers-contrast: more`
使用不透明高对比 Surface；浏览器不支持背景模糊时同样必须可读，不可把 blur 当作信息表达。

## 无障碍约定

- 所有交互点击区至少 44×44px，底栏适配 safe-area。
- IconButton、搜索框、导航和浮层均必须有可访问名称。
- Tabs 使用 roving tabindex，并跳过 disabled 项。
- 浮层使用原生 dialog、`aria-modal`、标题与描述关联。
- 图片必须提供真实 alt；纯装饰图 alt 为空。
- focus-visible 使用主题适配的 `focus-ring`，不可仅用颜色表达状态。
- Glass 与不透明 fallback 中的正文、图标和字标均须保持至少 4.5:1 对比。
