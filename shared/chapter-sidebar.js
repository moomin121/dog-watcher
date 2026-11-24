/* Shared sidebar frame. Navigation content and routes stay in site-nav.js. */
(function () {
  'use strict';
  const root = new URL('../', document.currentScript.src);
  function boot() {
    document.querySelectorAll('.chapter-sidebar').forEach(function (panel) {
      panel.innerHTML = `
        <label class="cs-search"><img class="cs-icon" src="${new URL('assets/sidebar/sidebar-icon-search.svg', root).href}" alt=""><input type="search" placeholder="全书" aria-label="搜索目录"></label>
        <div class="cs-actions"><button class="cs-primary" type="button" data-preview="新建章">新建章</button><button class="cs-secondary" type="button" data-preview="新建卷">新建卷</button></div>
        <nav class="site-nav" aria-label="站点目录"></nav>
        <div class="cs-notice" role="status" hidden></div>`;
      let noticeTimer;
      panel.querySelectorAll('[data-preview]').forEach(function (button) {
        button.addEventListener('click', function () {
          const notice = panel.querySelector('.cs-notice');
          notice.textContent = button.dataset.preview + '功能由作家助手客户端提供。';
          notice.hidden = false;
          clearTimeout(noticeTimer);
          noticeTimer = setTimeout(function () { notice.hidden = true; }, 4500);
        });
      });
    });
  }
  // Runs before site-nav.js so the navigation mounts and search field exist.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
