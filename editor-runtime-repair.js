(() => {
  const q = (s, root = document) => root.querySelector(s);
  const qa = (s, root = document) => [...root.querySelectorAll(s)];

  function makeEditableInput(el) {
    if (!el) return;
    el.readOnly = false;
    el.disabled = false;
    el.removeAttribute('readonly');
    el.removeAttribute('disabled');
    el.tabIndex = 0;
    el.style.pointerEvents = 'auto';
    el.style.userSelect = 'text';
    el.style.webkitUserSelect = 'text';
    if (!el.dataset.pulseFocusWired) {
      el.dataset.pulseFocusWired = '1';
      el.addEventListener('pointerdown', () => {
        el.focus({ preventScroll: true });
      });
      el.addEventListener('click', () => {
        el.focus({ preventScroll: true });
      });
    }
  }

  function wireCanvasEditing() {
    const title = q('.presentation-canvas .canvas-title');
    const titleInput = q('#title');
    if (title && titleInput && !title.dataset.pulseEditable) {
      title.dataset.pulseEditable = 'true';
      title.contentEditable = 'true';
      title.spellcheck = false;
      title.title = 'Click to edit';
      title.addEventListener('input', () => {
        titleInput.value = title.innerText.trim();
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      title.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          title.blur();
        }
      });
    }

    const body = q('.presentation-canvas .canvas-body');
    const bodyInput = q('#body');
    if (body && bodyInput && !body.dataset.pulseEditable) {
      body.dataset.pulseEditable = 'true';
      body.contentEditable = 'true';
      body.spellcheck = true;
      body.title = 'Click to edit';
      body.addEventListener('input', () => {
        bodyInput.value = body.innerText;
        bodyInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
  }

  function wireEditor() {
    const panel = q('.editor-body .edit-panel');
    if (!panel) return;

    qa('input, textarea, select', panel).forEach(makeEditableInput);
    wireCanvasEditing();
  }

  const observer = new MutationObserver(wireEditor);
  observer.observe(document.body, { childList: true, subtree: true });
  wireEditor();
})();
