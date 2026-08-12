(()=>{
function wire(){
  const title=document.querySelector('.canvas-title');
  const titleInput=document.querySelector('#slide-title');
  if(title&&titleInput&&!title.dataset.editwired){
    title.dataset.editwired='1'; title.contentEditable='true'; title.spellcheck=false; title.title='Click to edit';
    title.addEventListener('input',()=>{titleInput.value=title.innerText.trim();titleInput.dispatchEvent(new Event('input',{bubbles:true}))});
    title.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();title.blur()}});
  }
  document.querySelectorAll('.canvas-option').forEach((node,i)=>{
    if(node.dataset.editwired)return;
    const input=document.querySelector(`[data-opt="${i}"]`); if(!input)return;
    node.dataset.editwired='1'; node.contentEditable='true'; node.spellcheck=false; node.title='Click to edit';
    node.addEventListener('input',()=>{const text=node.innerText.replace(/^\s*[A-Z]\s*/,'').trim();input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}))});
    node.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();node.blur()}});
  });
  const body=document.querySelector('.canvas-body'); const bodyInput=document.querySelector('#slide-body');
  if(body&&bodyInput&&!body.dataset.editwired){
    body.dataset.editwired='1'; body.contentEditable='true'; body.spellcheck=true; body.title='Click to edit';
    body.addEventListener('input',()=>{bodyInput.value=body.innerText;bodyInput.dispatchEvent(new Event('input',{bubbles:true}))});
  }
}
new MutationObserver(wire).observe(document.body,{childList:true,subtree:true});
wire();
})();
