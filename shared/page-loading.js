(() => {
  'use strict';
  // 只等待当前文档的编辑脚本，不等待 load、背景视频、网络字体或其他页面。
  const ready = () => {
    document.documentElement.dataset.editorReady = 'true';
    const indicator = document.getElementById('pageLoading');
    if (indicator) indicator.hidden = true;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
