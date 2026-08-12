(function () {
  const CURRENT_KEY = 'pulsePresentationsV7';
  const LEGACY_KEYS = [
    'pulsePresentations',
    'pulsePresentationsV1',
    'pulsePresentationsV2',
    'pulsePresentationsV3',
    'pulsePresentationsV4',
    'pulsePresentationsV5',
    'pulsePresentationsV6',
  ];

  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function migratePresentations() {
    let current = read(CURRENT_KEY);
    const byId = new Map(current.map(p => [p.id, p]));
    const byTitle = new Map(current.map(p => [String(p.title || '').trim().toLowerCase(), p]));
    let changed = false;

    for (const key of LEGACY_KEYS) {
      for (const legacy of read(key)) {
        if (!legacy || !Array.isArray(legacy.slides) || !legacy.slides.length) continue;
        const idMatch = legacy.id && byId.get(legacy.id);
        const titleKey = String(legacy.title || '').trim().toLowerCase();
        const titleMatch = titleKey && byTitle.get(titleKey);
        const match = idMatch || titleMatch;

        if (!match) {
          current.push(legacy);
          if (legacy.id) byId.set(legacy.id, legacy);
          if (titleKey) byTitle.set(titleKey, legacy);
          changed = true;
          continue;
        }

        if (legacy.slides.length > (match.slides?.length || 0)) {
          Object.assign(match, legacy);
          changed = true;
        }
      }
    }

    if (changed) localStorage.setItem(CURRENT_KEY, JSON.stringify(current));
  }

  migratePresentations();

  const originalIo = window.io;
  if (typeof originalIo === 'function') {
    const wrappedIo = function (...args) {
      const sock = originalIo.apply(this, args);
      window.PulseLiveSocket = sock;
      installLiveQuizRepair(sock);
      return sock;
    };
    Object.keys(originalIo).forEach(k => { try { wrappedIo[k] = originalIo[k]; } catch (_) {} });
    window.io = wrappedIo;
  }

  let liveState = { slide: null, leaderboard: null };
  let timerHandle = null;
  let observerInstalled = false;

  const esc = v => String(v ?? '').replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));

  function installLiveQuizRepair(sock) {
    if (!sock || sock.__pulseRepairInstalled) return;
    sock.__pulseRepairInstalled = true;

    sock.on('slide:open', slide => {
      liveState.slide = slide || null;
      liveState.leaderboard = slide?.leaderboard || liveState.leaderboard;
      scheduleRepair();
    });

    sock.on('slide:progress', data => {
      liveState.leaderboard = data?.leaderboard || liveState.leaderboard;
      scheduleRepair();
    });

    sock.on('slide:results', data => {
      liveState.slide = data?.slide || liveState.slide;
      liveState.leaderboard = data?.leaderboard || liveState.leaderboard;
      scheduleRepair();
    });

    sock.on('session:complete', data => {
      liveState.leaderboard = data?.leaderboard || liveState.leaderboard;
      stopRepairTimer();
      scheduleRepair();
    });

    if (!observerInstalled) {
      observerInstalled = true;
      const observer = new MutationObserver(scheduleRepair);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  function scheduleRepair() {
    clearTimeout(scheduleRepair._t);
    scheduleRepair._t = setTimeout(repairLiveUI, 0);
  }

  function isAnswerSlide(slide) {
    return ['quiz', 'truefalse', 'poll'].includes(slide?.type);
  }

  function repairLiveUI() {
    const slide = liveState.slide;
    if (!slide) return;

    if (isAnswerSlide(slide) && document.querySelector('.host-timer, .participant-timer')) {
      const duration = Math.max(1, Number(slide.duration) || 30);
      startRepairTimer(Number(slide.startedAt) || Date.now(), duration);
      ensureLiveLeaderboard();
    } else if (slide.type === 'leaderboard') {
      stopRepairTimer();
      renderDedicatedLeaderboard();
    }
  }

  function startRepairTimer(startedAt, duration) {
    if (timerHandle?.startedAt === startedAt && timerHandle?.duration === duration) return;
    stopRepairTimer();
    const tick = () => {
      const left = Math.max(0, duration * 1000 - (Date.now() - startedAt));
      const text = Math.ceil(left / 1000) + 's';
      document.querySelectorAll('.host-timer, .participant-timer').forEach(el => {
        el.textContent = text;
        el.classList.toggle('timer-critical', left <= 5000);
      });
      if (left > 0) timerHandle.raf = requestAnimationFrame(tick);
    };
    timerHandle = { startedAt, duration, raf: 0 };
    tick();
  }

  function stopRepairTimer() {
    if (timerHandle?.raf) cancelAnimationFrame(timerHandle.raf);
    timerHandle = null;
  }

  function boardRows() {
    const top = liveState.leaderboard?.top || [];
    if (!top.length) return '<div class="pulse-board-empty">No scores yet — scores will appear as people answer.</div>';
    return top.slice(0, 10).map(p => `
      <div class="pulse-board-row">
        <span><b>#${Number(p.rank) || ''}</b> ${esc(p.name)}</span>
        <strong>${Number(p.score || 0).toLocaleString()}</strong>
      </div>`).join('');
  }

  function leaderboardHtml() {
    return `<div class="pulse-live-board">
      <div class="pulse-board-heading"><span>🏆 Live leaderboard</span><small>TOP 10</small></div>
      <div class="pulse-board-rows">${boardRows()}</div>
    </div>`;
  }

  function ensureLiveLeaderboard() {
    const host = document.querySelector('.host-question');
    const participant = document.querySelector('.participant-question');
    const target = host || participant;
    if (!target) return;

    let board = target.querySelector('.pulse-live-board');
    if (!board) {
      target.insertAdjacentHTML('beforeend', leaderboardHtml());
      return;
    }

    const rows = board.querySelector('.pulse-board-rows');
    const nextRows = boardRows();
    if (rows && rows.innerHTML !== nextRows) rows.innerHTML = nextRows;
  }

  function renderDedicatedLeaderboard() {
    const host = document.querySelector('.host-question');
    const participant = document.querySelector('.participant-question');
    const target = host || participant;
    if (!target) return;

    let dedicated = target.querySelector('.pulse-dedicated-board');
    if (!dedicated) {
      target.innerHTML = `<div class="pulse-dedicated-board">
        <div class="eyebrow">LEADERBOARD</div>
        <h1>🏆 ${esc(liveState.slide?.title || 'Leaderboard')}</h1>
        ${leaderboardHtml()}
      </div>`;
    } else {
      const rows = dedicated.querySelector('.pulse-board-rows');
      const nextRows = boardRows();
      if (rows && rows.innerHTML !== nextRows) rows.innerHTML = nextRows;
    }

    if (host) {
      const controls = document.querySelector('.present-controls');
      if (controls && !document.querySelector('#pulseLeaderboardNext')) {
        controls.innerHTML = '<button class="primary" id="pulseLeaderboardNext">Next</button>';
        document.querySelector('#pulseLeaderboardNext')?.addEventListener('click', () => {
          window.PulseLiveSocket?.emit('host:next');
        });
      }
    }
  }

  window.PulseEditorRepair = { migratePresentations, installLiveQuizRepair };
})();
