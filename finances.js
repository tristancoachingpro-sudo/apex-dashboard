// ── FINANCES MODULE ───────────────────────────────────────────
const Finances = (() => {
  async function init() {}

  async function render() {
    const container = document.getElementById('finances-content');
    const allOrders = await DB.getAll('orders');
    const allTx = await DB.getAll('finances');
    const now = new Date();

    // This month calculations
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    let monthIn = 0, monthOut = 0, transit = 0;

    // From delivered orders this month
    allOrders.forEach(o => {
      if (o.status === 'delivered') {
        const dateRef = o.deliveredAt || o.createdAt || '';
        if (dateRef.startsWith(thisMonth)) {
          monthIn += o.totalSell || 0;
          monthOut += o.totalBuy || 0;
        }
      } else {
        // Active orders: client money in transit (paid but not delivered)
        if (o.status === 'paid' || o.status === 'supplier_paid' || o.status === 'supplier_sent') {
          transit += o.totalSell || 0;
        }
      }
    });

    // Manual transactions
    allTx.forEach(t => {
      if (t.date && t.date.startsWith(thisMonth)) {
        if (t.type === 'income') monthIn += t.amount;
        else monthOut += t.amount;
      }
    });

    const profit = monthIn - monthOut;

    // Last 6 months chart data
    const months6 = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      let inc = 0, exp = 0;
      allOrders.forEach(o => {
        if (o.status === 'delivered') {
          const dateRef = o.deliveredAt || o.createdAt || '';
          if (dateRef.startsWith(key)) { inc += o.totalSell || 0; exp += o.totalBuy || 0; }
        }
      });
      allTx.forEach(t => {
        if (t.date && t.date.startsWith(key)) {
          if (t.type === 'income') inc += t.amount;
          else exp += t.amount;
        }
      });
      months6.push({ label: Utils.MONTHS_SHORT[d.getMonth()], inc, exp, profit: inc - exp });
    }

    const maxVal = Math.max(...months6.map(m => Math.max(m.inc, m.exp)), 1);

    // All time stats
    let allTimeIn = 0, allTimeOut = 0, totalOrders = 0;
    allOrders.forEach(o => {
      if (o.status === 'delivered') {
        allTimeIn += o.totalSell || 0;
        allTimeOut += o.totalBuy || 0;
        totalOrders++;
      }
    });
    allTx.forEach(t => {
      if (t.type === 'income') allTimeIn += t.amount;
      else allTimeOut += t.amount;
    });

    // Avg order value
    const avgOrder = totalOrders ? Math.round(allTimeIn / totalOrders) : 0;

    // Recent transactions (from manual + recent orders)
    const recentTx = [
      ...allTx.map(t => ({ ...t, _type: 'manual' })),
      ...allOrders.filter(o => o.status === 'delivered').map(o => ({
        id: o.id, label: o.name + (o.clientName ? ` — ${o.clientName}` : ''),
        amount: o.totalSell, type: 'income', date: o.deliveredAt || o.createdAt, _type: 'order'
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20);

    container.innerHTML = `
      <div class="fin-section-title">CE MOIS-CI — ${Utils.MONTHS_FR[now.getMonth()]}</div>
      <div class="fin-top-grid">
        <div class="fin-card green">
          <div class="fin-amount green">+${Math.round(monthIn)}€</div>
          <div class="fin-label">Encaissé</div>
        </div>
        <div class="fin-card red">
          <div class="fin-amount red">-${Math.round(monthOut)}€</div>
          <div class="fin-label">Déboursé</div>
        </div>
        <div class="fin-card full ${profit >= 0 ? 'green' : 'red'}">
          <div class="fin-amount ${profit >= 0 ? 'green' : 'red'}">${profit >= 0 ? '+' : ''}${Math.round(profit)}€</div>
          <div class="fin-label">Bénéfice net</div>
        </div>
        <div class="fin-card transit full">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div class="fin-amount gold">${Math.round(transit)}€</div>
              <div class="fin-label">💸 Cash en transit</div>
            </div>
            <div style="font-size:11px;color:var(--text-muted);max-width:150px;text-align:right">Reçu clients, commandes en cours</div>
          </div>
        </div>
      </div>

      <!-- Prévisionnel -->
      <div class="fin-section-title">🔮 PRÉVISIONNEL CE MOIS</div>
      ${(() => {
        const activeOrders = allOrders.filter(o => o.status !== 'delivered');
        const expectedCA = activeOrders.reduce((s,o) => s+(o.totalSell||0), 0);
        const expectedProfit = activeOrders.reduce((s,o) => s+(o.totalSell||0)-(o.totalBuy||0), 0);
        return `<div style="background:var(--bg-card);border:1px solid rgba(124,107,255,0.2);border-radius:var(--radius-lg);padding:14px;margin-bottom:12px">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">Si toutes les commandes en cours sont livrées ce mois-ci</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div style="text-align:center">
              <div style="font-size:20px;font-weight:800;color:var(--accent-crystal)">+${Math.round(monthIn + expectedCA)}€</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px">CA TOTAL ESTIMÉ</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:20px;font-weight:800;color:var(--accent-green)">+${Math.round(profit + expectedProfit)}€</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px">BÉNÉFICE ESTIMÉ</div>
            </div>
          </div>
        </div>`;
      })()}

      <div class="fin-section-title">6 DERNIERS MOIS</div>
      <div class="fin-chart-area">
        <div class="fin-chart-bars">
          ${months6.map(m => `
            <div class="fin-bar-group" style="position:relative">
              <div class="fin-bar income" style="height:${Math.round((m.inc/maxVal)*100)}%"></div>
              <div class="fin-bar expense" style="height:${Math.round((m.exp/maxVal)*100)}%"></div>
            </div>`).join('')}
        </div>
        <div class="fin-bar-label">
          ${months6.map(m => `<span>${m.label}</span>`).join('')}
        </div>
      </div>

      <div class="fin-section-title">STATISTIQUES GLOBALES</div>
      <div class="fin-top-grid">
        <div class="fin-card">
          <div class="fin-amount green">+${Math.round(allTimeIn - allTimeOut)}€</div>
          <div class="fin-label">Bénéfice total</div>
        </div>
        <div class="fin-card">
          <div class="fin-amount" style="color:var(--accent-crystal)">${totalOrders}</div>
          <div class="fin-label">Commandes livrées</div>
        </div>
        <div class="fin-card">
          <div class="fin-amount" style="color:var(--accent-gold)">${avgOrder}€</div>
          <div class="fin-label">Panier moyen</div>
        </div>
        <div class="fin-card">
          <div class="fin-amount" style="color:var(--accent-crystal)">${allTimeIn > 0 ? Utils.margin(allTimeOut, allTimeIn) : 0}%</div>
          <div class="fin-label">Marge moyenne</div>
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:20px;margin-bottom:10px">
        <div class="fin-section-title" style="margin:0">TRANSACTIONS MANUELLES</div>
        <button class="btn-primary" style="font-size:12px;padding:7px 14px" onclick="Finances.openAddTx()">+ Ajouter</button>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Frais annexes uniquement — les commandes livrées sont comptées automatiquement</div>
      ${recentTx.length ? recentTx.map(t => `
        <div class="transaction-item">
          <div class="tx-dot ${t.type === 'income' ? 'income' : 'expense'}"></div>
          <div class="tx-info">
            <div class="tx-label">${t.label || t.name || '—'}</div>
            <div class="tx-date">${t.date ? Utils.formatDate(t.date) : '—'} ${t._type === 'order' ? '· Commande' : ''}</div>
          </div>
          <div class="tx-amount ${t.type === 'income' ? 'income' : 'expense'}">${t.type === 'income' ? '+' : '-'}${Math.round(t.amount)}€</div>
          ${t._type === 'manual' ? `<button onclick="Finances._deleteTx('${t.id}')" style="color:var(--text-muted);padding:4px;font-size:16px">×</button>` : ''}
        </div>`).join('') : `<div class="empty-state" style="padding:24px 0"><div class="empty-state-text">Aucune transaction</div></div>`}
    `;
  }

  function openAddTx() {
    Utils.modal(`
      <div class="modal-title">Nouvelle transaction</div>
      <div class="form-group">
        <label class="form-label">TYPE</label>
        <div class="type-pills">
          <button class="type-pill active" id="tx-type-inc" onclick="Finances._selTxType('income')">💰 Entrée</button>
          <button class="type-pill" id="tx-type-exp" onclick="Finances._selTxType('expense')">💸 Dépense</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">LIBELLÉ *</label>
        <input class="form-input" id="tx-label" placeholder="Ex: Frais de livraison">
      </div>
      <div class="form-group">
        <label class="form-label">MONTANT (€) *</label>
        <input class="form-input" id="tx-amount" type="number" placeholder="0" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">DATE</label>
        <input class="form-input" id="tx-date" type="date" value="${Utils.today()}">
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="Utils.closeModals()">Annuler</button>
        <button class="btn-primary" onclick="Finances._saveTx()">Ajouter</button>
      </div>
    `);
    window._txType = 'income';
  }

  function _selTxType(t) {
    window._txType = t;
    document.getElementById('tx-type-inc').classList.toggle('active', t === 'income');
    document.getElementById('tx-type-exp').classList.toggle('active', t === 'expense');
  }

  async function _saveTx() {
    const label = document.getElementById('tx-label').value.trim();
    const amount = parseFloat(document.getElementById('tx-amount').value);
    if (!label || !amount) { Utils.toast('⚠️ Libellé et montant requis'); return; }
    await DB.put('finances', {
      id: Utils.uid(),
      type: window._txType || 'income',
      label,
      amount,
      date: document.getElementById('tx-date').value || Utils.today(),
    });
    Utils.closeModals();
    await render();
    App.renderHome();
    Utils.toast('✅ Transaction ajoutée');
  }

  async function _deleteTx(id) {
    Utils.confirm('Supprimer cette transaction ?', async () => {
      await DB.del('finances', id);
      await render();
      Utils.toast('🗑 Supprimé');
    });
  }

  return { init, render, openAddTx, _selTxType, _saveTx, _deleteTx };
})();
