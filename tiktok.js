// ── TIKTOK MODULE ─────────────────────────────────────────────
const TikTok = (() => {

  const STAT_FIELDS = [
    { key: 'followers',    label: 'Followers',      emoji: '👥', color: '#7c6bff' },
    { key: 'views',        label: 'Vues totales',   emoji: '👁', color: '#4d9fff' },
    { key: 'likes',        label: 'Likes',          emoji: '❤️', color: '#ff4d6d' },
    { key: 'comments',     label: 'Commentaires',   emoji: '💬', color: '#f5a623' },
    { key: 'shares',       label: 'Partages',       emoji: '🔄', color: '#00d47e' },
    { key: 'videos',       label: 'Vidéos postées', emoji: '🎬', color: '#a78bfa' },
  ];

  async function init() {}

  async function getConfig() {
    const c = await DB.getSetting('tiktok_config');
    return c || {
      username: '',
      objective: { metric: 'followers', target: 10000, growthPct: 10 },
      monthlyObjectives: {},
    };
  }

  async function saveConfig(config) {
    await DB.setSetting('tiktok_config', config);
  }

  async function getStats() {
    const all = await DB.getAll('tiktok_stats');
    return all.sort((a, b) => a.date.localeCompare(b.date));
  }

  // ── Posting tracker ───────────────────────────────────────
  async function getPostLog() {
    const log = await DB.getSetting('tiktok_post_log');
    return log || {};
  }

  async function logPostToday() {
    const log = await getPostLog();
    const today = Utils.today();
    log[today] = (log[today] || 0) + 1;
    await DB.setSetting('tiktok_post_log', log);
  }

  function _getWeekDates() {
    const today = new Date();
    const day = today.getDay(); // 0=Sun
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((day + 6) % 7));
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push(d.toISOString().slice(0,10));
    }
    return dates;
  }

  function _calcStreak(log) {
    let streak = 0;
    const d = new Date();
    while (true) {
      const key = d.toISOString().slice(0,10);
      if (log[key] && log[key] > 0) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  // ── Main render ───────────────────────────────────────────
  async function render(container) {
    if (!container) return;
    const config = await getConfig();
    const stats  = await getStats();
    const postLog = await getPostLog();
    const today  = Utils.today();
    const now    = new Date();

    const latestStat = stats[stats.length - 1];
    const prevStat   = stats[stats.length - 2];

    const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    // Weekly posting data
    const weekDates = _getWeekDates();
    const weekPosted = weekDates.filter(d => postLog[d] && postLog[d] > 0).length;
    const postedToday = !!(postLog[today] && postLog[today] > 0);
    const streak = _calcStreak(postLog);

    // Alert if not posted yet and it's past 18h
    const isLate = now.getHours() >= 18 && !postedToday;

    const DAY_LABELS = ['L','M','M','J','V','S','D'];

    container.innerHTML = `
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div>
          <div style="font-size:22px;font-weight:900">📱 TikTok</div>
          ${config.username ? `<div style="font-size:13px;color:var(--text-muted)">@${config.username}</div>` : ''}
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn-secondary" style="padding:8px 12px;font-size:13px" onclick="TikTok.openAddStats()">+ Stats</button>
          <button class="btn-secondary" style="padding:8px 12px;font-size:16px" onclick="TikTok.openSettings()">⚙️</button>
        </div>
      </div>

      <!-- Alerte si pas posté après 18h -->
      ${isLate ? `
        <div style="background:rgba(255,77,109,0.12);border:1px solid rgba(255,77,109,0.4);border-radius:var(--radius-lg);padding:12px 14px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
          <span style="font-size:20px">⚠️</span>
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--accent-red)">Pas encore posté aujourd'hui !</div>
            <div style="font-size:12px;color:var(--text-muted)">Il est ${now.getHours()}h — pense à publier ta vidéo</div>
          </div>
        </div>` : ''}

      <!-- Posting tracker -->
      <div style="background:var(--bg-card);border:1px solid rgba(124,107,255,0.2);border-radius:var(--radius-xl);padding:16px;margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div style="font-size:14px;font-weight:800">🎬 Posts cette semaine</div>
          <div style="font-size:20px;font-weight:900;color:${weekPosted >= 7 ? 'var(--accent-green)' : weekPosted >= 5 ? 'var(--accent-gold)' : 'var(--accent-crystal)'}">
            ${weekPosted}/7
          </div>
        </div>

        <!-- Semaine en pills -->
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:14px">
          ${weekDates.map((d, i) => {
            const posted = postLog[d] && postLog[d] > 0;
            const isT = d === today;
            return `<div style="text-align:center">
              <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">${DAY_LABELS[i]}</div>
              <div style="width:100%;aspect-ratio:1;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;
                background:${posted ? 'var(--accent-green)' : isT ? 'rgba(124,107,255,0.2)' : 'var(--bg-elevated)'};
                border:${isT ? '2px solid var(--accent-crystal)' : '2px solid transparent'};
                font-weight:${posted?'900':'400'};color:${posted?'#fff':'var(--text-muted)'}">
                ${posted ? (postLog[d] > 1 ? postLog[d] : '✓') : '·'}
              </div>
            </div>`;
          }).join('')}
        </div>

        <!-- Streak + bouton poster -->
        <div style="display:flex;align-items:center;gap:10px">
          <div style="flex:1;background:var(--bg-elevated);border-radius:var(--radius-lg);padding:10px 12px;text-align:center">
            <div style="font-size:22px;font-weight:900;color:${streak >= 7 ? 'var(--accent-green)' : streak >= 3 ? 'var(--accent-gold)' : 'var(--text-secondary)'}">
              ${streak > 0 ? '🔥' : '💤'} ${streak}
            </div>
            <div style="font-size:11px;color:var(--text-muted)">jours de suite</div>
          </div>
          <button onclick="TikTok._logPost()" style="flex:2;padding:14px;border-radius:var(--radius-lg);font-size:14px;font-weight:800;border:none;cursor:pointer;
            background:${postedToday ? 'var(--bg-elevated)' : 'linear-gradient(135deg,var(--accent-crystal),#4d9fff)'};
            color:${postedToday ? 'var(--text-muted)' : '#fff'}">
            ${postedToday ? `✅ Posté (${postLog[today]}×)` : '📤 J\'ai posté !'}
          </button>
        </div>
      </div>

      <!-- Current stats -->
      ${latestStat ? `
        <div class="fin-section-title">📊 DERNIÈRES STATS — ${Utils.formatDate(latestStat.date)}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
          ${STAT_FIELDS.filter(f => latestStat[f.key] !== undefined).map(f => {
            const val = latestStat[f.key] || 0;
            const prev = prevStat?.[f.key] || 0;
            const delta = val - prev;
            const deltaPct = prev > 0 ? ((delta/prev)*100).toFixed(1) : null;
            return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px">
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">${f.emoji} ${f.label.toUpperCase()}</div>
              <div style="font-size:22px;font-weight:900;color:${f.color}">${_fmt(val)}</div>
              ${prevStat ? `<div style="font-size:11px;margin-top:4px;color:${delta>=0?'var(--accent-green)':'var(--accent-red)'}">
                ${delta>=0?'+':''}${_fmt(delta)} ${deltaPct!==null?`(${delta>=0?'+':''}${deltaPct}%)`:''}</div>` : ''}
            </div>`;
          }).join('')}
        </div>` : `
        <div class="empty-state" style="padding:24px 0">
          <div class="empty-state-icon">📊</div>
          <div class="empty-state-text">Aucune stat enregistrée</div>
          <div class="empty-state-sub">Ajoute tes premières stats</div>
        </div>`}

      <!-- Objectif mensuel -->
      ${_renderObjective(config, latestStat, monthKey)}

      <!-- Chart -->
      ${stats.length >= 2 ? `
        <div class="fin-section-title">📈 ÉVOLUTION</div>
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-xl);padding:16px;margin-bottom:16px">
          <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap" id="tt-chart-metric-pills">
            ${STAT_FIELDS.map(f => `
              <button class="filter-chip ${f.key==='followers'?'active':''}" style="font-size:11px"
                onclick="TikTok._changeChartMetric('${f.key}','${f.color}')"
                data-metric="${f.key}">${f.emoji} ${f.label}</button>`).join('')}
          </div>
          <canvas id="tt-chart" height="160" style="width:100%;display:block"></canvas>
        </div>` : ''}

      <!-- History -->
      ${stats.length ? `
        <div class="fin-section-title">🗓️ HISTORIQUE</div>
        ${[...stats].reverse().slice(0,10).map(s => `
          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px 14px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:13px;font-weight:700">${Utils.formatDate(s.date)}</div>
              <div style="font-size:11px;color:var(--text-muted)">
                ${STAT_FIELDS.filter(f=>s[f.key]!==undefined).map(f=>`${f.emoji}${_fmt(s[f.key])}`).join(' · ')}
              </div>
            </div>
            <button onclick="TikTok._deleteStat('${Utils.escAttr(s.id)}')" style="color:var(--text-muted);font-size:16px;padding:4px">×</button>
          </div>`).join('')}` : ''}
    `;

    if (stats.length >= 2) {
      setTimeout(() => _drawChart(stats, 'followers', '#7c6bff'), 50);
    }
  }

  function _renderObjective(config, latestStat, monthKey) {
    const obj = config.monthlyObjectives?.[monthKey];
    if (!obj && !config.objective) return '';

    const target = obj?.target || config.objective?.target || 0;
    const metric = obj?.metric || config.objective?.metric || 'followers';
    const current = latestStat?.[metric] || 0;
    const pct = target > 0 ? Math.min(100, Math.round((current/target)*100)) : 0;
    const field = STAT_FIELDS.find(f => f.key === metric);
    const remaining = Math.max(0, target - current);

    return `
      <div class="fin-section-title">🎯 OBJECTIF ${Utils.MONTHS_FR[new Date().getMonth()].toUpperCase()}</div>
      <div style="background:var(--bg-card);border:1px solid rgba(124,107,255,0.2);border-radius:var(--radius-xl);padding:16px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px">
          <div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">${field?.emoji||''} ${field?.label||metric}</div>
            <div style="font-size:24px;font-weight:900;color:var(--accent-crystal)">${_fmt(current)} <span style="font-size:14px;color:var(--text-muted)">/ ${_fmt(target)}</span></div>
          </div>
          <div style="text-align:right">
            <div style="font-size:28px;font-weight:900;color:${pct>=100?'var(--accent-green)':'var(--accent-crystal)'}">${pct}%</div>
            ${remaining > 0 ? `<div style="font-size:11px;color:var(--text-muted)">encore ${_fmt(remaining)}</div>` : ''}
          </div>
        </div>
        <div style="height:8px;background:var(--bg-elevated);border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${pct>=100?'var(--accent-green)':'linear-gradient(90deg,var(--accent-crystal),#4d9fff)'};border-radius:4px;transition:width 0.6s cubic-bezier(0.34,1.56,0.64,1)"></div>
        </div>
        ${pct >= 100 ? '<div style="text-align:center;margin-top:8px;font-size:13px;color:var(--accent-green);font-weight:700">🎉 Objectif atteint !</div>' : ''}
      </div>`;
  }

  function _fmt(n) {
    if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n/1000).toFixed(1) + 'K';
    return String(n || 0);
  }

  async function _logPost() {
    await logPostToday();
    if (navigator.vibrate) navigator.vibrate(60);
    const container = document.querySelector('.biz-screen.active .biz-body');
    if (container) await render(container);
    const log = await getPostLog();
    const today = Utils.today();
    if (log[today] === 1) Utils.toast('🎬 Vidéo postée ! Continue comme ça 🔥');
    else Utils.toast(`🎬 +1 vidéo aujourd'hui (${log[today]} au total)`);
  }

  function _drawChart(stats, metric, color) {
    const canvas = document.getElementById('tt-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const wrap = canvas.parentElement;
    const W = wrap?.offsetWidth || 320;
    const H = 160;
    canvas.width = W; canvas.height = H;
    ctx.clearRect(0, 0, W, H);

    const data = stats.filter(s => s[metric] !== undefined);
    if (data.length < 2) return;

    const vals = data.map(s => s[metric] || 0);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const range = maxV - minV || 1;

    const PAD_L=36, PAD_R=12, PAD_T=12, PAD_B=24;
    const cW = W-PAD_L-PAD_R, cH = H-PAD_T-PAD_B;

    ctx.strokeStyle='rgba(255,255,255,0.05)'; ctx.lineWidth=1;
    for(let i=0;i<=3;i++){
      const y=PAD_T+(i/3)*cH;
      ctx.beginPath();ctx.moveTo(PAD_L,y);ctx.lineTo(W-PAD_R,y);ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,0.3)';ctx.font='9px system-ui';ctx.textAlign='right';
      ctx.fillText(_fmt(maxV-(i/3)*(maxV-minV)), PAD_L-4, y+3);
    }

    const pts = data.map((s,i)=>({
      x: PAD_L+(i/(data.length-1))*cW,
      y: PAD_T+((maxV-(s[metric]||0))/range)*cH,
    }));

    const grad = ctx.createLinearGradient(0,PAD_T,0,PAD_T+cH);
    grad.addColorStop(0, color+'55'); grad.addColorStop(1, color+'00');
    ctx.beginPath();
    pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.lineTo(pts[pts.length-1].x,PAD_T+cH);ctx.lineTo(PAD_L,PAD_T+cH);
    ctx.closePath();ctx.fillStyle=grad;ctx.fill();

    ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=2.5;
    ctx.lineJoin='round';ctx.lineCap='round';
    pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.stroke();

    ctx.font='9px system-ui';ctx.textAlign='center';
    data.forEach((s,i)=>{
      const p=pts[i];
      ctx.fillStyle=color;
      ctx.beginPath();ctx.arc(p.x,p.y,3.5,0,Math.PI*2);ctx.fill();
      if(i%Math.max(1,Math.floor(data.length/5))===0){
        ctx.fillStyle='rgba(255,255,255,0.3)';
        const d=new Date(s.date+'T12:00:00');
        ctx.fillText(`${d.getDate()}/${d.getMonth()+1}`,p.x,H-4);
      }
    });
  }

  function _changeChartMetric(metric, color) {
    document.querySelectorAll('#tt-chart-metric-pills .filter-chip').forEach(b => {
      b.classList.toggle('active', b.dataset.metric === metric);
    });
    DB.getAll('tiktok_stats').then(stats => {
      _drawChart(stats.sort((a,b)=>a.date.localeCompare(b.date)), metric, color);
    });
  }

  function openAddStats() {
    Utils.modal(`
      <div class="modal-title">📊 Nouvelles stats</div>
      <div class="form-group">
        <label class="form-label">DATE</label>
        <input class="form-input" id="tt-stat-date" type="date" value="${Utils.today()}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${STAT_FIELDS.map(f => `
          <div class="form-group">
            <label class="form-label">${f.emoji} ${f.label.toUpperCase()}</label>
            <input class="form-input" id="tt-stat-${f.key}" type="number" placeholder="0" min="0">
          </div>`).join('')}
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="Utils.closeModals()">Annuler</button>
        <button class="btn-primary" onclick="TikTok._saveStat()">Sauvegarder</button>
      </div>
    `);
  }

  async function _saveStat() {
    const date = document.getElementById('tt-stat-date')?.value || Utils.today();
    const stat = { id: Utils.uid(), date };
    STAT_FIELDS.forEach(f => {
      const val = parseInt(document.getElementById(`tt-stat-${f.key}`)?.value);
      if (!isNaN(val)) stat[f.key] = val;
    });

    const all = await DB.getAll('tiktok_stats');
    const existing = all.find(s => s.date === date);
    if (existing) {
      await DB.put('tiktok_stats', { ...existing, ...stat, id: existing.id });
    } else {
      await DB.put('tiktok_stats', stat);
    }

    await _updateObjective(stat);
    Utils.closeModals();
    const container = document.querySelector('.biz-screen.active .biz-body');
    if (container) await render(container);
    Utils.toast('✅ Stats enregistrées');
  }

  async function _updateObjective(latestStat) {
    const config = await getConfig();
    if (!config.objective?.growthPct) return;

    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth()+1, 1);
    const nextKey = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth()+1).padStart(2,'0')}`;
    const metric = config.objective.metric;
    const current = latestStat[metric] || 0;
    const growth = config.objective.growthPct / 100;
    const nextTarget = Math.round(current * (1 + growth));

    if (!config.monthlyObjectives) config.monthlyObjectives = {};
    config.monthlyObjectives[nextKey] = { metric, target: nextTarget };
    await saveConfig(config);
  }

  async function _deleteStat(id) {
    Utils.confirm('Supprimer cette entrée ?', async () => {
      await DB.del('tiktok_stats', id);
      const container = document.querySelector('.biz-screen.active .biz-body');
      if (container) await render(container);
      Utils.toast('🗑 Supprimé');
    });
  }

  function openSettings() {
    getConfig().then(config => {
      Utils.modal(`
        <div class="modal-title">⚙️ Config TikTok</div>

        <div class="form-group">
          <label class="form-label">NOM D'UTILISATEUR</label>
          <input class="form-input" id="tt-username" placeholder="@tonpseudo" value="${Utils.escAttr(config.username||'')}">
        </div>

        <div class="fin-section-title">OBJECTIF DE CROISSANCE</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="form-group">
            <label class="form-label">MÉTRIQUE</label>
            <select class="form-select" id="tt-obj-metric">
              ${STAT_FIELDS.map(f=>`<option value="${f.key}" ${config.objective?.metric===f.key?'selected':''}>${f.emoji} ${f.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">OBJECTIF CE MOIS</label>
            <input class="form-input" id="tt-obj-target" type="number" placeholder="10000" value="${config.objective?.target||''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">CROISSANCE AUTO MOIS SUIVANT (%)</label>
          <div style="display:flex;align-items:center;gap:10px">
            <input class="form-input" id="tt-obj-growth" type="number" placeholder="10" min="0" max="100"
              value="${config.objective?.growthPct||''}" style="flex:1">
            <span style="font-size:13px;color:var(--text-muted);flex-shrink:0">% de plus / mois</span>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:6px">
            L'objectif du mois suivant sera automatiquement +X% du dernier stat enregistré
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" onclick="Utils.closeModals()">Annuler</button>
          <button class="btn-primary" onclick="TikTok._saveSettings()">Sauvegarder</button>
        </div>
      `);
    });
  }

  async function _saveSettings() {
    const config = await getConfig();
    config.username = document.getElementById('tt-username')?.value.trim() || '';

    const metric = document.getElementById('tt-obj-metric')?.value || 'followers';
    const target = parseInt(document.getElementById('tt-obj-target')?.value) || 0;
    const growthPct = parseFloat(document.getElementById('tt-obj-growth')?.value) || 0;
    config.objective = { metric, target, growthPct };

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    if (!config.monthlyObjectives) config.monthlyObjectives = {};
    if (target > 0) config.monthlyObjectives[monthKey] = { metric, target };

    await saveConfig(config);
    Utils.closeModals();
    const container = document.querySelector('.biz-screen.active .biz-body');
    if (container) await render(container);
    Utils.toast('✅ Config sauvegardée');
  }

  return { init, render, openAddStats, openSettings, _saveStat, _saveSettings, _logPost, _changeChartMetric, _deleteStat };
})();
