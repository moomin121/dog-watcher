# 狗狗督察

用笔记本前置摄像头监测摸鱼行为，分心时狗狗会叫你。

受 [凛冬督学局](https://redwatch.top) 启发。

**页面入口：[write.html](write.html)**

## 使用

1. 打开页面右上角「专注监测」，授权摄像头
2. 分心时右下角狗狗会发出声音警告（请打开声音）
3. 点狗狗右上角设置按钮，可换成自己的宠物视频

摄像头画面只在本机处理，不上传。

## 站点目录

两个页面共用 `shared/site-nav.js` 与 `shared/site-nav.css`。新增页面时：

1. 将页面放到站点目录内，并在 `<body>` 设置唯一 `data-page-id`。
2. 在 `shared/site-nav.js` 的 `SITE_NAV.folders[].items` 增加 `{ id, title, href }`。
3. 页面引入相对路径正确的共享 CSS/JS；运行 `node tests/site-smoke.cjs`。

目录链接以站点根为基准，适用于本地预览和 `/dog-watcher/` GitHub Pages 子路径。

## 说明

- 单个 HTML 文件，视频与插画均已内嵌，无需其他依赖
- 除输入区和「专注监测」外，其余按钮为界面演示，点击会跳转作家助手官网
