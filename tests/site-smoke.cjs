const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const nav = require(path.join(ROOT, 'shared/site-nav.js'));
const pages = [
  { file: 'write.html', id: 'dog-watcher', shared: 'shared/site-nav.js' },
  { file: 'themes/meadow/index.html', id: 'meadow', shared: '../../shared/site-nav.js' }
];
const local = (p) => path.join(ROOT, p);
const exists = (p) => fs.existsSync(local(p));
const source = (p) => fs.readFileSync(local(p), 'utf8');

assert.equal(nav.folders.length, 2);
assert.deepEqual(nav.folders.map((f) => f.label), ['码字主题', '其他']);
assert.deepEqual(nav.folders.flatMap((f) => f.items.map((i) => i.title)), ['风吹草低', '狗狗督查']);
for (const folder of nav.folders) for (const item of folder.items) {
  assert.match(item.href, /^(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\/$|^[a-z0-9_-]+\.html$/i);
  assert.ok(exists(item.href.replace(/\/$/, '/index.html')), `missing route: ${item.href}`);
}

for (const page of pages) {
  const html = source(page.file);
  assert.match(html, new RegExp(`<body[^>]*data-page-id=["']${page.id}["']`));
  assert.match(html, new RegExp(`(?:href|src)=["']${page.shared.replaceAll('/', '\\/')}\\?v=14["']`));
  assert.match(html, /class=["']site-nav["']/);
  assert.match(html, new RegExp(`<title>[^<]*(?:${page.id === 'meadow' ? '风吹草低' : '狗狗督查'})`));
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
    ? 'https://moomin121.github.io/dog-watcher/shared/site-nav.js?v=14'
    : 'https://moomin121.github.io/dog-watcher/themes/meadow/../../shared/site-nav.js?v=14');
  const root = new URL('../', scriptUrl);
  return nav.folders.flatMap((f) => f.items.map((i) => new URL(i.href, root).href));
}
const expected = [
  'https://moomin121.github.io/dog-watcher/themes/meadow/',
  'https://moomin121.github.io/dog-watcher/write.html'
];
for (const page of pages) assert.deepEqual(navUrls(page.file), expected);

console.log('PASS: shared navigation config and routes');
console.log('PASS: both pages mount the same navigation and page ids');
console.log('PASS: meadow local assets and JavaScript syntax');
console.log('PASS: GitHub Pages root URL resolution from both page depths');
