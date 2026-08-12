// Pulse live-session reliability layer.
// Runs beside app.js so the core editor/presentation flow stays untouched.
(() => {
  const socket = io();
  let timerInterval = null;
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const isParticipant = () => !!$('.participant-page');

  const ensureStyles = () => {
    if ($('#pulse-live-fixes-style')) return;
    const style = document.createElement('style');
    style.id = 'pulse-live-fixes-style';
    style.textContent = `
      .pulse-live-timer-overlay{position:fixed;top:78px;right:28px;z-index:9999;min-width:108px;padding:12px 16px;border-radius:16px;background:#635bff;color:#fff;box-shadow:0 10px 30px #0003;text-align:center;pointer-events:none;font:800 30px/1.05 Inter,'DM Sans',Arial,sans-serif}
      .pulse-live-timer-overlay small{display:block;font:700 10px/1.2 Inter,'DM Sans',Arial,sans-serif;letter-spacing:1.4px;opacity:.85;margin-bottom:4px}
      .pulse-live-timer-overlay.warning{background:#d97706}.pulse-live-timer-overlay.done{background:#d84b4b}
      .participant-options button{position:relative!important;z-index:5!important;pointer-events:auto!important;touch-action:manipulation!important;cursor:pointer!important}
      .pulse-live-board{max-width:650px;margin:26px auto;padding:20px;background:#fff;border:1px solid #e7e7e7;border-radius:16px;box-shadow:0 10px 30px #0000000d;text-align:left}
      .pulse-live-board h3{margin:0 0 12px;font:700 24px/1.1 'Space Grotesk',Inter,sans-serif}
      .pulse-live-board-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;border-radius:9px;background:#f7f7f8;margin:5px 0}
      .pulse-live-board-row.me{background:#f0eeff;outline:1px solid #d7d2ff}
      .pulse-live-board-rank{width:32px;font-weight:800;color:#635bff}.pulse-live-board-name{flex:1;font-weight:700}.pulse-live-board-score{font-weight:800}
      @media(max-width:650px){.pulse-live-timer-overlay{top:68px;right:12px;min-width:82px;padding:9px 12px;font-size:24px}.pulse-live-timer-overlay small{font-size:9px}}
    `;
    document.head.appendChild(style);
  };

  const timerEl = () => {
    let el = $('.pulse-live-timer-overlay');
    if (!el) {
      el = document.createElement('div');
      el.className = 'pulse-live-timer-overlay';
      el.innerHTML = '<small>TIME LEFT</small><span>0s</span>';
      document.body.appendChild(el);
    }
    return el;
  };

  const removeTimer = () => {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    document.querySelector('.pulse-live-timer-overlay')?.remove();
  };

  const startVisibleTimer = (slide) => {
    if (!slide || !slide.duration || !slide.startedAt) { removeTimer(); return; }
    ensureStyles();
    const el = timerEl();
    if (timerInterval) clearInterval(timerInterval);
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((slide.startedAt + slide.duration * 1000 - Date.now()) / 1000));
      el.querySelector('span').textContent = `${remaining}s`;
      el.classList.toggle('warning', remaining <= 5 && remaining > 0);
      el.classList.toggle('done', remaining <= 0);
      if (remaining <= 0) {
        document.querySelectorAll('.participant-options button').forEach(b => { b.disabled = true; });
        if (isParticipant() && $('#answerMsg') && !$('#answerMsg').textContent.trim()) $('#answerMsg').textContent = 'Time is up — 0 points for this question.';
        clearInterval(timerInterval); timerInterval = null;
      }
    };
    tick();
    timerInterval = setInterval(tick, 250);
  };

  const renderLeaderboard = (board) => {
    if (!isParticipant() || !board) return;
    ensureStyles();
    let wrap = $('.pulse-live-board');
    if (!wrap) {
      wrap = document.createElement('section');
      wrap.className = 'pulse-live-board';
      const page = $('.participant-page');
      (page || document.body).appendChild(wrap);
    }
    const rows = (board.top || []).map(p => `<div class="pulse-live-board-row ${board.participantRank===p.rank?'me':''}"><span class="pulse-live-board-rank">${p.rank}</span><span class="pulse-live-board-name">${esc(p.name)}</span><span class="pulse-live-board-score">${p.score}</span></div>`).join('');
    wrap.innerHTML = `<h3>🏆 Live leaderboard</h3>${rows || '<div class="hint">No scores yet.</div>'}${board.participantRank?`<div class="hint" style="margin-top:12px">Your rank: <b>#${board.participantRank}</b> · ${board.participantScore ?? 0} points</div>`:''}`;
  };

  const joinObserver = () => {
    const params = new URLSearchParams(location.search);
    const hostCode = params.get('host');
    const hostToken = params.get('token');
    if (hostCode && hostToken) {
      socket.emit('host:join', {code:hostCode, token:hostToken});
      return;
    }
    const saved = JSON.parse(sessionStorage.getItem('pulseParticipant') || 'null');
    if (saved?.code) socket.emit('participant:observe', {code:saved.code});
  };

  // Capture participant join details without creating a second participant.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#joinBtn');
    if (!btn) return;
    setTimeout(() => {
      const code = $('#code')?.value?.trim();
      const name = $('#name')?.value?.trim();
      if (code && name) {
        sessionStorage.setItem('pulseParticipant', JSON.stringify({code, name}));
        socket.emit('participant:observe', {code});
      }
    }, 150);
  }, true);

  socket.on('slide:open', slide => {
    startVisibleTimer(slide);
    if (isParticipant()) $('.pulse-live-board')?.remove();
  });
  socket.on('slide:results', payload => {
    removeTimer();
    if (isParticipant()) renderLeaderboard(payload?.leaderboard);
  });
  socket.on('session:complete', payload => {
    removeTimer();
    if (isParticipant()) renderLeaderboard(payload?.leaderboard);
  });
  socket.on('connect', joinObserver);

  ensureStyles();
  new MutationObserver(() => {
    if (isParticipant()) {
      document.querySelectorAll('.participant-options button').forEach(b => {
        b.style.pointerEvents = 'auto';
        b.style.touchAction = 'manipulation';
      });
    }
  }).observe(document.body, {childList:true, subtree:true});
})();
