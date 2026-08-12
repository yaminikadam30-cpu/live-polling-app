(() => {
  const app = document.getElementById('app');
  if (!app) return;

  const addHostNavigation = () => {
    const shell = document.querySelector('.present-shell');
    const bar = document.querySelector('.present-bar');
    if (!shell || !bar || document.getElementById('pulseHostBack')) return;

    const codeEl = bar.querySelector('.present-code strong');
    const code = codeEl?.textContent?.trim();
    if (!code) return;

    const actions = document.createElement('div');
    actions.id = 'pulseHostNav';
    actions.className = 'pulse-host-nav';
    actions.innerHTML = `
      <button class="pulse-nav-btn" id="pulseHostBack" type="button">← Back</button>
      <button class="pulse-nav-btn pulse-share" id="pulseShare" type="button">🔗 Share join link</button>
    `;

    bar.appendChild(actions);

    document.getElementById('pulseHostBack').onclick = () => {
      if (window.state?.presentation) {
        // The existing app keeps its presentation in local state; use the public editor entry point.
        const evt = new CustomEvent('pulse:back-to-editor');
        window.dispatchEvent(evt);
      } else {
        location.href = location.pathname;
      }
    };

    document.getElementById('pulseShare').onclick = async () => {
      const url = `${location.origin}${location.pathname}?join=${encodeURIComponent(code)}`;
      try {
        await navigator.clipboard.writeText(url);
        document.getElementById('pulseShare').textContent = '✓ Link copied';
        setTimeout(() => {
          const b = document.getElementById('pulseShare');
          if (b) b.textContent = '🔗 Share join link';
        }, 1800);
      } catch (_) {
        window.prompt('Copy this participant link:', url);
      }
    };
  };

  const addEditorBack = () => {
    const top = document.querySelector('.editor-top');
    if (!top || document.getElementById('pulseEditorBack')) return;
    const brand = top.querySelector('.brand-btn');
    if (!brand) return;
    const back = document.createElement('button');
    back.id = 'pulseEditorBack';
    back.className = 'pulse-editor-back';
    back.type = 'button';
    back.textContent = '← Back';
    brand.parentNode.insertBefore(back, brand);
    back.onclick = () => document.getElementById('editorHome')?.click();
  };

  // Bridge the host back button to the existing editor function without changing its live-session code.
  window.addEventListener('pulse:back-to-editor', () => {
    const p = window.__pulsePresentation;
    if (p && typeof window.__pulseOpenEditor === 'function') {
      window.__pulseOpenEditor(p);
      return;
    }
    // The app's current implementation exposes the presentation through its internal state only.
    // Fall back to the presentation dashboard rather than trapping the user in the session.
    document.getElementById('exit')?.click();
  });

  const observe = () => {
    addHostNavigation();
    addEditorBack();
  };
  new MutationObserver(observe).observe(app, { childList: true, subtree: true });
  observe();
})();
