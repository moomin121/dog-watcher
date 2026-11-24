# dog-watcher 接手说明

## 站点结构

- `write.html`：狗狗督查页面。
- `themes/meadow/`：风吹草低视频写作主题。
- `themes/coastal-road/`：通向海边，代码驱动的海岸动态写作主题；独立 URL，只加载当前页资源，复用 shared 目录。正文草稿独立存储于 `writing-skin:coastal-road-pages:v1`。
- `shared/site-nav.js`：唯一目录配置与渲染器；新增页面优先只改这里。
- `shared/site-nav.css`：两个页面共用的目录样式。
- `shared/chapter-sidebar.js` / `.css`：四个页面的侧栏外框，保留全书搜索和章卷按钮，下面直接展示原有「码字主题／其他」站点链接；不显示草稿、已发布、筛选、更多菜单或示例章节。
- `tests/site-smoke.cjs`：发布前静态冒烟测试。

## 目录约定

`SITE_NAV` 中的 `href` 以站点根 `/dog-watcher/` 为基准；页面设置 `data-page-id` 后会自动高亮当前项。不要在页面内复制目录配置。主题链接须写完整 `themes/<主题>/index.html`，不能只写目录路径，否则本地 `file://` 打开时不会进入页面。

页面挂载 `.chapter-sidebar`，并在 `site-nav.js` 之前加载 `chapter-sidebar.js`；它会先生成 `.site-nav` 和上方搜索框，`site-nav.js` 复用该搜索框筛选站点链接。章卷按钮是界面预览，点击会提示，不覆盖编辑器草稿；分组折叠、搜索和原有页面跳转可用。搜索图标复用 `assets/sidebar/` 中原 Figma 导出的 SVG。

## 验证与发布

```sh
/Users/moomin/.workbuddy/binaries/node/versions/22.22.2/bin/node tests/site-smoke.cjs
git diff --check
git add .
git commit -m "feat: add extensible shared site navigation"
git push origin main
```

修改狗狗督查页面时，保留摄像头检测和正文持久化逻辑；狗狗媒体已拆分到 `assets/dog/`，不要重新内嵌大段 base64。第三方统计必须 async，不得阻塞编辑器。两页仅以 DOMContentLoaded 判断当前页就绪，不等媒体、字体或另一页。`shared/writer-indent.js` 提供统一的两全角空格缩进；草地保留自身提交与撤销流程，只复用 normalize。背景状态只放设置面板，禁止插入底栏与计划重叠。

浏览器回归：打开各页后执行 `tests/editor-browser.js`，覆盖独立就绪、输入、粘贴、回车、IME、重复缩进和底栏。
