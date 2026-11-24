const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL, fileURLToPath } = require('node:url');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'shared/site-nav.js'), 'utf8');
const routes = ['themes/meadow/index.html', 'themes/coastal-road/index.html', 'themes/christmas/index.html', 'write.html'];
const ids = ['meadow', 'coastal-road', 'christmas', 'dog-watcher'];

// Execute the production renderer with a minimal DOM sink and inspect the anchors
// it actually creates. This checks URL construction, not browser navigation.
function renderLinks(pageURL, scriptURL, pageId) {
  const links = [];
  const element = tag => {
    const node = {
      dataset: {}, attributes: {}, children: [],
      classList: { add() {} },
      appendChild(child) { this.children.push(child); },
      setAttribute(key, value) { this.attributes[key] = value; },
      addEventListener() {},
      closest() { return null; },
      querySelector() { return { textContent: '' }; }
    };
    if (tag === 'a') links.push(node);
    return node;
  };
  const container = element('nav');
  let boot;
  const document = {
    baseURI: pageURL.href, currentScript: { src: scriptURL.href }, readyState: 'loading',
    body: { getAttribute: () => pageId },
    createElement: element,
    querySelectorAll: () => [container],
    addEventListener(event, callback) { if (event === 'DOMContentLoaded') boot = callback; }
  };
  vm.runInNewContext(script, { document, URL });
  document.currentScript = null; // As in a real DOMContentLoaded callback.
  boot();
  return links;
}

for (const base of [pathToFileURL(root + path.sep), new URL('http://localhost:8765/'), new URL('https://moomin121.github.io/dog-watcher/')]) {
  for (const [i, route] of routes.entries()) {
    const pageURL = new URL(route, base);
    const src = new URL((route === 'write.html' ? '' : '../../') + 'shared/site-nav.js?v=17', pageURL);
    const links = renderLinks(pageURL, src, ids[i]);
    assert.deepEqual(links.map(link => link.href), routes.map(target => new URL(target, base).href));
    assert.equal(links.filter(link => link.attributes['aria-current'] === 'page').length, 1);
    assert.equal(links[i].attributes['aria-current'], 'page');
    for (const link of links) {
      const url = new URL(link.href);
      const file = url.protocol === 'file:' ? fileURLToPath(url) : path.join(root, routes[links.indexOf(link)]);
      assert.ok(fs.statSync(file).isFile(), `navigation must target a file: ${link.href}`);
    }
  }
}
console.log('PASS: rendered navigation targets real HTML files across file://, localhost and GitHub Pages (48 links)');
