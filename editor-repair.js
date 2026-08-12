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
  window.PulseEditorRepair = { migratePresentations };
})();
