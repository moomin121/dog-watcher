(function (root) {
  'use strict';
  const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
  const smooth = x => x * x * (3 - 2 * x);
  class Drift {
    constructor(minSeconds, maxSeconds, random = Math.random) {
      this.min = minSeconds; this.max = maxSeconds; this.random = random;
      this.from = random(); this.to = random(); this.elapsed = 0;
      this.duration = minSeconds + random() * (maxSeconds - minSeconds);
    }
    step(dt) {
      this.elapsed += dt;
      if (this.elapsed >= this.duration) {
        this.from = this.to; this.to = this.random(); this.elapsed %= this.duration;
        this.duration = this.min + this.random() * (this.max - this.min);
      }
      return this.from + (this.to - this.from) * smooth(clamp(this.elapsed / this.duration));
    }
  }
  function insertedCharacters(before, after, inputType = '') {
    if (/paste|drop|history|delete|replacement/i.test(inputType)) return 0;
    let start = 0, endBefore = before.length, endAfter = after.length;
    while (start < endBefore && start < endAfter && before[start] === after[start]) start++;
    while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) { endBefore--; endAfter--; }
    return [...after.slice(start, endAfter)].filter(char => !/\s/u.test(char)).length;
  }
  class WindModel {
    constructor(random = Math.random) {
      this.samples = []; this.pace = 0; this.rate = 0; this.phase = 0;
      this.wind = .2; this.sun = .5;
      this.gust = new Drift(6, 16, random); this.light = new Drift(20, 40, random);
    }
    input(now, count) { if (count > 0) this.samples.push({ at: now, count }); }
    step(now, seconds) {
      const dt = clamp(seconds, 0, .1);
      this.samples = this.samples.filter(sample => sample.at > now - 3000);
      this.rate = this.samples.reduce((sum, sample) => sum + sample.count * clamp(1 - (now - sample.at) / 3000), 0) * 40;
      const target = clamp(this.rate / 220);
      const tau = target > this.pace ? .5 : 2;
      this.pace += (target - this.pace) * (1 - Math.exp(-dt / tau));
      const gust = this.gust.step(dt);
      this.wind = .18 + .11 * gust + .72 * this.pace * (.84 + .16 * gust);
      this.phase = (this.phase + dt * (.74 + .14 * this.pace) / 5.2) % 1;
      this.sun = this.light.step(dt);
      return this;
    }
    resetInput() { this.samples = []; this.pace = 0; this.rate = 0; }
  }
  // 视频节奏：初始 idle 暂停；首个真实提交立即进 slow；按最近输入间隔/字数估计速率。
  // 默认实例：停笔 450ms 后开始减速（target 置 0），900ms 硬暂停；响应平滑时间常数约 0.18s。
  // 自适应视频实例：真正停笔约 7.2s 后才开始减速，按近期间隔在 8.2~10s 内暂停。
  // 这样逐字输入不会被短暂字间停顿打断，同时仍会在明确停笔后收住。
  const RATES = { idle: 0, slow: .45, medium: 1, fast: 2 };
  const TAU = .18;             // 秒，平滑时间常数
  const DECEL_DELAY = 450;     // 毫秒，默认氛围：最后提交后开始减速
  const HARD_PAUSE = 900;      // 毫秒，默认氛围：最后提交后硬暂停
  const ADAPTIVE_DECEL_DELAY = 7200; // 毫秒，自适应视频开始减速
  const ADAPTIVE_PAUSE_MIN = 8200; // 毫秒，自适应视频硬暂停下限
  const ADAPTIVE_PAUSE_MAX = 10000; // 毫秒，自适应视频硬暂停上限
  const GAP_FACTOR = 2.5;      // 间隔中位数放大倍数
  const GAP_WINDOW = 8;        // 最多保留的间隔样本数
  const MAX_EVENTS = 6;        // 仅保留最近六次真实提交
  const FAST_RATE = 200;       // 字/分，升 fast 阈值
  const MEDIUM_RATE = 80;      // 字/分，升 medium 阈值
  function rateToTier(rate) {
    if (rate >= FAST_RATE) return 'fast';
    if (rate >= MEDIUM_RATE) return 'medium';
    return 'slow';
  }
  class VideoPace {
    constructor(options = {}) {
      this.decelDelay = options.decelDelay ?? (options.adaptive ? ADAPTIVE_DECEL_DELAY : DECEL_DELAY);
      this.pauseBase = options.hardPause ?? (options.adaptive ? ADAPTIVE_PAUSE_MIN : HARD_PAUSE);
      this.adaptive = options.adaptive ?? false;
      this.fastRate = Number.isFinite(options.fastRate) ? clamp(options.fastRate, 1, 2) : 2;
      this.reset();
    }
    setPauseSeconds(seconds = 0) {
      this.fixedPause = Number.isFinite(seconds) && seconds > 0 ? clamp(seconds, 1, 10) * 1000 : null;
      this.decelDelay = this.fixedPause ? Math.min(1200, this.fixedPause * .6) : (this.adaptive ? ADAPTIVE_DECEL_DELAY : DECEL_DELAY);
      this.hardPause = this.fixedPause || this.pauseBase;
    }
    reset() {
      this.intervals = [];
      this.hardPause = this.fixedPause || this.pauseBase;
      this.samples = [];
      this.rate = 0;
      this.tier = 'idle';
      this.active = false;
      this.playbackRate = 0;
      this.target = 0;
      this.lastInputAt = -Infinity;
    }
    input(now, count) {
      if (count <= 0) return;
      // 即使后台尚未 step，超过暂停期限的新输入也必须开启新段。
      const gap = now - this.lastInputAt;
      const fresh = !this.active || gap >= this.hardPause;
      if (fresh) this.reset();
      else if (this.adaptive && !this.fixedPause && gap > 0) {
        this.intervals.push(gap);
        this.intervals = this.intervals.slice(-GAP_WINDOW);
        const sorted = [...this.intervals].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
        this.hardPause = clamp(6000 + median * GAP_FACTOR, Math.max(this.pauseBase, ADAPTIVE_PAUSE_MIN), ADAPTIVE_PAUSE_MAX);
      }
      this.samples.push({ at: now, count });
      this.samples = this.samples.slice(-MAX_EVENTS);
      this.lastInputAt = now;
      this.active = true;
      this.rate = this.estimateRate();
      this.tier = rateToTier(this.rate);
      this.target = this.tier === 'fast' ? this.fastRate : RATES[this.tier];
      if (fresh) this.playbackRate = RATES.slow;
    }
    // 首事件没有间隔，不计其字数；后续 IME 多字提交按实际字符数计。
    estimateRate() {
      if (this.samples.length < 2) return 0;
      const span = this.samples[this.samples.length - 1].at - this.samples[0].at;
      if (span <= 0) return 0;
      const total = this.samples.slice(1).reduce((sum, s) => sum + s.count, 0);
      return total * 60000 / span;
    }
    step(now, seconds) {
      const dt = clamp(seconds, 0, .1);
      if (!this.active) {
        // 空闲收敛到 0（供平滑淡出视觉状态）
        this.target = 0;
        this.playbackRate += (0 - this.playbackRate) * (1 - Math.exp(-dt / TAU));
        if (this.playbackRate < .001) this.playbackRate = 0;
        return this;
      }
      this.rate = this.estimateRate();
      const idle = now - this.lastInputAt;
      const tierRate = this.tier === 'fast' ? this.fastRate : RATES[this.tier];
      if (idle < this.decelDelay) {
        // 连贯视频保留字间宽限；默认氛围仍为 450ms。
        this.target = tierRate;
      } else if (idle < this.hardPause) {
        // 自适应视频缓慢收速，避免长时间贴着最低速拖动。
        this.target = this.adaptive ? tierRate * clamp((this.hardPause - idle) / (this.hardPause - this.decelDelay)) : 0;
      } else {
        // 到达本实例的硬停期限后归零；默认氛围900ms，视频自适应。
        this.active = false;
        this.tier = 'idle';
        this.target = 0;
        this.playbackRate = 0;
        this.rate = 0;
        return this;
      }
      this.playbackRate += (this.target - this.playbackRate) * (1 - Math.exp(-dt / TAU));
      return this;
    }
  }
  // Same pace tiers drive video, independent v1 wind volume and leaves per character.
  function atmosphereForTier(tier) {
    return ({ idle: { gain: 0, leaves: 0 }, slow: { gain: .25, leaves: 1.2 }, medium: { gain: .55, leaves: 2.4 }, fast: { gain: 1, leaves: 4.8 } })[tier] || { gain: 0, leaves: 0 };
  }
  const api = { WindModel, VideoPace, Drift, insertedCharacters, clamp, atmosphereForTier };
  root.MeadowWindMath = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
