// Keeps the live countdown directly beside the question so it is impossible to miss.
(() => {
  const moveTimer = () => {
    document.querySelectorAll('.host-live .live-question, .participant .participant-card').forEach(card => {
      const timer = card.querySelector('.timer');
      const title = card.querySelector('h1');
      if (!timer || !title) return;
      if (!timer.classList.contains('live-timer-prominent')) {
        timer.classList.add('live-timer-prominent');
        const wrap = document.createElement('div');
        wrap.className = 'live-timer-wrap';
        wrap.innerHTML = '<span class="live-timer-label">TIME LEFT</span>';
        timer.parentNode.insertBefore(wrap, title);
        wrap.appendChild(timer);
      }
    });
  };
  moveTimer();
  new MutationObserver(moveTimer).observe(document.body, { childList: true, subtree: true });
})();
