import { DEFAULTS, RANGES, sanitizeSettings, isTypingInput, ActivityClock, smooth, readingRect, readingFeather } from './motion-model.js?v=17';

const $=id=>document.getElementById(id);
const video=$('wallpaperVideo'),canvas=$('coastalCanvas'),fileInput=$('videoFile'),dialog=$('themeDialog');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const key='writing-skin:coastal-road-motion:motion:v4';
let settings={...DEFAULTS};
try {settings=sanitizeSettings(JSON.parse(localStorage.getItem(key)||'null'));}catch{}
let scene,scenePromise,failed=false,objectURL,fileName='',videoReady=false,loadingVideo=false,preview=false;
let videoRAF=0,videoLast=0;
const videoClock=new ActivityClock();
video.muted=true;
const save=()=>{try{localStorage.setItem(key,JSON.stringify(settings));}catch{}};
const allowed=()=>settings.enabled&&!document.hidden&&!reduced.matches;
const units={cloudSpeed:'像素/秒',cloudFloat:'像素',cloudRandom:'%',cloudOpacity:'%',roadSpeed:'%',edgeWidth:'%',bottomHeight:'%',caretAnchor:'%'};
function updateStatus(){
  $('previewMotion').textContent=preview?'停止预览':'连续预览';
  $('previewMotion').setAttribute('aria-pressed',String(preview));
  $('previewMotion').disabled=!allowed()||settings.mode==='static'||(settings.mode==='builtin'&&(!scene?.ready||failed))||(settings.mode==='video'&&!videoReady);
  const text=reduced.matches?'已遵循系统“减少动态效果”，显示静态壁纸。':settings.mode==='static'?'静态壁纸 · 画面静止。':
    settings.mode==='builtin'?(failed?'绘图暂时不可用，已显示静态壁纸。':!scene?.ready?'正在准备独立云层与海岸景物…':!settings.enabled?'动画已暂停在当前位置。':preview?'连续预览中 · 关闭面板后恢复跟随打字。':'跟随实际输入 · 停笔 400 毫秒内静止。'):
    loadingVideo?`正在加载 ${fileName}…`:!videoReady?'选择本地视频，仅在本机播放；刷新后需重新选择。':`${fileName} · ${preview?'连续预览':settings.enabled?'跟随输入':'已暂停'} · 正文区保留静态壁纸。`;
  $('videoStatus').textContent=text;
}
async function ensureScene(){
  if(scenePromise||failed)return scenePromise;
  scenePromise=import('./coastal-scene.js?v=17').then(async({CoastalScene})=>{
    scene=new CoastalScene(canvas,()=>{failed=true;canvas.hidden=true;preview=false;sync();});
    window.__coastalScene=scene;   // 调试/验证钩子：真页面可直接 readPixels 检查
    await scene.initialize();sync();
  }).catch(error=>{failed=true;canvas.hidden=true;canvas.dataset.error=String(error?.message||error);console.warn('Coastal wallpaper:',error?.message||error);sync();});
  return scenePromise;
}
function sync(){
  $('motionMode').value=settings.mode;$('motionToggle').checked=settings.enabled;
  $('cloudsToggle').checked=settings.clouds;$('roadToggle').checked=settings.road;$('shoreToggle').checked=settings.shore;
  for(const id of Object.keys(RANGES)){$(id).value=settings[id];$(id+'Value').textContent=`${settings[id]} ${units[id]}`;}
  document.documentElement.style.setProperty('--caret-anchor',String(settings.caretAnchor/100));
  const builtin=settings.mode==='builtin',local=settings.mode==='video';
  $('builtinSettings').hidden=!builtin;$('localVideoControls').hidden=!local;$('clearVideo').disabled=!objectURL;
  $('anchorSelect').disabled=builtin;
  if(builtin){$('anchorSelect').value='center bottom';document.documentElement.style.setProperty('--wallpaper-position','center bottom');}
  if(!allowed()||settings.mode==='static')preview=false;
  canvas.hidden=!(builtin&&scene?.ready&&!failed&&!reduced.matches);
  video.hidden=!(local&&videoReady&&!reduced.matches);
  if(scene){scene.applySettings(settings);scene.setEnabled(builtin&&allowed()&&!failed);if(!preview&&scene.clock.preview)scene.setPreview(false);}
  videoClock.enabled=local&&videoReady&&allowed();
  if(!videoClock.enabled){videoClock.suspend(performance.now());stopVideo();}
  updateStatus();maskVideo();
  if(builtin&&!scenePromise&&!failed&&!reduced.matches)ensureScene();
}
function setPreview(value){
  preview=Boolean(value&&dialog.open&&allowed());
  if(settings.mode==='builtin')scene?.setPreview(preview);
  if(settings.mode==='video'){videoClock.setPreview(preview,performance.now());if(preview)wakeVideo();else stopVideo();}
  updateStatus();
}
function suspend(){preview=false;scene?.suspend();videoClock.suspend(performance.now());stopVideo();updateStatus();}
function stopVideo(){cancelAnimationFrame(videoRAF);videoRAF=0;video.pause();}
function wakeVideo(){if(!videoClock.enabled||videoRAF)return;videoLast=performance.now();video.play().catch(()=>{preview=false;updateStatus();});videoRAF=requestAnimationFrame(tickVideo);}
function tickVideo(now){
  videoRAF=0;if(!videoClock.pending(now)){stopVideo();return;}
  if(now-videoLast>=33){videoLast=now;video.playbackRate=Math.max(.1,videoClock.weight(now));}
  videoRAF=requestAnimationFrame(tickVideo);
}
// The mask keeps even a local movie away from the visible text and its safety margin.
function maskVideo(){
  if(settings.mode!=='video')return;
  const paper=document.querySelector('.paper').getBoundingClientRect(),editor=$('editorScroll').getBoundingClientRect(),zone=document.querySelector('.center').getBoundingClientRect();
  const w=innerWidth,h=innerHeight,m=document.createElement('canvas');m.width=Math.ceil(w/4);m.height=Math.ceil(h/4);
  const ctx=m.getContext('2d'),data=ctx.createImageData(m.width,m.height);
  const bounds=readingRect(paper,editor,zone,w);
  const left=bounds[0]-4,right=bounds[2]+4;
  for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++){
    const px=x*4,py=y*4,nx=(px-zone.left)/zone.width;
    const sides=1-smooth(settings.edgeWidth/100-.055,settings.edgeWidth/100,Math.min(nx,1-nx));
    const bottom=smooth(1-settings.bottomHeight/100,1-settings.bottomHeight/100+.055,py/h);
    const distance=Math.hypot(Math.max(left-px,px-right,0),Math.max(editor.top-4-py,py-editor.bottom-4,0));
    const i=(y*m.width+x)*4;data.data[i]=data.data[i+1]=data.data[i+2]=255;data.data[i+3]=Math.round(Math.max(sides,bottom)*smooth(0,readingFeather(w),distance)*255);
  }
  ctx.putImageData(data,0,0);video.style.maskImage=`url(${m.toDataURL()})`;
}
let maskFrame=0;
new ResizeObserver(()=>{cancelAnimationFrame(maskFrame);maskFrame=requestAnimationFrame(maskVideo);}).observe(document.querySelector('.center'));
const fromEditor=event=>event.target?.closest?.('.editor');
document.addEventListener('input',event=>{
  if(!fromEditor(event)||!isTypingInput(event)||!allowed())return;
  if(settings.mode==='builtin')scene?.pulse();
  if(settings.mode==='video'&&videoClock.pulse(performance.now()))wakeVideo();
});
let lastScrollTop=$('editorScroll').scrollTop;
$('editorScroll').addEventListener('scroll',()=>{
  const next=$('editorScroll').scrollTop;
  // fitText briefly shrinks then restores the textarea; ignore events with no final movement.
  if(Math.abs(next-lastScrollTop)>.5)suspend();
  lastScrollTop=next;
},{passive:true});
$('editorScroll').addEventListener('wheel',suspend,{passive:true});
window.addEventListener('writing-scroll',suspend);
dialog.addEventListener('close',()=>setPreview(false));
$('previewMotion').addEventListener('click',()=>setPreview(!preview));
$('resetMotion').addEventListener('click',()=>{const mode=settings.mode;settings={...DEFAULTS,mode};save();sync();});
for(const id of Object.keys(RANGES))$(id).addEventListener('input',()=>{settings[id]=Number($(id).value);save();sync();});
$('motionMode').addEventListener('change',()=>{suspend();settings.mode=$('motionMode').value;save();sync();});
for(const [id,k] of [['motionToggle','enabled'],['cloudsToggle','clouds'],['roadToggle','road'],['shoreToggle','shore']])$(id).addEventListener('change',()=>{settings[k]=$(id).checked;save();sync();});
function clearVideo(){videoReady=false;loadingVideo=false;stopVideo();video.removeAttribute('src');video.load();if(objectURL)URL.revokeObjectURL(objectURL);objectURL=null;fileName='';fileInput.value='';}
$('chooseVideo').addEventListener('click',()=>fileInput.click());
$('clearVideo').addEventListener('click',()=>{suspend();clearVideo();settings.mode='builtin';save();sync();});
fileInput.addEventListener('change',()=>{const file=fileInput.files[0];if(!file)return;suspend();clearVideo();fileName=file.name;objectURL=URL.createObjectURL(file);loadingVideo=true;settings.mode='video';video.src=objectURL;video.load();save();sync();});
video.addEventListener('loadeddata',()=>{if(objectURL){videoReady=true;loadingVideo=false;sync();}});
video.addEventListener('error',()=>{if(objectURL){clearVideo();sync();$('videoStatus').textContent='视频无法播放，请选择 MP4（H.264）或 WebM 文件。';}});
canvas.addEventListener('scene-restored',()=>{failed=false;sync();});
document.addEventListener('visibilitychange',()=>{suspend();sync();});
reduced.addEventListener('change',()=>{suspend();sync();});
window.addEventListener('pagehide',event=>{suspend();if(!event.persisted){scene?.dispose();if(objectURL)URL.revokeObjectURL(objectURL);}});
window.addEventListener('pageshow',sync);
sync();
