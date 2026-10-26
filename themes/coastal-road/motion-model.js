export const DEFAULTS = Object.freeze({ mode:'builtin', enabled:true, clouds:true, road:true, shore:false,
  cloudSpeed:120, cloudFloat:10, cloudRandom:91, cloudOpacity:85, roadSpeed:20,
  edgeWidth:14, bottomHeight:20, caretAnchor:65 });
export const RANGES = Object.freeze({cloudSpeed:[0,120],cloudFloat:[0,24],cloudRandom:[0,100],
  cloudOpacity:[0,100],roadSpeed:[0,40],edgeWidth:[8,22],bottomHeight:[10,25],caretAnchor:[35,85]});
export const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
export const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
export function sanitizeSettings(saved={}) {
  const s={...DEFAULTS};
  if(['builtin','video','static'].includes(saved?.mode))s.mode=saved.mode;
  for(const k of ['enabled','clouds','road','shore'])if(typeof saved?.[k]==='boolean')s[k]=saved[k];
  for(const [k,[lo,hi]] of Object.entries(RANGES))if(Number.isFinite(saved?.[k]))s[k]=clamp(saved[k],lo,hi);
  return s;
}
export function isTypingInput(event){
  return /^(insertText|insertCompositionText|insertFromComposition|insertLineBreak|insertParagraph)$/.test(event.inputType||'');
}
// One input clock, regardless of how many browser events an IME emits.
export class ActivityClock {
  constructor(){this.enabled=false;this.preview=false;this.lastInput=-Infinity;this.started=-Infinity;this.blockUntil=0;}
  pulse(now){if(!this.enabled||now<this.blockUntil)return false;if(this.weight(now)===0)this.started=now;this.lastInput=now;return true;}
  setPreview(value,now){if(value)this.blockUntil=0;if(value&&!this.preview&&this.weight(now)===0)this.started=now;this.preview=value;if(!value)this.lastInput=-Infinity;}
  suspend(now){this.lastInput=-Infinity;this.preview=false;this.blockUntil=now+180;}
  weight(now){
    if(!this.enabled||now<this.blockUntil)return 0;
    if(!this.preview&&now-this.lastInput>=400)return 0;
    return smooth(0,200,now-this.started)*(this.preview?1:1-smooth(250,400,now-this.lastInput));
  }
  pending(now){return this.enabled&&now>=this.blockUntil&&(this.preview||now-this.lastInput<400);}
}
// Safety space scales with the viewport so a narrow editor cannot freeze the entire sky.
export const readingFeather = width => Math.max(20, Math.min(100, width * 100 / 1920));
// textTop：正文第一行文字（章节眉）的屏幕位置。云与视频的保护从文字开始，
// 眉行上方的天空带保持可见——云在那里出生、长大、飘走。
export function readingRect(paper, editor, zone, width, textTop, textBottom) {
  const safety = Math.min(48, width * 48 / 1920);
  // 保护下界跟实际文字（自动增高的正文框）走，而不是编辑器底——
  // 编辑器占满整个高度，若按编辑器底冻结会把底部道路动效带也盖住。
  const bottom = Math.min(textBottom ?? Infinity, editor.bottom);
  return [Math.max(zone.left, paper.left - safety), textTop ?? editor.top,
    Math.min(zone.right, paper.right + safety), bottom];
}
