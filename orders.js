// ── ORDERS MODULE ─────────────────────────────────────────────
const Orders = (() => {
  let filterStatus = 'all';
  let filterText = '';

  async function init() {}

  async function render() {
    const orders = await DB.getAll('orders');
    const clients = await DB.getAll('clients');
    const clientMap = {};
    clients.forEach(c => clientMap[c.id] = c.name);

    const strip = document.getElementById('pipeline-strip');
    if (strip) {
      const allCount = orders.length;
      strip.innerHTML = `
        <div class="pipeline-step ${filterStatus==='all'?'active':''}" onclick="Orders.setFilter('all')">
          <div class="pipeline-count">${allCount}</div>
          <div class="pipeline-label">Toutes</div>
        </div>
        ${Utils.PIPELINE_STEPS.map(step => {
          const count = orders.filter(o => o.status === step.key).length;
          return `<div class="pipeline-step ${filterStatus===step.key?'active':''}" onclick="Orders.setFilter('${step.key}')">
            <div class="pipeline-count">${count}</div>
            <div class="pipeline-label">${step.label}</div>
          </div>`;
        }).join('')}`;
    }

    const list = document.getElementById('orders-list');
    if (!list) return;

    // Search bar
    const searchBarHtml = `<div style="position:relative;margin-bottom:12px">
      <input class="form-input" id="orders-search" placeholder="🔍 Rechercher une commande..." value="${filterText}"
        oninput="Orders.setSearch(this.value)" style="padding-left:16px">
    </div>`;
    const searchBarEl = document.getElementById('orders-search-bar');
    if (searchBarEl) searchBarEl.innerHTML = searchBarHtml;

    // Separate active from archived (delivered + older than 30 days)
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const archiveThreshold = Utils.dateKey(thirtyDaysAgo);
    const archived = orders.filter(o => o.status === 'delivered' && (o.deliveredAt||o.createdAt||'') < archiveThreshold);
    const active = orders.filter(o => !archived.includes(o));

    let filtered = active;
    if (filterStatus !== 'all') filtered = filtered.filter(o => o.status === filterStatus);
    if (filterText) {
      const q = filterText.toLowerCase();
      filtered = filtered.filter(o =>
        o.name.toLowerCase().includes(q) ||
        (o.clientName||'').toLowerCase().includes(q) ||
        (o.products||[]).some(p => p.name.toLowerCase().includes(q))
      );
    }

    if (!filtered.length) {
      list.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">📦</div>
        <div class="empty-state-text">${orders.length ? 'Aucune commande dans ce statut' : 'Aucune commande'}</div>
        <div class="empty-state-sub">${orders.length ? 'Change le filtre ci-dessus' : 'Crée ta première commande'}</div>
      </div>`;
      return;
    }

    const sorted = [...filtered].sort((a, b) => {
      if (a.status === 'delivered' && b.status !== 'delivered') return 1;
      if (a.status !== 'delivered' && b.status === 'delivered') return -1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    list.innerHTML = sorted.map(o => {
      const stepIndex = Utils.PIPELINE_STEPS.findIndex(s => s.key === o.status);
      const totalSteps = Utils.PIPELINE_STEPS.length;
      const progressPct = stepIndex < 0 ? 0 : Math.round(((stepIndex + 1) / totalSteps) * 100);
      const progressColor = o.status === 'delivered' ? 'var(--accent-green)' : 'var(--accent-crystal)';

      return `<div class="order-card" onclick="Orders.openDetail('${Utils.escAttr(o.id)}')">
        <div class="order-top">
          <span class="order-name">${o.name}</span>
          <span class="order-status ${Utils.statusClass(o.status)}">${Utils.statusLabel(o.status)}</span>
        </div>
        <div class="order-client">👤 ${clientMap[o.clientId] || o.clientName || '—'} · ${Utils.formatDate(o.createdAt)}</div>
        <div class="order-progress-bar">
          <div class="order-progress-fill" style="width:${progressPct}%;background:${progressColor}"></div>
        </div>
        <div class="order-bottom">
          <span class="order-total">${Utils.formatMoneyAbs(o.totalSell)}</span>
          <span style="font-size:11px;color:var(--text-muted)">Marge: ${Utils.formatMoneyAbs((o.totalSell||0)-(o.totalBuy||0))} (${Utils.margin(o.totalBuy,o.totalSell)}%)</span>
        </div>
      </div>`;
    }).join('');
  }

  function setFilter(status) {
    filterStatus = status;
    render();
  }

  function setSearch(q) {
    filterText = q;
    render();
  }

  // ── Autocomplete client ──────────────────────────────────────
  function _buildClientAutocomplete(inputId, listId) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;
    input.addEventListener('input', async () => {
      const q = input.value.trim().toLowerCase();
      list.innerHTML = '';
      if (!q) { list.style.display = 'none'; return; }
      const clients = await DB.getAll('clients');
      const matches = clients.filter(c => c.name.toLowerCase().includes(q));
      if (!matches.length) { list.style.display = 'none'; return; }
      list.style.display = 'block';
      list.innerHTML = matches.map(c =>
        `<div class="autocomplete-item" onclick="Orders._selectClient('${Utils.escAttr(c.id)}','${Utils.escAttr(c.name)}','${inputId}','${listId}')">${c.name}</div>`
      ).join('');
    });
    input.addEventListener('blur', () => {
      setTimeout(() => { if (list) list.style.display = 'none'; }, 200);
    });
  }

  function _selectClient(id, name, inputId, listId) {
    const input = document.getElementById(inputId);
    if (input) { input.value = name; input.dataset.clientId = id; }
    const list = document.getElementById(listId);
    if (list) list.style.display = 'none';
  }

  // ── New Order ────────────────────────────────────────────────
  async function openNew(prefillProducts) {
    window._orderProducts = prefillProducts
      ? prefillProducts.map(p => ({...p, qty: p.qty || 1}))
      : [];
    window._orderTotalSell = 0;
    window._orderTotalBuy = 0;
    window._orderOverrideDate = null;
    window._orderAdjPct = 0;
    window._orderFinalSell = undefined;

    Utils.modal(`
      <div class="modal-title">Nouvelle commande</div>

      <div class="form-group">
        <label class="form-label">NOM DE LA COMMANDE *</label>
        <input class="form-input" id="ord-name" placeholder="Ex: Commande Juillet — Marc">
      </div>

      <div class="form-group">
        <label class="form-label">CLIENT</label>
        <div style="position:relative">
          <input class="form-input" id="ord-client-input"
            placeholder="Tape un nom (existant ou nouveau)" autocomplete="off">
          <div id="ord-client-list" class="autocomplete-list" style="display:none"></div>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
          Si le client n'existe pas il sera créé automatiquement
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">PRODUITS</label>
        <div id="ord-products-list"></div>
        <button class="btn-primary" onclick="Orders._openProductPicker()"
          style="margin-top:8px;width:100%;padding:12px;font-size:14px">🔍 Choisir un produit</button>
        <button class="btn-secondary" onclick="Orders._addCustomProduct()"
          style="margin-top:8px;width:100%;font-size:12px">+ Produit hors catalogue</button>
      </div>

      <div class="form-group">
        <label class="form-label">FRAIS DE PORT</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;font-weight:600">FACTURÉ AU CLIENT</div>
            <div style="position:relative">
              <input class="form-input" id="ord-ship-sell" type="number" step="0.01"
                value="20" min="0" placeholder="0"
                oninput="Orders._updateShipping()"
                style="padding-right:28px">
              <span style="position:absolute;right:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:13px">€</span>
            </div>
          </div>
          <div>
            <div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;font-weight:600">PAYÉ FOURNISSEUR</div>
            <div style="position:relative">
              <input class="form-input" id="ord-ship-buy" type="number" step="0.01"
                value="20" min="0" placeholder="0"
                oninput="Orders._updateShipping()"
                style="padding-right:28px">
              <span style="position:absolute;right:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:13px">€</span>
            </div>
          </div>
        </div>
        <div id="ord-ship-diff" style="font-size:11px;color:var(--text-muted);margin-top:6px;text-align:right"></div>
      </div>

      <div class="order-total-row">
        <span class="order-total-label">Prix d'achat total</span>
        <span class="order-total-val" id="ord-total" style="color:var(--accent-red)">0€</span>
      </div>

      <!-- Ajustement de marge à la finalisation -->
      <div style="background:var(--bg-elevated);border-radius:var(--radius-lg);padding:14px;margin-bottom:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div>
            <div style="font-size:12px;font-weight:700;color:var(--text-muted)">AJUSTEMENT PRIX FINAL</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Adapte selon le client / la demande</div>
          </div>
          <span id="ord-adj-label" style="font-size:18px;font-weight:900;color:var(--accent-crystal)">0%</span>
        </div>
        <input type="range" id="ord-adj-slider" min="-30" max="30" step="1" value="0"
          oninput="Orders._updateAdjustment()"
          style="width:100%;accent-color:var(--accent-crystal);cursor:pointer">
        <div style="display:flex;justify-content:space-between;margin-top:4px">
          <span style="font-size:10px;color:var(--accent-red)">-30%</span>
          <span style="font-size:10px;color:var(--text-muted)">0</span>
          <span style="font-size:10px;color:var(--accent-green)">+30%</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
          <span style="font-size:12px;color:var(--text-muted)">Prix final client</span>
          <span id="ord-final-price" style="font-size:20px;font-weight:900;color:var(--accent-green)">0€</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);font-size:13px">
          <span id="ord-profit-formula" style="color:var(--text-muted)">0€ − 0€ =</span>
          <span id="ord-profit-val" style="font-size:18px;font-weight:900;color:var(--accent-green)">0€</span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">NOTES</label>
        <textarea class="form-textarea" id="ord-notes" placeholder="Notes..."></textarea>
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" onclick="Utils.closeModals()">Annuler</button>
        <button class="btn-primary" onclick="Orders._save()">Créer commande</button>
      </div>
    `);

    _buildClientAutocomplete('ord-client-input', 'ord-client-list');
    _renderOrderProducts();
  }

  function _renderOrderProducts() {
    const list = document.getElementById('ord-products-list');
    if (!list) return;
    let totalSell = 0, totalBuy = 0;
    list.innerHTML = (window._orderProducts || []).map((p, i) => {
      const lineSell = (p.sellPrice || 0) * p.qty;
      const lineBuy  = (p.buyPrice  || 0) * p.qty;
      totalSell += lineSell;
      totalBuy  += lineBuy;
      return `<div class="order-product-row">
        <div class="opr-name">
          <div style="font-weight:700;font-size:13px">${p.name}</div>
          ${p.brand ? `<div style="color:var(--text-muted);font-size:11px">${p.brand}</div>` : ''}
        </div>
        <input class="form-input" type="number" min="1" value="${p.qty}"
          onchange="Orders._updateQty(${i},this.value)"
          style="width:64px;padding:6px 8px;text-align:center;flex-shrink:0">
        <span class="opr-price">${Utils.formatMoneyPrecise(lineSell)}</span>
        <button onclick="Orders._removeProduct(${i})"
          style="color:var(--accent-red);font-size:22px;padding:2px 4px;line-height:1;flex-shrink:0">×</button>
      </div>`;
    }).join('');

    const shipSell = parseFloat(document.getElementById('ord-ship-sell')?.value) || 0;
    const shipBuy  = parseFloat(document.getElementById('ord-ship-buy')?.value)  || 0;
    const grandSell = totalSell + shipSell;
    const grandBuy  = totalBuy  + shipBuy;
    const totalEl = document.getElementById('ord-total');
    // "Prix d'achat total" = ce que TOI tu paies (produits + port fournisseur)
    if (totalEl) totalEl.textContent = Utils.formatMoneyPrecise(grandBuy);
    window._orderTotalSell = grandSell;
    window._orderTotalBuy  = grandBuy;
    Orders._updateShippingDiff();
    Orders._updateAdjustment();
  }

  function _updateAdjustment() {
    const slider = document.getElementById('ord-adj-slider');
    const label = document.getElementById('ord-adj-label');
    const finalEl = document.getElementById('ord-final-price');
    const profitFormulaEl = document.getElementById('ord-profit-formula');
    const profitValEl = document.getElementById('ord-profit-val');
    if (!slider) return;
    const pct = parseInt(slider.value) || 0;
    const base = window._orderTotalSell || 0;
    const buyTotal = window._orderTotalBuy || 0;
    const adjusted = Math.round(base * (1 + pct/100) * 100) / 100;
    window._orderAdjPct = pct;
    window._orderFinalSell = adjusted;
    if (label) {
      label.textContent = (pct >= 0 ? '+' : '') + pct + '%';
      label.style.color = pct > 0 ? 'var(--accent-green)' : pct < 0 ? 'var(--accent-red)' : 'var(--accent-crystal)';
    }
    if (finalEl) finalEl.textContent = Utils.formatMoneyPrecise(adjusted);

    // Bénéfice en temps réel : prix client (ajusté) − prix d'achat total
    const profit = Math.round((adjusted - buyTotal) * 100) / 100;
    if (profitFormulaEl) {
      profitFormulaEl.textContent = `${Utils.formatMoneyPrecise(adjusted)} − ${Utils.formatMoneyPrecise(buyTotal)} =`;
    }
    if (profitValEl) {
      profitValEl.textContent = (profit >= 0 ? '' : '−') + Utils.formatMoneyPrecise(Math.abs(profit));
      profitValEl.style.color = profit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
    }
  }

  function _updateShipping() { _renderOrderProducts(); }

  function _updateShippingDiff() {
    const shipSell = parseFloat(document.getElementById('ord-ship-sell')?.value) || 0;
    const shipBuy  = parseFloat(document.getElementById('ord-ship-buy')?.value)  || 0;
    const diff = shipSell - shipBuy;
    const el = document.getElementById('ord-ship-diff');
    if (!el) return;
    if (diff === 0) {
      el.textContent = 'Port neutre (0€ de marge)';
      el.style.color = 'var(--text-muted)';
    } else if (diff > 0) {
      el.textContent = `+${Utils.formatMoneyPrecise(diff)} de marge sur le port`;
      el.style.color = 'var(--accent-green)';
    } else {
      el.textContent = `${Utils.formatMoneyPrecise(diff)} sur le port (offert ou remise)`;
      el.style.color = 'var(--accent-red)';
    }
  }

  async function _openProductPicker() {
    const products = await DB.getAll('catalogue');
    await Tags.openProductPicker({
      title: 'Choisir un produit',
      products,
      onSelect: (catalogProduct) => {
        const existing = (window._orderProducts || []).find(p => p.productId === catalogProduct.id);
        if (existing) { existing.qty++; }
        else {
          const effectiveSell = Catalogue.getEffectiveSellPrice(catalogProduct);
          if (!window._orderProducts) window._orderProducts = [];
          window._orderProducts.push({
            productId: catalogProduct.id,
            name: catalogProduct.name,
            brand: catalogProduct.brand || '',
            sellPrice: effectiveSell,
            buyPrice: catalogProduct.buyPrice || 0,
            qty: 1,
          });
        }
        _renderOrderProducts();
      },
    });
  }

  function _addCustomProduct() {
    Utils.modal(`
      <div class="modal-title">Produit hors catalogue</div>
      <div class="form-group"><label class="form-label">NOM *</label>
        <input class="form-input" id="cp-name" placeholder="Nom du produit"></div>
      <div class="form-group"><label class="form-label">MARQUE</label>
        <input class="form-input" id="cp-brand" placeholder="Marque"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group"><label class="form-label">PRIX VENTE (€)</label>
          <input class="form-input" id="cp-sell" type="number" placeholder="0"></div>
        <div class="form-group"><label class="form-label">PRIX ACHAT (€)</label>
          <input class="form-input" id="cp-buy" type="number" placeholder="0"></div>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="Utils.closeModals()">Annuler</button>
        <button class="btn-primary" onclick="Orders._confirmCustom()">Ajouter</button>
      </div>
    `);
  }

  function _confirmCustom() {
    const name = document.getElementById('cp-name')?.value.trim();
    if (!name) { Utils.toast('⚠️ Nom requis'); return; }
    if (!window._orderProducts) window._orderProducts = [];
    window._orderProducts.push({
      name,
      brand: document.getElementById('cp-brand')?.value.trim() || '',
      sellPrice: parseFloat(document.getElementById('cp-sell')?.value) || 0,
      buyPrice:  parseFloat(document.getElementById('cp-buy')?.value)  || 0,
      qty: 1,
    });
    Utils.closeModals();
    setTimeout(_renderOrderProducts, 50);
  }

  function _updateQty(idx, val) {
    if (!window._orderProducts) return;
    window._orderProducts[idx].qty = Math.max(1, parseInt(val) || 1);
    _renderOrderProducts();
  }

  function _removeProduct(idx) {
    if (!window._orderProducts) return;
    window._orderProducts.splice(idx, 1);
    _renderOrderProducts();
  }

  async function _save() {
    const name = document.getElementById('ord-name')?.value.trim();
    if (!name) { Utils.toast('⚠️ Nom de commande requis'); return; }
    if (!window._orderProducts?.length) { Utils.toast('⚠️ Ajoute au moins un produit'); return; }

    const clientInput = document.getElementById('ord-client-input');
    const clientName  = clientInput?.value.trim() || '';
    const clientId    = clientInput?.dataset.clientId || '';
    let resolvedClientId   = clientId;
    let resolvedClientName = clientName;

    if (clientName && !clientId) {
      const c = await Clients.getOrCreate(clientName);
      resolvedClientId   = c.id;
      resolvedClientName = c.name;
    } else if (clientId) {
      const c = await DB.get('clients', clientId);
      resolvedClientName = c ? c.name : clientName;
    }

    const shipSell = parseFloat(document.getElementById('ord-ship-sell')?.value) || 0;
    const shipBuy  = parseFloat(document.getElementById('ord-ship-buy')?.value)  || 0;
    // Use adjusted final price if slider was used
    const adjPct = window._orderAdjPct || 0;
    const finalSell = window._orderFinalSell !== undefined && adjPct !== 0
      ? window._orderFinalSell
      : (window._orderTotalSell || 0);
    const order = {
      id: Utils.uid(),
      name,
      clientId:   resolvedClientId,
      clientName: resolvedClientName,
      products:   window._orderProducts,
      shippingSell: shipSell,
      shippingBuy:  shipBuy,
      totalSell:  finalSell,
      totalBuy:   window._orderTotalBuy  || 0,
      marginAdjPct: adjPct,
      status:     'pending',
      notes:      document.getElementById('ord-notes')?.value.trim() || '',
      createdAt:  window._orderOverrideDate || Utils.today(),
    };

    window._orderOverrideDate = null;
    window._orderAdjPct = 0;
    window._orderFinalSell = undefined;
    await DB.put('orders', order);
    Utils.closeModals();
    await render();
    App.renderHome();
    Utils.toast('✅ Commande créée');
  }

  // ── Order Detail ─────────────────────────────────────────────
  async function openDetail(id) {
    const o = await DB.get('orders', id);
    if (!o) return;
    const clients     = await DB.getAll('clients');
    const client      = clients.find(c => c.id === o.clientId);
    const clientName  = client ? client.name : (o.clientName || '—');

    // Bug 4 fix: load async supplier msg BEFORE rendering modal
    const supplierMsg = await _generateSupplierMsgAsync(o);
    window._currentSupplierMsg = supplierMsg;

    const stepBtns = Utils.PIPELINE_STEPS.map(s =>
      `<button class="type-pill ${o.status === s.key ? 'active' : ''}"
        onclick="Orders._setStatus('${Utils.escAttr(id)}','${s.key}')">${s.label}</button>`
    ).join('');

    const profit     = (o.totalSell||0) - (o.totalBuy||0);
    const marginPct  = Utils.margin(o.totalBuy, o.totalSell);

    Utils.modal(`
      <div class="modal-title">${o.name}</div>

      <div class="info-row">
        <span class="info-row-label">Client</span>
        <span class="info-row-val">${clientName}</span>
      </div>
      <div class="info-row">
        <span class="info-row-label">Créée le</span>
        <span class="info-row-val">${Utils.formatDate(o.createdAt)}</span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:14px 0">
        <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:12px;text-align:center">
          <div style="font-size:18px;font-weight:800;color:var(--accent-green)">${Utils.formatMoneyAbs(o.totalSell)}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px">VENTE</div>
        </div>
        <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:12px;text-align:center">
          <div style="font-size:18px;font-weight:800;color:var(--accent-red)">${Utils.formatMoneyAbs(o.totalBuy)}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px">ACHAT</div>
        </div>
        <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:12px;text-align:center">
          <div style="font-size:18px;font-weight:800;color:${profit>=0?'var(--accent-green)':'var(--accent-red)'}">
            ${Utils.formatMoneyAbs(profit)}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px">MARGE ${marginPct}%</div>
        </div>
      </div>

      <div class="fin-section-title">PRODUITS</div>
      ${(o.products||[]).map(p => `
        <div class="transaction-item">
          <div class="tx-info">
            <div class="tx-label">${p.name}${p.brand ? ` <span style="color:var(--text-muted);font-size:11px">${p.brand}</span>` : ''}</div>
            <div class="tx-date">Qté: ${p.qty} × ${Utils.formatMoneyAbs(p.sellPrice)} | Achat: ${Utils.formatMoneyAbs(p.buyPrice)}/u</div>
          </div>
          <div class="tx-amount income">${Utils.formatMoneyAbs((p.sellPrice||0)*p.qty)}</div>
        </div>`).join('')}

      ${(o.shippingSell || o.shippingBuy) ? `
      <div class="fin-section-title" style="margin-top:16px">FRAIS DE PORT</div>
      <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:12px;display:flex;gap:12px;margin-bottom:4px">
        <div style="flex:1;text-align:center">
          <div style="font-size:15px;font-weight:800;color:var(--accent-green)">${Utils.formatMoneyAbs(o.shippingSell||0)}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px">FACTURÉ CLIENT</div>
        </div>
        <div style="flex:1;text-align:center">
          <div style="font-size:15px;font-weight:800;color:var(--accent-red)">${Utils.formatMoneyAbs(o.shippingBuy||0)}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px">PAYÉ FOURN.</div>
        </div>
        <div style="flex:1;text-align:center">
          <div style="font-size:15px;font-weight:800;color:${((o.shippingSell||0)-(o.shippingBuy||0))>=0?'var(--accent-green)':'var(--accent-red)'}">
            ${Utils.formatMoneyAbs((o.shippingSell||0)-(o.shippingBuy||0))}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px">MARGE PORT</div>
        </div>
      </div>` : ''}

      <div class="fin-section-title" style="margin-top:16px">MESSAGE FOURNISSEUR</div>
      <div class="supplier-msg-box">
        <div class="supplier-msg-text">${supplierMsg}</div>
        <button class="supplier-copy-btn" onclick="Orders._copyMsg()">📋 Copier le message</button>
      </div>

      <div class="fin-section-title" style="margin-top:16px">STATUT</div>
      <div class="type-pills">${stepBtns}</div>

      ${o.notes ? `<div style="margin-top:12px;font-size:13px;color:var(--text-secondary);
        padding:10px;background:var(--bg-elevated);border-radius:var(--radius-sm)">${o.notes}</div>` : ''}

      <div class="modal-actions" style="margin-top:20px">
        <button class="btn-danger" onclick="Orders._delete('${Utils.escAttr(id)}')">Supprimer</button>
        <button class="btn-secondary" onclick="Utils.closeModals();setTimeout(()=>Orders.openEdit('${Utils.escAttr(id)}'),100)">✏️ Modifier</button>
        <button class="btn-secondary" onclick="Utils.closeModals();setTimeout(()=>Orders.duplicate('${Utils.escAttr(id)}'),100)">📋 Dupliquer</button>
        <button class="btn-secondary" onclick="Utils.closeModals()">Fermer</button>
      </div>
    `);
  }

  // ── Edit Order ───────────────────────────────────────────────
  async function openEdit(id) {
    const o = await DB.get('orders', id);
    if (!o) return;

    window._orderProducts = (o.products || []).map(p => ({...p}));
    window._orderTotalSell = o.totalSell || 0;
    window._orderTotalBuy  = o.totalBuy  || 0;
    window._orderOverrideDate = null;
    window._editingOrderId = id;

    Utils.modal(`
      <div class="modal-title">Modifier commande</div>

      <div class="form-group">
        <label class="form-label">NOM *</label>
        <input class="form-input" id="ord-name" value="${Utils.escAttr(o.name)}" placeholder="Nom de la commande">
      </div>

      <div class="form-group">
        <label class="form-label">PRODUITS</label>
        <div id="ord-products-list"></div>
        <button class="btn-primary" onclick="Orders._openProductPicker()"
          style="margin-top:8px;width:100%;padding:12px;font-size:14px">🔍 Choisir un produit</button>
        <button class="btn-secondary" onclick="Orders._addCustomProduct()" style="margin-top:8px;width:100%;font-size:12px">+ Produit hors catalogue</button>
      </div>

      <div class="form-group">
        <label class="form-label">FRAIS DE PORT</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;font-weight:600">FACTURÉ CLIENT</div>
            <input class="form-input" id="ord-ship-sell" type="number" step="0.01" value="${o.shippingSell||0}" oninput="Orders._updateShipping()">
          </div>
          <div>
            <div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;font-weight:600">PAYÉ FOURN.</div>
            <input class="form-input" id="ord-ship-buy" type="number" step="0.01" value="${o.shippingBuy||0}" oninput="Orders._updateShipping()">
          </div>
        </div>
        <div id="ord-ship-diff" style="font-size:11px;color:var(--text-muted);margin-top:6px;text-align:right"></div>
      </div>

      <div class="order-total-row">
        <span class="order-total-label">Total commande</span>
        <span class="order-total-val" id="ord-total">0€</span>
      </div>

      <div class="form-group">
        <label class="form-label">NOTES</label>
        <textarea class="form-textarea" id="ord-notes">${Utils.escAttr(o.notes||'')}</textarea>
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" onclick="Utils.closeModals()">Annuler</button>
        <button class="btn-primary" onclick="Orders._saveEdit()">Sauvegarder</button>
      </div>
    `);
    _renderOrderProducts();
  }

  async function _saveEdit() {
    const id = window._editingOrderId;
    if (!id) return;
    const o = await DB.get('orders', id);
    if (!o) return;

    const name = document.getElementById('ord-name')?.value.trim();
    if (!name) { Utils.toast('⚠️ Nom requis'); return; }
    if (!window._orderProducts?.length) { Utils.toast('⚠️ Ajoute au moins un produit'); return; }

    const shipSell = parseFloat(document.getElementById('ord-ship-sell')?.value) || 0;
    const shipBuy  = parseFloat(document.getElementById('ord-ship-buy')?.value)  || 0;

    o.name = name;
    o.products = window._orderProducts;
    o.shippingSell = shipSell;
    o.shippingBuy  = shipBuy;
    o.totalSell = window._orderTotalSell || 0;
    o.totalBuy  = window._orderTotalBuy  || 0;
    o.notes = document.getElementById('ord-notes')?.value.trim() || '';

    await DB.put('orders', o);
    window._editingOrderId = null;
    Utils.closeModals();
    await render();
    App.renderHome();
    Utils.toast('✅ Commande modifiée');
  }

  async function _generateSupplierMsgAsync(order) {
    const lineTpl = await DB.getSetting('supplier_line_template') || '- {qty}x {name} {brand}';
    const msgTpl  = await DB.getSetting('supplier_template') ||
      'Hello Oliver I would like to do an order of :\n{lines}';
    const lines = (order.products || []).map(p => {
      return lineTpl
        .replace('{qty}',   p.qty || 1)
        .replace('{name}',  p.name || '')
        .replace('{brand}', p.brand || '')
        .trim();
    }).join('\n');
    return msgTpl.replace('{lines}', lines);
  }

  function _copyMsg() {
    const msg = window._currentSupplierMsg || '';
    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg).then(() => Utils.toast('✅ Copié !'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = msg;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      Utils.toast('✅ Copié !');
    }
  }

  async function _setStatus(id, status) {
    const o = await DB.get('orders', id);
    if (!o) return;
    o.status = status;
    if (status === 'delivered') o.deliveredAt = Utils.today();
    await DB.put('orders', o);
    Utils.closeModals();
    await render();
    App.renderHome();
    App.refreshHubBadges();
    Utils.toast('✅ Statut mis à jour');
  }

  async function _delete(id) {
    Utils.confirm('Supprimer cette commande ?', async () => {
      await DB.del('orders', id);
      Utils.closeModals();
      await render();
      App.renderHome();
      Utils.toast('🗑 Supprimé');
    });
  }

  return {
    init, render, setFilter, setSearch, openNew, openEdit, _saveEdit,
    _openProductPicker, _addCustomProduct, _confirmCustom,
    _updateQty, _removeProduct, _save,
    _updateShipping, _updateShippingDiff, _updateAdjustment,
    openDetail, _setStatus, _delete, _copyMsg, _selectClient,
  };
})();

// ── ORDERS CALENDAR ───────────────────────────────────────────
Orders.openCalendar = async function() {
  const orders  = await DB.getAll('orders');
  const clients = await DB.getAll('clients');
  const clientMap = {};
  clients.forEach(c => clientMap[c.id] = c.name);

  Orders._calY = new Date().getFullYear();
  Orders._calM = new Date().getMonth();
  Orders._calOrders = orders;
  Orders._calClientMap = clientMap;

  function renderCalModal() {
    const firstDay   = new Date(Orders._calY, Orders._calM, 1);
    const daysInMonth = new Date(Orders._calY, Orders._calM+1, 0).getDate();
    let startDow = firstDay.getDay();
    startDow = startDow === 0 ? 6 : startDow - 1;
    const prevDays = new Date(Orders._calY, Orders._calM, 0).getDate();
    const todayStr = Utils.today();

    const byDate = {};
    orders.forEach(o => {
      const d = o.createdAt;
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(o);
    });

    let cells = '';
    for (let i = startDow-1; i >= 0; i--) {
      cells += `<div class="heatmap-cell heatmap-cell--other">${prevDays-i}</div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${Orders._calY}-${String(Orders._calM+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dayOrders = byDate[dateStr] || [];
      const isToday = dateStr === todayStr;
      let dotColor = '';
      if (dayOrders.length) {
        const delivered = dayOrders.every(o => o.status === 'delivered');
        dotColor = delivered ? 'var(--accent-green)' : 'var(--accent-gold)';
      }
      cells += `<div class="heatmap-cell ${isToday?'heatmap-cell--today':''}"
        style="background:${dayOrders.length ? dotColor+'22' : 'var(--bg-elevated)'};position:relative"
        onclick="Orders._calDayClick('${dateStr}')">
        <span class="heatmap-day-num">${d}</span>
        ${dayOrders.length ? `<span class="heatmap-avg" style="color:${dotColor}">${dayOrders.length}</span>` : ''}
      </div>`;
    }
    const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
    for (let d = 1; d <= totalCells - startDow - daysInMonth; d++) {
      cells += `<div class="heatmap-cell heatmap-cell--other">${d}</div>`;
    }

    const container = document.getElementById('ord-cal-grid');
    const titleEl   = document.getElementById('ord-cal-title');
    if (container) container.innerHTML = cells;
    if (titleEl)   titleEl.textContent = `${Utils.MONTHS_FR[Orders._calM]} ${Orders._calY}`;
  }

  Orders._renderCalModal = renderCalModal;

  Utils.modal(`
    <div class="modal-title">📅 Calendrier commandes</div>
    <div class="heatmap-nav">
      <button class="cal-nav" onclick="Orders._calPrev()">‹</button>
      <span id="ord-cal-title" style="font-size:15px;font-weight:700"></span>
      <button class="cal-nav" onclick="Orders._calNext()">›</button>
    </div>
    <div class="heatmap-grid-labels">
      ${['L','M','M','J','V','S','D'].map(d=>`<span>${d}</span>`).join('')}
    </div>
    <div class="heatmap-grid" id="ord-cal-grid"></div>
    <div style="margin-top:12px;display:flex;gap:12px;font-size:11px;color:var(--text-muted)">
      <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent-gold);margin-right:4px"></span>En cours</span>
      <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent-green);margin-right:4px"></span>Livrées</span>
    </div>
    <div id="ord-cal-detail" style="margin-top:16px"></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="Utils.closeModals()">Fermer</button>
    </div>
  `);

  renderCalModal();
};

Orders._calPrev = function() {
  Orders._calM--;
  if (Orders._calM < 0) { Orders._calM = 11; Orders._calY--; }
  Orders._renderCalModal();
};
Orders._calNext = function() {
  const now = new Date();
  if (Orders._calY > now.getFullYear() || (Orders._calY === now.getFullYear() && Orders._calM >= now.getMonth())) return;
  Orders._calM++;
  if (Orders._calM > 11) { Orders._calM = 0; Orders._calY++; }
  Orders._renderCalModal();
};
Orders._calDayClick = function(dateStr) {
  const dayOrders = (Orders._calOrders||[]).filter(o => o.createdAt === dateStr);
  const detail = document.getElementById('ord-cal-detail');
  if (!detail) return;
  if (!dayOrders.length) {
    detail.innerHTML = `<div style="text-align:center;padding:12px">
      <div style="color:var(--text-muted);font-size:13px;margin-bottom:8px">Aucune commande ce jour</div>
      <button class="btn-primary" style="font-size:12px" onclick="Utils.closeModals();setTimeout(()=>Orders._openNewWithDate('${dateStr}'),100)">+ Commande à cette date</button>
    </div>`;
    return;
  }
  detail.innerHTML = dayOrders.map(o => `
    <div class="order-card" style="margin-bottom:8px" onclick="Utils.closeModals();setTimeout(()=>Orders.openDetail('${Utils.escAttr(o.id)}'),100)">
      <div class="order-top">
        <span class="order-name">${o.name}</span>
        <span class="order-status ${Utils.statusClass(o.status)}">${Utils.statusLabel(o.status)}</span>
      </div>
      <div class="order-client">👤 ${(Orders._calClientMap||{})[o.clientId] || o.clientName || '—'}</div>
      <div class="order-bottom">
        <span class="order-total">${Utils.formatMoneyAbs(o.totalSell)}</span>
      </div>
    </div>`).join('');
};

Orders._openNewWithDate = async function(dateStr) {
  window._orderOverrideDate = null; // Bug 3: reset first
  await Orders.openNew();
  window._orderOverrideDate = dateStr;
  const nameEl = document.getElementById('ord-name');
  if (nameEl) nameEl.placeholder = `Commande du ${Utils.formatDate(dateStr)}`;
};

// ── Duplicate order ───────────────────────────────────────────
Orders.duplicate = async function(id) {
  const o = await DB.get('orders', id);
  if (!o) return;
  const copy = {
    ...o,
    id: Utils.uid(),
    name: o.name + ' (copie)',
    status: 'pending',
    createdAt: Utils.today(),
    deliveredAt: null,
    paidAt: null,
  };
  await DB.put('orders', copy);
  await Orders.render();
  Utils.toast('📋 Commande dupliquée');
  setTimeout(() => Orders.openDetail(copy.id), 300);
};

// ── Express order ─────────────────────────────────────────────
Orders.openExpress = async function() {
  const clients = await DB.getAll('clients');
  window._expSelectedProduct = null;

  Utils.modal(`
    <div class="modal-title">⚡ Commande Express</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Création rapide — 1 client, 1 produit, 1 tap</div>

    <div class="form-group">
      <label class="form-label">CLIENT</label>
      <div style="position:relative">
        <input class="form-input" id="exp-client" placeholder="Nom du client" autocomplete="off">
        <div id="exp-client-list" class="autocomplete-list" style="display:none"></div>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">PRODUIT</label>
      <div id="exp-product-chosen"></div>
      <button class="btn-primary" onclick="Orders._openExpressPicker()" style="width:100%;padding:12px;font-size:14px">🔍 Choisir un produit</button>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="form-group">
        <label class="form-label">QTÉ</label>
        <input class="form-input" id="exp-qty" type="number" min="1" value="1" style="text-align:center;font-size:18px;font-weight:800">
      </div>
      <div class="form-group">
        <label class="form-label">TOTAL</label>
        <div id="exp-total" style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px 14px;font-size:18px;font-weight:800;color:var(--accent-green);text-align:center">0€</div>
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn-secondary" onclick="Utils.closeModals()">Annuler</button>
      <button class="btn-primary" onclick="Orders._saveExpress()">⚡ Créer</button>
    </div>
  `);

  const calcTotal = () => {
    const qty = parseInt(document.getElementById('exp-qty')?.value) || 1;
    const sell = window._expSelectedProduct ? Catalogue.getEffectiveSellPrice(window._expSelectedProduct) : 0;
    const el = document.getElementById('exp-total');
    if (el) el.textContent = Utils.formatMoneyAbs(sell * qty);
  };
  document.getElementById('exp-qty')?.addEventListener('input', calcTotal);
  window._expCalcTotal = calcTotal;

  // Client autocomplete
  const expInput = document.getElementById('exp-client');
  const expList = document.getElementById('exp-client-list');
  expInput?.addEventListener('input', async () => {
    const q = expInput.value.trim().toLowerCase();
    expList.innerHTML = '';
    if (!q) { expList.style.display = 'none'; return; }
    const matches = clients.filter(c => c.name.toLowerCase().includes(q));
    if (!matches.length) { expList.style.display = 'none'; return; }
    expList.style.display = 'block';
    expList.innerHTML = matches.map(c =>
      `<div class="autocomplete-item" onclick="Orders._selectClient('${Utils.escAttr(c.id)}','${Utils.escAttr(c.name)}','exp-client','exp-client-list')">${c.name}</div>`
    ).join('');
  });
  expInput?.addEventListener('blur', () => setTimeout(() => { expList.style.display='none'; }, 200));
};

Orders._openExpressPicker = async function() {
  const products = await DB.getAll('catalogue');
  await Tags.openProductPicker({
    title: 'Choisir un produit',
    products,
    onSelect: (product) => {
      window._expSelectedProduct = product;
      const sell = Catalogue.getEffectiveSellPrice(product);
      const chosen = document.getElementById('exp-product-chosen');
      if (chosen) {
        chosen.innerHTML = `<div class="product-card" style="margin-bottom:10px;cursor:default">
          <div class="product-thumb">${product.emoji || '💊'}</div>
          <div class="product-info">
            <div class="product-name">${product.name}</div>
            <div class="product-brand">${product.brand || ''}</div>
          </div>
          <div class="product-prices"><div class="product-sell">${Utils.formatMoneyAbs(sell)}</div></div>
        </div>`;
      }
      if (window._expCalcTotal) window._expCalcTotal();
    },
  });
};

Orders._saveExpress = async function() {
  const clientInput = document.getElementById('exp-client');
  const qty = Math.max(1, parseInt(document.getElementById('exp-qty')?.value) || 1);

  if (!clientInput?.value.trim()) { Utils.toast('⚠️ Client requis'); return; }
  if (!window._expSelectedProduct) { Utils.toast('⚠️ Produit requis'); return; }

  const chosen = window._expSelectedProduct;
  const clientName = clientInput.value.trim();
  const clientId = clientInput.dataset.clientId || '';
  let resolvedClientId = clientId;
  let resolvedClientName = clientName;

  if (clientName && !clientId) {
    const c = await Clients.getOrCreate(clientName);
    resolvedClientId = c.id;
    resolvedClientName = c.name;
  }

  const sellPrice = Catalogue.getEffectiveSellPrice(chosen);
  const buyPrice  = chosen.buyPrice || 0;
  const product = { name: chosen.name, brand: chosen.brand||'', sellPrice, buyPrice, qty, productId: chosen.id };

  const order = {
    id: Utils.uid(),
    name: `${resolvedClientName} — ${chosen.name}`,
    clientId: resolvedClientId,
    clientName: resolvedClientName,
    products: [product],
    shippingSell: 0, shippingBuy: 0,
    totalSell: sellPrice * qty,
    totalBuy:  buyPrice  * qty,
    status: 'pending',
    notes: '',
    createdAt: Utils.today(),
  };

  await DB.put('orders', order);
  window._expSelectedProduct = null;
  Utils.closeModals();
  await Orders.render();
  App.renderHome();
  Utils.toast('⚡ Commande express créée !');
};

// ── Archive view ──────────────────────────────────────────────
Orders.openArchive = async function() {
  const orders = await DB.getAll('orders');
  const clients = await DB.getAll('clients');
  const clientMap = {};
  clients.forEach(c => clientMap[c.id] = c.name);

  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const archiveThreshold = Utils.dateKey(thirtyDaysAgo);
  const archived = orders
    .filter(o => o.status === 'delivered' && (o.deliveredAt||o.createdAt||'') < archiveThreshold)
    .sort((a,b) => (b.deliveredAt||b.createdAt||'').localeCompare(a.deliveredAt||a.createdAt||''));

  const totalArchived = archived.reduce((s,o) => s+(o.totalSell||0), 0);
  const profitArchived = archived.reduce((s,o) => s+(o.totalSell||0)-(o.totalBuy||0), 0);

  Utils.modal(`
    <div class="modal-title">🗄️ Archives</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Commandes livrées il y a plus de 30 jours</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
      <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:10px;text-align:center">
        <div style="font-size:18px;font-weight:800;color:var(--accent-green)">+${Math.round(totalArchived)}€</div>
        <div style="font-size:10px;color:var(--text-muted)">CA ARCHIVÉ</div>
      </div>
      <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:10px;text-align:center">
        <div style="font-size:18px;font-weight:800;color:var(--accent-crystal)">${archived.length}</div>
        <div style="font-size:10px;color:var(--text-muted)">COMMANDES</div>
      </div>
    </div>
    ${archived.map(o => `
      <div class="order-card" onclick="Utils.closeModals();setTimeout(()=>Orders.openDetail('${Utils.escAttr(o.id)}'),100)">
        <div class="order-top">
          <span class="order-name">${o.name}</span>
          <span class="order-status status-delivered">Livrée</span>
        </div>
        <div class="order-client">👤 ${clientMap[o.clientId]||o.clientName||'—'} · ${Utils.formatDate(o.deliveredAt||o.createdAt)}</div>
        <div class="order-bottom">
          <span class="order-total">${Utils.formatMoneyAbs(o.totalSell)}</span>
          <span style="font-size:11px;color:var(--text-muted)">Marge: ${Utils.formatMoneyAbs((o.totalSell||0)-(o.totalBuy||0))}</span>
        </div>
      </div>`).join('')}
    ${!archived.length ? '<div class="empty-state" style="padding:24px 0"><div class="empty-state-text">Aucune archive</div></div>' : ''}
    <div class="modal-actions"><button class="btn-secondary" onclick="Utils.closeModals()">Fermer</button></div>
  `);
};
