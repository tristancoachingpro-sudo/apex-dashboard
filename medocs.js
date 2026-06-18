// ── MEDOCS MODULE ─────────────────────────────────────────────
const Medocs = (() => {
  const TYPES = ['Oral','Injectable','Topique','Patch','Autre'];
  const DAY_KEYS = ['lun','mar','mer','jeu','ven','sam','dim'];
  const DAY_LABELS = ['L','M','M','J','V','S','D'];
  let calYear, calMonth;

  async function init() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    await _purgeTakenHistory();
  }

  // Bug 1 fix: purge taken entries older than 90 days to prevent unbounded growth
  async function _purgeTakenHistory() {
    try {
      const medocs = await DB.getAll('medocs');
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const cutoffStr = Utils.dateKey(cutoff);
      let changed = false;
      for (const m of medocs) {
        if (!m.taken) continue;
        const before = Object.keys(m.taken).length;
        const cleaned = {};
        for (const [date, val] of Object.entries(m.taken)) {
          if (date >= cutoffStr) cleaned[date] = val;
        }
        if (Object.keys(cleaned).length < before) {
          m.taken = cleaned;
          await DB.put('medocs', m);
          changed = true;
        }
      }
    } catch(e) { /* non-blocking */ }
  }

  async function render() {
    await renderCalendar();
    await renderList();
  }

  async function renderCalendar() {
    const medocs = await DB.getAll('medocs');
    const todayStr = Utils.today();
    const container = document.getElementById('medoc-calendar');

    const doseDates = {};
    medocs.forEach(m => {
      if (!m.days) return;
      const firstDay = new Date(calYear, calMonth, 1);
      const lastDay = new Date(calYear, calMonth + 1, 0);
      for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        const dk = Utils.getDayKey(new Date(d));
        if (m.days.includes(dk)) {
          const key = Utils.dateKey(new Date(d));
          if (!doseDates[key]) doseDates[key] = { total: 0, taken: 0 };
          doseDates[key].total++;
          if (m.taken && m.taken[key]) doseDates[key].taken++;
        }
      }
    });

    const monthName = Utils.MONTHS_FR[calMonth];
    const firstDay = new Date(calYear, calMonth, 1);
    let startDow = firstDay.getDay();
    startDow = (startDow === 0) ? 6 : startDow - 1;

    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const prevDays = new Date(calYear, calMonth, 0).getDate();

    let cells = '';
    for (let i = startDow - 1; i >= 0; i--) {
      cells += `<div class="cal-day other-month">${prevDays - i}</div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isToday = dateStr === todayStr;
      const isPast  = new Date(dateStr) < new Date(todayStr);
      const info = doseDates[dateStr];
      const hasDose = info && info.total > 0;
      const allTaken = hasDose && info.taken >= info.total;
      const partialTaken = hasDose && info.taken > 0 && !allTaken;
      // UX: distinguish past missed doses
      let extraClass = '';
      if (isPast && hasDose && !allTaken) extraClass = 'dose-missed';

      cells += `<div class="cal-day ${isToday ? 'today' : ''} ${hasDose ? (allTaken ? 'dose-taken' : partialTaken ? 'dose-partial' : 'has-dose') : ''} ${extraClass}">${d}</div>`;
    }
    const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
    for (let d = 1; d <= totalCells - startDow - daysInMonth; d++) {
      cells += `<div class="cal-day other-month">${d}</div>`;
    }

    container.innerHTML = `
      <div class="cal-header">
        <span class="cal-title">${monthName} ${calYear}</span>
        <div style="display:flex;gap:4px">
          <button class="cal-nav" onclick="Medocs.prevMonth()">‹</button>
          <button class="cal-nav" onclick="Medocs.nextMonth()">›</button>
        </div>
      </div>
      <div class="cal-grid-labels">
        ${['L','M','M','J','V','S','D'].map(l => `<span>${l}</span>`).join('')}
      </div>
      <div class="cal-grid">${cells}</div>
      <div style="display:flex;gap:16px;margin-top:12px;font-size:11px;color:var(--text-muted);flex-wrap:wrap">
        <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:var(--accent-crystal);display:inline-block"></span>À prendre</span>
        <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:var(--accent-gold);display:inline-block"></span>Partiel</span>
        <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:var(--accent-green);display:inline-block"></span>Pris</span>
        <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:var(--accent-red);display:inline-block"></span>Manqué</span>
      </div>
    `;
  }

  function prevMonth() {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  }

  function nextMonth() {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  }

  async function renderList() {
    const medocs = await DB.getAll('medocs');
    const todayStr = Utils.today();
    const todayKey = Utils.getDayKey(new Date());
    const container = document.getElementById('medoc-list');

    if (!medocs.length) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">💊</div>
        <div class="empty-state-text">Aucun médicament configuré</div>
        <div class="empty-state-sub">Appuie sur + Ajouter pour commencer</div>
      </div>`;
      return;
    }

    container.innerHTML = medocs.map(m => {
      const isTodayDay = m.days && m.days.includes(todayKey);
      const taken = m.taken && m.taken[todayStr];
      // UX: show streak count
      let streakCount = 0;
      if (m.taken) {
        const d = new Date();
        for (let i = 0; i < 30; i++) {
          d.setDate(d.getDate() - (i === 0 ? 0 : 1));
          const dk = Utils.getDayKey(new Date(d));
          const ds = Utils.dateKey(new Date(d));
          if (m.days && m.days.includes(dk)) {
            if (m.taken[ds]) streakCount++;
            else break;
          }
        }
      }
      return `<div class="medoc-item">
        <div class="medoc-top">
          <span class="medoc-name">${m.name}</span>
          <div style="display:flex;gap:6px;align-items:center">
            ${streakCount > 1 ? `<span class="medoc-streak">🔥 ${streakCount}j</span>` : ''}
            <span class="medoc-type-badge">${m.type || 'Oral'}</span>
          </div>
        </div>
        <div class="medoc-dose">${m.dosage || '—'}</div>
        <div class="medoc-days">
          ${DAY_KEYS.map((k, i) => `<span class="medoc-day-pill ${m.days && m.days.includes(k) ? 'active' : ''}">${DAY_LABELS[i]}</span>`).join('')}
        </div>
        ${m.reminders && m.reminders.length ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">🔔 ${m.reminders.join(' · ')}</div>` : ''}
        <div class="medoc-actions">
          ${isTodayDay ? `<button class="medoc-take-btn ${taken ? 'taken' : ''}" onclick="Medocs.toggleTake('${Utils.escAttr(m.id)}')">
            ${taken ? '✓ Pris aujourd\'hui' : 'Marquer comme pris'}
          </button>` : `<span style="font-size:12px;color:var(--text-muted);flex:1">Pas prévu aujourd'hui</span>`}
          <button class="btn-secondary" onclick="Medocs.openEdit('${Utils.escAttr(m.id)}')" style="padding:8px 12px;font-size:12px">✏️</button>
          <button class="medoc-delete-btn" onclick="Medocs.deleteMedoc('${Utils.escAttr(m.id)}')">🗑</button>
        </div>
      </div>`;
    }).join('');
  }

  async function toggleTake(id) {
    const m = await DB.get('medocs', id);
    if (!m) return;
    const todayStr = Utils.today();
    if (!m.taken) m.taken = {};
    m.taken[todayStr] = !m.taken[todayStr];
    await DB.put('medocs', m);
    await render();
    App.renderHome();
    if (m.taken[todayStr]) Utils.toast('✅ Prise enregistrée');
  }

  function openAdd() { openForm(null); }
  async function openEdit(id) {
    const m = await DB.get('medocs', id);
    openForm(m);
  }

  function openForm(medoc) {
    const isEdit = !!medoc;
    const days = medoc ? medoc.days || [] : ['lun','mar','mer','jeu','ven','sam','dim'];
    const reminders = medoc ? medoc.reminders || ['08:00'] : ['08:00'];
    const type = medoc ? medoc.type || 'Oral' : 'Oral';

    Utils.modal(`
      <div class="modal-title">${isEdit ? 'Modifier' : 'Nouveau médicament'}</div>
      <div class="form-group">
        <label class="form-label">NOM *</label>
        <input class="form-input" id="med-name" placeholder="Ex: Testostérone Cypionate" value="${Utils.escAttr(medoc ? medoc.name : '')}">
      </div>
      <div class="form-group">
        <label class="form-label">DOSAGE</label>
        <input class="form-input" id="med-dosage" placeholder="Ex: 250mg / 1ml" value="${Utils.escAttr(medoc ? medoc.dosage||'' : '')}">
      </div>
      <div class="form-group">
        <label class="form-label">TYPE</label>
        <div class="type-pills" id="med-type-pills">
          ${TYPES.map(t => `<button class="type-pill ${t === type ? 'active' : ''}" onclick="Medocs._selType('${t}')">${t}</button>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">JOURS</label>
        <div class="day-pills">
          ${DAY_KEYS.map((k, i) => `<button class="day-pill ${days.includes(k) ? 'active' : ''}" onclick="Medocs._togDay('${k}',this)">${DAY_LABELS[i]}</button>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">RAPPELS</label>
        <div id="med-reminders">
          ${reminders.map((r) => `
            <div class="reminder-row">
              <input type="time" class="form-input reminder-time" value="${r}">
              <button class="reminder-del" onclick="this.parentElement.remove()">×</button>
            </div>`).join('')}
        </div>
        <button class="add-reminder-btn" onclick="Medocs._addReminder()">+ Ajouter un rappel</button>
      </div>
      <div class="form-group">
        <label class="form-label">NOTE</label>
        <textarea class="form-textarea" id="med-notes" placeholder="Notes, protocole...">${Utils.escAttr(medoc ? medoc.notes||'' : '')}</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="Utils.closeModals()">Annuler</button>
        <button class="btn-primary" onclick="Medocs._save('${Utils.escAttr(medoc ? medoc.id : '')}')">Sauvegarder</button>
      </div>
    `);
    window._medTypeSelected = type;
    window._medDaysSelected = [...days];
  }

  function _selType(t) {
    window._medTypeSelected = t;
    document.querySelectorAll('.type-pill').forEach(p => p.classList.toggle('active', p.textContent === t));
  }

  function _togDay(key, btn) {
    if (!window._medDaysSelected) window._medDaysSelected = [];
    const idx = window._medDaysSelected.indexOf(key);
    if (idx > -1) { window._medDaysSelected.splice(idx, 1); btn.classList.remove('active'); }
    else { window._medDaysSelected.push(key); btn.classList.add('active'); }
  }

  function _addReminder() {
    const container = document.getElementById('med-reminders');
    const row = document.createElement('div');
    row.className = 'reminder-row';
    row.innerHTML = `<input type="time" class="form-input reminder-time" value="08:00">
      <button class="reminder-del" onclick="this.parentElement.remove()">×</button>`;
    container.appendChild(row);
  }

  async function _save(existingId) {
    const name = document.getElementById('med-name').value.trim();
    if (!name) { Utils.toast('⚠️ Nom requis'); return; }
    const reminders = [...document.querySelectorAll('.reminder-time')].map(i => i.value).filter(Boolean);
    const medoc = {
      id: existingId || Utils.uid(),
      name,
      dosage: document.getElementById('med-dosage').value.trim(),
      type: window._medTypeSelected || 'Oral',
      days: window._medDaysSelected || [],
      reminders,
      notes: document.getElementById('med-notes').value.trim(),
    };
    if (existingId) {
      const old = await DB.get('medocs', existingId);
      if (old) medoc.taken = old.taken || {};
    }
    await DB.put('medocs', medoc);
    scheduleReminders(medoc);
    Utils.closeModals();
    await render();
    App.renderHome();
    Utils.toast(existingId ? '✅ Médicament modifié' : '✅ Médicament ajouté');
  }

  function scheduleReminders(medoc) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') Notification.requestPermission();
    DB.setSetting(`reminder_${medoc.id}`, medoc.reminders);
  }

  async function deleteMedoc(id) {
    Utils.confirm('Supprimer ce médicament ?', async () => {
      await DB.del('medocs', id);
      await render();
      App.renderHome();
      Utils.toast('🗑 Supprimé');
    });
  }

  return { init, render, openAdd, openEdit, toggleTake, deleteMedoc, prevMonth, nextMonth, _selType, _togDay, _addReminder, _save };
})();

// ── Notification scheduling (real implementation) ─────────────
Medocs.scheduleAllReminders = async function() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const medocs = await DB.getAll('medocs');
  const todayKey = Utils.getDayKey(new Date());

  medocs.forEach(m => {
    if (!m.days?.includes(todayKey)) return;
    (m.reminders || []).forEach(timeStr => {
      const [h, min] = timeStr.split(':').map(Number);
      const now = new Date();
      const target = new Date();
      target.setHours(h, min, 0, 0);
      let delayMs = target - now;
      if (delayMs < 0) return; // Already passed today
      reg.active?.postMessage({
        type: 'SCHEDULE_REMINDER',
        title: `💊 ${m.name}`,
        body: `${m.dosage || 'Heure de la prise'} — ${timeStr}`,
        delayMs,
        tag: `medoc-${m.id}-${timeStr}`,
      });
    });
  });
};

Medocs.requestNotifPermission = async function() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
};
