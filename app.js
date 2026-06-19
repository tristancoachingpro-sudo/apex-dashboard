// ── APEX APP CORE ─────────────────────────────────────────────
const App = (() => {
  let currentTab = 'home';
  let isAnimating = false;
  const TABS = ['home','workout','medocs','business','divers'];

  async function init() {
    try {
    await Promise.all([
      Workout.init(), Medocs.init(), Orders.init(), Weight.init(), Recap.init(), TikTok.init(),
      Catalogue.init(), Clients.init(), Protocoles.init(),
      Finances.init(), Todos.init(), Divers.init(), Mood.init(),
    ]);
    await renderHome();
    _updateBnavIndicator('home');
    _initSwipe();

    setTimeout(() => {
      document.getElementById('splash').classList.add('fade-out');
      setTimeout(() => {
        document.getElementById('splash').style.display = 'none';
        document.getElementById('main').classList.remove('hidden');
      }, 600);
    }, 900);

    // Schedule notifications after splash — fully non-blocking
    setTimeout(async () => {
      try { await Notifs.scheduleAll(); } catch(e) {}
    }, 3000);

    } catch(err) {
      // Safety net: always show the app even if something crashes
      console.error('APEX init error:', err);
      document.getElementById('splash').style.display = 'none';
      document.getElementById('main').classList.remove('hidden');
    }
  }

  // ── Tab navigation with slide animation ─────────────────────
  function goTo(tab) {
    if (currentTab === tab && tab !== 'business') return;
    if (isAnimating) return;
    if (navigator.vibrate) navigator.vibrate(18);

    const prevTab = currentTab;
    const prevIdx = TABS.indexOf(prevTab);
    const nextIdx = TABS.indexOf(tab);
    const direction = nextIdx > prevIdx ? 1 : -1;

    currentTab = tab;

    document.querySelectorAll('.bnav-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab)
    );
    _updateBnavIndicator(tab);

    const prevPage = document.getElementById(`page-${prevTab}`);
    const nextPage = document.getElementById(`page-${tab}`);

    if (!prevPage || !nextPage || prevTab === tab) {
      // Fallback: just switch
      document.querySelectorAll('.page').forEach(p =>
        p.classList.toggle('active', p.id === `page-${tab}`)
      );
      _runTabLogic(tab);
      return;
    }

    isAnimating = true;

    // Prepare next page: position it off-screen
    nextPage.style.transform = `translateX(${direction * 100}%)`;
    nextPage.style.opacity = '0';
    nextPage.classList.add('active');

    // Force reflow
    nextPage.getBoundingClientRect();

    // Animate both pages
    nextPage.style.transition = 'transform 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.32s ease';
    prevPage.style.transition = 'transform 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.32s ease';

    nextPage.style.transform = 'translateX(0)';
    nextPage.style.opacity = '1';
    prevPage.style.transform = `translateX(${direction * -40}%)`;
    prevPage.style.opacity = '0';

    setTimeout(() => {
      prevPage.classList.remove('active');
      prevPage.style.transform = '';
      prevPage.style.opacity = '';
      prevPage.style.transition = '';
      nextPage.style.transition = '';
      isAnimating = false;
      _runTabLogic(tab);
    }, 320);

    history.pushState({ tab, biz: null }, '');
  }

  function _runTabLogic(tab) {
    if (tab === 'home')     renderHome();
    if (tab === 'workout')  Workout.render();
    if (tab === 'medocs')   Medocs.render();
    if (tab === 'business') { _showBizHub(); refreshHubBadges(); }
    if (tab === 'divers')   Divers.render();
  }

  function _updateBnavIndicator(tab) {
    const btn = document.querySelector(`.bnav-tab[data-tab="${tab}"]`);
    const nav = document.getElementById('bottomnav');
    const ind = document.getElementById('bnav-indicator');
    if (!btn || !nav || !ind) return;
    const btnRect = btn.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    ind.style.left  = (btnRect.left - navRect.left) + 'px';
    ind.style.width = btnRect.width + 'px';
  }

  // ── Swipe ───────────────────────────────────────────────────
  function _initSwipe() {
    const wrapper = document.getElementById('pages-wrapper');
    let startX = 0, startY = 0, isDragging = false;

    wrapper.addEventListener('touchstart', e => {
      if (document.getElementById('modals').children.length) return;
      const activeBiz = document.querySelector('.biz-screen.active');
      if (activeBiz && activeBiz.id !== 'biz-hub') return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isDragging = false;
    }, { passive: true });

    wrapper.addEventListener('touchmove', e => {
      if (document.getElementById('modals').children.length) return;
      const activeBiz = document.querySelector('.biz-screen.active');
      if (activeBiz && activeBiz.id !== 'biz-hub') return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!isDragging && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) isDragging = true;
    }, { passive: true });

    wrapper.addEventListener('touchend', e => {
      if (!isDragging) return;
      if (document.getElementById('modals').children.length) return;
      const activeBiz = document.querySelector('.biz-screen.active');
      if (activeBiz && activeBiz.id !== 'biz-hub') return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) < 50) return;
      const idx = TABS.indexOf(currentTab);
      if (dx < 0 && idx < TABS.length - 1) goTo(TABS[idx + 1]);
      if (dx > 0 && idx > 0) goTo(TABS[idx - 1]);
      isDragging = false;
    }, { passive: true });
  }

  // ── Business hub/sub ────────────────────────────────────────
  function _showBizHub() {
    document.querySelectorAll('.biz-screen').forEach(s => s.classList.remove('active'));
    document.getElementById('biz-hub').classList.add('active');
  }

  function goToBusiness(name) {
    currentTab = 'business';
    document.querySelectorAll('.bnav-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === 'business')
    );
    document.querySelectorAll('.page').forEach(p =>
      p.classList.toggle('active', p.id === 'page-business')
    );
    _updateBnavIndicator('business');

    const hub = document.getElementById('biz-hub');
    const target = document.getElementById(`biz-${name}`);
    if (!target) return;

    // Slide biz sub-screen in from the right
    hub.classList.add('active');
    target.style.transform = 'translateX(100%)';
    target.style.opacity = '0';
    target.classList.add('active');
    target.getBoundingClientRect();
    target.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease';
    hub.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease';
    target.style.transform = 'translateX(0)';
    target.style.opacity = '1';
    hub.style.transform = 'translateX(-30%)';
    hub.style.opacity = '0';

    setTimeout(() => {
      hub.classList.remove('active');
      hub.style.transform = '';
      hub.style.opacity = '';
      hub.style.transition = '';
      target.style.transition = '';
      if (name === 'tiktok')    TikTok.render(document.getElementById('tiktok-body'));
      if (name === 'orders')     Orders.render();
      if (name === 'catalogue')  Catalogue.render();
      if (name === 'clients')    Clients.render();
      if (name === 'protocoles') Protocoles.render();
      if (name === 'finances')   Finances.render();
      if (name === 'todos')      Todos.render();
    }, 280);

    history.pushState({ tab: 'business', biz: name }, '');
  }

  function businessBack() {
    const activeBiz = document.querySelector('.biz-screen.active:not(#biz-hub)');
    if (!activeBiz) return;

    const hub = document.getElementById('biz-hub');
    hub.style.transform = 'translateX(-30%)';
    hub.style.opacity = '0';
    hub.classList.add('active');
    hub.getBoundingClientRect();
    hub.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease';
    activeBiz.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease';
    hub.style.transform = 'translateX(0)';
    hub.style.opacity = '1';
    activeBiz.style.transform = 'translateX(100%)';
    activeBiz.style.opacity = '0';

    setTimeout(() => {
      activeBiz.classList.remove('active');
      activeBiz.style.transform = '';
      activeBiz.style.opacity = '';
      activeBiz.style.transition = '';
      hub.style.transition = '';
      refreshHubBadges();
    }, 280);

    history.pushState({ tab: 'business', biz: null }, '');
  }

  // ── Hub badges ──────────────────────────────────────────────
  async function refreshHubBadges() {
    try {
      const allOrders  = await DB.getAll('orders');
      const active     = allOrders.filter(o => o.status !== 'delivered');
      _setText('hub-orders-sub', active.length ? `${active.length} en cours` : 'Pipeline & suivi');
      _setBadge('hub-badge-orders', active.length);

      const allProducts = await DB.getAll('catalogue');
      _setText('hub-catalogue-sub', allProducts.length ? `${allProducts.length} produits` : 'Produits & prix');

      const allClients  = await DB.getAll('clients');
      _setText('hub-clients-sub', allClients.length ? `${allClients.length} clients` : 'Historique & stats');

      const allTodos   = await DB.getAll('todos');
      const pending    = allTodos.filter(t => !t.done);
      _setText('hub-todos-sub', pending.length ? `${pending.length} en attente` : 'Tout est à jour ✓');
      _setBadge('hub-badge-todos', pending.length);

      const now        = new Date();
      const thisMonth  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      let profit = 0;
      allOrders.forEach(o => {
        if (o.status === 'delivered') {
          const ref = o.deliveredAt || o.createdAt || '';
          if (ref.startsWith(thisMonth)) profit += (o.totalSell||0)-(o.totalBuy||0);
        }
      });
      _setText('hub-finances-sub', `Ce mois: ${profit>=0?'+':''}${Math.round(profit)}€`);

      // TikTok hub — streak + posts semaine
      try {
        const postLog = await DB.getSetting('tiktok_post_log') || {};
        const now2 = new Date();
        const weekStart2 = new Date(now2);
        weekStart2.setDate(now2.getDate() - ((now2.getDay() + 6) % 7));
        let weekPosts = 0;
        for (let i = 0; i < 7; i++) {
          const d = new Date(weekStart2);
          d.setDate(weekStart2.getDate() + i);
          const key = d.toISOString().slice(0,10);
          if (postLog[key] && postLog[key] > 0) weekPosts++;
        }
        let streak = 0;
        const sd = new Date();
        while (true) {
          const key = sd.toISOString().slice(0,10);
          if (postLog[key] && postLog[key] > 0) { streak++; sd.setDate(sd.getDate()-1); }
          else break;
        }
        const ttSub = streak > 0
          ? `${weekPosts}/7 cette semaine · 🔥${streak}j`
          : `${weekPosts}/7 cette semaine`;
        _setText('hub-tiktok-sub', ttSub);
      } catch(e) {}
    } catch(e) {}
  }

  function _setBadge(id, count) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = count;
    el.style.display = count > 0 ? 'inline-block' : 'none';
  }

  function _setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ── Home render ─────────────────────────────────────────────
  async function renderHome() {
    _setText('greeting-text', Utils.greeting());
    _setText('date-today', Utils.formatDateFull(new Date()));

    const program  = await DB.get('workout_program','main') || { days:{}, cycleLen:7 };
    const cycleLen = program.cycleLen || 7;
    const todayNum = Workout.getCycleDay(program);
    const todayKey = Workout.getDayKey(todayNum);
    _setText('home-workout-name', program.days[todayKey] || 'Repos');

    const strip = document.getElementById('home-week-strip');
    if (strip) {
      strip.innerHTML = Array.from({ length: cycleLen }, (_, i) => {
        const dayNum = i + 1;
        const key = Workout.getDayKey(dayNum);
        const isToday = dayNum === todayNum;
        const hasW = !!(program.days[key]);
        return `<div class="week-day ${isToday?'today':''} ${hasW?'has-workout':''}">
          <span class="wd-label">J${dayNum}</span>
          <div class="wd-dot"></div>
        </div>`;
      }).join('');
    }

    const allOrders = await DB.getAll('orders');
    const now       = new Date();
    const todayStr  = Utils.today();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    let monthRevenue = 0;
    allOrders.forEach(o => {
      if (o.status === 'delivered') {
        const ref = o.deliveredAt || o.createdAt || '';
        if (ref.startsWith(thisMonth)) monthRevenue += (o.totalSell||0)-(o.totalBuy||0);
      }
    });

    // Bénéfice de la semaine (lundi→aujourd'hui)
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const weekStartKey = weekStart.toISOString().slice(0,10);
    let weekRevenue = 0;
    allOrders.forEach(o => {
      if (o.status === 'delivered') {
        const ref = o.deliveredAt || o.createdAt || '';
        if (ref >= weekStartKey && ref <= todayStr) weekRevenue += (o.totalSell||0)-(o.totalBuy||0);
      }
    });
    const revEl = document.getElementById('month-revenue');
    if (revEl) {
      revEl.textContent = (weekRevenue>=0?'+':'')+Math.round(weekRevenue)+'€ cette semaine';
      revEl.className = 'home-month-badge' + (weekRevenue < 0 ? ' negative' : '');
    }

    // ── Financial goal bar ──────────────────────────────────
    try {
      let goalTarget = await DB.getSetting('fin_goal_amount');
      let goalLabel  = await DB.getSetting('fin_goal_label') || 'Objectif du mois';
      const goalCard   = document.getElementById('fin-goal-card');

      // Auto-calcul +10% du mois précédent si pas d'objectif manuel
      if ((!goalTarget || goalTarget <= 0) && goalCard) {
        const allOrdersForGoal = await DB.getAll('orders');
        const prevMonth = new Date(now.getFullYear(), now.getMonth()-1, 1);
        const prevMonthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth()+1).padStart(2,'0')}`;
        let prevRevenue = 0;
        allOrdersForGoal.forEach(o => {
          if (o.status === 'delivered') {
            const ref = o.deliveredAt || o.createdAt || '';
            if (ref.startsWith(prevMonthKey)) prevRevenue += (o.totalSell||0)-(o.totalBuy||0);
          }
        });
        if (prevRevenue > 0) {
          goalTarget = Math.round(prevRevenue * 1.1);
          goalLabel = '🤖 Objectif auto (+10%)';
        }
      }

      if (goalCard && goalTarget && goalTarget > 0) {
        goalCard.style.display = 'block';
        const pct = Math.min(100, Math.round((monthRevenue / goalTarget) * 100));
        const remaining = Math.max(0, goalTarget - monthRevenue);
        const over = monthRevenue > goalTarget;
        const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
        const daysLeft = daysInMonth - now.getDate();
        const perDay = daysLeft > 0 && remaining > 0 ? Math.ceil(remaining / daysLeft) : 0;

        document.getElementById('fgc-label').textContent    = goalLabel;
        document.getElementById('fgc-current').textContent  = Math.round(monthRevenue) + '€';
        document.getElementById('fgc-target').textContent   = Math.round(goalTarget) + '€';
        document.getElementById('fgc-pct').textContent      = pct + '%';
        document.getElementById('fgc-remaining').textContent = over
          ? '🎉 Objectif dépassé !'
          : perDay > 0
            ? `${Math.round(remaining)}€ restants · ${perDay}€/jour`
            : `Il manque ${Math.round(remaining)}€`;

        const fill = document.getElementById('fgc-fill');
        const glow = document.getElementById('fgc-glow');
        if (fill) {
          fill.style.width = pct + '%';
          // Color gradient based on progress
          if (pct >= 100) {
            fill.style.background = 'linear-gradient(90deg, #00d47e, #00ffaa)';
            if (glow) glow.style.background = '#00d47e';
          } else if (pct >= 75) {
            fill.style.background = 'linear-gradient(90deg, #7c6bff, #00d47e)';
            if (glow) glow.style.background = '#00d47e';
          } else if (pct >= 50) {
            fill.style.background = 'linear-gradient(90deg, #7c6bff, #4d9fff)';
            if (glow) glow.style.background = '#4d9fff';
          } else if (pct >= 25) {
            fill.style.background = 'linear-gradient(90deg, #7c6bff, #a78bfa)';
            if (glow) glow.style.background = '#7c6bff';
          } else {
            fill.style.background = 'linear-gradient(90deg, #7c6bff, #7c6bff)';
            if (glow) glow.style.background = '#7c6bff';
          }
          // Animate fill width (CSS handles transition)
          requestAnimationFrame(() => { if(fill) fill.classList.add('fgc-animated'); });
        }
      } else if (goalCard) {
        goalCard.style.display = 'none';
      }
    } catch(e) {}

    // Médocs card with progress bar
    const allMedocs = await DB.getAll('medocs');
    let takenToday = 0, totalToday = 0;
    allMedocs.forEach(m => {
      if (m.days && m.days.includes(todayKey)) {
        totalToday++;
        if (m.taken && m.taken[todayStr]) takenToday++;
      }
    });
    _setBadgeText('hc-medocs-badge', `${takenToday}/${totalToday}`);
    _setText('hc-medocs-sub', totalToday ? `${takenToday} pris aujourd'hui` : 'Aucun configuré');
    // Update progress bar
    const medocBar = document.getElementById('hc-medocs-bar');
    if (medocBar) {
      const pct = totalToday ? Math.round((takenToday/totalToday)*100) : 0;
      medocBar.style.width = pct + '%';
      medocBar.style.background = pct === 100 ? 'var(--accent-green)' : 'var(--accent-crystal)';
    }

    const activeOrders = allOrders.filter(o => o.status !== 'delivered');
    _setBadgeText('hc-orders-badge', activeOrders.length);
    _setText('hc-orders-sub', activeOrders.length ? `${activeOrders.length} en cours` : 'Aucune en cours');
    // Orders progress bar: ratio delivered/total
    const ordersBar = document.getElementById('hc-orders-bar');
    if (ordersBar) {
      const total = allOrders.length;
      const delivered = allOrders.filter(o => o.status === 'delivered').length;
      const pct = total ? Math.round((delivered/total)*100) : 0;
      ordersBar.style.width = pct + '%';
    }

    const allTx = await DB.getAll('finances');
    let totalIn = 0;
    allOrders.forEach(o => {
      if (o.status==='delivered') {
        const ref = o.deliveredAt||o.createdAt||'';
        if (ref.startsWith(thisMonth)) totalIn += (o.totalSell||0);
      }
    });
    allTx.forEach(t => { if (t.type==='income' && t.date?.startsWith(thisMonth)) totalIn += t.amount; });
    _setBadgeText('hc-finances-badge', '+'+Math.round(totalIn)+'€');
    // Finances bar: revenue vs last month simple indicator
    const finBar = document.getElementById('hc-finances-bar');
    if (finBar) {
      // Show month profit as % of revenue (margin %)
      let totalOut = 0;
      allOrders.forEach(o => {
        if (o.status==='delivered') {
          const ref = o.deliveredAt||o.createdAt||'';
          if (ref.startsWith(thisMonth)) totalOut += (o.totalBuy||0);
        }
      });
      allTx.forEach(t => { if (t.type==='expense' && t.date?.startsWith(thisMonth)) totalOut += t.amount; });
      const margin = totalIn > 0 ? Math.round(((totalIn-totalOut)/totalIn)*100) : 0;
      finBar.style.width = Math.max(0, Math.min(100, margin)) + '%';
    }

    const allTodos = await DB.getAll('todos');
    const pending  = allTodos.filter(t => !t.done);
    const done     = allTodos.filter(t => t.done);
    _setBadgeText('hc-todos-badge', pending.length);
    _setText('hc-todos-sub', pending.length ? `${pending.length} en attente` : 'À jour');
    // Todos progress bar: done / total
    const todosBar = document.getElementById('hc-todos-bar');
    if (todosBar) {
      const total = allTodos.length;
      const pct = total ? Math.round((done.length/total)*100) : 0;
      todosBar.style.width = pct + '%';
      todosBar.style.background = pct === 100 ? 'var(--accent-green)' : 'var(--accent-crystal)';
    }

    // Show recap button always (not just Mondays — bug 8 fix)
    try {
      const recapBtn = document.getElementById('home-recap-btn');
      if (recapBtn) recapBtn.style.display = 'block';
    } catch(e) {}

    // Moyenne d'humeur sur les 7 derniers jours
    try {
      const moodEntries2 = await DB.getAll('mood');
      const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      const sevenKey = sevenDaysAgo.toISOString().slice(0,10);
      const recentMoods = moodEntries2.filter(e => e.date >= sevenKey && e.date <= todayStr);
      const moodAvgEl = document.getElementById('home-mood-avg');
      if (moodAvgEl) {
        if (recentMoods.length > 0) {
          const scores = recentMoods.map(e => {
            const vals = Object.values(e.scores||{});
            return vals.length ? vals.reduce((s,v)=>s+v,0)/vals.length : null;
          }).filter(v => v !== null);
          if (scores.length > 0) {
            const avg = Math.round(scores.reduce((s,v)=>s+v,0)/scores.length * 10) / 10;
            moodAvgEl.style.display = 'inline-flex';
            moodAvgEl.querySelector('.hcs-val').textContent = avg + '/10';
            moodAvgEl.style.color = avg >= 7.5 ? 'var(--accent-green)' : avg >= 5 ? 'var(--accent-gold)' : 'var(--accent-red)';
          } else {
            moodAvgEl.style.display = 'none';
          }
        } else {
          moodAvgEl.style.display = 'none';
        }
      }
    } catch(e) {}

    const moodEntries = await DB.getAll('mood');
    const doneToday   = moodEntries.find(e => e.date === todayStr);
    const moodCta     = document.getElementById('home-mood-cta');
    if (moodCta) {
      const ctaTitle = moodCta.querySelector('.mood-cta-title');
      const ctaSub   = moodCta.querySelector('.mood-cta-sub');
      const ctaBtn   = moodCta.querySelector('.btn-cta');
      if (doneToday) {
        if (ctaTitle) ctaTitle.textContent = 'Journaling ✓';
        if (ctaSub)   ctaSub.textContent   = 'Déjà complété — modifier ?';
        if (ctaBtn)   ctaBtn.textContent   = 'Modifier →';
      } else {
        if (ctaTitle) ctaTitle.textContent = 'Journaling du soir';
        if (ctaSub)   ctaSub.textContent   = 'Prends 2 min pour noter ta journée';
        if (ctaBtn)   ctaBtn.textContent   = 'Commencer →';
      }
    }
  }

  function _setBadgeText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ── Android back button ─────────────────────────────────────
  history.replaceState({ tab: 'home', biz: null }, '');
  window.addEventListener('popstate', e => {
    const state = e.state || {};
    if (document.getElementById('modals').querySelector('.picker-overlay')) {
      Tags._closePicker();
      history.pushState(state, '');
      return;
    }
    if (document.getElementById('modals').children.length) {
      Utils.closeModals();
      history.pushState(state, '');
      return;
    }
    const activeBiz = document.querySelector('.biz-screen.active');
    if (activeBiz && activeBiz.id !== 'biz-hub') {
      businessBack();
      return;
    }
    if (state.tab && state.tab !== 'home') {
      goTo('home');
      return;
    }
  });

  return { init, goTo, goToBusiness, businessBack, renderHome, refreshHubBadges };
})();

window.addEventListener('DOMContentLoaded', async () => {
  // Wait for Firebase auth state before starting the app
  const user = await Auth.init(async (user) => {
    const authScreen = document.getElementById('auth-screen');
    if (user) {
      // Logged in — hide auth screen, start app
      if (authScreen) authScreen.style.display = 'none';
    } else {
      // Not logged in — show auth screen, hide main app
      if (authScreen) authScreen.style.display = 'flex';
      const splash = document.getElementById('splash');
      const main = document.getElementById('main');
      if (splash) splash.style.display = 'none';
      if (main) main.classList.add('hidden');
    }
  });
  if (user) App.init();
});
