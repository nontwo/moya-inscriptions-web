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

物理手机横竖屏始终使用底部 Tab
Bar；向内容方向累计滚动 12px 后收拢为当前栏目胶囊，反向累计 8px、回到顶部或点击胶囊时恢复。平板竖屏使用持久底栏，横屏使用持久浮动左栏，不采用手机式收拢。PC 从 896px 起使用持久底部三栏导航（不显示由艺 logo、不收拢）。首页与书帖使用更密卡片，约在一屏内露出三行；1024px、1440px 不再放大这两处卡片。Mac 触控板双指左右在首页栏目（发现/附近/专题）和书帖分类（全部/墨迹/拓本）上跟手滑动并弹簧回正，布局与 document 滚动不变；底栏主栏目仍靠点击。PC 首页顶栏不显示加载页格言。

运行时监听窗口缩放、方向、visual
viewport 与分页容器尺寸变化，在真实宽度稳定后重新对齐分页轨道，不刷新页面。三端碑刻使用相同的列表、搜索、全屏“图片 + 标题”详情和 history 返回结构；跨越 896px 时已打开详情保持原状态。

## 样式隔离

- `preview.shared.css`：三端一致的结构、卡片、专题、表单与加载样式。
- `preview.css`：手机触摸分页、横竖屏内容密度及始终位于底部的 Tab Bar 覆盖。
- `preview.tablet.css`：平板触摸分页、双列专题、竖屏底栏与横屏浮动侧轨覆盖。
- `preview.pc.css`：PC 滚动、底栏导航、更密首页/书帖卡片与触控板分页覆盖。

共享样式始终加载；三个平台覆盖表均随页面加载，但任意时刻只启用 `data-platform`
对应的一份，避免宽屏手机或平板被纯媒体查询错误升级。

三个固定导航字标保留原始 PNG 轮廓，并以 CSS
mask 跟随当前按钮颜色，避免浅色或深色主题出现灰色像素。碑刻搜索和书帖筛选的输入框不显示装饰性放大镜；独立搜索操作图标不受影响。手机竖屏书帖将分类与设置置于第一行、筛选框置于第二行。

纵向内容使用浏览器原生滚动，不拦截纵向 `wheel`
或触摸事件；PC 仅在首页栏目和书帖分类上拦截横向触控板 `wheel` 做跟手切页，静止时仍是单页 document 滚动。macOS 触控板惯性和鼠标滚轮的纵向滚动由当前页面的唯一主滚动容器处理。导航 Glass 只用于功能层，内容卡片和碑刻详情仍使用不透明纸墨 Surface。

## 专题占位

`fixtures/home-feed.placeholder.js`
为发现和附近补充长列表测试卡片；`fixtures/topics.placeholder.js`、`data-placeholder="topics-v1"`、专题 feed 和专栏 view 属于可删除占位。正式 T06 应以
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
