/* 打字特效与音效：每次真实输入时光标处散出细小雪花，并播放轻键盘声。
   开关存于 writing-skin:christmas:atmosphere:v1（与飘雪/最亮档字数合并写，互不覆盖）。
   遵循系统“减少动态”设置（停特效）；音效用 WebAudio 合成，无音频文件，首次输入时激活。 */
(function () {
  'use strict';
  const INPUT_RE = /^(insertText|insertCompositionText|insertFromComposition|insertLineBreak|insertParagraph)$/;
  const KEY = 'writing-skin:christmas:atmosphere:v1';
  const body = document.getElementById('bodyInput');
  if (!body) return;

  const settings = { typingSparkle: true, typingSound: true };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) {
      if (typeof saved.typingSparkle === 'boolean') settings.typingSparkle = saved.typingSparkle;
      if (typeof saved.typingSound === 'boolean') settings.typingSound = saved.typingSound;
    }
  } catch {}
  function save() {
    try {
      const merged = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
      merged.typingSparkle = settings.typingSparkle;
      merged.typingSound = settings.typingSound;
      localStorage.setItem(KEY, JSON.stringify(merged));
    } catch {}
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  /* ===== 音效：短噪声过带通滤波，模拟轻键盘声，音量随机微变 ===== */
  let ctx = null, noise = null, lastClick = 0;
  function ensureAudio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function ensureNoise() {
    if (noise || !ctx) return noise;
    const len = Math.floor(ctx.sampleRate * 0.06);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return noise;
  }
  function click() {
    const c = ensureAudio();
    if (!c || c.state !== 'running' || !ensureNoise()) return;
    const now = performance.now();
    if (now - lastClick < 12) return; // 高速连发时限流
    lastClick = now;
    const t = c.currentTime, dur = 0.05;
    const src = c.createBufferSource();
    src.buffer = noise;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400 + Math.random() * 1100;
    filter.Q.value = 1.15;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.14 + Math.random() * 0.05, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(c.destination);
    src.start(t);
    src.stop(t + dur + 0.01);
  }

  /* ===== 特效：光标处散出小雪花，向下飘落并淡出 ===== */
  const layer = document.createElement('div');
  layer.className = 'type-fx-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  const MAX = 24;
  let live = 0;
  const particles = [];
  const FLAKES = ['❄', '✦', '❅'];
  function spark(x, y) {
    const n = 2 + Math.round(Math.random() * 2);
    for (let i = 0; i < n && live < MAX; i++) {
      const el = document.createElement('span');
      el.className = 'type-spark';
      el.textContent = FLAKES[(Math.random() * FLAKES.length) | 0];
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.fontSize = (7 + Math.random() * 5).toFixed(1) + 'px';
      layer.appendChild(el);
      particles.push({
        el, x: x + (Math.random() * 6 - 3), y: y - 2,
        vx: (Math.random() * 18 - 9), vy: 16 + Math.random() * 26,
        sway: Math.random() * Math.PI * 2, swayV: 2 + Math.random() * 3,
        born: performance.now(), life: 620 + Math.random() * 380
      });
      live++;
    }
    if (!raf) raf = requestAnimationFrame(step);
  }
  let raf = 0, last = 0;
  function step(now) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const k = (now - p.born) / p.life;
      if (k >= 1) {
        p.el.remove();
        particles.splice(i, 1);
        live--;
        continue;
      }
      p.sway += p.swayV * dt;
      p.x += p.vx * dt + Math.sin(p.sway) * 10 * dt;
      p.y += p.vy * dt;
      p.el.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px)';
      p.el.style.opacity = (1 - k * k).toFixed(2);
    }
    if (particles.length) raf = requestAnimationFrame(step);
    else last = 0;
  }

  /* ===== 光标定位：镜像 div 复刻 textarea 排版，量出标记点位置 ===== */
  let mirror = null;
  const MIRROR_PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
    'textTransform', 'textIndent', 'whiteSpace', 'wordWrap', 'wordBreak', 'overflowWrap', 'padding', 'width'];
  function caretPoint() {
    const pos = typeof body.selectionEnd === 'number' ? body.selectionEnd : body.value.length;
    const rect = body.getBoundingClientRect();
    if (!mirror) {
      mirror = document.createElement('div');
      mirror.className = 'caret-mirror';
      mirror.setAttribute('aria-hidden', 'true');
      document.body.appendChild(mirror);
    }
    const cs = getComputedStyle(body);
    for (const prop of MIRROR_PROPS) mirror.style[prop] = cs[prop];
    mirror.style.left = rect.left + 'px';
    mirror.style.top = rect.top + 'px';
    mirror.textContent = body.value.slice(0, pos);
    const marker = document.createElement('span');
    marker.textContent = '​';
    mirror.appendChild(marker);
    const m = marker.getBoundingClientRect();
    const lineHeight = parseFloat(cs.lineHeight) || 24;
    return { x: m.left, y: m.top + lineHeight * 0.7 };
  }

  /* ===== 接线 ===== */
  body.addEventListener('input', event => {
    if (!INPUT_RE.test(event.inputType || '')) return; // 粘贴/撤销/删除等不触发
    if (settings.typingSparkle && !reduced.matches) {
      const c = caretPoint();
      spark(c.x, c.y);
    }
    if (settings.typingSound) click();
  });

  for (const [id, prop] of [['typingSparkleToggle', 'typingSparkle'], ['typingSoundToggle', 'typingSound']]) {
    const toggle = document.getElementById(id);
    if (!toggle) continue;
    toggle.checked = settings[prop];
    toggle.addEventListener('change', () => {
      settings[prop] = toggle.checked;
      save();
      if (prop === 'typingSound' && toggle.checked) ensureAudio(); // 开启时预热音频上下文
    });
  }

  // 验证/调试钩子
  window.__typingFX = {
    settings: () => ({ ...settings }),
    audioState: () => (ctx ? ctx.state : 'none'),
    particleCount: () => live
  };
})();
