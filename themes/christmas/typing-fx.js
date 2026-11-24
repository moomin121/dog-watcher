/* 打字特效与音效（对照 Figma Make「圣诞主题写作页」移植）：
   每次真实键入——
   1) 特效：光标处绽放一组元素：4 个发光 emoji（❄️⭐✨🎄，缩放 0→1.5→0、随机漂移旋转、
      交错延迟 1.5s）、红黄渐变铃铛光斑（放大 3 倍 0.8s）、8 颗白粒子向八方散开（60px，1s）；
   2) 音效：按 Jingle Bells 旋律逐音符播放（正弦振荡器，每键入一个音符，0.25s 衰减）。
   开关存于 writing-skin:christmas:atmosphere:v1（与飘雪/最亮档字数合并写，互不覆盖）。
   遵循系统“减少动态”设置（停特效）。光标定位比参考实现更准：镜像 div 复刻 textarea 排版。 */
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

  /* ===== 音效：Jingle Bells 逐音符（E E E | E E E | E G C D E | F F F F | F E E E | E D D E D G） ===== */
  const MELODY = [
    659.25, 659.25, 659.25,
    659.25, 659.25, 659.25,
    659.25, 783.99, 523.25, 587.33, 659.25,
    698.46, 698.46, 698.46, 698.46,
    698.46, 659.25, 659.25, 659.25,
    659.25, 587.33, 587.33, 659.25, 587.33, 783.99
  ];
  let ctx = null, noteIndex = 0;
  function ensureAudio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function note() {
    const c = ensureAudio();
    if (!c || c.state !== 'running') return;
    const frequency = MELODY[noteIndex % MELODY.length];
    noteIndex++;
    const t = c.currentTime;
    const oscillator = c.createOscillator();
    const gain = c.createGain();
    oscillator.connect(gain).connect(c.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
    oscillator.start(t);
    oscillator.stop(t + 0.25);
  }

  /* ===== 特效：光标处一组绽放元素（emoji + 铃光 + 八方粒子） ===== */
  const layer = document.createElement('div');
  layer.className = 'type-fx-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  const EMOJI = [
    { ch: '❄️', delay: 0, glow: '#93c5fd' },
    { ch: '⭐', delay: 0.1, glow: '#fde047' },
    { ch: '✨', delay: 0.2, glow: '#fef3c7' },
    { ch: '🎄', delay: 0.15, glow: '#86efac' }
  ];
  const MAX_BURSTS = 6;
  let bursts = 0;
  const animations = [];
  const BURST_LIFE = 1700;

  function makeItem(kind, delay, life, el, dx, dy, rot, born) {
    animations.push({ kind, delay: delay * 1000, life, el, dx, dy, rot, born });
  }
  function burst(x, y) {
    if (bursts >= MAX_BURSTS) return;
    bursts++;
    const box = document.createElement('div');
    box.className = 'type-fx-burst';
    box.style.left = x + 'px';
    box.style.top = y + 'px';
    layer.appendChild(box);
    const born = performance.now();

    for (const e of EMOJI) {
      const el = document.createElement('span');
      el.className = 'type-fx-item type-fx-emoji';
      el.textContent = e.ch;
      el.style.setProperty('--glow', e.glow);
      box.appendChild(el);
      makeItem('emoji', e.delay, 1500, el,
        (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100 - 50, Math.random() * 360, born);
    }
    const bell = document.createElement('span');
    bell.className = 'type-fx-item type-fx-bell';
    box.appendChild(bell);
    makeItem('bell', 0, 800, bell, 0, 0, 0, born);

    for (let i = 0; i < 8; i++) {
      const el = document.createElement('span');
      el.className = 'type-fx-item type-fx-dot';
      box.appendChild(el);
      makeItem('dot', 0, 1000, el,
        Math.cos(i * 45 * Math.PI / 180) * 60, Math.sin(i * 45 * Math.PI / 180) * 60, 0, born);
    }

    animations.push({ kind: 'burst', delay: 0, life: BURST_LIFE, el: box, born });
    if (!raf) raf = requestAnimationFrame(step);
  }
  let raf = 0, last = 0;
  function apply(item, k, ease) {
    if (item.kind === 'emoji') {
      const s = 1.5 * Math.sin(Math.PI * k);
      item.el.style.transform = 'translate(' + (item.dx * ease).toFixed(1) + 'px,' + (item.dy * ease).toFixed(1) + 'px) rotate(' + (item.rot * k).toFixed(0) + 'deg) scale(' + Math.max(0, s).toFixed(3) + ')';
      item.el.style.opacity = (1 - k).toFixed(2);
    } else if (item.kind === 'bell') {
      item.el.style.transform = 'scale(' + (3 * ease).toFixed(3) + ')';
      item.el.style.opacity = (1 - k).toFixed(2);
    } else if (item.kind === 'dot') {
      item.el.style.transform = 'translate(' + (item.dx * ease).toFixed(1) + 'px,' + (item.dy * ease).toFixed(1) + 'px) scale(' + (1 - k).toFixed(3) + ')';
      item.el.style.opacity = (1 - k).toFixed(2);
    }
  }
  function step(now) {
    raf = 0;
    last = now;
    for (let i = animations.length - 1; i >= 0; i--) {
      const a = animations[i];
      const t = now - a.born - a.delay;
      if (a.kind === 'burst') {
        if (t >= a.life) {
          a.el.remove();
          animations.splice(i, 1);
          bursts--;
        }
        continue;
      }
      if (t < 0) { a.el.style.opacity = '0'; continue; }
      const k = Math.min(1, t / a.life);
      if (k >= 1) { a.el.style.opacity = '0'; a.el.remove(); animations.splice(i, 1); continue; }
      apply(a, k, k * (2 - k)); // easeOut
    }
    if (animations.length) raf = requestAnimationFrame(step);
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
    return { x: m.left, y: m.top + lineHeight * 0.35 };
  }

  /* ===== 接线（节流：避免连续键入时特效与音符过于密集）===== */
  const FX_MIN_INTERVAL = 700;    // 两次绽放最小间隔（毫秒）
  const SOUND_MIN_INTERVAL = 350; // 两个音符最小间隔（毫秒），旋律随节奏慢慢走
  let lastBurstAt = 0, lastNoteAt = 0;
  body.addEventListener('input', event => {
    if (!INPUT_RE.test(event.inputType || '')) return; // 粘贴/撤销/删除等不触发
    const now = performance.now();
    if (settings.typingSparkle && !reduced.matches && now - lastBurstAt >= FX_MIN_INTERVAL) {
      lastBurstAt = now;
      const c = caretPoint();
      burst(c.x, c.y);
    }
    if (settings.typingSound && now - lastNoteAt >= SOUND_MIN_INTERVAL) {
      lastNoteAt = now;
      note();
    }
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
    noteIndex: () => noteIndex,
    activeBursts: () => bursts,
    activeItems: () => animations.filter(a => a.kind !== 'burst').length
  };
})();
