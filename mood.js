// ── MOOD MODULE ───────────────────────────────────────────────
const Mood = (() => {
  const DEFAULT_CRITERIA = [
    { key: 'mental',       label: 'Mental',       emoji: '🧠', color: '#7c6bff' },
    { key: 'sante',        label: 'Santé',         emoji: '❤️', color: '#ff4d6d' },
    { key: 'training',     label: 'Entraînement',  emoji: '💪', color: '#f5a623' },
    { key: 'business',     label: 'Business',      emoji: '💼', color: '#4d9fff' },
    { key: 'motivation',   label: 'Motivation',    emoji: '🔥', color: '#ff6b35' },
    { key: 'libido',       label: 'Libido',        emoji: '⚡', color: '#a78bfa' },
    { key: 'energie',      label: 'Énergie',       emoji: '🌟', color: '#ffd700' },
    { key: 'nourriture',   label: 'Nutrition',     emoji: '🥗', color: '#00d47e' },
    { key: 'sommeil',      label: 'Sommeil',       emoji: '😴', color: '#64b5f6' },
    { key: 'productivite', label: 'Productivité',  emoji: '📈', color: '#26c6da' },
  ];

  let calYear = new Date().getFullYear();
  let calMonth = new Date().getMonth();
  let chartCriteria = ['mental', 'energie', 'motivation']; // default selected

  async function init() {}

  async function getCriteria() {
    const custom = await DB.getSetting('mood_criteria');
    return custom || DEFAULT_CRITERIA;
  }

  // ── Entry modal (new or edit) ─────────────────────────────
  async function openEntry(editEntry, forDate) {
    const criteria = await getCriteria();
    const targetDate = forDate || (editEntry?.date) || Utils.today();
    const scores = {};
    criteria.forEach(c => { scores[c.key] = editEntry?.scores?.[c.key] ?? 5; });
    window._moodScores = { ...scores };
    window._moodEditId = editEntry?.id || null;
    window._moodDate = targetDate;

    const isToday = targetDate === Utils.today();
    const displayDate = isToday ? "d'aujourd'hui" : Utils.formatDate(targetDate);

    Utils.modal(`
      <div class="modal-title">🧠 Journaling ${displayDate}</div>
      <div class="mood-full-grid">
        ${criteria.map(c => {
          const val = scores[c.key];
          return `<div class="mood-full-item">
            <div class="mfi-top">
              <span class="mfi-emoji">${c.emoji}</span>
              <span class="mfi-label">${c.label}</span>
              <span class="mfi-score" id="mfis-${c.key}" style="color:${Utils.scoreColor(val)}">${val}</span>
            </div>
            <div class="mfi-bar-track">
              <div class="mfi-bar-fill" id="mfib-${c.key}"
                style="width:${val*10}%;background:${Utils.scoreColor(val)}"></div>
            </div>
            <input type="range" class="mfi-slider" min="1" max="10" value="${val}"
              oninput="Mood._updateScore('${c.key}',this.value)">
          </div>`;
        }).join('')}
      </div>
      <div class="form-group" style="margin-top:20px">
        <label class="form-label">NOTE DU JOUR</label>
        <textarea class="form-textarea" id="mood-note"
          placeholder="Comment s'est passée ta journée ?"
          style="min-height:80px">${editEntry?.note||''}</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="Utils.closeModals()">Annuler</button>
        <button class="btn-primary" onclick="Mood._save()">Sauvegarder</button>
      </div>
    `);
  }

  function _updateScore(key, val) {
    const n = parseInt(val);
    if (!window._moodScores) window._moodScores = {};
    window._moodScores[key] = n;
    const scoreEl = document.getElementById(`mfis-${key}`);
    const barEl   = document.getElementById(`mfib-${key}`);
    const color = Utils.scoreColor(n);
    if (scoreEl) { scoreEl.textContent = n; scoreEl.style.color = color; }
    if (barEl)   { barEl.style.width = (n*10)+'%'; barEl.style.background = color; }
  }

  async function _save() {
    const note = document.getElementById('mood-note')?.value.trim() || '';
    const entry = {
      id:        window._moodEditId || Utils.uid(),
      date:      window._moodDate || Utils.today(),
      scores:    window._moodScores || {},
      note,
      createdAt: new Date().toISOString(),
    };
    await DB.put('mood', entry);
    Utils.closeModals();
    Utils.toast('✅ Journaling sauvegardé');
    App.renderHome();
    // Refresh stats if open
    const sub = document.getElementById('divers-sub-content');
    if (sub && sub.innerHTML.includes('mood-heatmap')) renderStats();
  }

  // ── Render full stats page ────────────────────────────────
  async function renderStats() {
    const container = document.getElementById('divers-sub-content');
    if (!container) return;
    const criteria = await getCriteria();
    const entries  = (await DB.getAll('mood')).sort((a,b) => new Date(b.date)-new Date(a.date));

    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h2 style="font-size:18px;font-weight:700">Mood & Journal</h2>
        <button class="btn-primary" onclick="Mood.openEntry()">+ Entrée</button>
      </div>

      <!-- HEATMAP CALENDAR -->
      <div class="mood-heatmap-wrap">
        <div class="mood-heatmap" id="mood-heatmap"></div>
      </div>

      <!-- COURBES MULTI-CRITÈRES -->
      <div class="mood-chart-section">
        <div class="mood-chart-header">
          <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:var(--text-muted)">COURBES</div>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="mood-chart-legend" id="mood-chart-legend"></div>
            <button onclick="Mood.openFullscreenChart()" style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:4px 10px;font-size:12px;color:var(--text-muted);cursor:pointer">⛶ Agrandir</button>
          </div>
        </div>
        <div class="mood-criteria-selector" id="mood-criteria-selector"></div>
        <div class="mood-chart-canvas-wrap">
          <canvas id="mood-chart" height="180"></canvas>
        </div>
      </div>

      <!-- HISTORIQUE PAGINÉ -->
      <div id="mood-history-section"></div>
    `;

    await _renderHeatmap(entries);
    await _renderChart(entries, criteria);
    _renderHistory(entries, 0);
  }

  // ── Heatmap ───────────────────────────────────────────────
  async function _renderHeatmap(entries) {
    const container = document.getElementById('mood-heatmap');
    if (!container) return;

    const entryMap = {};
    entries.forEach(e => { entryMap[e.date] = e; });

    const now = new Date();
    // Navigation
    container.innerHTML = `
      <div class="heatmap-nav">
        <button class="cal-nav" onclick="Mood._heatmapPrev()">‹</button>
        <span class="heatmap-month-label" id="heatmap-month-label"></span>
        <button class="cal-nav" onclick="Mood._heatmapNext()">›</button>
      </div>
      <div class="heatmap-grid-labels">
        ${['L','M','M','J','V','S','D'].map(d=>`<span>${d}</span>`).join('')}
      </div>
      <div class="heatmap-grid" id="heatmap-grid"></div>
      <div class="heatmap-legend">
        <span style="color:var(--text-muted);font-size:10px">Moins</span>
        ${[1,3,5,7,9,10].map(v=>`<div class="heatmap-legend-dot" style="background:${Utils.scoreColor(v)}"></div>`).join('')}
        <span style="color:var(--text-muted);font-size:10px">Plus</span>
      </div>
    `;

    _renderHeatmapGrid(entryMap);
  }

  function _renderHeatmapGrid(entryMap) {
    const label = document.getElementById('heatmap-month-label');
    const grid  = document.getElementById('heatmap-grid');
    if (!label || !grid) return;

    label.textContent = `${Utils.MONTHS_FR[calMonth]} ${calYear}`;

    const firstDay  = new Date(calYear, calMonth, 1);
    const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
    let startDow = firstDay.getDay();
    startDow = startDow === 0 ? 6 : startDow - 1;
    const prevDays = new Date(calYear, calMonth, 0).getDate();
    const todayStr = Utils.today();

    let cells = '';
    for (let i = startDow-1; i >= 0; i--) {
      cells += `<div class="heatmap-cell heatmap-cell--other">${prevDays-i}</div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const entry   = entryMap ? entryMap[dateStr] : null;
      const isToday = dateStr === todayStr;
      const isFuture = new Date(dateStr) > new Date(todayStr);
      let bg = 'var(--bg-elevated)';
      let avg = null;
      if (entry) {
        const vals = Object.values(entry.scores||{});
        avg = vals.length ? Math.round(vals.reduce((s,v)=>s+v,0)/vals.length*10)/10 : 5;
        bg = Utils.scoreColor(avg);
      }
      cells += `<div class="heatmap-cell ${isToday?'heatmap-cell--today':''} ${isFuture?'heatmap-cell--future':''}"
        style="background:${isFuture?'transparent':bg};${isFuture?'border:1px solid var(--border)':''}"
        onclick="${isFuture?'':entry?`Mood._editDay('${dateStr}')`:`Mood.openEntry(null,'${dateStr}')`}"
        title="${entry?'Score: '+avg:'Cliquer pour remplir'}">
        <span class="heatmap-day-num">${d}</span>
        ${entry && avg ? `<span class="heatmap-avg">${avg}</span>` : ''}
      </div>`;
    }
    const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
    for (let d = 1; d <= totalCells - startDow - daysInMonth; d++) {
      cells += `<div class="heatmap-cell heatmap-cell--other">${d}</div>`;
    }
    grid.innerHTML = cells;
  }

  async function _editDay(dateStr) {
    const entries = await DB.getAll('mood');
    const entry = entries.find(e => e.date === dateStr);
    if (entry) openEntry(entry);
    else openEntry(null, dateStr);
  }

  async function _heatmapPrev() {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    const entries  = await DB.getAll('mood');
    const entryMap = {};
    entries.forEach(e => { entryMap[e.date] = e; });
    _renderHeatmapGrid(entryMap);
  }

  async function _heatmapNext() {
    const now = new Date();
    if (calYear > now.getFullYear() || (calYear === now.getFullYear() && calMonth >= now.getMonth())) return;
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    const entries  = await DB.getAll('mood');
    const entryMap = {};
    entries.forEach(e => { entryMap[e.date] = e; });
    _renderHeatmapGrid(entryMap);
  }

  // ── Multi-line Chart ──────────────────────────────────────
  async function _renderChart(entries, criteria) {
    const legendEl    = document.getElementById('mood-chart-legend');
    const selectorEl  = document.getElementById('mood-criteria-selector');
    if (!legendEl || !selectorEl) return;

    // Criteria selector pills
    selectorEl.innerHTML = criteria.map(c => `
      <button class="mood-crit-pill ${chartCriteria.includes(c.key)?'active':''}"
        style="${chartCriteria.includes(c.key)?`background:${c.color}22;color:${c.color};border-color:${c.color}55`:''}"
        onclick="Mood._toggleChartCriteria('${c.key}')">
        ${c.emoji} ${c.label}
      </button>`).join('');

    // Legend
    legendEl.innerHTML = criteria
      .filter(c => chartCriteria.includes(c.key))
      .map(c => `<span class="mood-legend-dot" style="background:${c.color}"></span><span style="font-size:10px;color:${c.color}">${c.label}</span>`)
      .join('');

    _drawChart(entries, criteria);
  }

  function _drawChart(entries, criteria) {
    const canvas = document.getElementById('mood-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Use last 30 entries (chronological)
    const sorted = [...entries].sort((a,b) => new Date(a.date)-new Date(b.date)).slice(-30);
    if (!sorted.length) {
      ctx.clearRect(0,0,canvas.width||340,canvas.height||180);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.font = "13px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Aucune donnée — commence ton journaling !", (canvas.width||340)/2, 90);
      ctx.clearRect(0,0,canvas.width,canvas.height);
      return;
    }

    const wrap = canvas.parentElement;
    const W = (wrap && wrap.offsetWidth > 0 ? wrap.offsetWidth : 340);
    const H = 180;
    canvas.width  = W;
    canvas.height = H;
    ctx.clearRect(0,0,W,H);

    const PAD_L = 28, PAD_R = 12, PAD_T = 12, PAD_B = 24;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 9; i++) {
      const y = PAD_T + chartH - (i/10)*chartH;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W-PAD_R, y); ctx.stroke();
    }

    // Y axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'right';
    [1,5,10].forEach(v => {
      const y = PAD_T + chartH - ((v-1)/9)*chartH;
      ctx.fillText(v, PAD_L-4, y+3);
    });

    // X axis labels (every ~5 entries)
    ctx.textAlign = 'center';
    sorted.forEach((e, i) => {
      if (i % Math.max(1, Math.floor(sorted.length/6)) === 0) {
        const x = PAD_L + (i/(sorted.length-1||1))*chartW;
        const d = new Date(e.date+'T12:00:00');
        ctx.fillText(`${d.getDate()}/${d.getMonth()+1}`, x, H-4);
      }
    });

    // Draw each selected criteria line
    const activeCrit = (criteria || DEFAULT_CRITERIA).filter(c => chartCriteria.includes(c.key));
    activeCrit.forEach(crit => {
      const points = sorted.map((e, i) => ({
        x: PAD_L + (i/(sorted.length-1||1))*chartW,
        y: PAD_T + chartH - ((((e.scores?.[crit.key]||5)-1)/9)*chartH),
      }));

      // Line
      ctx.beginPath();
      ctx.strokeStyle = crit.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap  = 'round';
      points.forEach((p,i) => i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
      ctx.stroke();

      // Dots
      ctx.fillStyle = crit.color;
      points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI*2);
        ctx.fill();
      });
    });
  }

  async function _toggleChartCriteria(key) {
    if (chartCriteria.includes(key)) {
      if (chartCriteria.length === 1) return; // keep at least 1
      chartCriteria = chartCriteria.filter(k => k !== key);
    } else {
      chartCriteria.push(key);
    }
    const criteria = await getCriteria();
    const entries  = (await DB.getAll('mood')).sort((a,b)=>new Date(b.date)-new Date(a.date));
    await _renderChart(entries, criteria);
    _drawChart(entries, criteria);
  }

  // ── Paginated history ─────────────────────────────────────
  const PAGE_SIZE = 10;

  function _renderHistory(entries, page) {
    const container = document.getElementById('mood-history-section');
    if (!container) return;
    const total = entries.length;
    const start = page * PAGE_SIZE;
    const slice = entries.slice(start, start + PAGE_SIZE);

    container.innerHTML = `
      <div class="fin-section-title" style="margin-top:20px">
        HISTORIQUE (${total} entrées)
      </div>
      ${slice.map(e => {
        const vals = Object.values(e.scores||{});
        const avg  = vals.length ? Math.round(vals.reduce((s,v)=>s+v,0)/vals.length*10)/10 : 5;
        return `<div class="mood-entry-row" onclick="Mood._editDay('${e.date}')">
          <div>
            <div style="font-size:14px;font-weight:700">${Utils.formatDate(e.date)}</div>
            ${e.note ? `<div class="mer-date">${e.note.slice(0,60)}${e.note.length>60?'…':''}</div>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:20px;font-weight:800;color:${Utils.scoreColor(avg)}">${avg}</span>
            <span style="font-size:10px;color:var(--text-muted)">/10</span>
          </div>
        </div>`;
      }).join('')}
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:center">
        ${page > 0 ? `<button class="btn-secondary" onclick="Mood._histPage(${page-1})" style="font-size:12px">← Précédent</button>` : ''}
        <span style="font-size:12px;color:var(--text-muted);padding:9px 4px">${page+1} / ${Math.ceil(total/PAGE_SIZE)||1}</span>
        ${start+PAGE_SIZE < total ? `<button class="btn-secondary" onclick="Mood._histPage(${page+1})" style="font-size:12px">Suivant →</button>` : ''}
      </div>
    `;
  }

  async function _histPage(page) {
    const entries = (await DB.getAll('mood')).sort((a,b)=>new Date(b.date)-new Date(a.date));
    _renderHistory(entries, page);
    document.getElementById('mood-history-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Fullscreen Chart ──────────────────────────────────────
  let _fsChartPeriod = 30;
  let _fsChartCriteria = null;

  async function openFullscreenChart() {
    const criteria = await getCriteria();
    const allEntries = (await DB.getAll('mood')).sort((a,b) => new Date(a.date)-new Date(b.date));
    if (_fsChartCriteria === null) _fsChartCriteria = criteria.map(c => c.key);

    const overlay = document.createElement('div');
    overlay.id = 'mood-fs-overlay';
    overlay.style.cssText = `position:fixed;inset:0;background:var(--bg-base);z-index:10000;display:flex;flex-direction:column;overflow:hidden`;

    overlay.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 16px 8px">
        <div style="font-size:16px;font-weight:900">📈 Évolution mood</div>
        <button onclick="document.getElementById('mood-fs-overlay').remove()"
          style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:10px;padding:6px 14px;font-size:14px;color:var(--text-secondary);cursor:pointer">✕ Fermer</button>
      </div>

      <!-- Période -->
      <div style="display:flex;gap:6px;padding:0 16px 10px">
        ${[7,30,90,365].map(d => `
          <button onclick="Mood._fsPeriod(${d})" id="fs-period-${d}"
            class="filter-chip ${_fsChartPeriod===d?'active':''}"
            style="flex:1;text-align:center;font-size:12px">
            ${d===7?'7j':d===30?'30j':d===90?'3 mois':'1 an'}
          </button>`).join('')}
      </div>

      <!-- Canvas -->
      <div style="flex:1;padding:0 8px;position:relative">
        <canvas id="mood-fs-canvas" style="width:100%;height:100%;display:block"></canvas>
      </div>

      <!-- Critères sélecteurs -->
      <div style="padding:10px 12px 16px;display:flex;flex-wrap:wrap;gap:6px;max-height:40vh;overflow-y:auto">
        ${criteria.map(c => `
          <button onclick="Mood._fsToggleCrit('${c.key}')" id="fs-crit-${c.key}"
            style="padding:6px 10px;border-radius:20px;font-size:12px;cursor:pointer;border:1px solid;
              ${_fsChartCriteria.includes(c.key) ? `background:${c.color}22;color:${c.color};border-color:${c.color}55` : 'background:var(--bg-elevated);color:var(--text-muted);border-color:var(--border)'}">
            ${c.emoji} ${c.label}
          </button>`).join('')}
        <button onclick="Mood._fsToggleAll()" 
          style="padding:6px 10px;border-radius:20px;font-size:12px;cursor:pointer;border:1px solid var(--border);background:var(--bg-elevated);color:var(--text-muted)">
          Tout / Rien
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
    setTimeout(() => _drawFsChart(allEntries, criteria), 60);
  }

  function _drawFsChart(allEntries, criteria) {
    const canvas = document.getElementById('mood-fs-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const wrap = canvas.parentElement;
    const W = wrap.offsetWidth || 360;
    const H = wrap.offsetHeight || 300;
    canvas.width = W; canvas.height = H;
    ctx.clearRect(0,0,W,H);

    // Filter by period
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - _fsChartPeriod);
    const cutoffKey = cutoff.toISOString().slice(0,10);
    const sorted = allEntries.filter(e => e.date >= cutoffKey);

    if (sorted.length < 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '14px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('Pas assez de données pour cette période', W/2, H/2);
      return;
    }

    const PAD_L=32, PAD_R=12, PAD_T=16, PAD_B=28;
    const cW = W-PAD_L-PAD_R, cH = H-PAD_T-PAD_B;

    // Grid
    ctx.strokeStyle='rgba(255,255,255,0.05)'; ctx.lineWidth=1;
    for(let i=1;i<=9;i++){
      const y=PAD_T+cH-(i/10)*cH;
      ctx.beginPath();ctx.moveTo(PAD_L,y);ctx.lineTo(W-PAD_R,y);ctx.stroke();
    }
    ctx.fillStyle='rgba(255,255,255,0.3)';ctx.font='10px system-ui';ctx.textAlign='right';
    [1,3,5,7,10].forEach(v=>{
      const y=PAD_T+cH-((v-1)/9)*cH;
      ctx.fillText(v,PAD_L-4,y+3);
    });

    // X labels
    ctx.textAlign='center';ctx.font='10px system-ui';
    const step = Math.max(1,Math.floor(sorted.length/6));
    sorted.forEach((e,i)=>{
      if(i%step===0){
        const x=PAD_L+(i/(sorted.length-1))*cW;
        const d=new Date(e.date+'T12:00:00');
        ctx.fillText(`${d.getDate()}/${d.getMonth()+1}`,x,H-6);
      }
    });

    // Draw lines
    const activeCrit = criteria.filter(c => _fsChartCriteria.includes(c.key));
    activeCrit.forEach(crit => {
      const pts = sorted.map((e,i)=>({
        x: PAD_L+(i/(sorted.length-1))*cW,
        y: PAD_T+cH-(((e.scores?.[crit.key]||5)-1)/9)*cH,
      }));
      // Gradient fill
      const grad = ctx.createLinearGradient(0,PAD_T,0,PAD_T+cH);
      grad.addColorStop(0,crit.color+'33');grad.addColorStop(1,crit.color+'00');
      ctx.beginPath();
      pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
      ctx.lineTo(pts[pts.length-1].x,PAD_T+cH);ctx.lineTo(PAD_L,PAD_T+cH);
      ctx.closePath();ctx.fillStyle=grad;ctx.fill();
      // Line
      ctx.beginPath();ctx.strokeStyle=crit.color;ctx.lineWidth=activeCrit.length>4?1.5:2;
      ctx.lineJoin='round';ctx.lineCap='round';
      pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
      ctx.stroke();
      // Dots (only if few points)
      if(sorted.length<=20){
        ctx.fillStyle=crit.color;
        pts.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();});
      }
    });
  }

  async function _fsPeriod(days) {
    _fsChartPeriod = days;
    [7,30,90,365].forEach(d => {
      const btn = document.getElementById(`fs-period-${d}`);
      if(btn) btn.className = 'filter-chip' + (d===days?' active':'');
    });
    const criteria = await getCriteria();
    const entries = (await DB.getAll('mood')).sort((a,b)=>new Date(a.date)-new Date(b.date));
    _drawFsChart(entries, criteria);
  }

  async function _fsToggleCrit(key) {
    if(_fsChartCriteria.includes(key)){
      if(_fsChartCriteria.length===1) return;
      _fsChartCriteria = _fsChartCriteria.filter(k=>k!==key);
    } else {
      _fsChartCriteria.push(key);
    }
    const criteria = await getCriteria();
    // Update button styles
    criteria.forEach(c=>{
      const btn=document.getElementById(`fs-crit-${c.key}`);
      if(!btn) return;
      if(_fsChartCriteria.includes(c.key)){
        btn.style.background=`${c.color}22`;btn.style.color=c.color;btn.style.borderColor=`${c.color}55`;
      } else {
        btn.style.background='var(--bg-elevated)';btn.style.color='var(--text-muted)';btn.style.borderColor='var(--border)';
      }
    });
    const entries = (await DB.getAll('mood')).sort((a,b)=>new Date(a.date)-new Date(b.date));
    _drawFsChart(entries, criteria);
  }

  async function _fsToggleAll() {
    const criteria = await getCriteria();
    if(_fsChartCriteria.length === criteria.length){
      _fsChartCriteria = [criteria[0].key];
    } else {
      _fsChartCriteria = criteria.map(c=>c.key);
    }
    criteria.forEach(c=>{
      const btn=document.getElementById(`fs-crit-${c.key}`);
      if(!btn) return;
      if(_fsChartCriteria.includes(c.key)){
        btn.style.background=`${c.color}22`;btn.style.color=c.color;btn.style.borderColor=`${c.color}55`;
      } else {
        btn.style.background='var(--bg-elevated)';btn.style.color='var(--text-muted)';btn.style.borderColor='var(--border)';
      }
    });
    const entries = (await DB.getAll('mood')).sort((a,b)=>new Date(a.date)-new Date(b.date));
    _drawFsChart(entries, criteria);
  }

  return {
    init, getCriteria, openEntry, _updateScore, _save,
    renderStats,
    _heatmapPrev, _heatmapNext, _editDay,
    _toggleChartCriteria, _drawChart,
    _histPage,
    openFullscreenChart, _fsPeriod, _fsToggleCrit, _fsToggleAll,
  };
})();
