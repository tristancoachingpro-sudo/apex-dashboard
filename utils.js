// ── APEX UTILS ───────────────────────────────────────────────
const Utils = (() => {
  const DAYS_FR = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const DAYS_FULL = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const MONTHS_SHORT = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  const DAY_KEYS = ['lun','mar','mer','jeu','ven','sam','dim'];

  function uid() { return crypto.randomUUID(); }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
  }

  function formatDateFull(date) {
    return `${DAYS_FULL[date.getDay()]} ${date.getDate()} ${MONTHS_FR[date.getMonth()]} ${date.getFullYear()}`;
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 6) return 'Bonne nuit 🌙';
    if (h < 12) return 'Bonjour ☀️';
    if (h < 18) return 'Bon après-midi 👋';
    if (h < 21) return 'Bonsoir 🌆';
    return 'Bonne soirée 🌙';
  }

  function formatMoney(val) {
    const n = Number(val) || 0;
    return (n >= 0 ? '+' : '') + n.toFixed(0) + '€';
  }

  function formatMoneyAbs(val) {
    return (Number(val) || 0).toFixed(0) + '€';
  }

  // Garde 2 décimales si le montant n'est pas un entier rond (évite de masquer
  // des écarts du type 24.70€ affiché "25€" qui rendaient les totaux illisibles)
  function formatMoneyPrecise(val) {
    const n = Number(val) || 0;
    const rounded2 = Math.round(n * 100) / 100;
    const isWhole = Math.abs(rounded2 - Math.round(rounded2)) < 0.005;
    return (isWhole ? rounded2.toFixed(0) : rounded2.toFixed(2)) + '€';
  }

  function pct(a, b) {
    if (!b) return 0;
    return Math.round((a / b) * 100);
  }

  function margin(buy, sell) {
    if (!buy || !sell) return 0;
    return Math.round(((sell - buy) / buy) * 100);
  }

  // Bug 2 fix: safe escape for inline HTML attributes
  function escAttr(str) {
    return String(str || '').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
  }

  function toast(msg, duration = 2500) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), duration);
  }

  function modal(html, onClose) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-sheet"><div class="modal-handle"></div>${html}</div>`;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.remove(); if (onClose) onClose(); }
    });
    document.getElementById('modals').appendChild(overlay);
    history.pushState({ modal: true }, '');
    return overlay;
  }

  function closeModals() {
    document.getElementById('modals').innerHTML = '';
  }

  function confirm(msg, onYes) {
    const m = modal(`
      <div class="modal-title">Confirmer</div>
      <p style="color:var(--text-secondary);margin-bottom:20px">${msg}</p>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="Utils.closeModals()">Annuler</button>
        <button class="btn-danger" id="_conf_yes">Confirmer</button>
      </div>
    `);
    m.querySelector('#_conf_yes').onclick = () => { closeModals(); onYes(); };
  }

  function getDayKey(dateObj) {
    const map = ['dim','lun','mar','mer','jeu','ven','sam'];
    return map[dateObj.getDay()];
  }

  function scoreColor(score) {
    if (score >= 8) return 'var(--accent-green)';
    if (score >= 5) return 'var(--accent-gold)';
    return 'var(--accent-red)';
  }

  const PIPELINE_STEPS = [
    { key: 'pending',        label: 'En attente' },
    { key: 'paid',           label: 'Payée' },
    { key: 'supplier_paid',  label: 'Fournisseur payé' },
    { key: 'supplier_sent',  label: 'Fournisseur expédié' },
    { key: 'delivered',      label: 'Livrée' },
  ];

  function statusClass(status) {
    const map = {
      pending: 'status-pending',
      paid: 'status-paid',
      supplier_paid: 'status-supplier-paid',
      supplier_sent: 'status-shipped',
      delivered: 'status-delivered',
    };
    return map[status] || 'status-pending';
  }

  function statusLabel(status) {
    const step = PIPELINE_STEPS.find(s => s.key === status);
    return step ? step.label : status;
  }


  // Haptic feedback
  function haptic(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern || 30);
  }

  // Animate number counting up
  function animateCount(el, target, duration, formatter) {
    if (!el) return;
    const start = 0;
    const startTime = performance.now();
    const fmt = formatter || (n => Math.round(n).toString());
    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      el.textContent = fmt(start + (target - start) * eased);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  return {
    uid, today, dateKey, formatDate, formatDateFull, greeting, haptic, animateCount,
    formatMoney, formatMoneyAbs, formatMoneyPrecise, pct, margin, escAttr,
    toast, modal, closeModals, confirm,
    getDayKey, scoreColor,
    PIPELINE_STEPS, statusClass, statusLabel,
    DAYS_FR, DAYS_FULL, MONTHS_FR, MONTHS_SHORT, DAY_KEYS,
  };
})();
