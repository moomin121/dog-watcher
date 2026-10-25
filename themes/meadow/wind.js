(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const { VideoPace, WindModel, insertedCharacters, clamp, atmosphereForTier } = window.MeadowWindMath;
  const video = $('meadowVideo'), sun = $('meadowSun');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const pace = new VideoPace(), wind = new WindModel();
  const motion = new VideoPace({ adaptive: true });
  const key = 'writing-skin:sunny-meadow:video-atmosphere:fix';
  const defaults = { motion: true, particles: true, sunlight: true, sound: true, particleRate: 50, sunStrength: 50, volume: 24, pauseSeconds: 0, fastRate: 1.5 };
  const settings = { ...defaults };
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    for (const k of Object.keys(defaults)) {
      if (typeof defaults[k] === 'boolean' && typeof saved?.[k] === 'boolean') settings[k] = saved[k];
      if (typeof defaults[k] === 'number' && Number.isFinite(saved?.[k])) settings[k] = clamp(saved[k], 0, 100);
    }
  } catch {}
  settings.pauseSeconds = [0, 1, 2, 3, 4, 5, 8, 10].includes(settings.pauseSeconds) ? settings.pauseSeconds : 0;
  settings.fastRate = Math.round(clamp(settings.fastRate, 1, 2) * 10) / 10;
  motion.fastRate = settings.fastRate;
  motion.setPauseSeconds(settings.pauseSeconds);
  const canvas = document.createElement('canvas');
  canvas.className = 'meadow-particles'; canvas.setAttribute('aria-hidden', 'true'); document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  // activeSmooth：随「是否有输入」平滑淡入淡出，驱动阳光与风声的停止
  let particles = [], raf = 0, last = null, ready = false, failed = false, blocked = false, pending = false, firstInput = false, audio = null, emittedLeaves = 0, audioTarget = 0, statusAt = 0, activeSmooth = 0, lastCaret = null, lastEmission = -Infinity;
  const toggles = { motion: 'motionToggle', particles: 'particlesToggle', sunlight: 'sunlightToggle', sound: 'soundToggle' };
  const sliders = { particleRate: 'particles', sunStrength: 'sunlight', volume: 'sound' };
  function updateControls() {
    $('fastRate').value = settings.fastRate;
    $('fastRate').disabled = !settings.motion || reduced.matches;
    $('fastRateValue').textContent = `${settings.fastRate.toFixed(1)}×`;
    $('tierRatesHint').textContent = `慢档 0.45× · 中档 1.0× · 快档 ${settings.fastRate.toFixed(1)}×`;
    $('pauseSeconds').value = settings.pauseSeconds;
    $('pauseSeconds').disabled = !settings.motion || reduced.matches;
    $('pauseSecondsHint').textContent = settings.pauseSeconds ? `从最后一次真实落字开始计时，${settings.pauseSeconds} 秒时完全暂停，之前平滑减速。仅影响视频，较短时间可能出现字间启停。` : '自动适应近期输入间隔，停笔约7.2秒后减速，8.2–10秒内暂停。仅影响视频，风声和草叶保持原效果。';
    for (const [k, id] of Object.entries(toggles)) { $(id).checked = settings[k]; $(id).disabled = k !== 'sound' && reduced.matches; }
    for (const [k, owner] of Object.entries(sliders)) {
      const el = $(k === 'volume' ? 'windVolume' : k); el.value = settings[k]; $(`${el.id}Value`).textContent = `${settings[k]}%`;
      el.disabled = !settings[owner] || (owner !== 'sound' && reduced.matches);
    }
    $('atmosphereHint').textContent = reduced.matches ? '已遵循系统“减少动态”设置，使用静态封面。' : failed ? '视频加载失败，已回退到静态封面。' : settings.pauseSeconds ? `背景连贯优先：停笔 ${settings.pauseSeconds} 秒后暂停，之前平滑减速；风声和草叶仍按原节奏淡出。` : '背景连贯优先：逐字输入保持运动，停笔约 7.2 秒后渐慢，按近期节奏在 8.2–10 秒内收住；风声和草叶仍按原节奏淡出。';
    $('soundHint').textContent = !settings.sound ? '风声已关闭' : !firstInput ? 'v1 风声：输入后开启，音量随码字速度变化' : 'v1 风声：慢打轻、快打响，停笔后淡出';
  }
  function wake() { if (!raf && !document.hidden) raf = requestAnimationFrame(tick); }
  function invalidate() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0); wake();
  }
  // 播放入口使用独立 motion 状态；氛围 pace 可先淡出，视频仍保持连贯
  function syncVideo() {
    const canPlay = settings.motion && !reduced.matches && ready && !failed && !document.hidden && motion.active;
    const showFrame = settings.motion && !reduced.matches && ready && !failed;
    // 暂停时保持当前帧可见，不退回封面；reduced/failed 才隐藏
    video.style.visibility = showFrame ? 'visible' : 'hidden';
    if (canPlay) {
      // playbackRate 下限 .1：逼近 0 时不设 0，改用暂停
      video.playbackRate = Math.max(.1, motion.playbackRate);
      if (video.paused && !pending) {
        pending = true;
        video.play().then(() => {
          blocked = false;
          // 异步 resolve 后再次校验，消除 play 完成后误启动风险
          if (!motion.active || !settings.motion || reduced.matches || document.hidden) video.pause();
        }).catch(() => { blocked = true; video.pause(); }).finally(() => { pending = false; updateControls(); wake(); });
      }
    } else {
      video.pause();
    }
  }
  function ensureAudio() {
    if (!firstInput || !settings.sound || document.hidden) return;
    if (!pace.active) return;
    if (!audio) { audio = new Audio('assets/caoyuan.mp3'); audio.loop = true; audio.volume = 0; }
    if (audio.paused) audio.play().then(updateControls).catch(updateControls);
  }
  function tick(now) {
    raf = 0;
    if (document.hidden) { last = null; return; }
    const dt = last === null ? 0 : Math.min(.1, (now - last) / 1000); last = now;
    pace.step(now, dt); motion.step(now, dt); wind.step(now, dt);
    const idle = now - pace.lastInputAt;
    const release = pace.active ? clamp(1 - (idle - 350) / 550) : 0;
    // 阳光/风声随输入淡入、停笔淡出
    activeSmooth += (release - activeSmooth) * (1 - Math.exp(-dt / .3));
    syncVideo();
    ensureAudio();
    const sunBase = settings.sunlight && !reduced.matches ? ((.1 + .2 * wind.sun) * settings.sunStrength / 100) : 0;
    sun.style.opacity = String(sunBase * activeSmooth);
    if (now - statusAt > 200) {
      const tierName = { idle: '空闲', slow: '慢档', medium: '中档', fast: '快档' }[motion.tier];
      const videoStatus = failed ? '背景视频加载失败 · 请刷新重试' : reduced.matches ? '系统减少动态 · 静态背景' : !settings.motion ? '背景动画已关闭 · 可在背景面板开启' : !ready ? '背景视频加载中…' : blocked ? '背景播放受限 · 请点击正文后输入' : motion.active ? `${tierName} · ${motion.playbackRate.toFixed(2)}× · 节奏 ${Math.round(motion.rate)} 字/分` : !firstInput ? '背景已就绪 · 在正文输入后启动动画' : '停笔 · 背景已暂停，继续输入恢复';
      $('videoPaceStatus').textContent = videoStatus;
      const status = $('backgroundStatus');
      if (status) status.textContent = videoStatus;
      statusAt = now;
    }
    if (audio) {
      const target = settings.sound ? settings.volume / 100 * atmosphereForTier(pace.tier).gain * activeSmooth : 0;
      audioTarget = target;
      audio.volume += (target - audio.volume) * (1 - Math.exp(-dt / .4));
      if (!pace.active && audio.volume < .003 && !audio.paused) audio.pause();
    }
    if (ctx) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      const r = $('editorScroll').getBoundingClientRect(); ctx.save(); ctx.beginPath(); ctx.rect(r.left, r.top, r.width, r.height); ctx.clip();
      particles = particles.filter(p => p.age < p.life);
      for (const p of particles) {
        p.age += dt; p.x -= (25 + wind.wind * 35) * dt; p.y += p.vy * dt; p.vy += 14 * dt;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.age * 2); ctx.globalAlpha = .7 * Math.sin(Math.PI * Math.min(1, p.age / p.life)); ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * .38, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      ctx.restore();
    }
    const busy = motion.active || pace.active || particles.length || (audio && !audio.paused) || Math.abs(activeSmooth) > .002;
    if (busy || settings.sunlight) wake();
    else last = null;
  }
  function recordInput(before, after, inputType, caret) {
    const count = insertedCharacters(before, after, inputType);
    if (!count || document.hidden) return;
    const now = performance.now();
    pace.input(now, count); motion.input(now, count); wind.input(now, count); firstInput = true;
    if (ctx && settings.particles && settings.particleRate > 0 && !reduced.matches && caret && now - lastEmission > 70) {
      lastEmission = now;
      const amount = Math.min(3, Math.ceil(count * settings.particleRate / 100));
      for (let i = 0; i < amount && particles.length < 30; i++) {
        particles.push({ x: caret.x + 5, y: caret.y, age: 0, life: 1.2, vy: -20, size: 3 + Math.random() * 2, color: `hsl(${60 + Math.random() * 40} 40% 40%)` }); emittedLeaves++;
      }
    }
    if (caret) lastCaret = { x: caret.x, y: caret.y };
    ensureAudio(); updateControls(); wake();
  }
  function save() { try { localStorage.setItem(key, JSON.stringify(settings)); } catch {} }
  for (const [k, id] of Object.entries(toggles)) $(id).addEventListener('change', e => {
    settings[k] = e.target.checked;
    if (k === 'motion' && !settings.motion) video.pause();
    if (k === 'particles' && !settings.particles) particles = [];
    if (k === 'sound' && !settings.sound) audio?.pause();
    save(); updateControls(); wake();
  });
  $('fastRate').addEventListener('input', e => {
    settings.fastRate = Math.round(clamp(Number(e.target.value), 1, 2) * 10) / 10;
    motion.fastRate = settings.fastRate;
    save(); updateControls(); wake();
  });
  $('pauseSeconds').addEventListener('change', e => {
    settings.pauseSeconds = Number(e.target.value);
    motion.setPauseSeconds(settings.pauseSeconds);
    save(); updateControls(); wake();
  });
  for (const k of Object.keys(sliders)) $(k === 'volume' ? 'windVolume' : k).addEventListener('input', e => { settings[k] = clamp(Number(e.target.value), 0, 100); if (k === 'particleRate' && !settings[k]) particles = []; save(); updateControls(); wake(); });
  video.muted = true; video.defaultMuted = true; video.playbackRate = .45;
  // 无 autoplay：加载完成后也不自动播放，必须等 motion.active
  video.addEventListener('loadeddata', () => { ready = true; syncVideo(); wake(); });
  video.addEventListener('playing', () => { blocked = false; updateControls(); wake(); });
  function fail() { failed = true; ready = false; video.pause(); video.style.visibility = 'hidden'; updateControls(); }
  video.addEventListener('error', fail); video.querySelector('source').addEventListener('error', fail);
  document.addEventListener('pointerdown', () => { syncVideo(); ensureAudio(); }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; last = null; particles = []; pace.reset(); motion.reset(); wind.resetInput(); activeSmooth = 0; lastCaret = null; video.pause(); audio?.pause(); }
    else { syncVideo(); ensureAudio(); wake(); }
  });
  reduced.addEventListener('change', () => { particles = []; pace.reset(); motion.reset(); if (reduced.matches) video.pause(); else syncVideo(); updateControls(); wake(); });
  window.addEventListener('resize', invalidate);
  window.addEventListener('pagehide', () => { cancelAnimationFrame(raf); raf = 0; last = null; video.pause(); audio?.pause(); });
  window.addEventListener('pageshow', () => { pace.reset(); motion.reset(); syncVideo(); invalidate(); });
  window.MeadowWind = { recordInput, invalidate, getState: () => ({ ready, failed, blocked, reducedMotion: reduced.matches, settings: { ...settings }, videoTier: motion.tier, active: motion.active, playbackRate: video.playbackRate, targetRate: motion.target, rate: motion.rate, atmosphereTier: pace.tier, atmosphereActive: pace.active, videoHardPause: motion.hardPause, videoPaused: video.paused, videoVisible: video.style.visibility, particleCount: particles.length, emittedLeaves, audioTarget, audioVolume: audio?.volume || 0, audioSource: audio?.src || null, videoMuted: video.muted, atmosphere: atmosphereForTier(pace.tier), firstInput, activeSmooth, audioState: audio ? (audio.paused ? 'paused' : 'running') : 'uninitialized' }) };
  if (video.readyState >= 2) ready = true;
  updateControls(); syncVideo(); invalidate();
})();
