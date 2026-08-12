/* Pulse editor: direct slide-content editing, without any live/collaborative editing. */
(function(){
  const escText = el => (el.textContent || '').replace(/\u00a0/g,' ').trim();
  const mark = (el, target) => {
    if (!el || el.dataset.pulseEditable === '1') return;
    el.dataset.pulseEditable = '1';
    el.contentEditable = 'true';
    el.spellcheck = true;
    el.setAttribute('role','textbox');
    el.title = 'Click to edit';
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && el.classList.contains('canvas-title')) {
        e.preventDefault(); el.blur();
      }
    });
    el.addEventListener('blur', () => {
      const input = typeof target === 'function' ? target() : target;
      if (!input) return;
      const value = escText(el);
      input.value = value;
      input.dispatchEvent(new Event('input', {bubbles:true}));
    });
  };
  function wire(){
    if (!document.querySelector('.editor-layout')) return;
    const canvas = document.querySelector('.editor-layout .presentation-canvas');
    if (!canvas) return;

    const title = canvas.querySelector('.canvas-title');
    if (title && !title.closest('.fake-board')) mark(title, ()=>document.querySelector('#slide-title'));

    const body = canvas.querySelector('.canvas-body');
    if (body && !body.querySelector('.canvas-option')) mark(body, ()=>document.querySelector('#slide-body') || document.querySelector('#slide-title'));

    canvas.querySelectorAll('.canvas-option').forEach((option, i) => {
      if (option.dataset.pulseOptionWired === '1') return;
      option.dataset.pulseOptionWired = '1';
      let text = option.querySelector('.pulse-option-text');
      if (!text) {
        text = document.createElement('span');
        text.className = 'pulse-option-text';
        const nodes = [...option.childNodes].filter(n => !(n.nodeType===1 && n.tagName==='SPAN' && !n.classList.contains('pulse-option-text')));
        nodes.forEach(n => text.appendChild(n));
        option.appendChild(text);
      }
      mark(text, ()=>document.querySelector(`[data-opt="${i}"]`));
    });
  }
  const observer = new MutationObserver(() => requestAnimationFrame(wire));
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('click', e => {
    const editable = e.target.closest('.editor-layout .presentation-canvas [contenteditable="true"]');
    if (!editable) return;
    requestAnimationFrame(() => {
      try { document.execCommand('selectAll', false, null); } catch(_) {}
    });
  });
  setTimeout(wire,300);
})();
