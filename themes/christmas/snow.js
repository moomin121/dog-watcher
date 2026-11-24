/* 圣诞飘雪：轻量 canvas 雪层，绘制在壁纸之上、界面之下。
   雪量与落速随码字速度增大（SnowPace，与雪落主题同一套节奏模型）；
   遵循系统“减少动态”设置。 */
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

  // —— 码字节奏模型（移植自雪落 snow-model）——
  const clamp01 = n => Math.min(1, Math.max(0, n));
  function insertedCharacters(before, after, kind = 'insertText') {
    if (!/^insert/i.test(kind) || /paste|drop|replacement|history/i.test(kind)) return 0;
    let a = 0, b = before.length, c = after.length;
    while (a < b && a < c && before[a] === after[a]) a++;
    while (b > a && c > a && before[b - 1] === after[c - 1]) { b--; c--; }
    return [...after.slice(a, c)].filter(ch => !/\s/u.test(ch)).length;
  }
  function snowDensity(intensity) { return 60 + Math.pow(clamp01(intensity), .8) * 760; }
  function snowVelocity(intensity) { return 1 + clamp01(intensity) * 1.1; }
  class SnowPace {
    constructor() { this.samples = []; this.rate = 0; this.intensity = 0; }
    input(now, count) { if (Number.isFinite(count) && count > 0) this.samples.push({ at: now, count }); }
    step(now, seconds) {
      this.samples = this.samples.filter(s => s.at > now - 4000);
      this.rate = this.samples.reduce((sum, s) => sum + s.count * clamp01(1 - (now - s.at) / 4000), 0) * 30;
      const target = clamp01(this.rate / 150), dt = Math.min(.1, Math.max(0, seconds));
      this.intensity += (target - this.intensity) * (1 - Math.exp(-dt / (target > this.intensity ? .5 : 2.3)));
      if (target === 0 && this.intensity < .005) this.intensity = 0;
      return this;
    }
    reset() { this.samples = []; this.rate = 0; this.intensity = 0; }
  }
  const pace = new SnowPace();

  let width = 0, height = 0, flakes = [], last = null, raf = 0;
  function createFlake(anywhere) {
    const z = Math.random();
    return {
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : -12 - Math.random() * 40,
      r: .5 + z * 2.6, depth: z,
      speed: 10 + z * 26, phase: Math.random() * Math.PI * 2, sway: 2 + Math.random() * 8,
      alpha: .25 + z * .6, crystal: z > .88 && Math.random() > .2
    };
  }
  function targetCount() { return Math.min(1600, Math.round((width * height / 1000000) * snowDensity(pace.intensity))); }
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
    // 新雪平滑融入；停笔后多余的雪渐渐退场，不突然消失
    let additions = Math.min(12, Math.max(0, target - flakes.length));
    while (additions-- > 0) flakes.push(createFlake(true));
    const drift = Math.sin(now / 11000) * 6 + 3;
    const velocity = snowVelocity(pace.intensity);
    for (let i = flakes.length - 1; i >= 0; i--) {
      const f = flakes[i];
      const visibleTarget = i < target ? 1 : 0;
      f.visibility = (f.visibility ?? 1) + (visibleTarget - (f.visibility ?? 1)) * (1 - Math.exp(-dt / 1.2));
      if (!visibleTarget && f.visibility < .02) { flakes.splice(i, 1); continue; }
      f.phase += dt * (.35 + f.depth * .4);
      f.y += dt * f.speed * velocity;
      f.x += dt * (drift * (.4 + f.depth) + Math.sin(f.phase) * f.sway + pace.intensity * 14);
      if (f.x > width + 12) f.x = -12;
      if (f.x < -12) f.x = width + 12;
      if (f.y > height + 10) {
        if (flakes.length > target) { flakes.splice(i, 1); continue; }
        flakes[i] = createFlake(false); continue;
      }
      ctx.globalAlpha = f.alpha * Math.min(1, (f.age = (f.age ?? 2) + dt) * 1.5) * f.visibility;
      const r = f.r * (1 + pace.intensity * .12);
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
    pace.step(now, dt); render(dt, now); wake();
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
  document.addEventListener('visibilitychange', () => { stop(); pace.reset(); if (!document.hidden) wake(); });
  window.addEventListener('pagehide', stop);
  window.addEventListener('resize', resize);
  media.addEventListener('change', () => { stop(); pace.reset(); resize(); sync(); });
  resize(); sync();
  window.ChristmasSnow = {
    recordInput(before, after, kind) { const count = insertedCharacters(before, after, kind); if (count) pace.input(performance.now(), count); },
    invalidate() {},
    getState() { return { intensity: pace.intensity, rate: pace.rate, particleCount: flakes.length, targetCount: targetCount(), snowVelocity: snowVelocity(pace.intensity), running: !!raf, enabled: settings.enabled }; }
  };
})();
