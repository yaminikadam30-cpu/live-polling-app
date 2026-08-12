/* Pulse slide organizer: drag slide thumbnails to rearrange the presentation sequence. */
(function(){
  const KEY='pulsePresentationsV3';
  let dragged=null;
  let moved=false;

  function list(){
    return [...document.querySelectorAll('.editor-layout .slide-item')];
  }

  function wire(){
    list().forEach(item=>{
      if(item.dataset.reorderWired==='1') return;
      item.dataset.reorderWired='1';
      item.draggable=true;
      item.title='Drag to rearrange slides';
      item.addEventListener('dragstart',e=>{
        dragged=item;
        moved=false;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('text/plain',item.dataset.slide);
      });
      item.addEventListener('dragend',()=>{
        item.classList.remove('dragging');
        list().forEach(x=>x.classList.remove('drag-over'));
        dragged=null;
        if(moved) persistOrder();
      });
      item.addEventListener('dragover',e=>{
        if(!dragged || dragged===item) return;
        e.preventDefault();
        e.dataTransfer.dropEffect='move';
        list().forEach(x=>x.classList.remove('drag-over'));
        item.classList.add('drag-over');
      });
      item.addEventListener('drop',e=>{
        e.preventDefault();
        if(!dragged || dragged===item) return;
        const parent=item.parentElement;
        const rect=item.getBoundingClientRect();
        const after=e.clientY>rect.top+rect.height/2;
        if(after) parent.insertBefore(dragged,item.nextSibling);
        else parent.insertBefore(dragged,item);
        moved=true;
      });
    });
  }

  function persistOrder(){
    const ids=list().map(x=>{
      const i=Number(x.dataset.slide);
      return i;
    });
    try{
      const pres=JSON.parse(localStorage.getItem(KEY)||'[]');
      const title=document.querySelector('.top-title')?.textContent?.trim();
      const p=pres.find(x=>x.title===title);
      if(!p) return;
      const old=p.slides.slice();
      p.slides=ids.map(i=>old[i]).filter(Boolean);
      p.updatedAt=Date.now();
      localStorage.setItem(KEY,JSON.stringify(pres));
      // Reload so the app's internal presentation state is rebuilt in the new order.
      location.reload();
    }catch(err){ console.error('Pulse slide reorder failed',err); }
  }

  const observer=new MutationObserver(()=>requestAnimationFrame(wire));
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(wire,300);
})();
