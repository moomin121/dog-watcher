(function (root) {
  'use strict';
  function countWords(text) {
    const han = text.match(/\p{Script=Han}/gu) || [];
    const other = text.replace(/\p{Script=Han}/gu, ' ').match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || [];
    return han.length + other.length;
  }
  function formatTime(ms) {
    const seconds = Math.floor(Math.max(0, ms) / 1000);
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
  }
  class WritingSession {
    constructor() { this.lastInput = null; this.accountedAt = null; this.activeMs = 0; this.idleMs = 0; this.samples = []; this.visible = true; }
    tick(now) {
      if (this.accountedAt !== null && this.visible) {
        const delta = Math.max(0, now - this.accountedAt);
        const active = Math.min(delta, Math.max(0, this.lastInput + 4000 - this.accountedAt));
        this.activeMs += active;
        this.idleMs += delta - active;
      }
      if (this.accountedAt !== null) this.accountedAt = now;
      this.samples = this.samples.filter(sample => sample.at > now - 60000);
    }
    input(now, before, after, inputType) {
      this.tick(now);
      this.lastInput = now;
      this.accountedAt = now;
      const added = Math.max(0, countWords(after) - countWords(before));
      if (added && !/paste|drop|history/i.test(inputType || '')) this.samples.push({ at: now, count: added });
    }
    setVisible(now, value) { this.tick(now); this.visible = value; }
    speed(now) { this.tick(now); return this.samples.reduce((total, sample) => total + sample.count, 0); }
  }
  const api = { countWords, formatTime, WritingSession };
  root.MeadowStats = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
