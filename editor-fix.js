(()=>{
  // The editor's normal input handlers save state AND refresh the canvas.
  // Refreshing .canvas-wrap on every keystroke destroys the focused input/contenteditable.
  // Temporarily suppress only that canvas refresh while text is being edited.
  const originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
  if(originalInnerHTML?.set && !window.__pulseInnerHTMLPatched){
    window.__pulseInnerHTMLPatched=true;
    Object.defineProperty(Element.prototype,'innerHTML',{
      configurable: originalInnerHTML.configurable,
      enumerable: originalInnerHTML.enumerable,
      get: originalInnerHTML.get,
      set(value){
        if(window.__pulseEditingText && this.classList?.contains('canvas-wrap')){
          window.__pulseEditingText=false;
          return;
        }
        return originalInnerHTML.set.call(this,value);
      }
    });
  }

  function canvasMirror(target){
    if(target.id==='slide-title'){
      const c=document.querySelector('.canvas-title');
      if(c) c.textContent=target.value;
    }else if(target.id==='slide-body'){
      const c=document.querySelector('.canvas-body');
      if(c) c.textContent=target.value;
    }else if(target.matches('[data-opt]')){
      const i=Number(target.dataset.opt);
      const c=document.querySelectorAll('.canvas-option')[i];
      if(c){
        const letter=c.querySelector('span');
        c.textContent='';
        if(letter) c.appendChild(letter);
        c.appendChild(document.createTextNode(target.value));
      }
    }
  }

  function wire(){
    const title=document.querySelector('.canvas-title');
    const titleInput=document.querySelector('#slide-title');
    if(title&&titleInput&&!title.dataset.editwired){
      title.dataset.editwired='1';
      title.contentEditable='true';
      title.spellcheck=false;
      title.title='Click to edit';
      title.style.cursor='text';
      title.addEventListener('input',()=>{
        titleInput.value=title.innerText.trim();
        titleInput.dispatchEvent(new Event('input',{bubbles:true}));
      });
      title.addEventListener('keydown',e=>{
        if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();title.blur();}
      });
    }

    document.querySelectorAll('.canvas-option').forEach((node,i)=>{
      if(node.dataset.editwired)return;
      const input=document.querySelector(`[data-opt="${i}"]`);
      if(!input)return;
      node.dataset.editwired='1';
      node.contentEditable='true';
      node.spellcheck=false;
      node.title='Click to edit';
      node.style.cursor='text';
      node.addEventListener('input',()=>{
        const text=node.innerText.replace(/^\s*[A-Z]\s*/,'').trim();
        input.value=text;
        input.dispatchEvent(new Event('input',{bubbles:true}));
      });
      node.addEventListener('keydown',e=>{
        if(e.key==='Enter'){e.preventDefault();node.blur();}
      });
    });

    const body=document.querySelector('.canvas-body');
    const bodyInput=document.querySelector('#slide-body');
    if(body&&bodyInput&&!body.dataset.editwired){
      body.dataset.editwired='1';
      body.contentEditable='true';
      body.spellcheck=true;
      body.title='Click to edit';
      body.style.cursor='text';
      body.addEventListener('input',()=>{
        bodyInput.value=body.innerText;
        bodyInput.dispatchEvent(new Event('input',{bubbles:true}));
      });
    }
  }

  // Capture text-field input before app.js's listener. We let app.js update its
  // in-memory presentation and localStorage, but suppress only its destructive
  // canvas rerender. Then mirror the new value into the visible canvas.
  document.addEventListener('input',e=>{
    const t=e.target;
    if(t?.id==='slide-title'||t?.id==='slide-body'||t?.matches?.('[data-opt]')){
      window.__pulseEditingText=true;
      setTimeout(()=>canvasMirror(t),0);
    }
  },true);

  new MutationObserver(wire).observe(document.body,{childList:true,subtree:true});
  wire();
})();
