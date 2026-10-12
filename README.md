# 关于

一个零编译的浏览器首页 / 导航站 / 备忘录。每个标签页就是一个 markdown 文件，渲染成网页；用 `<navCard>` 包起来的列表会显示成导航卡片。

## 功能

- **多标签页**：「＋」新建（直接写 md，第一个 `#` 标题或第一句话自动作为标签名），双击重命名，整理模式下拖动排序、✕ 删除。
- **⇅ 整理**：导航卡片里的网址可以拖动排序、跨卡片移动；点击修改名称、网址、图标；✕ 删除、＋ 添加；新增和删除整张卡片。所有改动都写回 md。
- **✎ 编辑**：直接编辑当前页的 markdown 文字，什么内容都能改。
- **图标**：内置五个图标集，可以分类浏览、筛选；也可以直接写 emoji、填图片网址，什么都不填就用网站的 favicon。
- **备份**：「⇩ zip」导出全部页面，「⇩ md」导出当前页，「⇧ 导入」上传 zip 或多个 .md。
- **快**：数据存在浏览器 IndexedDB，上次渲染的页面会先直接显示，再加载其余功能。

## 导航卡片写法

```md
<navCard title="常用">

- [GitHub](https://github.com) {logos:github-icon}
- [MDN](https://developer.mozilla.org) {mdi:web}
- [火箭](https://example.com) {🚀}
- [NAS](https://nas.local) {https://nas.local/logo.png}
- [不写图标就用 favicon](https://example.com)

</navCard>
```

`<navCard title="标题">` 和 `</navCard>` 前后要留空行，中间是普通的 markdown 列表。任何页面都能放导航卡片。

## 图标集

| 写法 | 图标集 | 来源 |
| --- | --- | --- |
| `{logos:xxx}` | SVG Logos（彩色品牌） | [gilbarbara/logos](https://github.com/gilbarbara/logos) |
| `{fluent-emoji-flat:xxx}` | Fluent Emoji | [microsoft/fluentui-emoji](https://github.com/microsoft/fluentui-emoji) |
| `{fluent-color:xxx}` | Fluent UI System Color Icons | [microsoft/fluentui-system-icons](https://github.com/microsoft/fluentui-system-icons) |
| `{simple-icons:xxx}` | Simple Icons（单色品牌） | [simple-icons/simple-icons](https://github.com/simple-icons/simple-icons) |
| `{mdi:xxx}` | Material Design Icons | [Templarian/MaterialDesign](https://github.com/Templarian/MaterialDesign) |

图标通过 [Iconify](https://iconify.design) 按需加载。

## 文件

- `index.html` / `style.css` / `app.js`：全部代码，不需要编译；依赖走 CDN（Vue 3、marked、DOMPurify、iconify-icon，Sortable、JSZip 按需加载）。
- `default.md`（导航）、`memo.md`（备忘录）、`README.md`（关于）：第一次打开时的默认标签页。

## 运行

需要通过 HTTP 访问（ES 模块不能用 `file://` 打开），任何静态服务器都可以，本地例如：

```bash
python -m http.server 8080
```

数据只保存在当前浏览器里，换浏览器或清理数据前请先「⇩ zip」备份。
