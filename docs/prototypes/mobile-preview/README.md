# 手机交互原型

> **非生产原型：**
> 本目录只用于验证移动端信息架构、导航和交互手感，不是正式 Web 页面，也不能作为生产实现直接发布。

原型完整保留首页“发现/附近”切换、碑刻搜索过滤、书帖分类、详情进入与返回、设置页、明暗主题、单列/双列偏好、`localStorage`
持久化、浏览器 history 返回和滚动位置恢复。

它不连接真实 Reader/API、数据库、搜索服务或生产图片。页面仅引用
`docs/design-system/assets/demo/`
中的虚构演示图，不在原型目录复制资产；正式应用仍须通过图片适配器从 object
key 派生 URL。

## 本地查看

从仓库根目录运行：

```sh
python3 -m http.server 4173
```

打开
`http://localhost:4173/docs/prototypes/mobile-preview/`。关联的 6 个交互场景位于
`tests/integration/prototypes/mobile-preview.test.ts`。
