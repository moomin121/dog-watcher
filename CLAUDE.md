# dog-watcher 接手说明

## 站点结构

- `write.html`：狗狗督查页面。
- `themes/meadow/`：风吹草低视频写作主题。
- `shared/site-nav.js`：唯一目录配置与渲染器；新增页面优先只改这里。
- `shared/site-nav.css`：两个页面共用的目录样式。
- `tests/site-smoke.cjs`：发布前静态冒烟测试。

## 目录约定

`SITE_NAV` 中的 `href` 以站点根 `/dog-watcher/` 为基准；页面设置 `data-page-id` 后会自动高亮当前项。不要在页面内复制目录配置。

## 验证与发布

```sh
/Users/moomin/.workbuddy/binaries/node/versions/22.22.2/bin/node tests/site-smoke.cjs
git diff --check
git add .
git commit -m "feat: add extensible shared site navigation"
git push origin main
```

修改狗狗督查页面时，保留摄像头检测、视频内嵌资源和正文持久化逻辑；修改风吹草低页面时，保持视频节奏模型和共享导航引用有效。
