# 交互原型（手机 / 平板 / 桌面）

> **非生产原型（prototype shell only）：**
> 本目录用于验证信息架构、导航和交互手感，以及平板与桌面的响应式呈现；**不是**正式 Web
> /
> T06–T08 验收交付，也不能作为生产实现直接发布。不连接 Repository、数据库、Reader/API 或 SearchDocument。

同一链接包含两个同级视觉壳。手机/平板壳保留首页“发现/附近/专题”切换和书帖
**本地筛选壳**（非 T08）；桌面壳以归档旧版的米纸、朱砂、墨色、Hero、统计卡、快捷入口、精选内容、参与共建区和页脚为视觉依据，统一使用“由艺”品牌。两者共享碑刻搜索、书帖分类、详情进入与返回、设置页、明暗主题、显示偏好、`localStorage`
持久化、浏览器 history 返回和滚动位置恢复。

`document.documentElement.dataset.platform` 经 `matchMedia` 在 896px 记为
`pc`（另有 `phone` /
`tablet`），但视觉壳只在 1024px 切换；896–1023px 仍使用平板横屏侧轨。「专题」为策展占位（`editorialTopic`），**不是**社区帖或 CMS。

页面仅引用 `docs/design-system/assets/demo/`
中的虚构演示图，不在原型目录复制资产；正式应用仍须通过图片适配器从 object
key 派生 URL。

## 壳层体验要点

| 项        | 说明                                                                         |
| --------- | ---------------------------------------------------------------------------- |
| 手机/平板 | 发现、附近、专题与书帖共用紧凑内容壳；平板横屏使用固定侧轨                   |
| 桌面      | 1024px 起使用独立顶部导航和归档首页，不复用紧凑壳的 PC 放大规则              |
| 共享状态  | 主页面、碑刻检索词、书帖分类、主题和显示偏好跨壳同步                         |
| 专题      | 仅紧凑壳展示 `topics-v1` 策展占位；桌面切换时安全回落到当前主页面            |
| 书帖筛选  | 紧凑壳提供本地 DOM 文本筛选；非 URL 分面、非中文检索产品，桌面只同步分类状态 |

## 响应式结构

| 宽度             | 活动视觉壳与结构                                          |
| ---------------- | --------------------------------------------------------- |
| `< 768px`        | 手机/平板壳：手机画布（最大 430px 居中）+ 固定底栏        |
| `768–895px` 竖屏 | 手机/平板壳：全宽平板布局，保留触控底栏                   |
| `768–895px` 横屏 | 手机/平板壳：同一批主导航改为左侧固定轨                   |
| `896–1023px`     | 手机/平板壳：固定侧轨；`data-platform=pc`，但不切换视觉壳 |
| `≥ 1024px`       | 桌面壳：归档视觉语言的全屏网页与顶部导航                  |
| `≥ 1440px`       | 桌面壳：保持 1200px 内容上限，增加两侧呼吸空间            |

公共 UI 组件仍以 `navigation=896px`
作为导航断点；本原型为了同时审核两套视觉方案，使用设计 token 中的
`desktop=1024px` 作为壳切换特例，不修改公共组件 API。非活动壳同时
`display:none`、`aria-hidden="true"` 并设置
`inert`。跨断点切换保留主页面、碑刻搜索词、书帖分类和显示偏好；若紧凑壳正打开专题专栏，桌面壳安全回落到首页。

桌面首页的 `8 / 6 / 8`
明确属于“原型数据”。“朝代浏览、地区浏览、书体分类、时间轴”只保留归档入口名称，点击后以
`role="status"` 提示“原型暂未实现”，不恢复归档版 contracts、Mock
Repository、数据文件或依赖。

## 删除专题占位（topics-v1）

整块删除时按下列步骤（标记均为 `TOPICS_PLACEHOLDER` /
`data-placeholder="topics-v1"`）：

1. 删除 [`fixtures/topics.placeholder.js`](./fixtures/topics.placeholder.js)
2. 从 [`index.html`](./index.html)
   去掉专题 Tab、格言节点、`data-feed-panel="topics"`、`data-view="topic-column"`
   及相关注释块
3. 从 [`preview.js`](./preview.js) 去掉 `YOYI_TOPICS_PLACEHOLDER` 依赖与
   `openTopicColumn` / `renderTopicsFeed` 等逻辑
4. 从 [`preview.css`](./preview.css) 去掉
   `.app-home-motto`、`.app-topics*`、`.app-topic-*` 规则
5. 更新本 README 与相关测试断言

正式 T06 应以 `EditorialCollection` API 替换后再删占位，勿把 Mock 当生产。

## 两壳范围约束

| 端   | 约束                                             |
| ---- | ------------------------------------------------ |
| 手机 | 顶栏不放长格言；专题可缩字；专栏全宽             |
| 平板 | 竖屏可短格言；横屏侧轨不增项；主题卡约 2 列      |
| 桌面 | 使用独立归档壳；不伪造专题、统计、分面或后端能力 |
| 禁止 | 整分支回灌；未做身份前加社区互动；冒充 T08 检索  |

## 本地查看

从仓库根目录运行：

```sh
python -m http.server 4173 --bind 127.0.0.1
```

打开
[http://127.0.0.1:4173/docs/prototypes/mobile-preview/](http://127.0.0.1:4173/docs/prototypes/mobile-preview/)。关联测试：
`tests/integration/prototypes/mobile-preview.test.ts`。

建议在浏览器开发者工具中检查 360 / 390 / 430 / 768 / 834 / 1023 / 1024 /
1440px，并分别旋转平板竖屏与横屏；重点检查 1023→1024 动态切换时状态与键盘焦点范围。

## 外部对照

PC 布局与题材参考见 [类似网站参考清单](../../references/similar-sites.md)
（哈佛 Rubbings
masonry、中华石刻数据库、小红书 / 站酷等；专题气质可对照 Europeana 主题浏览）。
