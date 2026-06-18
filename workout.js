// ── WORKOUT MODULE ────────────────────────────────────────────
const Workout = (() => {

  async function init() {}

  // Retourne le numéro du jour courant dans le cycle (1-based)
  function getCycleDay(program) {
    const cycleLen = program.cycleLen || 7;
    const anchor = program.anchor; // { date: 'YYYY-MM-DD', day: N }
    if (!anchor) return 1;
    const msPerDay = 86400000;
    const anchorDate = new Date(anchor.date + 'T12:00:00');
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const daysDiff = Math.round((today - anchorDate) / msPerDay);
    return ((anchor.day - 1 + daysDiff) % cycleLen + cycleLen) % cycleLen + 1;
  }

  function getDayKey(dayNum) {
    return 'jour' + dayNum;
  }

  async function render() {
    const program = await DB.get('workout_program', 'main') || { id: 'main', days: {}, cycleLen: 7 };
    const cycleLen = program.cycleLen || 7;
    const todayNum = getCycleDay(program);
    const container = document.getElementById('week-program');

    container.innerHTML = Array.from({ length: cycleLen }, (_, i) => {
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

    document.getElementById('workout-log-list').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🏋️</div>
        <div class="empty-state-text">Cycle de ${cycleLen} jour${cycleLen > 1 ? 's' : ''}</div>
        <div class="empty-state-sub">Modifie dans Divers → Programme</div>
      </div>`;
  }

  return { init, render, getCycleDay, getDayKey };
})();
