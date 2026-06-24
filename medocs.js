// ── MEDOCS MODULE v2 ──────────────────────────────────────────
// Nouvelles features :
// - Compteur de doses précis (ex: 2x par jour → 0/2, 1/2, 2/2)
// - Bibliothèque / vue par médicament avec historique
// - Planification semaines à l'avance (dates de début/fin de protocole)
// - Note de protocole enrichie

const Medocs = (() => {
  const TYPES = ['Oral','Injectable','Topique','Patch','Autre'];
  const DAY_KEYS = ['lun','mar','mer','jeu','ven','sam','dim'];
  const DAY_LABELS = ['L','M','M','J','V','S','D'];
  let calYear, calMonth;
  let _currentView = 'today'; // 'today' | 'library'

  async function init() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    await _purgeTakenHistory();
  }

  async function _purgeTakenHistory() {
    try {
      const medocs = await DB.getAll('medocs');
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const cutoffStr = Utils.dateKey(cutoff);
      for (const m of medocs) {
        if (!m.taken) continue;
        const cleaned = {};
        for (const [date, val] of Object.entries(m.taken)) {
          if (date >= cutoffStr) cleaned[date] = val;
        }
        if (Object.keys(cleaned).length < Object.keys(m.taken).length) {
          m.taken = cleaned;
          await DB.put('medocs', m);
        }
      }
    } catch(e) {}
  }

  async function render() {
    _renderTabs();
    if (_currentView === 'library') {
      await renderLibrary();
    } else {
      await renderCalendar();
      await renderList();
    }
  }

  // ── Tabs ─────────────────────────────────────────────────
  function _renderTabs() {
    const tabs = document.getElementById('medoc-tabs');
    if (!tabs) return;
    tabs.innerHTML = `
      <button class="medoc-tab-btn ${_currentView === 'today' ? 'active' : ''}" onclick="Medocs.switchView('today')">📅 Aujourd'hui</button>
      <button class="medoc-tab-btn ${_currentView === 'library' ? 'active' : ''}" onclick="Medocs.switchView('library')">📚 Bibliothèque</button>
    `;
  }

  function switchView(view) {
    _currentView = view;
    render();
  }

  // ── Calendar ──────────────────────────────────────────────
  async function renderCalendar() {
    const medocs = await DB.getAll('medocs');
    const todayStr = Utils.today();
    const container = document.getElementById('medoc-calendar');
    if (!container) return;

    const doseDates = {};
    medocs.forEach(m => {
      const doses = m.dosesPerDay || 1;
      if (!m.days) return;
      const firstDay = new Date(calYear, calMonth, 1);
      const lastDay = new Date(calYear, calMonth + 1, 0);
      for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        // Vérifie si le médicament est actif à cette date (protocole)
        if (!_isActiveDate(m, d)) continue;
        const dk = Utils.getDayKey(new Date(d));
        if (!m.days.includes(dk)) continue;
        const key = Utils.dateKey(new Date(d));
        if (!doseDates[key]) doseDates[key] = { total: 0, taken: 0 };
        doseDates[key].total += doses;
        doseDates[key].taken += Math.min(m.taken?.[key] || 0, doses);
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
      const isPast = new Date(dateStr) < new Date(todayStr);
      const info = doseDates[dateStr];
      const hasDose = info && info.total > 0;
      const allTaken = hasDose && info.taken >= info.total;
      const partialTaken = hasDose && info.taken > 0 && !allTaken;
      let extraClass = '';
      // has-dose doit toujours être présent pour que ::after (le point) existe
      // dose-taken / dose-partial / dose-missed sont des modificateurs de couleur en plus
      if (isPast && hasDose && !allTaken) extraClass = 'dose-missed';
      const doseClass = hasDose ? ('has-dose' + (allTaken ? ' dose-taken' : partialTaken ? ' dose-partial' : '')) : '';
      cells += `<div class="cal-day ${isToday ? 'today' : ''} ${doseClass} ${extraClass}">${d}</div>`;
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
      <div class="cal-grid-labels">${['L','M','M','J','V','S','D'].map(l => `<span>${l}</span>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
      <div style="display:flex;gap:16px;margin-top:12px;font-size:11px;color:var(--text-muted);flex-wrap:wrap">
        <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:var(--accent-crystal);display:inline-block"></span>À prendre</span>
        <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:var(--accent-gold);display:inline-block"></span>Partiel</span>
        <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:var(--accent-green);display:inline-block"></span>Pris</span>
        <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:var(--accent-red);display:inline-block"></span>Manqué</span>
      </div>
    `;
  }

  function prevMonth() { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); }
  function nextMonth() { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); }

  // ── Helper : le médicament est-il actif à cette date ? ────
  function _isActiveDate(m, date) {
    const ds = Utils.dateKey(date);
    // Si protocole défini, respecte les bornes
    if (m.startDate && ds < m.startDate) return false;
    if (m.endDate && ds > m.endDate) return false;
    // Si pas de startDate mais createdAt connu, ignore les jours avant l'ajout
    if (!m.startDate && m.createdAt && ds < m.createdAt) return false;
    return true;
  }

  // ── Liste aujourd'hui ─────────────────────────────────────
  async function renderList() {
    const medocs = await DB.getAll('medocs');
    const todayStr = Utils.today();
    const todayKey = Utils.getDayKey(new Date());
    const container = document.getElementById('medoc-list');
    if (!container) return;

    const todayMedocs = medocs.filter(m =>
      m.days && m.days.includes(todayKey) && _isActiveDate(m, new Date())
    );

    if (!todayMedocs.length) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">💊</div>
        <div class="empty-state-text">${medocs.length ? 'Rien à prendre aujourd\'hui' : 'Aucun médicament configuré'}</div>
        <div class="empty-state-sub">${medocs.length ? 'Prochaine prise selon ton protocole' : 'Appuie sur + Ajouter pour commencer'}</div>
      </div>`;
      return;
    }

    container.innerHTML = todayMedocs.map(m => {
      const doses = m.dosesPerDay || 1;
      const taken = Math.min(m.taken?.[todayStr] || 0, doses);
      const allTaken = taken >= doses;

      // Streak
      let streakCount = 0;
      if (m.taken) {
        const d = new Date();
        for (let i = 0; i < 30; i++) {
          if (i > 0) d.setDate(d.getDate() - 1);
          const dk = Utils.getDayKey(new Date(d));
          const ds = Utils.dateKey(new Date(d));
          if (m.days && m.days.includes(dk)) {
            const takenDay = m.taken[ds] || 0;
            if (takenDay >= (m.dosesPerDay || 1)) streakCount++;
            else break;
          }
        }
      }

      // Boutons doses : si doses > 1, affiche des boutons 1/N … N/N
      let doseButtons = '';
      if (doses === 1) {
        doseButtons = `<button class="medoc-take-btn ${allTaken ? 'taken' : ''}" onclick="Medocs.stepTake('${Utils.escAttr(m.id)}')">
          ${allTaken ? '✓ Pris' : 'Marquer comme pris'}
        </button>`;
      } else {
        const pips = Array.from({ length: doses }, (_, i) => {
          const filled = i < taken;
          return `<div class="wk-pip ${filled ? 'filled' : ''}" style="width:28px;height:28px;font-size:14px" onclick="Medocs.stepTake('${Utils.escAttr(m.id)}',${i+1})">${filled ? '●' : '○'}</div>`;
        }).join('');
        doseButtons = `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-size:12px;color:var(--text-muted)">${taken}/${doses} prises :</span>
          <div style="display:flex;gap:4px">${pips}</div>
        </div>`;
      }

      const protocolLine = (m.startDate || m.endDate) ?
        `<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">📅 ${m.startDate || '?'} → ${m.endDate || '∞'}</div>` : '';

      return `<div class="medoc-item ${allTaken ? 'medoc-all-taken' : ''}">
        <div class="medoc-top">
          <span class="medoc-name">${m.name}</span>
          <div style="display:flex;gap:6px;align-items:center">
            ${streakCount > 1 ? `<span class="medoc-streak">🔥 ${streakCount}j</span>` : ''}
            <span class="medoc-type-badge">${m.type || 'Oral'}</span>
          </div>
        </div>
        <div class="medoc-dose">${m.dosage || '—'}${doses > 1 ? ` · ${doses}×/jour` : ''}</div>
        ${protocolLine}
        <div class="medoc-days">
          ${DAY_KEYS.map((k, i) => `<span class="medoc-day-pill ${m.days && m.days.includes(k) ? 'active' : ''}">${DAY_LABELS[i]}</span>`).join('')}
        </div>
        ${m.reminders && m.reminders.length ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">🔔 ${m.reminders.join(' · ')}</div>` : ''}
        <div class="medoc-actions">
          ${doseButtons}
          <button class="btn-secondary" onclick="Medocs.openEdit('${Utils.escAttr(m.id)}')" style="padding:8px 12px;font-size:12px">✏️</button>
          <button class="medoc-delete-btn" onclick="Medocs.deleteMedoc('${Utils.escAttr(m.id)}')">🗑</button>
        </div>
      </div>`;
    }).join('');
  }

  // ── Bibliothèque ──────────────────────────────────────────
  async function renderLibrary() {
    const medocs = await DB.getAll('medocs');
    const calContainer = document.getElementById('medoc-calendar');
    const listContainer = document.getElementById('medoc-list');
    if (calContainer) calContainer.innerHTML = '';
    if (!listContainer) return;

    if (!medocs.length) {
      listContainer.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">📚</div>
        <div class="empty-state-text">Bibliothèque vide</div>
        <div class="empty-state-sub">Ajoute ton premier médicament</div>
      </div>`;
      return;
    }

    const todayStr = Utils.today();

    listContainer.innerHTML = medocs.map(m => {
      const doses = m.dosesPerDay || 1;
      // Calcul stats : jours pris / jours prévus (sur les 30 derniers jours)
      // Suivi : part de la date d'ajout du médoc (ou 30j max), jusqu'à hier inclus
      const cutoffDate = new Date(); cutoffDate.setDate(cutoffDate.getDate() - 30);
      const startRef = m.createdAt && m.createdAt > Utils.dateKey(cutoffDate) ? m.createdAt : Utils.dateKey(cutoffDate);
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = Utils.dateKey(yesterday);
      let planned = 0, taken = 0;
      for (let d = new Date(startRef + 'T12:00:00'); d <= yesterday; d.setDate(d.getDate() + 1)) {
        const dk = Utils.getDayKey(new Date(d));
        const ds = Utils.dateKey(new Date(d));
        if (m.days && m.days.includes(dk) && _isActiveDate(m, new Date(d))) {
          planned += doses;
          taken += Math.min(m.taken?.[ds] || 0, doses);
        }
      }
      const compliance = planned > 0 ? Math.round(taken / planned * 100) : null;
      const compColor = compliance === null ? 'var(--text-muted)' : compliance >= 90 ? 'var(--accent-green)' : compliance >= 60 ? 'var(--accent-gold)' : 'var(--accent-red)';

      const isActiveToday = m.days && m.days.includes(Utils.getDayKey(new Date())) && _isActiveDate(m, new Date());
      const protocolLine = (m.startDate || m.endDate) ?
        `<div style="font-size:11px;color:var(--text-muted)">📅 ${m.startDate || '?'} → ${m.endDate || '∞'}</div>` : '';

      return `<div class="medoc-item">
        <div class="medoc-top">
          <span class="medoc-name">${m.name}</span>
          <span class="medoc-type-badge">${m.type || 'Oral'}</span>
        </div>
        <div class="medoc-dose">${m.dosage || '—'}${doses > 1 ? ` · ${doses}×/jour` : ''}</div>
        ${protocolLine}
        <div class="medoc-days" style="margin:6px 0">
          ${DAY_KEYS.map((k, i) => `<span class="medoc-day-pill ${m.days && m.days.includes(k) ? 'active' : ''}">${DAY_LABELS[i]}</span>`).join('')}
        </div>
        ${compliance !== null ? `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="font-size:11px;color:var(--text-muted)">Observance 30j :</span>
            <span style="font-size:13px;font-weight:700;color:${compColor}">${compliance}%</span>
            <div style="flex:1;height:4px;background:var(--border);border-radius:2px">
              <div style="width:${compliance}%;height:100%;background:${compColor};border-radius:2px"></div>
            </div>
          </div>` : ''}
        ${m.notes ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;line-height:1.4">${m.notes}</div>` : ''}
        <div style="display:flex;gap:6px">
          ${isActiveToday ? '<span style="font-size:11px;color:var(--accent-green)">● Actif aujourd\'hui</span>' : '<span style="font-size:11px;color:var(--text-muted)">○ Pas aujourd\'hui</span>'}
          <div style="flex:1"></div>
          <button class="btn-secondary" onclick="Medocs.openEdit('${Utils.escAttr(m.id)}')" style="padding:6px 10px;font-size:12px">✏️ Modifier</button>
          <button class="medoc-delete-btn" onclick="Medocs.deleteMedoc('${Utils.escAttr(m.id)}')">🗑</button>
        </div>
      </div>`;
    }).join('');
  }

  // ── Prise de dose ─────────────────────────────────────────
  async function stepTake(id, val) {
    const m = await DB.get('medocs', id);
    if (!m) return;
    const todayStr = Utils.today();
    const doses = m.dosesPerDay || 1;
    if (!m.taken) m.taken = {};
    const current = m.taken[todayStr] || 0;

    if (doses === 1) {
      m.taken[todayStr] = current >= 1 ? 0 : 1;
    } else {
      // val fourni par le pip cliqué
      m.taken[todayStr] = (current === val) ? val - 1 : val;
    }

    await DB.put('medocs', m);
    await render();
    App.renderHome();
    const newVal = m.taken[todayStr];
    if (newVal >= doses) Utils.toast(`✅ ${m.name} — ${doses}/${doses} pris !`);
    else if (newVal > 0) Utils.toast(`💊 ${m.name} — ${newVal}/${doses}`);
  }

  // Compatibilité ancien code
  async function toggleTake(id) { await stepTake(id); }

  // ── Formulaire ────────────────────────────────────────────
  function openAdd() { openForm(null); }
  async function openEdit(id) { const m = await DB.get('medocs', id); openForm(m); }

  function openForm(medoc) {
    const isEdit = !!medoc;
    const days = medoc ? medoc.days || [] : ['lun','mar','mer','jeu','ven','sam','dim'];
    const reminders = medoc ? medoc.reminders || ['08:00'] : ['08:00'];
    const type = medoc ? medoc.type || 'Oral' : 'Oral';
    const doses = medoc ? medoc.dosesPerDay || 1 : 1;

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
        <label class="form-label">DOSES PAR JOUR</label>
        <div style="display:flex;align-items:center;gap:12px">
          <button class="btn-secondary" style="padding:8px 16px;font-size:18px" onclick="Medocs._adjDoses(-1)">−</button>
          <span id="med-doses-display" style="font-size:20px;font-weight:700;min-width:30px;text-align:center">${doses}</span>
          <button class="btn-secondary" style="padding:8px 16px;font-size:18px" onclick="Medocs._adjDoses(1)">+</button>
        </div>
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
        <label class="form-label">PROTOCOLE (OPTIONNEL)</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="date" class="form-input" id="med-start" placeholder="Début" value="${Utils.escAttr(medoc ? medoc.startDate||'' : '')}" style="flex:1">
          <span style="color:var(--text-muted)">→</span>
          <input type="date" class="form-input" id="med-end" placeholder="Fin" value="${Utils.escAttr(medoc ? medoc.endDate||'' : '')}" style="flex:1">
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Laisse vide pour protocole sans fin</div>
      </div>
      <div class="form-group">
        <label class="form-label">RAPPELS</label>
        <div id="med-reminders">
          ${reminders.map(r => `<div class="reminder-row">
            <input type="time" class="form-input reminder-time" value="${r}">
            <button class="reminder-del" onclick="this.parentElement.remove()">×</button>
          </div>`).join('')}
        </div>
        <button class="add-reminder-btn" onclick="Medocs._addReminder()">+ Ajouter un rappel</button>
      </div>
      <div class="form-group">
        <label class="form-label">NOTE / PROTOCOLE</label>
        <textarea class="form-textarea" id="med-notes" placeholder="Notes, instructions, effets...">${Utils.escAttr(medoc ? medoc.notes||'' : '')}</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="Utils.closeModals()">Annuler</button>
        <button class="btn-primary" onclick="Medocs._save('${Utils.escAttr(medoc ? medoc.id : '')}')">Sauvegarder</button>
      </div>
    `);
    window._medTypeSelected = type;
    window._medDaysSelected = [...days];
    window._medDosesSelected = doses;
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

  function _adjDoses(delta) {
    window._medDosesSelected = Math.max(1, Math.min(10, (window._medDosesSelected || 1) + delta));
    const el = document.getElementById('med-doses-display');
    if (el) el.textContent = window._medDosesSelected;
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
      createdAt: existingId ? undefined : Utils.today(),
      dosage: document.getElementById('med-dosage').value.trim(),
      dosesPerDay: window._medDosesSelected || 1,
      type: window._medTypeSelected || 'Oral',
      days: window._medDaysSelected || [],
      reminders,
      startDate: document.getElementById('med-start').value || null,
      endDate: document.getElementById('med-end').value || null,
      notes: document.getElementById('med-notes').value.trim(),
    };
    if (existingId) {
      const old = await DB.get('medocs', existingId);
      if (old) medoc.taken = old.taken || {};
    }
    await DB.put('medocs', medoc);
    Utils.closeModals();
    await render();
    App.renderHome();
    Utils.toast(existingId ? '✅ Médicament modifié' : '✅ Médicament ajouté');
  }

  async function deleteMedoc(id) {
    Utils.confirm('Supprimer ce médicament ?', async () => {
      await DB.del('medocs', id);
      await render();
      App.renderHome();
      Utils.toast('🗑 Supprimé');
    });
  }

  return {
    init, render, switchView, openAdd, openEdit,
    toggleTake, stepTake, deleteMedoc,
    prevMonth, nextMonth, renderLibrary,
    _selType, _togDay, _adjDoses, _addReminder, _save,
  };
})();

Medocs.scheduleAllReminders = async function() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const medocs = await DB.getAll('medocs');
  const todayKey = Utils.getDayKey(new Date());
  medocs.forEach(m => {
    if (!m.days?.includes(todayKey)) return;
    (m.reminders || []).forEach(timeStr => {
      const [h, min] = timeStr.split(':').map(Number);
      const target = new Date(); target.setHours(h, min, 0, 0);
      const ts = target <= new Date() ? target.getTime() + 86400000 : target.getTime();
      reg.active?.postMessage({ type: 'SHOW_NOTIF_AT', title: `💊 ${m.name}`, body: `${m.dosage || 'Heure de la prise'} — ${timeStr}`, tag: `medoc-${m.id}-${timeStr}`, timestamp: ts });
    });
  });
};

Medocs.requestNotifPermission = async function() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
};
