// ── WEEKLY RECAP MODULE ───────────────────────────────────────
const Recap = (() => {
  async function init() {}

  function _getWeekBounds(offset = 0) {
    const now = new Date();
    const day = now.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    const mon = new Date(now);
    mon.setDate(now.getDate() + diff + offset * 7);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { start: Utils.dateKey(mon), end: Utils.dateKey(sun), mon, sun };
  }

  async function generate(weekOffset = 0) {
    const { start, end, mon, sun } = _getWeekBounds(weekOffset);

    const [orders, todos, mood, finances] = await Promise.all([
      DB.getAll('orders'),
      DB.getAll('todos'),
      DB.getAll('mood'),
      DB.getAll('finances'),
    ]);

    const weekOrders = orders.filter(o => {
      const ref = o.deliveredAt || o.createdAt || '';
      return ref >= start && ref <= end && o.status === 'delivered';
    });
    const weekRevenue = weekOrders.reduce((s,o) => s+(o.totalSell||0), 0);
    const weekProfit  = weekOrders.reduce((s,o) => s+(o.totalSell||0)-(o.totalBuy||0), 0);

    const weekTodos = todos.filter(t => t.doneAt && t.doneAt >= start && t.doneAt <= end);
    const pendingTodos = todos.filter(t => !t.done);

    const weekMood = mood.filter(e => e.date >= start && e.date <= end);
    const avgMood = weekMood.length
      ? Math.round(weekMood.reduce((s,e) => {
          const vals = Object.values(e.scores||{});
          return s + (vals.length ? vals.reduce((a,v)=>a+v,0)/vals.length : 5);
        }, 0) / weekMood.length * 10) / 10
      : null;

    const weekTx = finances.filter(t => t.date >= start && t.date <= end);
    const extraIncome = weekTx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
    const extraExp = weekTx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);

    return { start, end, mon, sun, weekOrders, weekRevenue, weekProfit, weekTodos, pendingTodos, weekMood, avgMood, extraIncome, extraExp };
  }

  async function render(container, weekOffset = 0) {
    if (!container) return;
    container.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted)">Chargement...</div>`;

    const d = await generate(weekOffset);
    const isCurrentWeek = weekOffset === 0;
    const isPastWeek = weekOffset === -1;

    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:8px">
        <button class="btn-secondary" style="padding:8px 14px;font-size:13px" onclick="Recap._nav(${weekOffset-1})">‹ Préc.</button>
        <h2 style="font-size:16px;font-weight:800;text-align:center;flex:1">
          ${isCurrentWeek ? '📊 Cette semaine' : isPastWeek ? '📊 Semaine dernière' : `📊 Semaine du ${Utils.formatDate(d.start)}`}
        </h2>
        ${weekOffset < 0 ? `<button class="btn-secondary" style="padding:8px 14px;font-size:13px" onclick="Recap._nav(${weekOffset+1})">Suiv. ›</button>` : '<div style="width:80px"></div>'}
      </div>

      <div style="font-size:12px;color:var(--text-muted);text-align:center;margin-bottom:20px">
        ${Utils.formatDate(d.start)} — ${Utils.formatDate(d.end)}
      </div>

      <!-- Business -->
      <div class="fin-section-title">💼 BUSINESS</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px;text-align:center">
          <div style="font-size:22px;font-weight:900;color:var(--accent-green)">+${Math.round(d.weekRevenue)}€</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px">CA SEMAINE</div>
        </div>
        <div style="background:var(--bg-card);border:1px solid var(--accent-green);border-radius:var(--radius-lg);padding:14px;text-align:center">
          <div style="font-size:22px;font-weight:900;color:var(--accent-green)">+${Math.round(d.weekProfit)}€</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px">BÉNÉFICE NET</div>
        </div>
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px;text-align:center">
          <div style="font-size:22px;font-weight:900;color:var(--accent-crystal)">${d.weekOrders.length}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px">COMMANDES LIVRÉES</div>
        </div>
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px;text-align:center">
          <div style="font-size:22px;font-weight:900;color:${d.extraExp>0?'var(--accent-red)':'var(--text-muted)'}">-${Math.round(d.extraExp)}€</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px">DÉPENSES</div>
        </div>
      </div>

      <!-- Todos -->
      <div class="fin-section-title">✅ PRODUCTIVITÉ</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px;text-align:center">
          <div style="font-size:22px;font-weight:900;color:var(--accent-green)">${d.weekTodos.length}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px">TÂCHES FAITES</div>
        </div>
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px;text-align:center">
          <div style="font-size:22px;font-weight:900;color:${d.pendingTodos.length>0?'var(--accent-gold)':'var(--accent-green)'}">${d.pendingTodos.length}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px">EN ATTENTE</div>
        </div>
      </div>
      ${d.weekTodos.length ? `
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px;margin-bottom:16px">
          ${d.weekTodos.slice(0,5).map(t => `<div style="font-size:13px;color:var(--text-secondary);padding:4px 0;display:flex;gap:8px;align-items:center"><span style="color:var(--accent-green)">✓</span>${t.text}</div>`).join('')}
          ${d.weekTodos.length > 5 ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">+${d.weekTodos.length-5} autres</div>` : ''}
        </div>` : ''}

      <!-- Mood -->
      <div class="fin-section-title">🧠 MOOD</div>
      ${d.avgMood !== null ? `
        <div style="display:flex;align-items:center;gap:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;margin-bottom:16px">
          <div style="font-size:40px;font-weight:900;color:${Utils.scoreColor(d.avgMood)}">${d.avgMood}</div>
          <div>
            <div style="font-size:14px;font-weight:700">Moyenne sur ${d.weekMood.length} jour${d.weekMood.length>1?'s':''}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${d.avgMood >= 8 ? '🔥 Excellente semaine !' : d.avgMood >= 6 ? '👍 Bonne semaine' : d.avgMood >= 4 ? '😐 Semaine mitigée' : '💪 Courage pour la prochaine'}</div>
          </div>
        </div>` :
        `<div style="color:var(--text-muted);font-size:13px;margin-bottom:16px">Aucune entrée mood cette semaine</div>`}
    `;

  }

  async function checkAndShowMonday() {
    const today = new Date();
    if (today.getDay() !== 1) return; // Only monday
    const lastShown = await DB.getSetting('last_recap_shown');
    const todayStr = Utils.today();
    if (lastShown === todayStr) return;
    await DB.setSetting('last_recap_shown', todayStr);
    return true; // Signal to show button
  }

  return { init, generate, render, checkAndShowMonday };
})();

// Navigation (assigned after IIFE so Recap exists)
Recap._nav = function(offset) {
  const container = document.getElementById('divers-sub-content');
  if (container) Recap.render(container, offset);
};
