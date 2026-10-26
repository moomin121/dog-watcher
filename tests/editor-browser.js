(() => {
  const check=(v,m)=>{if(!v)throw Error(m)};
  const body=document.querySelector('#bodyInput'), saved=body.value;
  const input=(value,type='insertText')=>{body.value=value;body.setSelectionRange(value.length,value.length);body.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:type}));};
  check(document.documentElement.dataset.editorReady==='true','editor ready');
  check(document.querySelector('#pageLoading').hidden,'loader must finish independently');
  input('测试');check(body.value==='　　测试','first line indent');
  input('测试\n下一段','insertFromPaste');check(body.value==='　　测试\n　　下一段','paste indent');
  input('　　测试\n','insertLineBreak');check(body.value==='　　测试\n　　','newline indent');
  body.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
  input('中文','insertCompositionText');check(body.value==='中文','composition must remain untouched');
  body.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文'}));
  check(body.value==='　　中文','composition commit indent');
  input('　　中文');check(body.value==='　　中文','no double indent');
  if(document.body.dataset.pageId==='meadow') {
    check(!document.querySelector('.statusbar #backgroundStatus'),'no overlapping status');
    check(document.querySelector('.status-plan').textContent.includes('计划'),'plan preserved');
  }
  input(saved,'insertFromPaste');
  return 'PASS: independent ready, first input, paste, newline, IME, idempotence, footer';
})();
