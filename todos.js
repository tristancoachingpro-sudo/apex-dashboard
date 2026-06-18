// ── TODOS MODULE v14 — Full rewrite ───────────────────────────
const Todos = (() => {
  let activeView = 'list'; // 'list' | 'calendar'
  let calView = 'month';   // 'month' | 'week' | 'day'
  let calDate = new Date();
  let filterCat = 'all';
  let filterStatus = 'pending'; // 'pending' | 'done' | 'all'

  async function init() {}

  // ── Main render ───────────────────────────────────────────
  async function render() {
    const container = document.getElementById('todos-content');
    if (!container) return;

    const todos = await DB.getAll('todos');
    // Auto-handle recurring todos
    await _handleRecurring(todos);
    const fresh = await DB.getAll('todos');

    const cats = ['all', ...new Set(fresh.map(t => t.category).filter(Boolean)).values()].sort((a,b) => a==='all'?-1:a.localeCompare(b));

    container.innerHTML = `
      <!-- Stats bar -->
      ${_renderStats(fresh)}

      <!-- View toggle -->
      <div class="todo-view-toggle">
        <button class="tvt-btn ${activeView==='list'?'active':''}" onclick="Todos.setView('list')">
          <svg viewBox="0 0 24 24" width="15" height="15"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="3" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="3" cy="18" r="1" fill="currentColor" stroke="none"/></svg>
          Liste
        </button>
        <button class="tvt-btn ${activeView==='calendar'?'active':''}" onclick="Todos.setView('calendar')">
          <svg viewBox="0 0 24 24" width="15" height="15"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Calendrier
        </button>
      </div>

      ${activeView === 'list' ? _renderListView(fresh, cats) : _renderCalendarView(fresh)}
    `;

    _attachListeners();
  }

  function _renderStats(todos) {
    const today = Utils.today();
    const thisWeek = _getWeekDates(new Date());
    const total = todos.length;
    const done = todos.filter(t => t.done).length;
    const doneThisWeek = todos.filter(t => t.done && t.doneAt && thisWeek.includes(t.doneAt)).length;
    const overdue = todos.filter(t => !t.done && t.dueDate && t.dueDate < today).length;
    const pct = total ? Math.round((done/total)*100) : 0;

    return `<div class="todo-stats-bar">
      <div class="tsb-item">
        <div class="tsb-val" style="color:var(--accent-crystal)">${total - done}</div>
        <div class="tsb-lbl">En cours</div>
      </div>
      <div class="tsb-item">
        <div class="tsb-val" style="color:var(--accent-green)">${doneThisWeek}</div>
        <div class="tsb-lbl">Cette semaine</div>
      </div>
      <div class="tsb-item">
        <div class="tsb-val" style="color:${overdue>0?'var(--accent-red)':'var(--text-muted)'}">${overdue}</div>
        <div class="tsb-lbl">En retard</div>
      </div>
      <div class="tsb-item tsb-progress-wrap">
        <div class="tsb-pct">${pct}%</div>
        <div class="tsb-progress-track">
          <div class="tsb-progress-fill" style="width:${pct}%;background:${pct===100?'var(--accent-green)':'var(--accent-crystal)'}"></div>
        </div>
        <div class="tsb-lbl">Complété</div>
      </div>
    </div>`;
  }

  function _renderListView(todos, cats) {
    const today = Utils.today();

    // Category filter pills
    const filterHtml = `
      <div class="todo-filter-row">
        <div class="todo-cat-pills">
          ${cats.map(c => `<button class="filter-chip ${filterCat===c?'active':''}" onclick="Todos.setCat('${Utils.escAttr(c)}')">${c==='all'?'Toutes':c}</button>`).join('')}
        </div>
        <div class="todo-status-pills">
          <button class="tvt-btn ${filterStatus==='pending'?'active':''}" onclick="Todos.setStatus('pending')">En cours</button>
          <button class="tvt-btn ${filterStatus==='done'?'active':''}" onclick="Todos.setStatus('done')">Faites</button>
          <button class="tvt-btn ${filterStatus==='all'?'active':''}" onclick="Todos.setStatus('all')">Toutes</button>
        </div>
      </div>`;

    let filtered = todos;
    if (filterCat !== 'all') filtered = filtered.filter(t => t.category === filterCat);
    if (filterStatus === 'pending') filtered = filtered.filter(t => !t.done);
    else if (filterStatus === 'done') filtered = filtered.filter(t => t.done);

    // Group by category
    const pinned = filtered.filter(t => t.pinned && !t.done);
    const overdue = filtered.filter(t => !t.done && !t.pinned && t.dueDate && t.dueDate < today);
    const dueToday = filtered.filter(t => !t.done && !t.pinned && t.dueDate === today);
    const rest = filtered.filter(t => !t.done && !t.pinned && (!t.dueDate || t.dueDate > today));
    const done = filtered.filter(t => t.done);

    // Sort rest by priority then due date
    const sortFn = (a,b) => {
      const pO = {high:0, med:1, low:2};
      const pd = (pO[a.priority]||1) - (pO[b.priority]||1);
      if (pd !== 0) return pd;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    };

    let html = filterHtml;

    if (!filtered.length) {
      html += `<div class="empty-state" style="padding:32px 20px">
        <div class="empty-state-icon">✅</div>
        <div class="empty-state-text">Aucune tâche ici</div>
        <div class="empty-state-sub">Tout est à jour !</div>
      </div>`;
      return html;
    }

    if (pinned.length) {
      html += `<div class="todo-group-label">📌 ÉPINGLÉES</div>`;
      html += pinned.sort(sortFn).map(t => _renderTodoItem(t, today)).join('');
    }
    if (overdue.length) {
      html += `<div class="todo-group-label" style="color:var(--accent-red)">⚠️ EN RETARD</div>`;
      html += overdue.sort(sortFn).map(t => _renderTodoItem(t, today)).join('');
    }
    if (dueToday.length) {
      html += `<div class="todo-group-label" style="color:var(--accent-gold)">📅 AUJOURD'HUI</div>`;
      html += dueToday.sort(sortFn).map(t => _renderTodoItem(t, today)).join('');
    }
    if (rest.length) {
      // Group by category
      const byCat = {};
      rest.forEach(t => {
        const c = t.category || 'Sans catégorie';
        if (!byCat[c]) byCat[c] = [];
        byCat[c].push(t);
      });
      Object.entries(byCat).sort(([a],[b])=>a.localeCompare(b)).forEach(([cat, items]) => {
        if (filterCat === 'all') html += `<div class="todo-group-label">${cat.toUpperCase()}</div>`;
        html += items.sort(sortFn).map(t => _renderTodoItem(t, today)).join('');
      });
    }
    if (done.length) {
      html += `<div class="todo-group-label" style="color:var(--accent-green)">✓ TERMINÉES (${done.length})</div>`;
      html += done.slice(0,10).map(t => _renderTodoItem(t, today)).join('');
      if (done.length > 10) {
        html += `<button class="btn-secondary" onclick="Todos.clearDone()" style="width:100%;font-size:12px;margin-top:8px">🗑 Effacer les ${done.length} terminées</button>`;
      }
    }

    return html;
  }

  function _renderTodoItem(t, today) {
    const pColors = { high: 'var(--accent-red)', med: 'var(--accent-gold)', low: 'var(--accent-blue)' };
    const pColor = pColors[t.priority] || 'var(--accent-blue)';
    const isOverdue = !t.done && t.dueDate && t.dueDate < today;
    const isDueToday = !t.done && t.dueDate === today;
    const recurIcon = t.recurrence ? '🔁 ' : '';

    return `<div class="todo-item ${t.done?'todo-item--done':''} ${isOverdue?'todo-item--overdue':''}" onclick="Todos.openDetail('${Utils.escAttr(t.id)}')">
      <div class="todo-check-wrap" onclick="event.stopPropagation();Todos.toggle('${Utils.escAttr(t.id)}')">
        <div class="todo-check ${t.done?'done':''}"></div>
      </div>
      <div style="flex:1;min-width:0">
        <div class="todo-text ${t.done?'done':''}">
          ${t.pinned && !t.done ? '📌 ' : ''}${recurIcon}${t.text}
        </div>
        <div class="todo-meta-row">
          ${t.category ? `<span class="todo-cat-chip">${t.category}</span>` : ''}
          ${t.dueDate ? `<span class="todo-due ${isOverdue?'overdue':isDueToday?'today':''}">
            ${isOverdue?'⚠️':'📅'} ${Utils.formatDate(t.dueDate)}
          </span>` : ''}
          ${t.description ? `<span class="todo-has-note">📝</span>` : ''}
        </div>
      </div>
      <div class="todo-prio-dot" style="background:${pColor}"></div>
    </div>`;
  }

  // ── Calendar view ─────────────────────────────────────────
  function _renderCalendarView(todos) {
    return `
      <div class="todo-cal-wrap">
        <div class="todo-cal-nav">
          <button class="cal-nav" onclick="Todos.calPrev()">‹</button>
          <div class="todo-cal-view-pills">
            <button class="tvt-btn ${calView==='day'?'active':''}" onclick="Todos.setCalView('day')">Jour</button>
            <button class="tvt-btn ${calView==='week'?'active':''}" onclick="Todos.setCalView('week')">Semaine</button>
            <button class="tvt-btn ${calView==='month'?'active':''}" onclick="Todos.setCalView('month')">Mois</button>
          </div>
          <button class="cal-nav" onclick="Todos.calNext()">›</button>
        </div>
        <div class="todo-cal-title" id="todo-cal-title"></div>
        <div id="todo-cal-body"></div>
      </div>
    `;
  }

  function _renderCalBody(todos) {
    const title = document.getElementById('todo-cal-title');
    const body  = document.getElementById('todo-cal-body');
    if (!title || !body) return;

    const today = Utils.today();

    if (calView === 'month') {
      title.textContent = `${Utils.MONTHS_FR[calDate.getMonth()]} ${calDate.getFullYear()}`;
      body.innerHTML = _renderMonthCal(todos, today);
    } else if (calView === 'week') {
      const weekDates = _getWeekDatesFromDate(calDate);
      title.textContent = `Sem. du ${Utils.formatDate(weekDates[0])} au ${Utils.formatDate(weekDates[6])}`;
      body.innerHTML = _renderWeekCal(todos, weekDates, today);
    } else {
      title.textContent = Utils.formatDateFull(calDate);
      body.innerHTML = _renderDayCal(todos, Utils.dateKey(calDate), today);
    }
  }

  function _renderMonthCal(todos, today) {
    const y = calDate.getFullYear(), m = calDate.getMonth();
    const firstDay = new Date(y, m, 1);
    const daysInMonth = new Date(y, m+1, 0).getDate();
    let startDow = firstDay.getDay();
    startDow = startDow === 0 ? 6 : startDow - 1;
    const prevDays = new Date(y, m, 0).getDate();

    // Map todos by due date
    const byDate = {};
    todos.forEach(t => {
      if (!t.dueDate) return;
      if (!byDate[t.dueDate]) byDate[t.dueDate] = [];
      byDate[t.dueDate].push(t);
    });

    let html = `<div class="heatmap-grid-labels">${['L','M','M','J','V','S','D'].map(d=>`<span>${d}</span>`).join('')}</div>
    <div class="todo-month-grid">`;

    for (let i = startDow-1; i >= 0; i--) {
      html += `<div class="todo-month-cell todo-month-cell--other"><span class="tmc-num">${prevDays-i}</span></div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dayTodos = byDate[dateStr] || [];
      const isToday = dateStr === today;
      const hasOverdue = dayTodos.some(t => !t.done);
      const allDone = dayTodos.length > 0 && dayTodos.every(t => t.done);
      html += `<div class="todo-month-cell ${isToday?'today':''}" onclick="Todos._calDayClick('${dateStr}')">
        <span class="tmc-num">${d}</span>
        ${dayTodos.length ? `<div class="tmc-dots">
          ${dayTodos.slice(0,3).map(t => `<div class="tmc-dot" style="background:${t.done?'var(--accent-green)':t.dueDate<today?'var(--accent-red)':'var(--accent-crystal)'}"></div>`).join('')}
          ${dayTodos.length > 3 ? `<span class="tmc-more">+${dayTodos.length-3}</span>` : ''}
        </div>` : ''}
      </div>`;
    }
    const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
    for (let d = 1; d <= totalCells - startDow - daysInMonth; d++) {
      html += `<div class="todo-month-cell todo-month-cell--other"><span class="tmc-num">${d}</span></div>`;
    }

    html += `</div><div id="todo-cal-day-detail" style="margin-top:16px"></div>`;
    return html;
  }

  function _renderWeekCal(todos, weekDates, today) {
    const byDate = {};
    todos.forEach(t => {
      if (!t.dueDate) return;
      if (!byDate[t.dueDate]) byDate[t.dueDate] = [];
      byDate[t.dueDate].push(t);
    });

    const dayLabels = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
    let html = `<div class="todo-week-grid">`;
    weekDates.forEach((dateStr, i) => {
      const dayTodos = byDate[dateStr] || [];
      const isToday = dateStr === today;
      const d = new Date(dateStr + 'T12:00:00').getDate();
      html += `<div class="todo-week-col ${isToday?'today':''}">
        <div class="twc-header">
          <div class="twc-label">${dayLabels[i]}</div>
          <div class="twc-num ${isToday?'today':''}">${d}</div>
        </div>
        <div class="twc-todos">
          ${dayTodos.map(t => `
            <div class="twc-todo ${t.done?'done':t.dueDate<today?'overdue':''}" onclick="Todos.openDetail('${Utils.escAttr(t.id)}')">
              <div class="twc-dot" style="background:${_prioColor(t.priority)}"></div>
              <span class="twc-text">${t.text}</span>
            </div>`).join('')}
          ${!dayTodos.length ? `<div class="twc-empty">—</div>` : ''}
        </div>
        <button class="twc-add" onclick="Todos.openAdd('${dateStr}')">+</button>
      </div>`;
    });
    html += `</div>`;
    return html;
  }

  function _renderDayCal(todos, dateStr, today) {
    const dayTodos = todos.filter(t => t.dueDate === dateStr);
    const noDate = todos.filter(t => !t.dueDate && !t.done);
    const isToday = dateStr === today;

    let html = `<div class="todo-day-view">`;
    if (dayTodos.length) {
      html += `<div class="todo-group-label">${isToday ? "AUJOURD'HUI" : "CE JOUR"} (${dayTodos.length})</div>`;
      html += dayTodos.map(t => _renderTodoItem(t, today)).join('');
    } else {
      html += `<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px">Aucune tâche ce jour</div>`;
    }
    if (noDate.length) {
      html += `<div class="todo-group-label" style="margin-top:16px">SANS DATE (${noDate.length})</div>`;
      html += noDate.slice(0,5).map(t => _renderTodoItem(t, today)).join('');
    }
    html += `<button class="btn-primary" style="width:100%;margin-top:16px" onclick="Todos.openAdd('${dateStr}')">+ Tâche pour ce jour</button>`;
    html += `</div>`;
    return html;
  }

  // ── Recurring todos handler ───────────────────────────────
  async function _handleRecurring(todos) {
    const today = Utils.today();
    for (const t of todos) {
      if (!t.recurrence || !t.done) continue;
      // Check if we need to spawn a new instance
      const nextDue = _nextRecurDate(t.doneAt || t.dueDate, t.recurrence);
      if (nextDue && nextDue <= today) {
        // Check if already spawned
        const existing = todos.find(x => x.recurParentId === t.id && x.dueDate === nextDue);
        if (!existing) {
          await DB.put('todos', {
            id: Utils.uid(),
            text: t.text,
            category: t.category,
            priority: t.priority,
            description: t.description,
            recurrence: t.recurrence,
            recurParentId: t.id,
            dueDate: nextDue,
            done: false,
            createdAt: today,
          });
        }
      }
    }
  }

  function _nextRecurDate(fromDate, recurrence) {
    if (!fromDate) return null;
    const d = new Date(fromDate + 'T12:00:00');
    if (recurrence === 'daily')   d.setDate(d.getDate() + 1);
    if (recurrence === 'weekly')  d.setDate(d.getDate() + 7);
    if (recurrence === 'monthly') d.setMonth(d.getMonth() + 1);
    return Utils.dateKey(d);
  }

  // ── Open / Edit detail ────────────────────────────────────
  async function openDetail(id) {
    const t = await DB.get('todos', id);
    if (!t) return;
    const today = Utils.today();
    const isOverdue = !t.done && t.dueDate && t.dueDate < today;

    Utils.modal(`
      <div class="modal-title">${t.done ? '✅' : isOverdue ? '⚠️' : '📋'} ${t.text}</div>

      ${t.category ? `<div style="margin-bottom:12px"><span class="todo-cat-chip">${t.category}</span></div>` : ''}

      ${t.dueDate ? `<div class="info-row">
        <span class="info-row-label">Échéance</span>
        <span class="info-row-val ${isOverdue?'style="color:var(--accent-red)"':''}">${Utils.formatDate(t.dueDate)}${isOverdue?' ⚠️ En retard':''}</span>
      </div>` : ''}

      ${t.recurrence ? `<div class="info-row">
        <span class="info-row-label">Récurrence</span>
        <span class="info-row-val">🔁 ${_recurLabel(t.recurrence)}</span>
      </div>` : ''}

      ${t.pinned ? `<div class="info-row"><span class="info-row-label">Épinglée</span><span class="info-row-val">📌 Oui</span></div>` : ''}

      ${t.description ? `
        <div class="fin-section-title" style="margin-top:16px">DESCRIPTION</div>
        <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:12px;font-size:14px;color:var(--text-secondary);line-height:1.6">${t.description}</div>
      ` : ''}

      <div class="modal-actions" style="margin-top:20px;flex-wrap:wrap;gap:8px">
        <button class="btn-${t.done?'secondary':'primary'}" style="flex:1" onclick="Todos.toggle('${Utils.escAttr(id)}');Utils.closeModals()">
          ${t.done ? '↩ Rouvrir' : '✓ Terminer'}
        </button>
        <button class="btn-secondary" style="flex:1" onclick="Utils.closeModals();setTimeout(()=>Todos.openEdit('${Utils.escAttr(id)}'),100)">✏️ Modifier</button>
        <button class="btn-${t.pinned?'secondary':'secondary'}" style="flex:1" onclick="Todos.togglePin('${Utils.escAttr(id)}')">
          ${t.pinned ? '📌 Désépingler' : '📌 Épingler'}
        </button>
        <button class="btn-danger" style="flex:1" onclick="Todos.deleteTodo('${Utils.escAttr(id)}');Utils.closeModals()">🗑 Supprimer</button>
      </div>
    `);
  }

  function openAdd(prefillDate) {
    _openForm(null, prefillDate);
  }

  async function openEdit(id) {
    const t = await DB.get('todos', id);
    _openForm(t);
  }

  function _openForm(todo, prefillDate) {
    const isEdit = !!todo;
    Utils.modal(`
      <div class="modal-title">${isEdit ? 'Modifier la tâche' : 'Nouvelle tâche'}</div>

      <div class="form-group">
        <label class="form-label">TÂCHE *</label>
        <input class="form-input" id="todo-text" placeholder="Décris la tâche..." value="${Utils.escAttr(todo?.text||'')}">
      </div>

      <div class="form-group">
        <label class="form-label">DESCRIPTION</label>
        <textarea class="form-textarea" id="todo-desc" placeholder="Détails, notes...">${Utils.escAttr(todo?.description||'')}</textarea>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group">
          <label class="form-label">CATÉGORIE</label>
          <input class="form-input" id="todo-cat" placeholder="Business, Perso..." value="${Utils.escAttr(todo?.category||'')}">
        </div>
        <div class="form-group">
          <label class="form-label">ÉCHÉANCE</label>
          <input class="form-input" id="todo-due" type="date" value="${Utils.escAttr(todo?.dueDate || prefillDate || '')}">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">PRIORITÉ</label>
        <div class="type-pills">
          <button class="type-pill ${(todo?.priority||'med')==='high'?'active':''}" id="prio-high" onclick="Todos._selPrio('high')">🔴 Haute</button>
          <button class="type-pill ${(todo?.priority||'med')==='med'?'active':''}" id="prio-med" onclick="Todos._selPrio('med')">🟡 Moyenne</button>
          <button class="type-pill ${(todo?.priority||'med')==='low'?'active':''}" id="prio-low" onclick="Todos._selPrio('low')">🔵 Basse</button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">RÉCURRENCE</label>
        <div class="type-pills">
          <button class="type-pill ${!todo?.recurrence?'active':''}" id="rec-none" onclick="Todos._selRecur(null)">Aucune</button>
          <button class="type-pill ${todo?.recurrence==='daily'?'active':''}" id="rec-daily" onclick="Todos._selRecur('daily')">🔁 Daily</button>
          <button class="type-pill ${todo?.recurrence==='weekly'?'active':''}" id="rec-weekly" onclick="Todos._selRecur('weekly')">🔁 Hebdo</button>
          <button class="type-pill ${todo?.recurrence==='monthly'?'active':''}" id="rec-monthly" onclick="Todos._selRecur('monthly')">🔁 Mensuel</button>
        </div>
      </div>

      <div class="form-group" style="display:flex;align-items:center;gap:12px">
        <label class="form-label" style="margin:0">ÉPINGLER</label>
        <button class="type-pill ${todo?.pinned?'active':''}" id="todo-pin-btn" onclick="Todos._togPin()">📌 Épingler en haut</button>
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" onclick="Utils.closeModals()">Annuler</button>
        <button class="btn-primary" onclick="Todos._save('${Utils.escAttr(todo?.id||'')}')">
          ${isEdit ? 'Sauvegarder' : 'Ajouter'}
        </button>
      </div>
    `);
    window._todoPriority = todo?.priority || 'med';
    window._todoRecur = todo?.recurrence || null;
    window._todoPin = todo?.pinned || false;
  }

  function _selPrio(p) {
    window._todoPriority = p;
    ['high','med','low'].forEach(x => document.getElementById(`prio-${x}`)?.classList.toggle('active', x===p));
  }

  function _selRecur(r) {
    window._todoRecur = r;
    ['none','daily','weekly','monthly'].forEach(x =>
      document.getElementById(`rec-${x}`)?.classList.toggle('active', (r===null&&x==='none') || r===x)
    );
  }

  function _togPin() {
    window._todoPin = !window._todoPin;
    document.getElementById('todo-pin-btn')?.classList.toggle('active', window._todoPin);
  }

  async function _save(existingId) {
    const text = document.getElementById('todo-text')?.value.trim();
    if (!text) { Utils.toast('⚠️ Texte requis'); return; }

    const todo = {
      id: existingId || Utils.uid(),
      text,
      description: document.getElementById('todo-desc')?.value.trim() || '',
      category: document.getElementById('todo-cat')?.value.trim() || '',
      dueDate: document.getElementById('todo-due')?.value || '',
      priority: window._todoPriority || 'med',
      recurrence: window._todoRecur || null,
      pinned: window._todoPin || false,
      done: false,
      createdAt: existingId ? undefined : Utils.today(),
    };

    if (existingId) {
      const old = await DB.get('todos', existingId);
      if (old) { todo.done = old.done; todo.doneAt = old.doneAt; todo.createdAt = old.createdAt; }
    }

    await DB.put('todos', todo);
    Utils.closeModals();
    await render();
    App.renderHome();
    Utils.toast(existingId ? '✅ Tâche modifiée' : '✅ Tâche ajoutée');
  }

  async function toggle(id) {
    const t = await DB.get('todos', id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? Utils.today() : null;
    await DB.put('todos', t);
    await render();
    App.renderHome();
    if (t.done) Utils.toast('✅ Tâche terminée !');
  }

  async function togglePin(id) {
    const t = await DB.get('todos', id);
    if (!t) return;
    t.pinned = !t.pinned;
    await DB.put('todos', t);
    Utils.closeModals();
    await render();
    Utils.toast(t.pinned ? '📌 Épinglée' : 'Désépinglée');
  }

  async function deleteTodo(id) {
    await DB.del('todos', id);
    await render();
    App.renderHome();
    Utils.toast('🗑 Supprimé');
  }

  async function clearDone() {
    Utils.confirm('Effacer toutes les tâches terminées ?', async () => {
      const todos = await DB.getAll('todos');
      for (const t of todos.filter(t => t.done)) await DB.del('todos', t.id);
      await render();
      Utils.toast('🗑 Tâches terminées effacées');
    });
  }

  // ── Calendar navigation ───────────────────────────────────
  function setView(v) { activeView = v; render(); }
  function setCalView(v) {
    calView = v;
    _refreshCal();
  }
  function setCat(c) { filterCat = c; render(); }
  function setStatus(s) { filterStatus = s; render(); }

  function calPrev() {
    if (calView === 'month') calDate = new Date(calDate.getFullYear(), calDate.getMonth()-1, 1);
    else if (calView === 'week') { const d = new Date(calDate); d.setDate(d.getDate()-7); calDate = d; }
    else { const d = new Date(calDate); d.setDate(d.getDate()-1); calDate = d; }
    _refreshCal();
  }
  function calNext() {
    if (calView === 'month') calDate = new Date(calDate.getFullYear(), calDate.getMonth()+1, 1);
    else if (calView === 'week') { const d = new Date(calDate); d.setDate(d.getDate()+7); calDate = d; }
    else { const d = new Date(calDate); d.setDate(d.getDate()+1); calDate = d; }
    _refreshCal();
  }

  async function _refreshCal() {
    const todos = await DB.getAll('todos');
    _renderCalBody(todos);
  }

  function _attachListeners() {
    if (activeView === 'calendar') {
      DB.getAll('todos').then(todos => _renderCalBody(todos));
    }
  }

  function _calDayClick(dateStr) {
    const detail = document.getElementById('todo-cal-day-detail');
    if (!detail) return;
    DB.getAll('todos').then(todos => {
      const today = Utils.today();
      const dayTodos = todos.filter(t => t.dueDate === dateStr);
      detail.innerHTML = `
        <div class="todo-group-label">${Utils.formatDate(dateStr)}</div>
        ${dayTodos.length ? dayTodos.map(t => _renderTodoItem(t, today)).join('') : '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Aucune tâche</div>'}
        <button class="btn-primary" style="width:100%;margin-top:12px;font-size:13px" onclick="Todos.openAdd('${dateStr}')">+ Tâche ce jour</button>
      `;
      _attachListeners();
    });
  }

  // ── Helpers ───────────────────────────────────────────────
  function _getWeekDates(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    return Array.from({length:7}, (_,i) => {
      const dd = new Date(d);
      dd.setDate(dd.getDate() + i);
      return Utils.dateKey(dd);
    });
  }

  function _getWeekDatesFromDate(date) {
    return _getWeekDates(date);
  }

  function _prioColor(p) {
    return p==='high'?'var(--accent-red)':p==='low'?'var(--accent-blue)':'var(--accent-gold)';
  }

  function _recurLabel(r) {
    return {daily:'Quotidien',weekly:'Hebdomadaire',monthly:'Mensuel'}[r] || r;
  }

  return {
    init, render, toggle, togglePin,
    openAdd, openEdit, openDetail,
    _selPrio, _selRecur, _togPin, _save,
    deleteTodo, clearDone,
    setView, setCalView, setCat, setStatus,
    calPrev, calNext, _calDayClick,
  };
})();
