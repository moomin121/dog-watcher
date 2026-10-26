/*
 * shared/site-nav.js —— 站点目录（单一配置）
 *
 * 两个页面（狗狗督查 write.html 与 风吹草低 themes/meadow/）共用这一份
 * 目录配置 + 渲染器。以后新增页面只需：
 *   1. 在下方 SITE_NAV 里加一条 item（id + title + href，href 相对站点根）；
 *   2. 新页面 <body> 上写 data-page-id="<id>"；
 *   3. 在左侧放一个 <nav class="site-nav">…</nav> 容器（引入本脚本与 CSS）。
 *
 * 站点根通过 document.currentScript 的 src 反推，兼容本地 file:// 预览与
 * GitHub Pages 子路径（如 https://user.github.io/dog-watcher/…）。
 * 纯配置会导出给 Node（tests/site-smoke.cjs 校验共用配置）。
 */
(function (root) {
  'use strict';

  // —— 单一配置：未来只改这里 ——
  const SITE_NAV = {
    version: 1,
    folders: [
      {
        id: 'themes',
        label: '码字主题',
        defaultOpen: true,
        items: [
          { id: 'meadow', title: '风吹草低', href: 'themes/meadow/' },
          { id: 'coastal-road', title: '通向海边', href: 'themes/coastal-road/' }
        ]
      },
      {
        id: 'other',
        label: '其他',
        defaultOpen: true,
        items: [
          { id: 'dog-watcher', title: '狗狗督查', href: 'write.html' }
        ]
      }
    ]
  };

  // —— Node 环境：只导出纯配置，供测试校验 ——
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SITE_NAV;
  }

  // —— 浏览器环境：渲染目录 ——
  if (typeof document === 'undefined') return;

  // 站点根：本脚本位于 <root>/shared/site-nav.js，取上一级目录即根。
  // 必须在脚本顶层（defer 执行、DOMContentLoaded 之前）同步捕获 script.src：
  // boot() 运行于 DOMContentLoaded，彼时 document.currentScript 已是 null。
  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';

  function resolveSiteRoot() {
    if (SCRIPT_SRC) {
      try {
        const url = new URL(SCRIPT_SRC, document.baseURI);
        return new URL('../', url).href; // …/shared/site-nav.js → …/（站点根）
      } catch (e) { /* fallthrough */ }
    }
    return './';
  }

  function resolveHref(href, root) {
    // 已是绝对 URL（http/file/data）就直接用，否则拼到站点根。
    if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(href) || /^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
    return new URL(href, root).href;
  }

  const pageId = (document.body && document.body.getAttribute('data-page-id')) || '';

  function buildFolder(folder, root) {
    const section = document.createElement('div');
    section.className = 'site-nav-folder';
    section.dataset.folder = folder.id;
    section.dataset.defaultOpen = String(!!folder.defaultOpen);
    if (folder.defaultOpen) section.classList.add('open');

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'site-nav-folder-head';
    head.setAttribute('aria-expanded', folder.defaultOpen ? 'true' : 'false');
    head.innerHTML = '<span class="sn-caret" aria-hidden="true"></span><span class="sn-label"></span>';
    head.querySelector('.sn-label').textContent = folder.label;
    head.addEventListener('click', function () {
      const open = section.classList.toggle('open');
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    const body = document.createElement('div');
    body.className = 'site-nav-folder-body';

    folder.items.forEach(function (item) {
      const a = document.createElement('a');
      a.className = 'site-nav-item';
      a.dataset.pageId = item.id;
      a.href = resolveHref(item.href, root);
      a.textContent = item.title;
      if (item.id === pageId) {
        a.classList.add('active');
        a.setAttribute('aria-current', 'page');
      }
      body.appendChild(a);
    });

    section.appendChild(head);
    section.appendChild(body);
    return section;
  }

  function render(container, root) {
    // 清空容器，避免重复挂载（含内联占位内容）。
    while (container.firstChild) container.removeChild(container.firstChild);

    const search = document.createElement('label');
    search.className = 'site-nav-search';
    search.innerHTML = '<span class="sn-search-icon" aria-hidden="true"></span>';
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = '搜索目录';
    input.setAttribute('aria-label', '搜索目录');
    search.appendChild(input);
    container.appendChild(search);

    const list = document.createElement('div');
    list.className = 'site-nav-list';

    const folders = SITE_NAV.folders.map(function (folder) {
      return buildFolder(folder, root);
    });
    folders.forEach(function (section) { list.appendChild(section); });
    container.appendChild(list);

    // 搜索：按标题过滤条目，命中时强制展开所属文件夹；无命中隐藏文件夹。
    input.addEventListener('input', function () {
      const query = input.value.trim();
      folders.forEach(function (section) {
        const items = Array.prototype.slice.call(section.querySelectorAll('.site-nav-item'));
        let any = false;
        items.forEach(function (item) {
          const hit = !query || item.textContent.indexOf(query) !== -1;
          item.hidden = !hit;
          if (hit) any = true;
        });
        section.hidden = !query ? false : !any;
        const head = section.querySelector('.site-nav-folder-head');
        if (query) {
          section.classList.add('open');
          if (head) head.setAttribute('aria-expanded', 'true');
        } else {
          section.classList.toggle('open', section.dataset.defaultOpen === 'true');
          if (head) head.setAttribute('aria-expanded', section.classList.contains('open') ? 'true' : 'false');
        }
      });
    });
  }

  function boot() {
    const root = resolveSiteRoot();
    const containers = Array.prototype.slice.call(document.querySelectorAll('.site-nav'));
    containers.forEach(function (c) { render(c, root); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
