# 资产清单

除用户明确指定的三个底部导航 PNG 字标外，资产均为 SVG；不含字体、base64、外链或运行时本地绝对路径。正式资产位于
`packages/ui/src/assets/`，演示内容位于 `docs/design-system/assets/demo/`。

## 品牌

| 仓库文件              | 用途                       | 来源                                                                             | 路径修改 | 颜色修改                                | 授权说明               |
| --------------------- | -------------------------- | -------------------------------------------------------------------------------- | -------- | --------------------------------------- | ---------------------- |
| `brand/yoyi-logo.svg` | 桌面品牌区与 LoadingScreen | `/Users/jia/Downloads/yoyi-logo-vector-package/yoyi-logo-transparent-vector.svg` | 否       | 否；组件以 alpha mask/currentColor 着色 | 用户提供的正式品牌矢量 |

原文件和仓库文件 SHA-256 均为
`3cef0221e44de2587ee153276417e38f702249c36bdf57d0db539236fd45bac3`。

## 纸张纹理

| 文件                     | 用途               | 原创 | 参数                        |
| ------------------------ | ------------------ | ---: | --------------------------- |
| `paper-subtle.svg`       | 克制浅色纸张       |   是 | 384×512 tile，opacity 0.048 |
| `paper-visible.svg`      | 移动主界面浅色纸张 |   是 | 384×512 tile，opacity 0.068 |
| `paper-dark-subtle.svg`  | 克制深色纸张       |   是 | 384×512 tile，opacity 0.045 |
| `paper-dark-visible.svg` | 移动主界面深色纸张 |   是 | 384×512 tile，opacity 0.065 |

参考 `/Users/jia/Downloads/GJ2304296.隸釋二十七卷.jpg`
的色温、纵向纤维和低频斑驳；纤维噪声方向为 `0.16 0.008`，未复制或嵌入任何像素。

## 图标

`home.svg`、`inscriptions.svg`、`calligraphy.svg`、`search.svg`、`back.svg`、
`menu.svg`、`close.svg`、`filter.svg`、`category.svg`、`location.svg`、
`nearby.svg`、`image.svg`、`loading.svg`、`error.svg`、`empty.svg`、
`previous.svg`、`next.svg` 均逐字节恢复为首个 T02 提交 `616c9a5` 的 24×24
currentColor 圆角线性图标。`settings.svg`
是同一线宽和端点规范下新增的原创齿轮图标。 `theme.svg` 仅为 `ThemeCycleButton`
的兼容资产，不再用于移动主预览。用户提供的 `/Users/jia/Downloads/IMG_5410.jpg`
与 `/Users/jia/Downloads/IMG_5411.jpg`
仅用于核对原版图标和底栏组合，未复制或嵌入其中像素。

## 固定字标

底部三个固定字标直接使用用户提供 PNG 的字形像素。处理仅包括以 alpha≥32 确定边界、清除低透明度背景残影、等比缩放并居中到 264×120 透明画布；未重绘、矢量化、改色或改变内部纹理：

- `nav-home.png` 来源
  `/Users/jia/Downloads/标签名/ChatGPT Image 2026年8月7日 17_30_09.png`。
- `nav-inscriptions.png` 来源
  `/Users/jia/Downloads/标签名/ChatGPT Image 2026年8月7日 17_19_06.png`。
- `nav-calligraphy.png` 来源
  `/Users/jia/Downloads/标签名/ChatGPT Image 2026年8月7日 17_16_35.png`。

这三个文件是本设计系统唯一允许的位图例外。顶部“发现、附近”和其他界面文字均使用系统字体。

## 演示图

`docs/design-system/assets/demo/` 中的
`discovery-stone.svg`、`inscription-rubbing.svg`、`calligraphy-sheet.svg`、
`cliff-gate.svg`、`valley-wall.svg`、`stone-detail.svg`、`rubbing-fragment.svg`、
`ink-album.svg`、`stele-shadow.svg`
是原创抽象占位图，仅用于文档、组件目录和非生产原型，不代表真实藏品。它们不随
`@moya/ui` 发布，也不通过公共 UI API 导出。
