(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const { countWords, formatTime, WritingSession } = window.MeadowStats;
  const title = $('titleInput'), body = $('bodyInput'), dialog = $('themeDialog');
  const storageKey = 'writing-skin:coastal-road-pages:v1';
  const session = new WritingSession();
  let composing = false, committedBody, saveTimer, toastTimer;
  let undoStack = [], redoStack = [];
  const snapshot = () => ({ title: title.value, body: body.value });
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved.title === 'string' && typeof saved.body === 'string') {
      title.value = saved.title; body.value = saved.body; $('saveState').textContent = '已保存在本机';
    }
  } catch { $('saveState').textContent = '本地保存不可用'; }
  committedBody = body.value;
  let committedSnapshot = snapshot();
  function fitText() { const y = $('editorScroll').scrollTop; body.style.height = 'auto'; body.style.height = `${body.scrollHeight + 3}px`; $('editorScroll').scrollTop = y; }

  // 打字自动滚动：光标越过 --caret-anchor（默认 .65）时，把光标所在行滚回该处；输入区仍是整个编辑区高度。
  // 锚点放在可视高度一半，正文就不会伸进下方会动的田野/公路，打字区始终落在静止的天空海面一侧。
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
    const available = document.querySelector('.center').clientHeight - document.querySelector('.statusbar').offsetHeight;
    const limit = Math.min(scroller.clientHeight - parseFloat(cs.lineHeight), available * caretAnchor());
    if (caretY - scroller.scrollTop > limit) {
      const before = scroller.scrollTop;
      scroller.scrollTop = Math.max(0, caretY - limit);
      if (scroller.scrollTop !== before) window.dispatchEvent(new Event('writing-scroll'));
    }
  }
  function caretAnchor() {
    const raw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--caret-anchor'));
    return Number.isFinite(raw) ? Math.min(0.85, Math.max(0.35, raw)) : 0.65;
  }

  function refresh() {
    const now = performance.now(), chapter = countWords(committedBody);
    $('statChapter').textContent = chapter.toLocaleString('zh-CN');
    if ($('chapterCount')) $('chapterCount').textContent = chapter.toLocaleString('zh-CN');
    $('footerCount').textContent = chapter.toLocaleString('zh-CN');
    $('statSpeed').textContent = session.speed(now);
    $('statActive').textContent = formatTime(session.activeMs);
    $('statIdle').textContent = formatTime(session.idleMs);
    if ($('chapterName')) $('chapterName').textContent = title.value || '未命名章节';
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
    fitText();
    autoScrollCaret();
    if (composing || event.isComposing) return;
    if (body.value !== committedBody) {
      const before = committedBody, inputType = event.inputType || 'insertText';
      session.input(performance.now(), before, body.value, inputType);
      committedBody = body.value;
      remember(); scheduleSave(); refresh();
    }
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
  // 左侧目录：拖动调宽 / 点击收起展开（状态记忆在本地）
  const sidebar = document.querySelector('.sidebar'), handle = $('sidebarHandle');
  const SIDEBAR_KEY = 'writing-skin:coastal-road-motion:sidebar';
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
