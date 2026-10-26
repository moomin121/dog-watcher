(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  // 章节 id 改为可选：侧栏已由 shared/site-nav 接管，这些 id 在导航结构里不再存在。
  // 用 null 保护，避免刷新/计数/过滤时对缺失元素报错，也避免把页面链接当成章节名更新。
  const chapterName = $('chapterName'), chapterCount = $('chapterCount'), chapterSearch = $('chapterSearch');
  const { countWords, formatTime, WritingSession } = window.MeadowStats;
  const title = $('titleInput'), body = $('bodyInput'), dialog = $('themeDialog');
  const storageKey = 'writing-skin:sunny-meadow:v1-fix';
  const session = new WritingSession();
  let composing = false, committedBody, saveTimer, toastTimer;
  let undoStack = [], redoStack = [];
  const snapshot = () => ({ title: title.value, body: body.value });
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved.title === 'string' && typeof saved.body === 'string') {
      const oldPreset = '同样的鲁恩语，同样凝重而紧绷的感觉。这是哪里？我想做什么？我野象知道……周明瑞冷静了下来，无声重复了两人的问题。';
      const isOldPreset = saved.title === '非凡者' && saved.body.trim() === oldPreset;
      if (!isOldPreset) { title.value = saved.title; body.value = saved.body; }
      else { localStorage.setItem(storageKey, JSON.stringify(snapshot())); }
      $('saveState').textContent = '已保存在本机';
    }
  } catch { $('saveState').textContent = '本地保存不可用'; }
  // 每段默认两个全角空格；空白分隔行保留，已有缩进不重复添加。
  function indentParagraphs(value) {
    return window.WriterIndent.normalize(value);
  }
  body.value = indentParagraphs(body.value);
  committedBody = body.value;
  let committedSnapshot = snapshot();
  function fitText() { const y = $('editorScroll').scrollTop; body.style.height = 'auto'; body.style.height = `${body.scrollHeight + 3}px`; $('editorScroll').scrollTop = y; }

  // 打字自动滚动：光标越过编辑区可视高度 70% 的位置时，把光标所在行滚回 70% 处
  const caretMirror = document.createElement('div');
  caretMirror.setAttribute('aria-hidden', 'true');
  caretMirror.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre-wrap;word-break:break-word;box-sizing:content-box;padding:0;border:0;margin:0';
  const caretMark = document.createElement('span');
  caretMark.textContent = '\u200b';
  document.body.appendChild(caretMirror);
  function autoScrollCaret() {
    const scroller = $('editorScroll'), cs = getComputedStyle(body);
    caretMirror.style.width = `${body.getBoundingClientRect().width}px`;
    caretMirror.style.fontFamily = cs.fontFamily;
    caretMirror.style.fontSize = cs.fontSize;
    caretMirror.style.fontWeight = cs.fontWeight;
    caretMirror.style.fontStyle = cs.fontStyle;
    caretMirror.style.lineHeight = cs.lineHeight;
    caretMirror.style.letterSpacing = cs.letterSpacing;
    const pos = body.selectionStart == null ? body.value.length : body.selectionStart;
    caretMirror.textContent = body.value.slice(0, pos);
    caretMirror.appendChild(caretMark);
    const caretY = body.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop + caretMark.offsetTop;
    const limit = scroller.clientHeight * 0.7;
    if (caretY - scroller.scrollTop > limit) scroller.scrollTop = Math.max(0, caretY - limit);
  }

  function refresh() {
    const now = performance.now(), chapter = countWords(committedBody);
    $('statChapter').textContent = chapter.toLocaleString('zh-CN');
    if (chapterCount) chapterCount.textContent = chapter.toLocaleString('zh-CN');
    $('footerCount').textContent = chapter.toLocaleString('zh-CN');
    $('statSpeed').textContent = session.speed(now);
    $('statActive').textContent = formatTime(session.activeMs);
    $('statIdle').textContent = formatTime(session.idleMs);
    if (chapterName) chapterName.textContent = `第六章 ${title.value || '未命名章节'}`;
    $('undoButton').disabled = undoStack.length === 0;
    $('redoButton').disabled = redoStack.length === 0;
  }
  function save() {
    clearTimeout(saveTimer);
    try { localStorage.setItem(storageKey, JSON.stringify(snapshot())); $('saveState').textContent = '已保存在本机'; }
    catch { $('saveState').textContent = '此窗口未保存'; }
  }
  function scheduleSave() { $('saveState').textContent = '保存中…'; clearTimeout(saveTimer); saveTimer = setTimeout(save, 500); }
  function remember() {
    undoStack.push(committedSnapshot);
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
    committedSnapshot = snapshot();
  }
  function handleCommit(event) {
    if (!composing && !event.isComposing && /^insert/.test(event.inputType || 'insertText')) {
      const start = body.selectionStart, end = body.selectionEnd, value = body.value;
      const breaks = ['insertLineBreak', 'insertParagraph'].includes(event.inputType);
      const normalize = text => indentParagraphs(text);
      let next = normalize(value);
      let nextStart = normalize(value.slice(0, start)).length;
      let nextEnd = normalize(value.slice(0, end)).length;
      if (breaks && start === end && (start === 0 || value[start - 1] === '\n') && !next.slice(nextStart).startsWith('　　')) {
        next = next.slice(0, nextStart) + '　　' + next.slice(nextStart);
        nextStart += 2; nextEnd = nextStart;
      }
      if (next !== value) { body.value = next; body.setSelectionRange(nextStart, nextEnd); }
    }
    fitText();
    autoScrollCaret();
    if (composing || event.isComposing) return;
    if (body.value !== committedBody) {
      const before = committedBody, inputType = event.inputType || 'insertText';
      session.input(performance.now(), before, body.value, inputType);
      committedBody = body.value;
      // 提交给风力模型：中文输入法只在提交后计入，粘贴/撤销等由 insertedCharacters 过滤
      window.MeadowWind?.recordInput(before, body.value, inputType, caretPoint());
      remember(); scheduleSave(); refresh();
    }
  }
  // 光标在视口中的位置（caretMirror 与正文同宽同字体，偏移量可直接映射）
  function caretPoint() {
    const rect = body.getBoundingClientRect();
    return { x: rect.left + caretMark.offsetLeft, y: rect.top + caretMark.offsetTop };
  }
  body.addEventListener('compositionstart', () => { composing = true; });
  body.addEventListener('compositionend', () => { composing = false; handleCommit({ inputType: 'insertCompositionText' }); });
  body.addEventListener('input', handleCommit);
  title.addEventListener('input', () => { if (title.value !== committedSnapshot.title) remember(); refresh(); scheduleSave(); });
  function restoreFromHistory(from, to) {
    if (!from.length) return;
    to.push(snapshot()); const state = from.pop();
    title.value = state.title; body.value = state.body; committedBody = body.value; committedSnapshot = snapshot();
    fitText(); refresh(); scheduleSave();
  }
  $('undoButton').addEventListener('click', () => restoreFromHistory(undoStack, redoStack));
  $('redoButton').addEventListener('click', () => restoreFromHistory(redoStack, undoStack));
  function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2600); }
  const showTheme = () => { if (!dialog.open) dialog.showModal(); };
  ['themeButton', 'fontButton'].forEach(id => $(id).addEventListener('click', () => { showTheme(); if (id === 'fontButton') $('fontSelect').focus(); }));
  $('closeTheme').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  $('anchorSelect').addEventListener('change', event => document.documentElement.style.setProperty('--wallpaper-position', event.target.value));
  $('fontSelect').addEventListener('change', event => { document.documentElement.style.setProperty('--body-size', `${event.target.value}px`); $('fontStatus').textContent = `${event.target.value} px`; fitText(); });
  $('formatButton').addEventListener('click', () => {
    const formatted = body.value.split(/\n+/).map(line => line.trim()).filter(Boolean).map(line => `　　${line}`).join('\n\n');
    if (formatted !== body.value) { body.value = formatted; committedBody = formatted; remember(); fitText(); refresh(); scheduleSave(); }
    toast('已整理段落与首行缩进');
  });
  $('focusButton').addEventListener('click', () => { const active = document.body.classList.toggle('focus-mode'); $('focusButton').setAttribute('aria-pressed', String(active)); fitText(); });
  $('fullscreenButton').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { toast('当前预览窗口不支持全屏'); }
  });
  $('exportButton').addEventListener('click', () => {
    const blob = new Blob([`${title.value}\n\n${body.value}`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `${(title.value || '未命名章节').replace(/[\\/:*?"<>|]/g, '_')}.txt`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('已导出本章文字');
  });
  $('insertButton').addEventListener('click', () => toast('插入：该功能由客户端提供，皮肤仅预览样式'));
  ['findButton', 'nameButton', 'painterButton', 'historyButton'].forEach(id => $(id).addEventListener('click', () => toast('该功能由客户端提供，皮肤仅预览样式')));
  $('statsClose').addEventListener('click', () => { $('statsPanel').hidden = true; });
  // 章节搜索：原逻辑过滤 .chapter/.folder；侧栏已由 shared/site-nav 接管，此处仅作 null 保护，
  // 避免把导航链接当章节名过滤。保留函数体以兼容后续若有独立章节列表的扩展。
  if (chapterSearch) chapterSearch.addEventListener('input', event => { const query = event.target.value.trim(); document.querySelectorAll('.chapter, .folder').forEach(el => { el.hidden = !!query && !el.textContent.includes(query); }); });
  // 左侧目录：拖动调宽 / 点击收起展开（状态记忆在本地）
  const sidebar = document.querySelector('.sidebar'), handle = $('sidebarHandle');
  const SIDEBAR_KEY = 'writing-skin:sunny-meadow:sidebar-fix';
  const applySidebarWidth = px => document.documentElement.style.setProperty('--sidebar-w', `${Math.round(px)}px`);
  try {
    const savedSidebar = JSON.parse(localStorage.getItem(SIDEBAR_KEY) || 'null');
    if (savedSidebar && savedSidebar.w >= 200 && savedSidebar.w <= 420) applySidebarWidth(savedSidebar.w);
    // 目录默认展开：只记忆宽度，不复原收起状态，每次进入都从展开开始
  } catch {}
  let dragFrom = null, dragFromWidth = 0, dragged = false;
  handle.addEventListener('pointerdown', event => { dragFrom = event.clientX; dragFromWidth = sidebar.getBoundingClientRect().width; dragged = false; handle.classList.add('dragging'); handle.setPointerCapture(event.pointerId); });
  handle.addEventListener('pointermove', event => {
    if (dragFrom === null) return;
    const dx = event.clientX - dragFrom;
    if (Math.abs(dx) > 3) dragged = true;
    if (dragged) applySidebarWidth(Math.min(420, Math.max(200, dragFromWidth + dx)));
  });
  function finishDrag(event) {
    if (dragFrom === null) return;
    dragFrom = null;
    handle.classList.remove('dragging');
    try { handle.releasePointerCapture(event.pointerId); } catch {}
  }
  handle.addEventListener('pointerup', event => { finishDrag(event); try { localStorage.setItem(SIDEBAR_KEY, JSON.stringify({ w: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w')) || 255, collapsed: document.body.classList.contains('sidebar-collapsed') })); } catch {} });
  handle.addEventListener('pointercancel', finishDrag);
  handle.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleSidebar(); } });
  function toggleSidebar() {
    const collapsed = document.body.classList.toggle('sidebar-collapsed');
    handle.setAttribute('aria-expanded', String(!collapsed));
    try { localStorage.setItem(SIDEBAR_KEY, JSON.stringify({ w: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w')) || 255, collapsed })); } catch {}
    fitText();
  }
  handle.addEventListener('click', () => { if (!dragged) toggleSidebar(); dragged = false; });
  document.addEventListener('visibilitychange', () => { session.setVisible(performance.now(), !document.hidden); refresh(); });
  window.addEventListener('pagehide', save);
  window.addEventListener('resize', fitText);
  window.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save(); toast('已保存在本机'); }
  });
  function clock() { $('clock').textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); }
  clock(); setInterval(clock, 1000); setInterval(refresh, 500); fitText(); refresh();
  document.fonts.ready.then(fitText);
})();
