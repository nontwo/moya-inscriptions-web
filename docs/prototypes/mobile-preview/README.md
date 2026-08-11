# 交互原型（PC 专用壳）

> **非生产原型（prototype shell only）：** 本目录用于验证 **PC（≥896px）**
> 信息架构、导航和交互手感；**不是**正式 Web /
> T06–T08 验收交付，也不能作为生产实现直接发布。不连接 Repository、数据库、Reader/API 或 SearchDocument。

手机与平板壳已从此预览移除。打开时自动检测视口：`data-platform` 为 `pc` /
`tablet` /
`phone`；非 PC 仅显示提示页（请使用宽度 ≥896px 的电脑），**不会**把 PC 壳降级到平板宽度。

原型保留首页“发现/附近/专题”切换、碑刻搜索过滤、书帖分类 +
**本地筛选壳**（非 T08）、详情进入与返回、设置页、明暗主题、`localStorage`
持久化、浏览器 history 返回和滚动位置恢复。首页单列/双列偏好仍可读历史
`localStorage`，但设置 UI 已去掉（PC 强制多列）。

PC 顶栏在「发现 | 附近 | 专题」与设置之间居中展示楷体格言「志于道，据于德，依于仁，游于艺」（系统楷体栈，无 CDN 字库）。「专题」为策展占位（`editorialTopic`），**不是**社区帖或CMS。

页面仅引用 `docs/design-system/assets/demo/`
中的虚构演示图，不在原型目录复制资产；正式应用仍须通过图片适配器从 object
key 派生 URL。

## 壳层体验要点

| 项       | 说明                                                                         |
| -------- | ---------------------------------------------------------------------------- |
| 平台门闸 | `<896px` 显示提示；`≥896px` 进入现有 PC 壳（`desktopSplitQuery` 仍为 56rem） |
| 格言     | 楷体加粗放大；约 1.75–2.125rem、`font-weight: 700`                           |
| 书帖缩放 | `--app-calligraphy-scale: 2`；首页发现/附近/专题与书帖共用 `--app-feed-*`    |
| 左侧导航 | `position: fixed`，下滑不跟随内容滚动                                        |
| 书帖筛选 | 拓本与设置之间的本地 DOM 过滤；非 URL 分面、非中文检索产品                   |

## 响应式结构（仅 PC 壳规则保留）

| 宽度                    | 结构                                                              |
| ----------------------- | ----------------------------------------------------------------- |
| `< 896px`               | 平台提示页；不渲染手机/平板交互壳                                 |
| `≥ 896px`               | 固定侧栏；格言居中楷体；A/B/C + 专题；书帖按 scale 放大；强制多列 |
| `≥ 1024px` / `≥ 1440px` | 首页卡片再放大；书帖随视口继续流式列；碑刻行再放大                |

`@media (min-width: 56rem|64rem|90rem)` 内规则保持不动，供后续与正式实现合入。

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

## 手机 / 平板合入预留（当前不实施）

| 端   | 预留策略                                        |
| ---- | ----------------------------------------------- |
| 共同 | 第三 feed「专题」+ 专栏 view + `topics-v1` 约定 |
| 手机 | 另行恢复专用壳；勿复用本 PC 壳降宽              |
| 平板 | 另行恢复竖/横屏壳；勿改 `56rem` 门槛            |
| PC   | 本方案已落地                                    |
| 禁止 | 整分支回灌；未做身份前加社区互动；冒充 T08 检索 |

## 本地查看

从仓库根目录运行：

```sh
python -m http.server 4173 --bind 127.0.0.1
```

打开
[http://127.0.0.1:4173/docs/prototypes/mobile-preview/](http://127.0.0.1:4173/docs/prototypes/mobile-preview/)。关联测试：
`tests/integration/prototypes/mobile-preview.test.ts`。

建议在浏览器开发者工具中检查 **&lt;896px**（应见提示）与 **≥896 / 1024 /
1440px**（PC壳）。

## 外部对照

PC 布局与题材参考见 [类似网站参考清单](../../references/similar-sites.md)
（哈佛 Rubbings
masonry、中华石刻数据库、小红书 / 站酷等；专题气质可对照 Europeana 主题浏览）。
