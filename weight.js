// ── WEIGHT MODULE ─────────────────────────────────────────────
const Weight = (() => {
  async function init() {}

  async function render(container) {
    if (!container) return;
    const entries = (await DB.getAll('weight')).sort((a,b) => a.date.localeCompare(b.date));
    const latest = entries[entries.length - 1];

    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h2 style="font-size:18px;font-weight:700">⚖️ Suivi du poids</h2>
        <button class="btn-primary" onclick="Weight.openAdd()">+ Entrée</button>
      </div>

      ${latest ? `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px">
          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px;text-align:center">
            <div style="font-size:26px;font-weight:900;color:var(--accent-crystal)">${latest.weight}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px">KG ACTUEL</div>
          </div>
          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px;text-align:center">
            <div style="font-size:26px;font-weight:900;color:${_delta(entries)>=0?'var(--accent-red)':'var(--accent-green)'}">${_delta(entries)>=0?'+':''}${_delta(entries)}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px">VS DÉPART</div>
          </div>
          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px;text-align:center">
            <div style="font-size:26px;font-weight:900;color:var(--accent-gold)">${entries.length}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px">ENTRÉES</div>
          </div>
        </div>` : ''}

      <!-- Chart -->
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-xl);padding:16px;margin-bottom:16px">
        ${entries.length >= 2 ? `<canvas id="weight-chart" height="160" style="width:100%;display:block"></canvas>` :
          `<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px">Ajoute au moins 2 entrées pour voir le graphique</div>`}
      </div>

      <!-- History -->
      <div class="fin-section-title">HISTORIQUE</div>
      ${entries.length ? [...entries].reverse().map(e => `
        <div class="transaction-item">
          <div class="tx-info">
            <div class="tx-label" style="font-size:16px;font-weight:800;color:var(--accent-crystal)">${e.weight} kg</div>
            <div class="tx-date">${Utils.formatDate(e.date)}${e.note ? ' · ' + e.note : ''}</div>
          </div>
          <button onclick="Weight.deleteEntry('${Utils.escAttr(e.id)}')" style="color:var(--text-muted);padding:4px;font-size:16px">×</button>
        </div>`).join('') :
        `<div class="empty-state" style="padding:32px 0"><div class="empty-state-icon">⚖️</div><div class="empty-state-text">Aucune entrée</div><div class="empty-state-sub">Commence à tracker ton poids</div></div>`}
    `;

    if (entries.length >= 2) {
      setTimeout(() => _drawChart(entries), 50);
    }
  }

  function _delta(entries) {
    if (entries.length < 2) return 0;
    return Math.round((entries[entries.length-1].weight - entries[0].weight) * 10) / 10;
  }

  function _drawChart(entries) {
    const canvas = document.getElementById('weight-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const wrap = canvas.parentElement;
    const W = wrap?.offsetWidth || 320;
    const H = 160;
    canvas.width = W;
    canvas.height = H;
    ctx.clearRect(0, 0, W, H);

    const PAD_L = 36, PAD_R = 12, PAD_T = 12, PAD_B = 24;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;

    const weights = entries.map(e => e.weight);
    const minW = Math.min(...weights) - 1;
    const maxW = Math.max(...weights) + 1;
    const range = maxW - minW || 1;

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = PAD_T + (i/4) * chartH;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W-PAD_R, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '9px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText((maxW - (i/4)*(maxW-minW)).toFixed(1), PAD_L-4, y+3);
    }

    const points = entries.map((e, i) => ({
      x: PAD_L + (i/(entries.length-1)) * chartW,
      y: PAD_T + ((maxW - e.weight) / range) * chartH,
    }));

    // Gradient fill
    const grad = ctx.createLinearGradient(0, PAD_T, 0, PAD_T+chartH);
    grad.addColorStop(0, 'rgba(124,107,255,0.3)');
    grad.addColorStop(1, 'rgba(124,107,255,0)');
    ctx.beginPath();
    points.forEach((p,i) => i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
    ctx.lineTo(points[points.length-1].x, PAD_T+chartH);
    ctx.lineTo(PAD_L, PAD_T+chartH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = 'var(--accent-crystal)' || '#7c6bff';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    points.forEach((p,i) => i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
    ctx.stroke();

    // Dots
    ctx.fillStyle = '#7c6bff';
    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI*2);
      ctx.fill();
    });

    // X labels
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'center';
    entries.forEach((e, i) => {
      if (i % Math.max(1, Math.floor(entries.length/5)) === 0) {
        const x = PAD_L + (i/(entries.length-1)) * chartW;
        const d = new Date(e.date+'T12:00:00');
        ctx.fillText(`${d.getDate()}/${d.getMonth()+1}`, x, H-4);
      }
    });
  }

  function openAdd() {
    Utils.modal(`
      <div class="modal-title">⚖️ Nouvelle entrée</div>
      <div class="form-group">
        <label class="form-label">POIDS (KG) *</label>
        <input class="form-input" id="w-weight" type="number" step="0.1" placeholder="Ex: 85.5" style="font-size:24px;font-weight:800;text-align:center">
      </div>
      <div class="form-group">
        <label class="form-label">DATE</label>
        <input class="form-input" id="w-date" type="date" value="${Utils.today()}">
      </div>
      <div class="form-group">
        <label class="form-label">NOTE</label>
        <input class="form-input" id="w-note" placeholder="Ex: après entraînement, à jeun...">
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="Utils.closeModals()">Annuler</button>
        <button class="btn-primary" onclick="Weight.save()">Ajouter</button>
      </div>
    `);
    setTimeout(() => document.getElementById('w-weight')?.focus(), 100);
  }

  async function save() {
    const weight = parseFloat(document.getElementById('w-weight')?.value);
    if (!weight || weight < 20 || weight > 300) { Utils.toast('⚠️ Poids invalide'); return; }
    await DB.put('weight', {
      id: Utils.uid(),
      weight,
      date: document.getElementById('w-date')?.value || Utils.today(),
      note: document.getElementById('w-note')?.value.trim() || '',
    });
    Utils.closeModals();
    const container = document.getElementById('divers-sub-content');
    if (container) await render(container);
    Utils.toast('✅ Poids enregistré');
  }

  async function deleteEntry(id) {
    Utils.confirm('Supprimer cette entrée ?', async () => {
      await DB.del('weight', id);
      const container = document.getElementById('divers-sub-content');
      if (container) await render(container);
      Utils.toast('🗑 Supprimé');
    });
  }

  return { init, render, openAdd, save, deleteEntry };
})();
