/* 圣诞飘雪：轻量 canvas 雪层，绘制在壁纸之上、界面之下；遵循“减少动态”。 */
(() => {
  'use strict';
  const canvas = document.getElementById('snowCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const KEY = 'writing-skin:christmas:atmosphere:v1';
  const settings = { enabled: true };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s.enabled === 'boolean') settings.enabled = s.enabled; } catch {}
  // 与 app.js 共用同一存储：写入时保留其他字段（如 brightCount）
  function saveAtmosphere() {
    try {
      let merged = {};
      try { merged = JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch {}
      localStorage.setItem(KEY, JSON.stringify(Object.assign(merged, { enabled: settings.enabled })));
    } catch {}
  }
  let width = 0, height = 0, flakes = [], last = null, raf = 0;
  function createFlake(anywhere) {
    const z = Math.random();
    return {
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : -12 - Math.random() * 40,
      r: .6 + z * 2.2, depth: z,
      speed: 10 + z * 26, phase: Math.random() * Math.PI * 2, sway: 2 + Math.random() * 8,
      alpha: .25 + z * .6, crystal: z > .88 && Math.random() > .2
    };
  }
  function targetCount() { return Math.round((width * height / 1000000) * 110); }
  function resize() {
    width = innerWidth; height = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = targetCount();
    while (flakes.length < target) flakes.push(createFlake(true));
    if (flakes.length > target) flakes.length = target;
    render(0, performance.now()); wake();
  }
  function render(dt, now) {
    ctx.clearRect(0, 0, width, height);
    const target = targetCount();
    while (flakes.length < target) { const f = createFlake(true); flakes.push(f); }
    if (flakes.length > target) flakes.length = target;
    const drift = Math.sin(now / 11000) * 6 + 3;
    for (const f of flakes) {
      f.phase += dt * (.35 + f.depth * .4);
      f.y += dt * f.speed;
      f.x += dt * (drift * (.4 + f.depth) + Math.sin(f.phase) * f.sway);
      if (f.x > width + 12) f.x = -12;
      if (f.x < -12) f.x = width + 12;
      if (f.y > height + 10) { Object.assign(f, createFlake(false)); continue; }
      ctx.globalAlpha = f.alpha;
      const r = f.r;
      if (f.crystal) {
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.phase * .25);
        ctx.strokeStyle = '#EAF6FF'; ctx.lineWidth = .7; ctx.lineCap = 'round'; ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = k * Math.PI / 3, len = r * 1.4;
          ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
        }
        ctx.stroke(); ctx.restore();
      } else {
        ctx.fillStyle = f.depth > .8 ? '#E2EFF8' : '#A8C5D9';
        ctx.beginPath(); ctx.ellipse(f.x, f.y, r * .82, r, Math.sin(f.phase) * .5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  function tick(now) {
    raf = 0;
    const dt = last === null ? 0 : Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
    render(dt, now); wake();
  }
  function wake() { if (!raf && !document.hidden && settings.enabled && !media.matches && ctx) raf = requestAnimationFrame(tick); }
  function stop() { cancelAnimationFrame(raf); raf = 0; last = null; }
  function sync() {
    const toggle = document.getElementById('snowToggle');
    if (toggle) toggle.checked = settings.enabled;
    stop(); render(0, performance.now()); wake();
  }
  const toggle = document.getElementById('snowToggle');
  if (toggle) toggle.addEventListener('input', () => {
    settings.enabled = toggle.checked;
    saveAtmosphere();
    stop(); wake();
  });
  document.addEventListener('visibilitychange', () => { stop(); if (!document.hidden) wake(); });
  window.addEventListener('resize', resize);
  media.addEventListener('change', () => { stop(); resize(); sync(); });
  resize(); sync();
})();
