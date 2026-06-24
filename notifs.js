// ── APEX NOTIFICATIONS v17 ────────────────────────────────────
// v17: Fix majeur — sendToSW utilise maintenant SHOW_NOTIF_AT avec un
// timestamp absolu au lieu de SHOW_NOTIF + setTimeout (qui mourait quand
// le Service Worker s'endormait, rendant toutes les notifs silencieuses
// sauf le test de 5 sec).

const Notifs = (() => {

  // ── Default config ────────────────────────────────────────
  const DEFAULTS = {
    medocs:   { enabled: true,  hour: 8,  min: 0  },
    workout:  { enabled: true,  hour: 7,  min: 30 },
    tasks:    { enabled: true,  hour: 8,  min: 15 },
    mood:     { enabled: true,  hour: 21, min: 0  },
    finances: { enabled: true,  hour: 20, min: 0  },
    orders:   { enabled: true,  hour: 9,  min: 0  },
  };

  const LABELS = {
    medocs:   '💊 Médicaments',
    workout:  '🏋️ Entraînement',
    tasks:    '✅ Tâches',
    mood:     '🧠 Mood',
    finances: '💰 Finances',
    orders:   '📦 Commandes',
  };

  async function getConfig() {
    const saved = await DB.getSetting('notif_config');
    if (saved) {
      const merged = { ...DEFAULTS };
      Object.keys(saved).forEach(k => { if (merged[k]) merged[k] = { ...merged[k], ...saved[k] }; });
      return merged;
    }
    return { ...DEFAULTS };
  }

  async function saveConfig(config) {
    await DB.setSetting('notif_config', config);
  }

  // ── Permission ────────────────────────────────────────────
  async function requestPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try {
      const result = await Notification.requestPermission();
      return result === 'granted';
    } catch(e) { return false; }
  }

  function hasPermission() {
    return 'Notification' in window && Notification.permission === 'granted';
  }

  // ── Core scheduler ────────────────────────────────────────
  // Retourne un timestamp absolu (ms epoch) pour la prochaine occurrence de hour:min
  function nextTimestamp(hour, min) {
    const now = new Date();
    const target = new Date();
    target.setHours(hour, min, 0, 0);
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }
    return target.getTime();
  }

  // ── Envoie une notif au SW avec timestamp absolu (robuste) ─
  async function sendToSW(title, body, tag, timestamp) {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg.active) {
        reg.active.postMessage({
          type: 'SHOW_NOTIF_AT',
          title,
          body,
          tag,
          timestamp,
        });
      }
    } catch(e) {}
  }

  // ── Envoie une notif immédiate avec délai ms (test seulement) ─
  async function sendToSWDelay(title, body, tag, delayMs) {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg.active) {
        reg.active.postMessage({
          type: 'SHOW_NOTIF',
          title,
          body,
          tag,
          delay: delayMs,
        });
      }
    } catch(e) {}
  }

  // ── Build notification content ────────────────────────────
  async function _buildMedocsNotif() {
    const medocs = await DB.getAll('medocs');
    const todayKey = Utils.getDayKey(new Date());
    const todayStr = Utils.today();
    const due = medocs.filter(m => m.days?.includes(todayKey));
    const taken = due.filter(m => m.taken?.[todayStr]);
    const remaining = due.filter(m => !m.taken?.[todayStr]);

    if (!due.length) return null;

    if (!remaining.length) {
      return {
        title: '💊 Médicaments — Tout pris ✓',
        body: `${taken.length} prise${taken.length > 1 ? 's' : ''} complétée${taken.length > 1 ? 's' : ''} aujourd'hui`,
      };
    }
    const names = remaining.map(m => m.name).join(', ');
    return {
      title: `💊 ${remaining.length} médicament${remaining.length > 1 ? 's' : ''} à prendre`,
      body: names.length > 60 ? names.slice(0, 57) + '...' : names,
    };
  }

  async function _buildWorkoutNotif() {
    const program = await DB.get('workout_program', 'main') || { days: {} };
    const todayKey = Utils.getDayKey(new Date());
    const workout = program.days[todayKey];
    if (!workout) {
      return { title: '🏋️ Repos aujourd\'hui', body: 'Récupération active — profites-en !' };
    }
    const quotes = [
      'Let\'s go 🔥',
      'C\'est l\'heure de briller 💪',
      'No excuses 🎯',
      'Beast mode ON ⚡',
      'Make it count 🏆',
    ];
    const quote = quotes[new Date().getDate() % quotes.length];
    return { title: `🏋️ ${workout}`, body: quote };
  }

  async function _buildTasksNotif() {
    const todos = await DB.getAll('todos');
    const today = Utils.today();
    const overdue = todos.filter(t => !t.done && t.dueDate && t.dueDate < today);
    const dueToday = todos.filter(t => !t.done && t.dueDate === today);
    const pinned = todos.filter(t => !t.done && t.pinned);

    if (!overdue.length && !dueToday.length && !pinned.length) {
      const pending = todos.filter(t => !t.done);
      if (!pending.length) return { title: '✅ Aucune tâche en attente', body: 'Tout est à jour — belle journée !' };
      return { title: `✅ ${pending.length} tâche${pending.length > 1 ? 's' : ''} en attente`, body: 'Ouvre APEX pour voir ta liste' };
    }

    let title = '';
    let lines = [];

    if (overdue.length) {
      title = `⚠️ ${overdue.length} tâche${overdue.length > 1 ? 's' : ''} en retard`;
      lines.push(...overdue.slice(0, 2).map(t => `• ${t.text}`));
    } else if (dueToday.length) {
      title = `📅 ${dueToday.length} tâche${dueToday.length > 1 ? 's' : ''} aujourd'hui`;
      lines.push(...dueToday.slice(0, 2).map(t => `• ${t.text}`));
    } else {
      title = `📌 ${pinned.length} tâche${pinned.length > 1 ? 's' : ''} épinglée${pinned.length > 1 ? 's' : ''}`;
      lines.push(...pinned.slice(0, 2).map(t => `• ${t.text}`));
    }

    return { title, body: lines.join('\n') };
  }

  async function _buildMoodNotif() {
    const entries = await DB.getAll('mood');
    const today = Utils.today();
    const doneToday = entries.find(e => e.date === today);
    if (doneToday) {
      const vals = Object.values(doneToday.scores || {});
      const avg = vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length * 10) / 10 : 5;
      return {
        title: '🧠 Journaling déjà complété ✓',
        body: `Score du jour : ${avg}/10 — bonne soirée !`,
      };
    }
    const streak = _getMoodStreak(entries, today);
    if (streak > 2) {
      return {
        title: '🧠 Journaling du soir',
        body: `🔥 ${streak} jours de suite — continue comme ça !`,
      };
    }
    return {
      title: '🧠 Comment s\'est passée ta journée ?',
      body: 'Prends 2 min pour remplir ton journaling',
    };
  }

  function _getMoodStreak(entries, today) {
    const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
    let streak = 0;
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    for (let i = 0; i < 30; i++) {
      const ds = Utils.dateKey(d);
      if (sorted.find(e => e.date === ds)) streak++;
      else break;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  async function _buildFinancesNotif() {
    const orders = await DB.getAll('orders');
    const finances = await DB.getAll('finances');
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const threshold = Utils.dateKey(thirtyDaysAgo);

    let ca = 0, profit = 0, count = 0;
    orders.forEach(o => {
      if (o.status === 'delivered') {
        const ref = o.deliveredAt || o.createdAt || '';
        if (ref >= threshold) {
          ca += o.totalSell || 0;
          profit += (o.totalSell || 0) - (o.totalBuy || 0);
          count++;
        }
      }
    });
    finances.forEach(t => {
      if (t.date >= threshold) {
        if (t.type === 'income') { ca += t.amount; profit += t.amount; }
        else profit -= t.amount;
      }
    });

    const profitStr = `${profit >= 0 ? '+' : ''}${Math.round(profit)}€`;
    const caStr = `+${Math.round(ca)}€`;
    let emoji = profit > 2000 ? '🚀' : profit > 1000 ? '💪' : profit > 500 ? '📈' : profit > 0 ? '✅' : '⚠️';
    let vibe = profit > 2000 ? 'Incroyable — continue !' : profit > 1000 ? 'Excellent mois !' : profit > 500 ? 'Bon travail !' : profit > 0 ? 'On avance !' : 'Analyse tes coûts';

    return {
      title: `${emoji} 30 derniers jours : ${profitStr} de bénéfice`,
      body: `CA : ${caStr} · ${count} commande${count > 1 ? 's' : ''} livrée${count > 1 ? 's' : ''} — ${vibe}`,
    };
  }

  async function _buildOrdersNotif() {
    const orders = await DB.getAll('orders');
    const clients = await DB.getAll('clients');
    const clientMap = {};
    clients.forEach(c => clientMap[c.id] = c.name);

    const active = orders.filter(o => o.status !== 'delivered');
    if (!active.length) {
      return {
        title: '📦 Aucune commande en cours',
        body: 'Pipeline vide — temps de prospecter 🎯',
      };
    }

    const today = Utils.today();
    const oldest = [...active].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    const daysSince = Math.floor((new Date(today) - new Date(oldest.createdAt + 'T12:00:00')) / 86400000);
    const clientName = clientMap[oldest.clientId] || oldest.clientName || '—';

    const pending = active.filter(o => o.status === 'pending').length;
    const paid = active.filter(o => o.status === 'paid').length;
    const inTransit = active.filter(o => o.status === 'supplier_sent').length;

    let statusLine = [];
    if (pending) statusLine.push(`${pending} en attente`);
    if (paid) statusLine.push(`${paid} payée${paid > 1 ? 's' : ''}`);
    if (inTransit) statusLine.push(`${inTransit} en transit`);

    const urgentFlag = daysSince >= 5 ? '⚠️' : '📦';

    return {
      title: `${urgentFlag} ${active.length} commande${active.length > 1 ? 's' : ''} en cours`,
      body: daysSince >= 3
        ? `${clientName} attend depuis ${daysSince}j · ${statusLine.join(' · ')}`
        : statusLine.join(' · '),
    };
  }

  // ── Main schedule function — appelé à chaque ouverture de l'app ───
  async function scheduleAll() {
    if (!hasPermission()) return;

    // Annuler les notifs programmées existantes
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg.active) reg.active.postMessage({ type: 'CANCEL_ALL' });
    } catch(e) {}

    const config = await getConfig();

    // Medocs — une notif par heure de rappel unique parmi les medocs actifs
    if (config.medocs.enabled) {
      const medocs = await DB.getAll('medocs');
      const todayKey = Utils.getDayKey(new Date());
      const todayMedocs = medocs.filter(m => m.days?.includes(todayKey));

      const times = new Set();
      todayMedocs.forEach(m => (m.reminders || []).forEach(t => times.add(t)));

      if (times.size > 0) {
        for (const timeStr of times) {
          const [h, min] = timeStr.split(':').map(Number);
          const ts = nextTimestamp(h, min);
          const content = await _buildMedocsNotif();
          if (content) await sendToSW(content.title, content.body, `medoc-${timeStr}`, ts);
        }
      } else {
        const ts = nextTimestamp(config.medocs.hour, config.medocs.min);
        const content = await _buildMedocsNotif();
        if (content) await sendToSW(content.title, content.body, 'medoc-main', ts);
      }
    }

    // Workout
    if (config.workout.enabled) {
      const ts = nextTimestamp(config.workout.hour, config.workout.min);
      const content = await _buildWorkoutNotif();
      if (content) await sendToSW(content.title, content.body, 'workout-daily', ts);
    }

    // Tasks
    if (config.tasks.enabled) {
      const ts = nextTimestamp(config.tasks.hour, config.tasks.min);
      const content = await _buildTasksNotif();
      if (content) await sendToSW(content.title, content.body, 'tasks-daily', ts);
    }

    // Mood
    if (config.mood.enabled) {
      const ts = nextTimestamp(config.mood.hour, config.mood.min);
      const content = await _buildMoodNotif();
      if (content) await sendToSW(content.title, content.body, 'mood-daily', ts);
    }

    // Finances
    if (config.finances.enabled) {
      const ts = nextTimestamp(config.finances.hour, config.finances.min);
      const content = await _buildFinancesNotif();
      if (content) await sendToSW(content.title, content.body, 'finances-daily', ts);
    }

    // Orders
    if (config.orders.enabled) {
      const ts = nextTimestamp(config.orders.hour, config.orders.min);
      const content = await _buildOrdersNotif();
      if (content) await sendToSW(content.title, content.body, 'orders-daily', ts);
    }
  }

  // ── Settings UI ───────────────────────────────────────────
  async function renderSettings(container) {
    const config = await getConfig();
    const permitted = hasPermission();

    // Vérifie si TimestampTrigger est supporté
    const supportsScheduled = typeof TimestampTrigger !== 'undefined';

    container.innerHTML = `
      <div class="fin-section-title">🔔 NOTIFICATIONS</div>

      ${!permitted ? `
        <div style="background:rgba(255,77,109,0.08);border:1px solid rgba(255,77,109,0.2);border-radius:var(--radius-lg);padding:14px;margin-bottom:16px">
          <div style="font-size:13px;font-weight:700;color:var(--accent-red);margin-bottom:6px">Notifications désactivées</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">Autorise les notifications dans les paramètres Chrome pour activer cette fonctionnalité.</div>
          <button class="btn-primary" style="width:100%;font-size:13px" onclick="Notifs.askPermission()">🔔 Autoriser les notifications</button>
        </div>` : `
        <div style="background:rgba(0,212,126,0.08);border:1px solid rgba(0,212,126,0.2);border-radius:var(--radius-lg);padding:12px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
          <span style="font-size:18px">✅</span>
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--accent-green)">Notifications actives</div>
            <div style="font-size:11px;color:var(--text-secondary)">${supportsScheduled ? 'Mode robuste activé (TimestampTrigger ✓)' : 'Reprogrammées à chaque ouverture de l\'app'}</div>
          </div>
        </div>`}

      ${!supportsScheduled && permitted ? `
        <div style="background:rgba(255,165,0,0.08);border:1px solid rgba(255,165,0,0.2);border-radius:var(--radius-lg);padding:12px;margin-bottom:16px">
          <div style="font-size:12px;color:orange;font-weight:700;margin-bottom:4px">⚠️ Mode compatibilité</div>
          <div style="font-size:11px;color:var(--text-secondary)">Ton Chrome ne supporte pas encore le scheduling natif. Les notifs fonctionnent si tu ouvres l'app au moins une fois par jour.</div>
        </div>` : ''}

      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
        ${Object.entries(config).map(([key, val]) => `
          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${val.enabled ? '12px' : '0'}">
              <div style="font-size:14px;font-weight:700">${LABELS[key]}</div>
              <label class="notif-toggle">
                <input type="checkbox" ${val.enabled ? 'checked' : ''} onchange="Notifs._toggleKey('${key}',this.checked)">
                <span class="notif-toggle-slider"></span>
              </label>
            </div>
            ${val.enabled ? `
              <div style="display:flex;align-items:center;gap:10px">
                <span style="font-size:12px;color:var(--text-muted);flex-shrink:0">Heure :</span>
                <input type="time" class="form-input" style="flex:1;padding:8px 12px;font-size:14px"
                  value="${String(val.hour).padStart(2,'0')}:${String(val.min).padStart(2,'0')}"
                  onchange="Notifs._setTime('${key}',this.value)">
              </div>` : ''}
          </div>`).join('')}
      </div>

      <button class="btn-primary" style="width:100%;margin-bottom:8px" onclick="Notifs.saveAndSchedule()">
        💾 Sauvegarder & programmer
      </button>
      <button class="btn-secondary" style="width:100%;font-size:12px" onclick="Notifs.testNotif()">
        🧪 Envoyer une notif de test (5 sec)
      </button>
    `;

    window._notifConfigEdit = JSON.parse(JSON.stringify(config));
  }

  async function _toggleKey(key, enabled) {
    if (!window._notifConfigEdit) window._notifConfigEdit = await getConfig();
    window._notifConfigEdit[key].enabled = enabled;
    const container = document.getElementById('notif-settings-container');
    if (container) await renderSettings(container);
  }

  async function _setTime(key, timeStr) {
    if (!window._notifConfigEdit) window._notifConfigEdit = await getConfig();
    const [h, m] = timeStr.split(':').map(Number);
    window._notifConfigEdit[key].hour = h;
    window._notifConfigEdit[key].min = m;
  }

  async function saveAndSchedule() {
    if (window._notifConfigEdit) {
      await saveConfig(window._notifConfigEdit);
    }
    await scheduleAll();
    Utils.toast('✅ Notifications programmées !');
  }

  async function askPermission() {
    const granted = await requestPermission();
    if (granted) {
      Utils.toast('✅ Notifications autorisées !');
      const container = document.getElementById('notif-settings-container');
      if (container) await renderSettings(container);
      await scheduleAll();
    } else {
      Utils.toast('⚠️ Permission refusée — vérifie les réglages Chrome');
    }
  }

  async function testNotif() {
    if (!hasPermission()) { Utils.toast('⚠️ Notifications non autorisées'); return; }
    await sendToSWDelay(
      '🧪 APEX — Test notification',
      'Si tu vois ça, les notifications fonctionnent parfaitement !',
      'apex-test',
      5000
    );
    Utils.toast('Notif de test dans 5 secondes...');
  }

  return {
    scheduleAll, getConfig, saveConfig, renderSettings,
    requestPermission, hasPermission, askPermission,
    _toggleKey, _setTime, saveAndSchedule, testNotif,
  };
})();
