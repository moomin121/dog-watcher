(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const { countWords, formatTime, WritingSession } = window.MeadowStats;
  const title = $('titleInput'), body = $('bodyInput'), dialog = $('themeDialog');
  const storageKey = 'writing-skin:christmas-pages:v1';
  const atmosphereKey = 'writing-skin:christmas:atmosphere:v1';
  const session = new WritingSession();

  // 字数 → 壁纸四档渐变（source-over 累积透明度，防止中间状态透底）
  const clamp01 = n => Math.min(1, Math.max(0, n));
  function lightWeights(count, maxCount) {
    const limit = Math.max(1, Number(maxCount) || 5000);
    const t = clamp01((Math.max(0, Number(count) || 0)) / limit) * 3;
    const lower = Math.min(2, Math.floor(t)), mix = t >= 3 ? 1 : t - lower;
    const weights = [0, 0, 0, 0];
    weights[lower] = 1 - mix; weights[Math.min(3, lower + 1)] = mix;
    return weights;
  }
  function lightOpacities(count, maxCount) {
    let accumulated = 0;
    return lightWeights(count, maxCount).map((weight, index) => {
      accumulated += weight;
      return index === 0 ? 1 : accumulated > 0 ? weight / accumulated : 0;
    });
  }
  let brightCount = 5000;
  try {
    const s = JSON.parse(localStorage.getItem(atmosphereKey) || 'null');
    if (s && Number.isFinite(s.brightCount)) brightCount = Math.min(20000, Math.max(500, Math.round(s.brightCount / 100) * 100));
  } catch {}
  // 与 snow.js 共用同一存储：写入时保留其他字段（如 enabled）
  function saveAtmosphere() {
    try {
      let merged = {};
      try { merged = JSON.parse(localStorage.getItem(atmosphereKey) || 'null') || {}; } catch {}
      localStorage.setItem(atmosphereKey, JSON.stringify(Object.assign(merged, { brightCount })));
    } catch {}
  }
  function updateBackground(count) {
    const opacities = lightOpacities(count, brightCount);
    ['dim', 'low', 'mid', 'bright'].forEach((name, index) =>
      document.documentElement.style.setProperty(`--winter-bg-${name}`, opacities[index].toFixed(3)));
    // 达标奖励：字数达到目标时仍显示原四档最亮图，再多打一个字才换满月市集新图
    document.documentElement.style.setProperty('--winter-bg-goal', count > brightCount ? '1' : '0');
  }

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

  // 打字自动滚动：光标越过 --caret-anchor（默认 .65）时滚回该处。
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
    const anchorRaw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--caret-anchor'));
    const anchor = Number.isFinite(anchorRaw) ? Math.min(0.85, Math.max(0.35, anchorRaw)) : 0.65;
    const limit = Math.min(scroller.clientHeight - parseFloat(cs.lineHeight), available * anchor);
    if (caretY - scroller.scrollTop > limit) scroller.scrollTop = Math.max(0, caretY - limit);
  }

  function refresh() {
    const now = performance.now(), chapter = countWords(committedBody);
    $('statChapter').textContent = chapter.toLocaleString('zh-CN');
    $('footerCount').textContent = chapter.toLocaleString('zh-CN');
    updateBackground(chapter);
    const scene = $('snowmanScene');
    if (scene) {
      const stage = chapter >= 1200 ? 4 : chapter >= 600 ? 3 : chapter >= 250 ? 2 : chapter >= 80 ? 1 : 0;
      scene.dataset.stage = String(stage);
      scene.setAttribute('aria-label', `随本章字数逐步堆起的雪人（第${stage}阶段，共4阶段）`);
    }
    $('statSpeed').textContent = session.speed(now);
    $('statActive').textContent = formatTime(session.activeMs);
    $('statIdle').textContent = formatTime(session.idleMs);
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
      window.ChristmasSnow?.recordInput(before, body.value, inputType);
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
  // 最亮档字数：修改后立即刷新壁纸渐变并保存
  const brightInput = $('brightCount');
  if (brightInput) {
    brightInput.value = String(brightCount);
    brightInput.addEventListener('change', () => {
      const value = Number(brightInput.value);
      brightCount = Math.min(20000, Math.max(500, Math.round((Number.isFinite(value) ? value : 5000) / 100) * 100));
      brightInput.value = String(brightCount);
      saveAtmosphere();
      refresh();
    });
  }
  // 左侧目录：拖动调宽 / 点击收起展开（宽度记忆在本地）
  const sidebar = document.querySelector('.sidebar'), handle = $('sidebarHandle');
  const SIDEBAR_KEY = 'writing-skin:christmas:sidebar';
  const applySidebarWidth = px => document.documentElement.style.setProperty('--sidebar-w', `${Math.round(px)}px`);
  try {
    const savedSidebar = JSON.parse(localStorage.getItem(SIDEBAR_KEY) || 'null');
    if (savedSidebar && savedSidebar.w >= 200 && savedSidebar.w <= 420) applySidebarWidth(savedSidebar.w);
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
