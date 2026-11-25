/* 圣诞飘雪：与雪落主题（writing-skins/snowfall）同一套实现，
   除存储键与设置项适配外，雪花模型、节奏模型与绘制逻辑保持一致。
   绘制在壁纸之上、界面之下（canvas z-index 5 > app 1），遵循系统"减少动态"设置。 */
(() => {
  'use strict';
  const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
  function insertedCharacters(before, after, kind = 'insertText') {
    if (!/^insert/i.test(kind) || /paste|drop|replacement|history/i.test(kind)) return 0;
    let a = 0, b = before.length, c = after.length;
    while (a < b && a < c && before[a] === after[a]) a++;
    while (b > a && c > a && before[b - 1] === after[c - 1]) { b--; c--; }
    return [...after.slice(a, c)].filter(ch => !/\s/u.test(ch)).length;
  }
  // 删除的字符数：与 insertedCharacters 对称，驱动“雪倒着下”的节奏
  function deletedCharacters(before, after, kind = 'deleteContentBackward') {
    if (!/^(delete|history|cut)/i.test(kind)) return 0;
    let a = 0, b = before.length, c = after.length;
    while (a < b && a < c && before[a] === after[a]) a++;
    while (b > a && c > a && before[b - 1] === after[c - 1]) { b--; c--; }
    return [...before.slice(a, b)].filter(ch => !/\s/u.test(ch)).length;
  }
  function snowDensity(intensity) { return 60 + Math.pow(clamp(intensity), .8) * 760; }
  function snowVelocity(intensity) { return 1 + clamp(intensity) * 1.1; }
  class SnowPace {
    constructor() { this.samples = []; this.rate = 0; this.intensity = 0; }
    input(now, count) { if (Number.isFinite(count) && count > 0) this.samples.push({at: now, count}); }
    step(now, seconds) {
      this.samples = this.samples.filter(s => s.at > now - 4000);
      this.rate = this.samples.reduce((sum, s) => sum + s.count * clamp(1 - (now - s.at) / 4000), 0) * 30;
      const target = clamp(this.rate / 150), dt = clamp(seconds, 0, .1);
      this.intensity += (target - this.intensity) * (1 - Math.exp(-dt / (target > this.intensity ? .5 : 2.3)));
      if (target === 0 && this.intensity < .005) this.intensity = 0;
      return this;
    }
    reset() { this.samples = []; this.rate = 0; this.intensity = 0; }
  }

  const canvas = document.getElementById('snowCanvas'), ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;
  const media = matchMedia('(prefers-reduced-motion: reduce)'), pace = new SnowPace(), deletePace = new SnowPace();
  // 方向因子：+1 正常下落；活跃删除（900ms 内有删除事件且删除节奏压过打字）时平滑过渡到 -1，雪倒着下
  let direction = 1, lastDeleteAt = -Infinity;
  // 圣诞页只暴露"飘雪开关"；amount / quietText 沿用雪落默认值（100 / true）。
  const key = 'writing-skin:christmas:atmosphere:v1';
  const settings = {enabled: true, amount: 100, quietText: true};
  try { const s = JSON.parse(localStorage.getItem(key) || 'null'); if (s && typeof s.enabled === 'boolean') settings.enabled = s.enabled; } catch {}
  // 与 app.js 共用同一存储：写入时保留其他字段（如 brightCount）
  function saveAtmosphere() {
    try {
      let merged = {};
      try { merged = JSON.parse(localStorage.getItem(key) || 'null') || {}; } catch {}
      localStorage.setItem(key, JSON.stringify(Object.assign(merged, {enabled: settings.enabled})));
    } catch {}
  }
  let width = 0, height = 0, flakes = [], last = null, raf = 0, uiAt = 0, rect = null, controls = [], maxParticles = 1800;
  function createFlake(anywhere = false) {
    const z = Math.random(), near = z > .89;
    return {x: Math.random() * width, y: anywhere ? Math.random() * height : -15 - Math.random() * 50,
      r: near ? 1.2 + Math.random() * 1.3 : .3 + z * 1.05, depth: z,
      speed: 11 + z * 30, phase: Math.random() * Math.PI * 2, sway: 2 + Math.random() * 10,
      alpha: .18 + z * .68, crystal: near && Math.random() > .15, age: anywhere ? 2 : 0, visibility: 1};
  }
  // 两路节奏中更活跃的一路驱动密度与速度；删除越快，倒放越快
  const activeIntensity = () => Math.max(pace.intensity, deletePace.intensity);
  function targetCount() { return Math.min(maxParticles, Math.round((width * height / 1000000) * snowDensity(activeIntensity()) * settings.amount / 100)); }
  function measure() {
    rect = document.querySelector('.paper')?.getBoundingClientRect();
    controls = [...document.querySelectorAll('.toolbar,.titlebar,.stats:not([hidden]),.statusbar')].map(e=>e.getBoundingClientRect()).filter(r=>r.width && r.height);
  }
  // Geometry is refreshed on layout changes, never measured per particle.
  function resize() {
    width = innerWidth; height = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    flakes = Array.from({length:targetCount()},()=>createFlake(true)); measure(); render(0,performance.now()); wake();
  }
  function render(dt, now) {
    ctx.clearRect(0,0,width,height);
    if (!settings.enabled) return;
    const target = targetCount();
    // Fade new density into the whole scene; retire excess flakes smoothly after slowing down.
    let additions = Math.min(12, Math.max(0,target-flakes.length));
    while (additions-- > 0) { const f=createFlake(true); f.age=0; flakes.push(f); }
    const drift = Math.sin(now / 11000) * 6 + 3;
    for (let i=flakes.length-1;i>=0;i--) {
      const f=flakes[i]; f.age+=dt;
      const visibleTarget=i<target?1:0; f.visibility += (visibleTarget-f.visibility)*(1-Math.exp(-dt/1.2));
      if(!visibleTarget&&f.visibility<.02){flakes.splice(i,1);continue;}
      f.phase += dt * (.35 + f.depth * .4);
      // 垂直速度带方向：删除时 direction 为负，雪花向上（倒放）；速度随更活跃节奏放大
      f.y += dt * f.speed * snowVelocity(activeIntensity()) * direction;
      // 横向风也随方向反转：打字向右吹、删除向左吹
      f.x += dt * (drift * (.4 + f.depth) + Math.sin(f.phase) * f.sway + (pace.intensity - deletePace.intensity) * 16);
      if (f.x>width+20) f.x=-20; if(f.x < -20)f.x=width+20;
      if (direction < 0) {
        // 倒放：从顶部升出的雪花重新从底部进入
        if (f.y < -20) {if(flakes.length>target){flakes.splice(i,1);continue;} const nf=createFlake(); nf.y=height+15+Math.random()*50; flakes[i]=nf;continue;}
      } else {
        if(f.y>height+16) {if(flakes.length>target){flakes.splice(i,1);continue;} flakes[i]=createFlake();continue;}
      }
      let alpha=f.alpha * Math.min(1,f.age*1.5) * f.visibility;
      if(settings.quietText && rect) {
        const dx=Math.max(rect.left-f.x,0,f.x-rect.right), dy=Math.max(rect.top-f.y,0,f.y-rect.bottom);
        alpha *= .18 + .82 * clamp(Math.max(dx,dy)/85);
      }
      if(controls.some(r=>f.x>=r.left&&f.x<=r.right&&f.y>=r.top&&f.y<=r.bottom)) alpha*=.22;
      ctx.globalAlpha=alpha;
      const r=f.r*(1+activeIntensity()*.12);
      if(f.crystal){
        ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.phase*.3);ctx.strokeStyle=f.depth>.89?'#f1f8ff':'#d6e9f4';ctx.lineWidth=f.depth>.89?.7:.5;ctx.lineCap='round';ctx.beginPath();
        for(let k=0;k<6;k++){
          const a=k*Math.PI/3, ux=Math.cos(a), uy=Math.sin(a), len=r*(f.depth>.89?1.55:1.25);
          ctx.moveTo(0,0);ctx.lineTo(ux*len,uy*len);
          for(const t of [.57,.78])for(const side of [-1,1]){const bx=ux*len*t,by=uy*len*t,ba=a+side*.78,bl=len*(.2-(t-.57)*.13);ctx.moveTo(bx,by);ctx.lineTo(bx+Math.cos(ba)*bl,by+Math.sin(ba)*bl);}
        }
        ctx.stroke();if(f.depth>.89){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,Math.max(.6,r*.2),0,Math.PI*2);ctx.fill();}ctx.restore();
      } else {
        ctx.fillStyle=f.depth>.8?'#e2eff8':'#a8c5d9';ctx.beginPath();ctx.ellipse(f.x,f.y,r*.82,r,Math.sin(f.phase)*.5,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.globalAlpha=1;
  }
  function tick(now) {
    raf=0;const dt=last===null?0:clamp((now-last)/1000,0,.05);last=now;
    pace.step(now,dt); deletePace.step(now,dt);
    // 方向平滑切换：删除节奏压过打字节奏时倒放，0.45 秒过渡避免生硬反向；
    // 删除停止 900ms 后即恢复下落，不留长拖尾
    const dirTarget = now - lastDeleteAt < 900 && deletePace.intensity > pace.intensity * .6 ? -1 : 1;
    direction += (dirTarget - direction) * (1 - Math.exp(-dt / .45));
    if (dirTarget === 1 && Math.abs(direction - 1) < .01) direction = 1;
    render(dt,now);wake();
  }
  function wake() { if(!raf&&!document.hidden&&settings.enabled&&!media.matches&&ctx) raf=requestAnimationFrame(tick); }
  function stop() {cancelAnimationFrame(raf);raf=0;last=null;}
  function sync() {
    const toggle = document.getElementById('snowToggle');
    if (toggle) toggle.checked = settings.enabled;
    stop();render(0,performance.now());wake();
  }
  const toggle = document.getElementById('snowToggle');
  if (toggle) toggle.addEventListener('input', () => { settings.enabled = toggle.checked; saveAtmosphere(); sync(); });
  document.addEventListener('visibilitychange',()=>{stop();pace.reset();deletePace.reset();direction=1;lastDeleteAt=-Infinity;if(!document.hidden){measure();sync();}});
  window.addEventListener('pagehide',stop);window.addEventListener('pageshow',()=>{pace.reset();deletePace.reset();direction=1;lastDeleteAt=-Infinity;resize();});
  window.addEventListener('resize',resize);document.getElementById('editorScroll')?.addEventListener('scroll',measure,{passive:true});
  media.addEventListener('change',()=>{pace.reset();deletePace.reset();direction=1;lastDeleteAt=-Infinity;resize();sync();});
  const observer=new ResizeObserver(measure);document.querySelector('.paper')&&observer.observe(document.querySelector('.paper'));document.querySelector('.center')&&observer.observe(document.querySelector('.center'));
  window.ChristmasSnow={
    recordInput(before,after,kind){
      const now=performance.now();
      const ins=insertedCharacters(before,after,kind);
      if(ins)pace.input(now,ins);
      const del=deletedCharacters(before,after,kind);
      if(del){deletePace.input(now,del);lastDeleteAt=now;}
    },
    invalidate:measure,
    getState:()=>({intensity:pace.intensity,deleteIntensity:deletePace.intensity,direction,
      rate:pace.rate,particleCount:flakes.length,targetCount:targetCount(),
      snowVelocity:snowVelocity(activeIntensity()),reducedMotion:media.matches,running:!!raf,settings:{...settings}})
  };
  resize();sync();
})();
