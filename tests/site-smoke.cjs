const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const nav = require(path.join(ROOT, 'shared/site-nav.js'));
const pages = [
  { file: 'write.html', id: 'dog-watcher', shared: 'shared/site-nav.js' },
  { file: 'themes/meadow/index.html', id: 'meadow', shared: '../../shared/site-nav.js' },
  { file: 'themes/coastal-road/index.html', id: 'coastal-road', shared: '../../shared/site-nav.js' },
  { file: 'themes/christmas/index.html', id: 'christmas', shared: '../../shared/site-nav.js' }
];
const local = (p) => path.join(ROOT, p);
const exists = (p) => fs.existsSync(local(p));
const source = (p) => fs.readFileSync(local(p), 'utf8');

assert.equal(nav.folders.length, 2);
assert.deepEqual(nav.folders.map((f) => f.label), ['码字主题', '其他']);
assert.deepEqual(nav.folders.flatMap((f) => f.items.map((i) => i.title)), ['风吹草低', '通向海边', '圣诞快乐', '狗狗督查']);
for (const folder of nav.folders) for (const item of folder.items) {
  assert.match(item.href, /^(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.html$/i);
  assert.ok(exists(item.href.replace(/\/$/, '/index.html')), `missing route: ${item.href}`);
}

for (const page of pages) {
  const html = source(page.file);
  assert.match(html, new RegExp(`<body[^>]*data-page-id=["']${page.id}["']`));
  assert.match(html, new RegExp(`(?:href|src)=["']${page.shared.replaceAll('/', '\\/')}\\?v=17["']`));
  assert.match(html, /class=["']chapter-sidebar["']/);
  assert.match(html, /chapter-sidebar\.js\?v=2/);
  assert.ok(html.indexOf("chapter-sidebar.js") < html.indexOf("site-nav.js"), "chapter sidebar must mount before site links");
  assert.match(html, new RegExp(`<title>[^<]*(?:${page.id === 'meadow' ? '风吹草低' : page.id === 'coastal-road' ? '通向海边' : page.id === 'christmas' ? '圣诞快乐' : '狗狗督查'})`));
}

const meadow = source('themes/meadow/index.html');
assert.doesNotMatch(meadow, /id="backgroundStatus"/);
for (const page of pages) {
  const html = source(page.file);
  assert.match(html, /id="pageLoading"/);
  assert.match(html, /page-loading\.js\?v=16/);
  assert.doesNotMatch(html, /<iframe|rel="prefetch"/);
}
const dog = source('write.html');
assert.ok(Buffer.byteLength(dog) < 150000, 'dog HTML must not embed media');
assert.doesNotMatch(dog, /id="embedded(?:IdleGif|FocusMp4|BarkMp4)"/);
assert.match(dog, /<script async[^>]*id="LA_COLLECT"/);
assert.match(dog, /WriterIndent\.attach\(bodyInput\)/);
for (const asset of ['idle.gif', 'focus.mp4', 'bark.mp4']) assert.ok(exists('assets/dog/' + asset));
const indentContext = { window: {} };
vm.runInNewContext(source('shared/writer-indent.js'), indentContext);
const { normalize, apply } = indentContext.window.WriterIndent;
assert.equal(normalize('第一段\n 第二段\n　　第三段'), '　　第一段\n　　第二段\n　　第三段');
assert.equal(normalize(normalize('正文')), '　　正文');
const input = { value: '正文\n', selectionStart: 3, selectionEnd: 3, setSelectionRange(a,b) { this.selectionStart=a; this.selectionEnd=b; } };
apply(input, { inputType: 'insertLineBreak' });
assert.equal(input.value, '　　正文\n　　');
assert.equal(input.selectionStart, 7);
console.log('PASS: independent loading, extracted media, async analytics, paragraph indentation');
assert.match(meadow, /id="titleInput"[^>]*value="风吹草低"/);
assert.match(meadow, /　　动态码字主题尝试，还在调试中。背景是连续视频，叶子是程序写的特效<\/textarea>/);
const restoreBlock = source('themes/meadow/app.js').split('  try {')[1].split('  // 每段默认')[0];
const previousBody = '　　同样的鲁恩语，同样凝重而紧绷的感觉。这是哪里？我想做什么？我野象知道……周明瑞冷静了下来，无声重复了两人的问题。';
for (const saved of [null, { title: '非凡者', body: previousBody }, { title: '我的草稿', body: '自己的正文' }, { title: '非凡者', body: previousBody + '新增' }]) {
  const title = { value: '风吹草低' }, body = { value: '　　动态码字主题尝试，还在调试中。背景是连续视频，叶子是程序写的特效' };
  const ctx = { title, body, storageKey: 'test', localStorage: { getItem: () => JSON.stringify(saved), setItem: () => {} }, snapshot: () => ({title:title.value,body:body.value}), $: () => ({textContent:''}) };
  vm.runInNewContext('try {' + restoreBlock, ctx);
  const preserved = saved && !(saved.title === '非凡者' && saved.body === previousBody);
  assert.equal(title.value, preserved ? saved.title : '风吹草低');
  assert.equal(body.value, preserved ? saved.body : '　　动态码字主题尝试，还在调试中。背景是连续视频，叶子是程序写的特效');
}
console.log('PASS: preset migration preserves edited drafts');
assert.match(meadow, /app\.js\?v=18/);
assert.match(meadow, /wind\.js\?v=17/);
assert.match(source('themes/meadow/wind.js'), /pauseSeconds: 0, fastRate: 1\.2/);
assert.match(meadow, /id="fastRate"[^>]*value="1\.2"/);
assert.match(meadow, /默认 1\.2×/);
assert.match(source('themes/meadow/wind.js'), /背景已就绪 · 在正文输入后启动动画/);
assert.match(source('themes/meadow/wind.js'), /!document\.hidden && motion\.active/);
assert.match(meadow, /assets\/stats-visual\.gif/);
assert.ok(exists('themes/meadow/assets/stats-visual.gif'));
const assetRefs = [...meadow.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)].map((m) => m[1]);
for (const ref of assetRefs.filter((ref) => !/^(?:https?:|data:|#)/.test(ref))) {
  assert.ok(fs.existsSync(path.resolve(local('themes/meadow'), ref)), `missing meadow asset: ${ref}`);
}
for (const file of ['shared/site-nav.js', 'shared/chapter-sidebar.js', 'themes/meadow/app.js', 'themes/meadow/wind.js', 'themes/meadow/wind-model.js']) {
  new vm.Script(source(file), { filename: file });
}
for (const name of ['search']) {
  assert.ok(fs.statSync(local(`assets/sidebar/sidebar-icon-${name}.svg`)).size > 0, `missing sidebar icon: ${name}`);
}

require('./navigation-targets.cjs');

console.log('PASS: shared navigation config and routes');
console.log('PASS: both pages mount the same navigation and page ids');
console.log('PASS: meadow local assets and JavaScript syntax');
console.log('PASS: GitHub Pages root URL resolution from both page depths');

const coastal = source('themes/coastal-road/index.html');
assert.match(coastal, /value="通向海边"/);
assert.match(coastal, /另一个调试中的动态码字主题，这个是纯代码写的背景动画<\/textarea>/);
assert.match(source('themes/coastal-road/app.js'), /coastal-road-pages:v1/);
for (const ref of [...coastal.matchAll(/(?:src|href)=["']([^"'#?]+)(?:\?[^"']*)?["']/g)].map(m=>m[1]).filter(x=>!/^https?:/.test(x))) {
  assert.ok(fs.existsSync(path.resolve(local('themes/coastal-road'),ref)), `missing coastal asset: ${ref}`);
}
console.log('PASS: coastal independent route, presets and all HTML asset references');

// —— file:// 兼容：动效必须是打包后的经典脚本（file:// 拦截 ES 模块与本地图片 WebGL 纹理）——
assert.doesNotMatch(coastal, /<script[^>]*type="module"/); // ES 模块在 file:// 下整条不可加载
assert.match(coastal, /<script src="motion-bundle\.js\?v=\d+" defer><\/script>/);
assert.ok(exists('themes/coastal-road/motion-bundle.js'), 'missing coastal motion bundle');
assert.ok(exists('themes/coastal-road/build-motion.sh'), 'missing coastal motion build script');
for (const t of ['first-frame.texture.jpg', 'distant-plate.texture.jpg', 'field-texture.texture.jpg', 'roadside-atlas.texture.webp']) {
  assert.ok(exists(`themes/coastal-road/assets/${t}`), `missing coastal texture variant: ${t}`);
}
new vm.Script(source('themes/coastal-road/motion-bundle.js'), { filename: 'themes/coastal-road/motion-bundle.js' });
console.log('PASS: coastal motion ships as classic bundle with inlined textures for file://');

const christmas = source('themes/christmas/index.html');
assert.match(christmas, /value="圣诞快乐"/);
assert.match(christmas, /　　圣诞快乐！雪夜市集的灯一盏盏亮着，陪你在长夜里慢慢写字。<\/textarea>/);
assert.match(source('themes/christmas/app.js'), /christmas-pages:v1/);
assert.match(christmas, /id="snowCanvas"/);
assert.match(christmas, /wallpaper-layer wallpaper-dim/);
assert.match(christmas, /wallpaper-layer wallpaper-bright/);
assert.match(source('themes/christmas/app.js'), /lightOpacities/);
assert.match(christmas, /type="number" id="brightCount" min="500" max="20000" step="100" value="5000"/);
for (const ref of [...christmas.matchAll(/(?:src|href)=["']([^"'#?]+)(?:\?[^"']*)?["']/g)].map(m=>m[1]).filter(x=>!/^https?:/.test(x))) {
  assert.ok(fs.existsSync(path.resolve(local('themes/christmas'),ref)), `missing christmas asset: ${ref}`);
}
for (const level of ['wallpaper-dim', 'wallpaper-low', 'wallpaper-mid', 'wallpaper-bright']) {
  assert.ok(exists(`themes/christmas/assets/${level}.png`), `missing christmas wallpaper level: ${level}`);
}
// 达标奖励层：达到目标字数仍是原四档最亮图，超出一个字才换满月市集新图
assert.match(christmas, /wallpaper-layer wallpaper-goal/);
assert.ok(exists('themes/christmas/assets/wallpaper-goal.jpg'), 'missing christmas goal wallpaper');
assert.match(source('themes/christmas/app.js'), /--winter-bg-goal.*count > brightCount/);
// 奖励壁纸必须与四档壁纸同尺寸（1672×941），否则同宽度适应下构图比例不一致
function jpegSize(path) {
  const buf = fs.readFileSync(path);
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    i += 2 + len;
  }
  return null;
}
function pngSize(path) {
  const buf = fs.readFileSync(path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
const goalDims = jpegSize(local('themes/christmas/assets/wallpaper-goal.jpg'));
const tierDims = pngSize(local('themes/christmas/assets/wallpaper-bright.png'));
assert.deepEqual(goalDims, tierDims, `goal wallpaper ${JSON.stringify(goalDims)} must match tier wallpaper ${JSON.stringify(tierDims)}`);
assert.deepEqual(goalDims, { width: 1672, height: 941 });
for (const file of ['themes/christmas/app.js', 'themes/christmas/snow.js', 'themes/christmas/stats.js']) {
  new vm.Script(source(file), { filename: file });
}
console.log('PASS: christmas dark route, word-count wallpaper gradient, snow layer and asset references');

// —— 圣诞页目录：与其他页面共用同一结构，仅深浅取色差异（:root 映射到主题变量）——
const christmasStyles = source('themes/christmas/styles.css');
assert.match(christmasStyles, /\.wallpaper-goal\{background-image:url\("assets\/wallpaper-goal\.jpg\?v=\d+"\)\}/); // 达标奖励层贴图（带缓存版本号）
assert.match(christmasStyles, /--ink:var\(--text\)/);
assert.match(christmasStyles, /--ink-49:var\(--muted\)/);
assert.match(christmasStyles, /--brand-weak:var\(--selected-bg\)/);
assert.doesNotMatch(christmasStyles, /\.site-nav-search\{border/); // 不给搜索框加其他页面没有的边框
assert.doesNotMatch(christmasStyles, /--ink:#[0-9a-f]/i); // 不再自创一套独立十六进制色
console.log('PASS: christmas site-nav mirrors shared structure with theme-variable palette');

// —— 深色模式图标：单色图标反白，品牌图标保持彩色 ——
assert.match(christmasStyles, /\.ic\{filter:brightness\(0\) invert\(1\)\}/);
assert.match(christmasStyles, /\.ic\[src\*="tabs-icon-workbench"\],\.ic\[src\*="tabs-icon-book"\]\{filter:none\}/);
console.log('PASS: christmas dark theme inverts monochrome icons and keeps brand icons colored');

// —— 写作区遮罩：雪落原版 .winter-scene::after 的移植，最亮档时保护正文可读性 ——
assert.match(christmasStyles, /\.wallpaper::after\{[^}]*linear-gradient\([^)]*\)[^}]*radial-gradient\(ellipse 51% 40% at 51% 40%/);
console.log('PASS: christmas writing-area scrim mirrors snowfall original over brightest wallpaper');

// —— 壁纸放置：原图大小（宽度 100% 适应）、顶部对齐（底部裁切）——
assert.match(christmasStyles, /\.wallpaper-layer\{[^}]*background-size:calc\(var\(--wallpaper-zoom,1\)\*100%\) auto/);
const christmasTheme = source('themes/christmas/theme.css');
assert.match(christmasTheme, /--wallpaper-position: ?top/);
assert.match(christmasTheme, /--wallpaper-zoom: ?1;/);
assert.match(christmas, /<option value="top" selected>顶部 · 裁底/); // 设置面板默认项同步
console.log('PASS: christmas wallpapers keep natural size width-fit anchored to top with bottom cropped');

// —— 降雪：与雪落静态页同一套模型与绘制 ——
const snow = source('themes/christmas/snow.js');
assert.match(snow, /class SnowPace/);
assert.match(snow, /function snowDensity\(intensity\) \{ return 60 \+ Math\.pow\(clamp\(intensity\), \.8\) \* 760; \}/);
assert.match(snow, /function snowVelocity\(intensity\) \{ return 1 \+ clamp\(intensity\) \* 1\.1; \}/);
assert.match(snow, /maxParticles = 1800/);
assert.match(snow, /r: near \? 1\.2 \+ Math\.random\(\) \* 1\.3 : \.3 \+ z \* 1\.05/);
assert.match(snow, /alpha \*= \.18 \+ \.82 \* clamp\(Math\.max\(dx,dy\)\/85\)/); // 正文区避让淡出
assert.match(snow, /alpha\*=\.22/); // 顶栏 / 工具栏 / 面板区避让淡出
assert.match(snow, /for\(const t of \[\.57,\.78\]\)/); // 六角雪晶分枝
assert.match(snow, /recordInput\(before,after,kind\)/);
// —— 删除倒放：删除字符驱动独立的删除节奏，方向因子翻转为上升，速度随删除强度 ——
assert.match(snow, /function deletedCharacters\(before, after, kind = 'deleteContentBackward'\)/);
assert.match(snow, /deletePace\.input\(now,del\)/);      // 删除事件进入独立节奏通道
assert.match(snow, /now - lastDeleteAt < 900/);          // 停删 900ms 后恢复下落，不留拖尾
assert.match(snow, /f\.speed \* snowVelocity\(activeIntensity\(\)\) \* direction/); // 垂直速度带方向
assert.match(snow, /nf\.y=height\+15\+Math\.random\(\)\*50/); // 倒放时从底部重新进入
console.log('PASS: christmas snow ports the snowfall pace model and reverses while deleting');

// —— 打字特效与音效（对照 Figma Make 移植）：Jingle Bells 逐音符 + 光标处表情/铃光/粒子绽放 ——
assert.match(christmas, /typing-fx\.js\?v=\d+/);
assert.match(christmas, /id="typingSparkleToggle"/);
assert.match(christmas, /id="typingSoundToggle"/);
const typingFx = source('themes/christmas/typing-fx.js');
assert.match(typingFx, /writing-skin:christmas:atmosphere:v1/); // 与飘雪/最亮档字数共用且合并写
assert.match(typingFx, /AudioContext/);                          // 音效为 WebAudio 合成，无音频文件
assert.match(typingFx, /659\.25, 659\.25, 659\.25/);             // 副歌旋律开头（E E E）
assert.match(typingFx, /783\.99, 523\.25, 587\.33/);             // 副歌段 E G C D E
assert.match(typingFx, /783\.99, 783\.99, 698\.46, 587\.33, 523\.25/); // 副歌第二段结尾 G G F D C
assert.match(typingFx, /392\.00, 659\.25, 587\.33, 523\.25, 392\.00/); // 主歌开头 Dashing through the snow（G4 E5 D5 C5 G4）
assert.match(typingFx, /880\.00/);                                // 主歌最高音 A5（a sleighing song tonight）
assert.match(typingFx, /'❄️', delay: 0/);                        // 4 个发光 emoji 绽放
assert.match(typingFx, /type-fx-bell|type-fx-dot/);              // 铃铛光斑 + 八方粒子
assert.match(typingFx, /insertText\|insertCompositionText/);     // 只响应真实键入，粘贴/撤销不触发
assert.match(typingFx, /FX_MIN_INTERVAL = 700/);                 // 特效节流：连续键入不密集
assert.match(typingFx, /SOUND_MIN_INTERVAL = 100/);              // 音符节流：跟得上较快打字
assert.match(typingFx, /BASE_OPACITY/);                          // 元素变淡，不干扰正文
new vm.Script(typingFx, { filename: 'themes/christmas/typing-fx.js' });
assert.match(christmasStyles, /\.type-fx-emoji\{[^}]*font-size:13px/); // emoji 缩小
assert.match(christmasStyles, /\.type-fx-bell\{[^}]*#ef4444/);
assert.match(christmasStyles, /\.type-fx-layer\{[^}]*z-index:1/);      // 特效层在 .app(z-index:2) 之下：渲染在文字后方
console.log('PASS: christmas typing burst effects and Jingle Bells full-chorus note-per-keystroke sound');
