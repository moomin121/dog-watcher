import * as THREE from './vendor/three.module.min.js';
import { SCENE, SPRITES, distanceAt, depthAt, coverLayout, makeRoadside } from './scene-model.js?v=8';
import { DEFAULTS, ActivityClock, readingRect, readingFeather } from './motion-model.js?v=17';

const quadVertex = `varying vec2 vUv;
void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;
const groundFragment = `
precision highp float;
uniform sampler2D uOriginal, uPlate, uField;
uniform vec2 uViewport, uDraw, uOrigin;
uniform float uDistance, uTime;
varying vec2 vUv;
vec3 painting(sampler2D tex, vec2 p){ return texture2D(tex,vec2(p.x,1.-p.y)).rgb; }
void main(){
  vec2 px=vec2(vUv.x,1.-vUv.y)*uViewport;
  vec2 p=(px-uOrigin)/uDraw;
  vec3 original=painting(uOriginal,p);
  vec2 sea=p;
  float water=smoothstep(.617,.634,p.y)*(1.-smoothstep(.71,.742,p.y))*smoothstep(.32,.48,p.x);
  sea.x+=sin(p.y*210.+uTime*6.2831853)*.00045*water;
  sea.y+=sin(p.x*60.-uTime*12.5663706)*.00022*water;
  vec3 plate=painting(uPlate,sea);
  vec3 base=mix(original,plate,smoothstep(.61,.73,p.y));
  if(p.y>.75){
    float z=1.7/max(.0001,p.y-.75);
    float x=(p.x-.5)*z/.48;
    float travel=z+uDistance;
    vec3 grass=texture2D(uField,vec2(x/18.,travel/45.)).rgb;
    float fieldTint=sin(x*.27+sin(travel*6.2831853/180.))*sin(travel*6.2831853/45.);
    grass=mix(grass,vec3(.77,.82,.61),.22+.12*fieldTint);
    float fieldEdge=1.-smoothstep(.03,.08,abs(sin(travel*3.14159265/15.)));
    grass=mix(grass,vec3(.63,.73,.54),fieldEdge*.28);
    grass+=sin(x*12.+.15*sin(travel*6.2831853/45.))*.008;
    float road=1.-smoothstep(2.99,3.045,abs(x));
    float edge=1.-smoothstep(.025,.065,abs(abs(x)-2.86));
    float centre=1.-smoothstep(.026,.052,abs(x));
    float lanePhase=fract(travel/9.);
    float aa=clamp(fwidth(travel)/9.,.005,.16);
    float dash=smoothstep(.10-aa,.10+aa,lanePhase)*(1.-smoothstep(.43-aa,.43+aa,lanePhase));
    vec3 asphalt=vec3(.817,.828,.858)+(grass.r-.79)*.065;
    asphalt=mix(asphalt,vec3(.963,.965,.958),max(edge*.72,centre*dash*.87));
    vec3 ground=mix(grass,asphalt,road);
    float reveal=smoothstep(.756,.789,p.y);
    gl_FragColor=vec4(mix(base,ground,reveal),1.);
  }else{ gl_FragColor=vec4(base,1.); }
}`;
const spriteVertex = `
uniform vec2 uViewport, uDraw, uOrigin;
uniform float uX, uZ, uWidth, uAspect, uSway, uTime;
varying vec2 vUv;
varying vec2 vPixel;
void main(){
  vUv=uv;
  float sway=sin(uTime*6.2831853+uX)*uSway*uv.y*uv.y;
  vec2 p=vec2(.5+.48*(uX+position.x*uWidth+sway)/uZ,
    .75+(1.7-(position.y+.5)*uWidth*uAspect*.48*(1672./941.))/uZ);
  vPixel=uOrigin+p*uDraw;
  vec2 screen=vPixel/uViewport;
  gl_Position=vec4(screen.x*2.-1.,1.-screen.y*2.,0.,1.);
}`;
const spriteFragment = `
uniform sampler2D uAtlas;
uniform vec4 uRect, uReading;
uniform float uFade;
varying vec2 vUv, vPixel;
void main(){
  vec2 coord=mix(uRect.xy,uRect.zw,vec2(vUv.x,1.-vUv.y));
  vec4 sampleColor=texture2D(uAtlas,vec2(coord.x,1.-coord.y));
  float edgeFade=smoothstep(0.,.02,vUv.x)*(1.-smoothstep(.98,1.,vUv.x));
  float alpha=sampleColor.a*uFade*edgeFade*smoothstep(0.,.025,vUv.y);
  if(alpha<.015) discard;
  vec2 outside=max(max(uReading.xy-vPixel,vPixel-uReading.zw),vec2(0.));
  float freedom=smoothstep(0.,130.,length(outside));
  vec3 color=mix(sampleColor.rgb,vec3(.88,.90,.79),.13);
  color=mix(color,vec3(.91,.93,.87),.12*(1.-freedom));
  gl_FragColor=vec4(color,alpha);
}`;

// Original painted sky, advected in texture space. Reading protection reduces
// displacement to zero; it never covers moving clouds with a different still image.
const compositeFragment=`uniform sampler2D uStill,uLive,uSky;uniform vec2 uViewport,uDraw,uOrigin;
uniform vec4 uReading,uZone;uniform float uEdge,uBottom,uFeather,uCloudTravel,uCloudTime,uCloudRandom,uCloudFloat,uCloudOpacity,uShore;varying vec2 vUv;
vec3 sky(vec2 p){return texture2D(uSky,vec2(p.x,1.-p.y)).rgb;}
vec3 flowingSky(vec2 p,float phase,float freedom){
 float horizon=1.-smoothstep(.52,.60,p.y);
 float side=sign(p.x-.5);
 float variation=1.+uCloudRandom*.14*sin(p.y*7.+side*1.9);
 float expansion=exp(phase*.32*freedom*horizon*variation);
 vec2 q=vec2(.5,.60)+(p-vec2(.5,.60))/expansion;
 q.y+=(sin(uCloudTime*.09+p.x*8.)-sin(p.x*8.))*uCloudFloat/uDraw.y*.22*freedom*horizon;
 return sky(q);
}
void main(){vec2 px=vec2(vUv.x,1.-vUv.y)*uViewport;
 vec2 p=(px-uOrigin)/uDraw;
 float x=(px.x-uZone.x)/max(1.,uZone.z-uZone.x);
 float sides=1.-smoothstep(uEdge-.055,uEdge,min(x,1.-x));
 float bottom=smoothstep(1.-uBottom,1.-uBottom+.055,px.y/uViewport.y);
 vec2 outside=max(max(uReading.xy-px,px-uReading.zw),vec2(0.));
 float protection=smoothstep(0.,uFeather*1.6,length(outside));
 vec3 ground=mix(texture2D(uStill,vUv).rgb,texture2D(uLive,vUv).rgb,max(sides,bottom)*protection);
 float phase=fract(uCloudTravel/480.+.5)-.5;
 float second=fract(uCloudTravel/480.)-.5;
 float weight=pow(cos(phase*3.14159265),2.);
 // Two advected samples recycle only at zero weight, so there is no reversal or jump.
 float freedom=protection*uCloudOpacity;
 vec3 clouds=mix(flowingSky(p,second,freedom),flowingSky(p,phase,freedom),weight);
 // 海浪缓缓拍打岸边：5 秒一个往复的循环（泡沫线随潮位进出、近岸亮带随潮涨落）。
 // 作为独立层叠加在合成结果上——海湾在画面中央，不在边缘动效带内，
 // 若放进 still/live 地面通道会永远显示静止参考帧。
 // 阅读保护区内取冻结相位（泡沫停在默认位置），区外随潮流动。
 float tide=sin(uCloudTime*1.2566371);
 float lap=smoothstep(-.3,.85,tide);
 float lapFrozen=smoothstep(-.3,.85,0.);
 float foamLine=.648+.012*tide;
 float dF=(p.y-foamLine)/.006;
 float dFz=(p.y-.648)/.006;
 float water=smoothstep(.617,.634,p.y)*(1.-smoothstep(.71,.742,p.y))*smoothstep(.32,.48,p.x);
 float shoreGlow=water*(1.-smoothstep(.64,.70,p.y));
 float foamLive=exp(-dF*dF)*water*(.30+.55*lap);
 float foamFrozen=exp(-dFz*dFz)*water*(.30+.55*lapFrozen);
 vec3 shore=mix(texture2D(uStill,vUv).rgb,texture2D(uLive,vUv).rgb,max(sides,bottom)*protection)
   +uShore*(vec3(.30,.31,.29)*mix(foamFrozen,foamLive,protection)
   +vec3(.07,.075,.07)*shoreGlow*mix(lapFrozen,lap,protection));
 gl_FragColor=vec4(mix(clouds,shore,smoothstep(.595,.615,p.y)),1.);}`;

export class CoastalScene {
  constructor(canvas,onFailure=()=>{}){
    this.canvas=canvas;this.onFailure=onFailure;this.ready=false;this.disposed=false;
    this.settings={...DEFAULTS};this.soft={...DEFAULTS};this.clock=new ActivityClock();
    this.time=0;this.cloudTime=0;this.cloudTravel=0;this.frames=0;this.raf=0;this.last=null;this.dirty=true;
    this.tick=this.tick.bind(this);this.refresh=this.refresh.bind(this);
    this.onLost=e=>{e.preventDefault();this.ready=false;this.cancel();this.canvas.dataset.ready='false';onFailure('绘图中断，已显示静态壁纸。');};
    this.onRestored=()=>queueMicrotask(()=>{if(!this.disposed){this.ready=true;this.dirty=true;this.referenceDirty=true;this.draw();this.canvas.dataset.ready='true';canvas.dispatchEvent(new Event('scene-restored'));}});
    canvas.addEventListener('webglcontextlost',this.onLost);canvas.addEventListener('webglcontextrestored',this.onRestored);
  }
  async initialize(){
    try{
      this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,alpha:false,antialias:false,powerPreference:'low-power'});
      this.renderer.debug.onShaderError=(gl,p,v,f)=>{throw new Error(gl.getShaderInfoLog(f)||gl.getShaderInfoLog(v));};
      this.camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);this.camera.position.z=1;
      this.scene=new THREE.Scene();this.compositeScene=new THREE.Scene();
      this.shared={uViewport:{value:new THREE.Vector2()},uDraw:{value:new THREE.Vector2()},uOrigin:{value:new THREE.Vector2()},
        uTime:{value:0},uDistance:{value:0},uReading:{value:new THREE.Vector4()},uZone:{value:new THREE.Vector4()},uFeather:{value:100}};
      const loader=new THREE.TextureLoader();
      this.textures=await Promise.all(['first-frame.png','distant-plate.png','field-texture.png','roadside-atlas.png'].map(n=>loader.loadAsync(new URL('assets/'+n,import.meta.url).href)));
      if(this.disposed){this.textures.forEach(t=>t.dispose());return;}
      const [original,plate,field,atlas]=this.textures;
      field.wrapS=field.wrapT=THREE.MirroredRepeatWrapping;field.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());
      this.geometry=new THREE.PlaneGeometry(2,2);this.spriteGeometry=new THREE.PlaneGeometry(1,1);this.materials=[];
      const make=(vertexShader,fragmentShader,uniforms,transparent=false)=>{
        const m=new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms,transparent,depthTest:false,depthWrite:false});this.materials.push(m);return m;};
      const ground=new THREE.Mesh(this.geometry,make(quadVertex,groundFragment,{...this.shared,uOriginal:{value:original},uPlate:{value:plate},uField:{value:field}}));
      ground.frustumCulled=false;ground.renderOrder=-100;this.scene.add(ground);
      this.objects=makeRoadside().map(item=>{
        const [l,t,r,b]=SPRITES[item.type].rect;
        const material=make(spriteVertex,spriteFragment,{...this.shared,uAtlas:{value:atlas},uRect:{value:new THREE.Vector4(l/1536,t/1024,r/1536,b/1024)},
          uX:{value:item.x},uZ:{value:1},uWidth:{value:item.width},uAspect:{value:(b-t)/(r-l)},uFade:{value:0},uSway:{value:item.type===2||item.type===3?.035:0}},true);
        const mesh=new THREE.Mesh(this.spriteGeometry,material);mesh.frustumCulled=false;this.scene.add(mesh);return {...item,mesh,material};
      });
      this.live=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});this.still=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
      this.mixUniforms={...this.shared,uSky:{value:original},uCloudTravel:{value:0},uCloudTime:{value:0},uCloudRandom:{value:.45},uCloudFloat:{value:10},uCloudOpacity:{value:1},uShore:{value:0},uLive:{value:this.live.texture},uStill:{value:this.still.texture},uEdge:{value:this.settings.edgeWidth/100},uBottom:{value:this.settings.bottomHeight/100}};
      const composite=new THREE.Mesh(this.geometry,make(quadVertex,compositeFragment,this.mixUniforms));composite.frustumCulled=false;this.compositeScene.add(composite);
      this.observer=new ResizeObserver(this.refresh);this.observer.observe(document.documentElement);
      for(const selector of ['.paper','.editor','.center']){const el=document.querySelector(selector);if(el)this.observer.observe(el);}
      window.addEventListener('resize',this.refresh);document.addEventListener('scroll',this.refresh,true);
      this.ready=true;this.referenceDirty=true;this.draw();this.canvas.dataset.ready='true';
    }catch(e){this.cancel();this.ready=false;this.canvas.dataset.error=String(e.message||e);this.onFailure('动态壁纸暂时不可用，已显示静态壁纸。');throw e;}
    return this;
  }
  applySettings(settings){
    if(settings.cloudOpacity!==undefined&&settings.cloudOpacity!==this.settings.cloudOpacity)this.referenceDirty=true;
    this.settings={...this.settings,...settings};
    if(!this.clock.pending(performance.now()))this.soft={...this.settings};
    if(this.mixUniforms){this.mixUniforms.uEdge.value=this.settings.edgeWidth/100;this.mixUniforms.uBottom.value=this.settings.bottomHeight/100;}
    this.refresh();
  }
  measure(){
    this.dirty=false;const w=innerWidth,h=innerHeight;
    const dpr=Math.min(devicePixelRatio||1,1.5,Math.sqrt(1800000/(w*h)));
    const rw=Math.floor(w*dpr),rh=Math.floor(h*dpr);
    if(this.canvas.width!==rw||this.canvas.height!==rh){this.renderer.setPixelRatio(dpr);this.renderer.setSize(w,h,false);this.live.setSize(this.canvas.width,this.canvas.height);this.still.setSize(this.canvas.width,this.canvas.height);this.referenceDirty=true;}
    const layout=coverLayout(w,h);this.layout=layout;
    this.shared.uViewport.value.set(w,h);this.shared.uDraw.value.set(layout.width,layout.height);this.shared.uOrigin.value.set(layout.x,layout.y);
    const zone=document.querySelector('.center')?.getBoundingClientRect()||{left:0,top:0,right:w,bottom:h};
    const zoneKey=[zone.left,zone.top,zone.right,zone.bottom].join(',');
    if(this.zoneKey!==zoneKey){this.zoneKey=zoneKey;this.referenceDirty=true;}
    this.shared.uZone.value.set(zone.left,zone.top,zone.right,zone.bottom);
    const editor=document.querySelector('.editor')?.getBoundingClientRect();
    const paper=document.querySelector('.paper')?.getBoundingClientRect();
    // Freeze all cloud pixels behind the visible text and its safety margin.
    const textTop=document.querySelector('.chapter-kicker')?.getBoundingClientRect().top;
    const bodyInput=document.getElementById('bodyInput')?.getBoundingClientRect();
    if(editor&&paper)this.shared.uReading.value.fromArray(readingRect(paper,editor,zone,w,textTop,bodyInput?.bottom));
    else this.shared.uReading.value.set(w*.27,h*.08,w*.73,h*.7);
    this.shared.uFeather.value=readingFeather(w);
    this.canvas.dataset.protectedRect=JSON.stringify(this.shared.uReading.value.toArray());
  }
  pose(roadTime,cloudTravel,cloudTime,settings){
    this.shared.uTime.value=(roadTime%SCENE.seconds)/SCENE.seconds;this.shared.uDistance.value=distanceAt(roadTime);
    for(const o of this.objects){const z=depthAt(o.seed,roadTime);o.material.uniforms.uZ.value=z;o.material.uniforms.uFade.value=THREE.MathUtils.smoothstep(130-z,0,45);o.mesh.renderOrder=1000-z;}
    this.mixUniforms.uCloudTravel.value=cloudTravel;
    this.mixUniforms.uCloudTime.value=cloudTime;
    this.mixUniforms.uCloudRandom.value=settings.cloudRandom/100;
    this.mixUniforms.uCloudFloat.value=settings.cloudFloat*innerWidth/1920;
    // Retain original colour/opacity; visibility controls motion strength instead of washing out the painting.
    this.mixUniforms.uCloudOpacity.value=settings.cloudOpacity/85;
    this.mixUniforms.uShore.value=settings.shore?1:0;
  }

  draw(){
    if(!this.ready||this.disposed)return;if(this.dirty)this.measure();
    if(this.referenceDirty){
      // Ground reference only; the sky is sampled directly in the final flow shader.
      this.pose(0,0,0,DEFAULTS);
      this.renderer.setRenderTarget(this.still);this.renderer.render(this.scene,this.camera);
      this.referenceDirty=false;
    }
    this.pose(this.time,this.cloudTravel,this.cloudTime,this.soft);
    this.renderer.setRenderTarget(this.live);this.renderer.render(this.scene,this.camera);
    this.renderer.setRenderTarget(null);this.renderer.render(this.compositeScene,this.camera);

    this.frames++;Object.assign(this.canvas.dataset,{elapsed:this.time.toFixed(4),cloudTime:this.cloudTime.toFixed(4),cloudTravel:this.cloudTravel.toFixed(4),frames:String(this.frames),active:String(this.clock.pending(performance.now())),preview:String(this.clock.preview)});
  }
  refresh(){this.dirty=true;if(this.ready&&!this.disposed&&!this.raf)this.draw();}
  setEnabled(value){this.clock.enabled=value;if(!value){this.clock.suspend(performance.now());this.cancel();}this.updateActivity();}
  setPreview(value){this.clock.setPreview(value,performance.now());if(value)this.wake();else{this.cancel();this.updateActivity();}}
  pulse(){if(this.clock.pulse(performance.now()))this.wake();}
  suspend(){this.clock.suspend(performance.now());this.cancel();this.updateActivity();}
  updateActivity(){this.canvas.dataset.active=String(this.clock.pending(performance.now()));this.canvas.dataset.preview=String(this.clock.preview);}
  wake(){if(!this.ready||this.disposed||this.raf)return;this.last=performance.now();this.raf=requestAnimationFrame(this.tick);}
  tick(now){
    this.raf=0;if(!this.ready||this.disposed)return;
    if(!this.clock.pending(now)){this.last=null;this.updateActivity();return;}
    if(now-this.last>=1000/30-.4){
      const dt=Math.min((now-this.last)/1000,.06);this.last=now;
      const amount=dt*this.clock.weight(now);
      for(const key of ['cloudSpeed','cloudFloat','cloudRandom','cloudOpacity','roadSpeed'])this.soft[key]+=(this.settings[key]-this.soft[key])*(1-Math.exp(-dt/0.18));
      if(this.settings.road)this.time+=amount*this.soft.roadSpeed/100;
      if(this.settings.clouds){this.cloudTime+=amount;this.cloudTravel+=amount*this.soft.cloudSpeed;}
      this.draw();
    }
    this.raf=requestAnimationFrame(this.tick);
  }
  cancel(){cancelAnimationFrame(this.raf);this.raf=0;this.last=null;}
  dispose(){
    this.disposed=true;this.cancel();this.observer?.disconnect();window.removeEventListener('resize',this.refresh);document.removeEventListener('scroll',this.refresh,true);
    this.canvas.removeEventListener('webglcontextlost',this.onLost);this.canvas.removeEventListener('webglcontextrestored',this.onRestored);
    this.materials?.forEach(m=>m.dispose());this.textures?.forEach(t=>t.dispose());this.geometry?.dispose();this.spriteGeometry?.dispose();this.live?.dispose();this.still?.dispose();this.renderer?.dispose();
  }
}
