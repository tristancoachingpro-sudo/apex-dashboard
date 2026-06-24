// ── WORKOUT MODULE v2 ─────────────────────────────────────────
// Nouvelles features :
// - Cocher la séance du jour (sauf repos)
// - Tracker les calories du jour (objectif configurable)
// - Tracker les shakers (quantité configurable, ex: 3/3)
// - Checklist quotidienne personnalisable (items + quantité)
// - Persistance locale via DB (clé workout_daily_YYYY-MM-DD)

const Workout = (() => {

  async function init() {}

  function getCycleDay(program) {
    const cycleLen = program.cycleLen || 7;
    const anchor = program.anchor;
    if (!anchor) return 1;
    const msPerDay = 86400000;
    const anchorDate = new Date(anchor.date + 'T12:00:00');
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const daysDiff = Math.round((today - anchorDate) / msPerDay);
    return ((anchor.day - 1 + daysDiff) % cycleLen + cycleLen) % cycleLen + 1;
  }

  function getDayKey(dayNum) { return 'jour' + dayNum; }

  // ── Daily state ───────────────────────────────────────────
  async function _getDailyState() {
    const key = 'workout_daily_' + Utils.today();
    return await DB.getSetting(key) || { sessionDone: false, cals: false, checks: {} };
  }

  async function _saveDailyState(state) {
    const key = 'workout_daily_' + Utils.today();
    await DB.setSetting(key, state);
  }

  // ── Checklist config ──────────────────────────────────────
  async function _getChecklist() {
    return await DB.getSetting('workout_checklist') || [
      { id: 'shaker', label: 'Shaker protéiné', max: 3 },
      { id: 'cals', label: 'Calories atteintes', max: 1 },
    ];
  }

  async function _saveChecklist(items) {
    await DB.setSetting('workout_checklist', items);
  }

  // ── Render ────────────────────────────────────────────────
  async function render() {
    const program = await DB.get('workout_program', 'main') || { id: 'main', days: {}, cycleLen: 7 };
    const cycleLen = program.cycleLen || 7;
    const todayNum = getCycleDay(program);
    const todayWorkout = program.days[getDayKey(todayNum)] || '';
    const isRest = !todayWorkout;
    const state = await _getDailyState();
    const checklist = await _getChecklist();
    const container = document.getElementById('week-program');

    // ── Programme du cycle ─────────────────────────────────
    const cycleHTML = Array.from({ length: cycleLen }, (_, i) => {
      const dayNum = i + 1;
      const key = getDayKey(dayNum);
      const name = program.days[key] || '';
      const isToday = dayNum === todayNum;
      return `<div class="day-row ${isToday ? 'today-row' : ''}">
        <span class="day-name">Jour ${dayNum}</span>
        ${isToday ? '<span class="today-badge">TODAY</span>' : ''}
        <span class="day-workout-name ${!name ? 'empty' : ''}">${name || 'Repos'}</span>
      </div>`;
    }).join('');

    // ── Checklist du jour ──────────────────────────────────
    const checklistHTML = checklist.map(item => {
      const current = state.checks[item.id] || 0;
      const max = item.max || 1;
      const done = current >= max;

      if (max === 1) {
        // Simple toggle
        return `<div class="wk-check-row ${done ? 'done' : ''}" onclick="Workout.toggleCheck('${item.id}')">
          <div class="wk-check-box">${done ? '✓' : ''}</div>
          <span class="wk-check-label">${item.label}</span>
          <button class="wk-check-edit" onclick="event.stopPropagation();Workout.editCheckItem('${item.id}')">✏️</button>
        </div>`;
      } else {
        // Multi-step (ex: shaker 1/3 → 2/3 → 3/3)
        const pips = Array.from({ length: max }, (_, i) => {
          const filled = i < current;
          return `<div class="wk-pip ${filled ? 'filled' : ''}" onclick="event.stopPropagation();Workout.stepCheck('${item.id}',${i+1})">${filled ? '●' : '○'}</div>`;
        }).join('');
        return `<div class="wk-check-row multi ${done ? 'done' : ''}">
          <div class="wk-check-content">
            <span class="wk-check-label">${item.label}</span>
            <span class="wk-check-count ${done ? 'count-done' : ''}">${current}/${max}</span>
          </div>
          <div class="wk-pips">${pips}</div>
          <button class="wk-check-edit" onclick="Workout.editCheckItem('${item.id}')">✏️</button>
        </div>`;
      }
    }).join('');

    // ── Séance du jour ─────────────────────────────────────
    let sessionHTML = '';
    if (isRest) {
      sessionHTML = `<div class="wk-rest-badge">😴 Jour de repos — Récupération active</div>`;
    } else {
      sessionHTML = `
        <div class="wk-session-row ${state.sessionDone ? 'done' : ''}" onclick="Workout.toggleSession()">
          <div class="wk-check-box">${state.sessionDone ? '✓' : ''}</div>
          <div>
            <div class="wk-session-name">${todayWorkout}</div>
            <div class="wk-session-sub">${state.sessionDone ? 'Séance complétée 🔥' : 'Marquer la séance comme faite'}</div>
          </div>
        </div>`;
    }

    container.innerHTML = `
      <div class="wk-today-block">
        <div class="wk-section-title">📅 AUJOURD'HUI</div>
        ${sessionHTML}
        <div class="wk-section-title" style="margin-top:16px">✅ CHECKLIST DU JOUR</div>
        <div id="wk-checklist">${checklistHTML}</div>
        <button class="btn-secondary" style="width:100%;margin-top:10px;font-size:12px" onclick="Workout.addCheckItem()">+ Ajouter un élément</button>
      </div>

      <div class="wk-section-title" style="margin-top:20px">📋 PROGRAMME — CYCLE ${cycleLen}J</div>
      <div id="wk-cycle-list">${cycleHTML}</div>

      <div id="workout-log-list"></div>
    `;
  }

  // ── Actions ───────────────────────────────────────────────
  async function toggleSession() {
    const state = await _getDailyState();
    state.sessionDone = !state.sessionDone;
    await _saveDailyState(state);
    await render();
    App.renderHome();
    Utils.toast(state.sessionDone ? '🔥 Séance validée !' : 'Séance dévalidée');
  }

  async function toggleCheck(id) {
    const state = await _getDailyState();
    if (!state.checks) state.checks = {};
    state.checks[id] = state.checks[id] ? 0 : 1;
    await _saveDailyState(state);
    await render();
  }

  async function stepCheck(id, val) {
    const state = await _getDailyState();
    if (!state.checks) state.checks = {};
    const checklist = await _getChecklist();
    const item = checklist.find(i => i.id === id);
    const max = item ? item.max : 1;
    // Si on clique sur la même valeur → reset à 0, sinon on avance
    state.checks[id] = (state.checks[id] === val) ? 0 : val;
    await _saveDailyState(state);
    await render();
    if (state.checks[id] >= max) Utils.toast('✅ ' + (item ? item.label : '') + ' complet !');
  }

  async function addCheckItem() {
    _openCheckItemForm(null);
  }

  async function editCheckItem(id) {
    const checklist = await _getChecklist();
    const item = checklist.find(i => i.id === id);
    _openCheckItemForm(item);
  }

  function _openCheckItemForm(item) {
    const isEdit = !!item;
    Utils.modal(`
      <div class="modal-title">${isEdit ? 'Modifier' : 'Nouvel élément'}</div>
      <div class="form-group">
        <label class="form-label">NOM</label>
        <input class="form-input" id="wk-item-label" placeholder="Ex: Shaker protéiné" value="${Utils.escAttr(item ? item.label : '')}">
      </div>
      <div class="form-group">
        <label class="form-label">QUANTITÉ PAR JOUR</label>
        <div style="display:flex;align-items:center;gap:12px">
          <button class="btn-secondary" style="padding:8px 16px;font-size:18px" onclick="Workout._adjMax(-1)">−</button>
          <span id="wk-item-max-display" style="font-size:20px;font-weight:700;min-width:30px;text-align:center">${item ? item.max : 1}</span>
          <button class="btn-secondary" style="padding:8px 16px;font-size:18px" onclick="Workout._adjMax(1)">+</button>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">1 = simple case à cocher · 2+ = compteur progressif</div>
      </div>
      <div class="modal-actions">
        ${isEdit ? `<button class="btn-danger" onclick="Workout._deleteCheckItem('${item.id}')">🗑 Supprimer</button>` : ''}
        <button class="btn-secondary" onclick="Utils.closeModals()">Annuler</button>
        <button class="btn-primary" onclick="Workout._saveCheckItem('${Utils.escAttr(item ? item.id : '')}')">Sauvegarder</button>
      </div>
    `);
    window._wkItemMax = item ? item.max : 1;
  }

  function _adjMax(delta) {
    window._wkItemMax = Math.max(1, Math.min(10, (window._wkItemMax || 1) + delta));
    const el = document.getElementById('wk-item-max-display');
    if (el) el.textContent = window._wkItemMax;
  }

  async function _saveCheckItem(existingId) {
    const label = document.getElementById('wk-item-label').value.trim();
    if (!label) { Utils.toast('⚠️ Nom requis'); return; }
    const checklist = await _getChecklist();
    const max = window._wkItemMax || 1;
    if (existingId) {
      const idx = checklist.findIndex(i => i.id === existingId);
      if (idx > -1) checklist[idx] = { ...checklist[idx], label, max };
    } else {
      checklist.push({ id: Utils.uid(), label, max });
    }
    await _saveChecklist(checklist);
    Utils.closeModals();
    await render();
    Utils.toast('✅ Élément sauvegardé');
  }

  async function _deleteCheckItem(id) {
    Utils.confirm('Supprimer cet élément ?', async () => {
      const checklist = await _getChecklist();
      await _saveChecklist(checklist.filter(i => i.id !== id));
      Utils.closeModals();
      await render();
    });
  }

  return {
    init, render, getCycleDay, getDayKey,
    toggleSession, toggleCheck, stepCheck,
    addCheckItem, editCheckItem, _adjMax, _saveCheckItem, _deleteCheckItem,
  };
})();
