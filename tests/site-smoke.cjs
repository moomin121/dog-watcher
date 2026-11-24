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
  assert.match(item.href, /^(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\/$|^[a-z0-9_-]+\.html$/i);
  assert.ok(exists(item.href.replace(/\/$/, '/index.html')), `missing route: ${item.href}`);
}

for (const page of pages) {
  const html = source(page.file);
  assert.match(html, new RegExp(`<body[^>]*data-page-id=["']${page.id}["']`));
  assert.match(html, new RegExp(`(?:href|src)=["']${page.shared.replaceAll('/', '\\/')}\\?v=15["']`));
  assert.match(html, /class=["']site-nav["']/);
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
for (const file of ['shared/site-nav.js', 'themes/meadow/app.js', 'themes/meadow/wind.js', 'themes/meadow/wind-model.js']) {
  new vm.Script(source(file), { filename: file });
}

function navUrls(pagePath) {
  const scriptUrl = new URL(pagePath === 'write.html'
    ? 'https://moomin121.github.io/dog-watcher/shared/site-nav.js?v=15'
    : 'https://moomin121.github.io/dog-watcher/themes/meadow/../../shared/site-nav.js?v=15');
  const root = new URL('../', scriptUrl);
  return nav.folders.flatMap((f) => f.items.map((i) => new URL(i.href, root).href));
}
const expected = [
  'https://moomin121.github.io/dog-watcher/themes/meadow/',
  'https://moomin121.github.io/dog-watcher/themes/coastal-road/',
  'https://moomin121.github.io/dog-watcher/themes/christmas/',
  'https://moomin121.github.io/dog-watcher/write.html'
];
for (const page of pages) assert.deepEqual(navUrls(page.file), expected);

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
for (const file of ['themes/christmas/app.js', 'themes/christmas/snow.js', 'themes/christmas/stats.js']) {
  new vm.Script(source(file), { filename: file });
}
console.log('PASS: christmas dark route, word-count wallpaper gradient, snow layer and asset references');

// —— 圣诞页目录：与其他页面共用同一结构，仅深浅取色差异（:root 映射到主题变量）——
const christmasStyles = source('themes/christmas/styles.css');
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
console.log('PASS: christmas snow ports the snowfall pace model and rendering dims');
