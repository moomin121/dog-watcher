(() => {
  'use strict';
  const normalize = value => value.split('\n').map(line => line.trim() ? '\u3000\u3000' + line.replace(/^[\t \u3000]+/, '') : line).join('\n');
  function apply(body, event = {}) {
    if (event.isComposing || /^(history|delete)/.test(event.inputType || '')) return;
    const value = body.value, start = body.selectionStart, end = body.selectionEnd;
    let next = normalize(value), a = normalize(value.slice(0, start)).length, b = normalize(value.slice(0, end)).length;
    if (['insertLineBreak', 'insertParagraph'].includes(event.inputType) && start === end && (start === 0 || value[start - 1] === '\n') && !next.slice(a).startsWith('\u3000\u3000')) {
      next = next.slice(0, a) + '\u3000\u3000' + next.slice(a); a += 2; b = a;
    }
    if (next !== value) { body.value = next; body.setSelectionRange(a, b); }
  }
  function attach(body) {
    if (body.dataset.autoIndent) return;
    body.dataset.autoIndent = 'true';
    body.value = normalize(body.value);
    let composing = false;
    body.addEventListener('compositionstart', () => { composing = true; });
    body.addEventListener('input', e => { if (!composing) apply(body, e); }, true);
    body.addEventListener('compositionend', () => {
      composing = false; apply(body, { inputType: 'insertCompositionText' });
      body.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText' }));
    });
  }
  window.WriterIndent = { normalize, apply, attach };
})();
