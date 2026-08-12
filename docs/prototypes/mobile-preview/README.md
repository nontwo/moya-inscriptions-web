# 交互原型（手机 / 平板 / PC 自动识别）

> **非生产原型（prototype shell only）：**
> 本目录用于验证信息架构、导航、交互手感与设备响应式呈现；不是正式 Web /
> T06–T08 验收交付，也不连接 Repository、数据库、Reader/API 或 SearchDocument。

同一 URL 复用一套 DOM 和交互状态。`device-platform.js`
在样式加载前结合 UA、视口宽度与方向设置：

- `data-device-class="phone|tablet|desktop"`：物理设备类型。
- `data-platform="phone|tablet|pc"`：当前实际启用的壳层。

原型保留首页“发现/附近/专题”、碑刻搜索与详情、书帖分类和本地筛选、设置页、明暗主题、手机单双列偏好、`localStorage`、history 返回和滚动位置恢复。「专题」仍是策展占位，不是社区帖或 CMS。

## 设备判定

| 设备类型                         | 视口        | 壳层                      |
| -------------------------------- | ----------- | ------------------------- |
| 手机 UA / `userAgentData.mobile` | 任意        | 手机；不会升级到平板或 PC |
| 平板 UA / iPadOS 触控 Mac UA     | `<768px`    | 手机降级壳                |
| 平板 UA / iPadOS 触控 Mac UA     | `≥768px`    | 平板；不会升级到 PC       |
| 桌面 UA                          | `<768px`    | 手机                      |
| 桌面 UA                          | `768–895px` | 平板                      |
| 桌面 UA                          | `≥896px`    | PC                        |

手机竖屏使用底部导航，横屏在保持手机平台身份的同时复用 88px 平板左侧轨和全宽内容布局。平板 768–895px 竖屏使用底部导航，横屏使用 88px 左侧轨；宽屏平板继续使用紧凑左侧轨。PC 从 896px 起使用固定放大侧栏、宽屏卡片密度及碑刻主从栏，并在 1024px、1440px 继续放大。PC 首页顶栏不显示加载页格言。

运行时监听窗口缩放和方向变化，只切换样式表及壳层行为，不刷新页面。打开的碑刻详情在跨越 896px 时会在全屏详情和 PC 主从栏之间转换。

## 样式隔离

- `preview.css`：手机基础样式；手机横屏通过方向与 568px 可用宽度启用平板式侧轨，不升级平台身份。
- `preview.tablet.css`：恢复后的手机/平板响应式样式。
- `preview.pc.css`：恢复后的 PC 专用样式。

三个样式表均随页面加载，但任意时刻只启用 `data-platform`
对应的一份，避免宽屏手机或平板被纯媒体查询错误升级。

三个固定导航字标保留原始 PNG 轮廓，并以 CSS
mask 跟随当前按钮颜色，避免浅色或深色主题出现灰色像素。碑刻搜索和书帖筛选的输入框不显示装饰性放大镜；独立搜索操作图标不受影响。手机竖屏书帖将分类与设置置于第一行、筛选框置于第二行。

纵向内容使用浏览器原生滚动，不拦截 `wheel`
或触摸事件；macOS 触控板惯性和鼠标滚轮由当前页面的唯一主滚动容器处理。PC 碑刻主从栏的列表和详情仍为两个明确的独立滚动区。

## 专题占位

`fixtures/topics.placeholder.js`、`data-placeholder="topics-v1"`、专题 feed 和专栏 view 属于可删除占位。正式 T06 应以
`EditorialCollection` API 替换，不得把 Mock 当生产数据。

## 本地与局域网查看

从仓库根目录运行：

```sh
python3 -m http.server 4175 --bind 0.0.0.0
```

- 本机：<http://127.0.0.1:4175/docs/prototypes/mobile-preview/>
- 实体设备：使用同一 Wi-Fi 下 Mac 的活动 IPv4，例如
  `http://192.168.1.3:4175/docs/prototypes/mobile-preview/`。

关联测试：`tests/integration/prototypes/mobile-preview.test.ts`。建议检查 360、390、430px 竖屏，568×320、667×375、844×390、932×430 手机横屏，以及 768、834、896、1024、1440、2048px，并覆盖手机、Android
Tablet、iPad/iPadOS 和桌面 UA。

页面仅引用 `docs/design-system/assets/demo/`
中的虚构演示图；正式应用仍须通过图片适配器取得公开或签名 URL。
