// ── CLIENTS MODULE ────────────────────────────────────────────
const Clients = (() => {
  let searchQuery = '';

  async function init() {}

  async function render() {
    const clients = await DB.getAll('clients');
    const orders  = await DB.getAll('orders');
    const list    = document.getElementById('clients-list');
    if (!list) return;

    // Search bar
    const searchHtml = `
      <div style="position:relative;margin-bottom:16px">
        <input class="form-input" id="cli-search"
          placeholder="🔍 Rechercher un client..."
          value="${searchQuery}"
          oninput="Clients.setSearch(this.value)">
      </div>`;

    if (!clients.length) {
      list.innerHTML = searchHtml + `<div class="empty-state">
        <div class="empty-state-icon">👤</div>
        <div class="empty-state-text">Aucun client</div>
        <div class="empty-state-sub">Ils s'ajoutent aussi lors d'une commande</div>
      </div>`;
      return;
    }

    let filtered = clients;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = clients.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.phone||'').toLowerCase().includes(q) ||
        (c.email||'').toLowerCase().includes(q)
      );
    }

    // Sort alphabetically
    filtered = [...filtered].sort((a,b) => a.name.localeCompare(b.name));

    list.innerHTML = searchHtml + (filtered.length ? filtered.map(c => {
      const clientOrders  = orders.filter(o => o.clientId === c.id);
      const totalSpent    = clientOrders.filter(o => o.status === 'delivered').reduce((s,o) => s+(o.totalSell||0), 0);
      const activeOrders  = clientOrders.filter(o => o.status !== 'delivered').length;
      const initials      = c.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
      return `<div class="client-card" onclick="Clients.openDetail('${c.id}')">
        <div class="client-top">
          <div class="client-avatar">${initials}</div>
          <div style="flex:1;min-width:0">
            <div class="client-name">${c.name}</div>
            <div class="client-meta">${[c.phone, c.email].filter(Boolean).join(' · ') || '—'}</div>
          </div>
          ${activeOrders ? `<div style="background:var(--accent-gold-dim);color:var(--accent-gold);border:1px solid rgba(245,166,35,0.25);
            padding:3px 9px;border-radius:20px;font-size:11px;font-weight:700;flex-shrink:0">${activeOrders} en cours</div>` : ''}
        </div>
        <div class="client-stats">
          <div>
            <div class="client-stat-val" style="color:var(--accent-green)">${Utils.formatMoneyAbs(totalSpent)}</div>
            <div class="client-stat-lbl">Total dépensé</div>
          </div>
          <div>
            <div class="client-stat-val">${clientOrders.length}</div>
            <div class="client-stat-lbl">Commandes</div>
          </div>
          <div>
            <div class="client-stat-val" style="color:var(--accent-crystal)">${clientOrders.length ? Utils.formatMoneyAbs(totalSpent/Math.max(clientOrders.filter(o=>o.status==='delivered').length,1)) : '—'}</div>
            <div class="client-stat-lbl">Panier moy.</div>
          </div>
        </div>
      </div>`;
    }).join('') : `<div class="empty-state" style="padding:24px 0">
      <div class="empty-state-text">Aucun résultat pour "${searchQuery}"</div>
    </div>`);
  }

  function setSearch(q) { searchQuery = q; render(); }

  function openAdd() { openForm(null); }

  async function openDetail(id) {
    const c      = await DB.get('clients', id);
    if (!c) return;
    const orders = (await DB.getAll('orders')).filter(o => o.clientId === id);
    const totalSpent = orders.filter(o => o.status==='delivered').reduce((s,o) => s+(o.totalSell||0), 0);

    Utils.modal(`
      <div class="modal-title">${c.name}</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
        <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:12px;text-align:center">
          <div style="font-size:20px;font-weight:800;color:var(--accent-green)">${Utils.formatMoneyAbs(totalSpent)}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px">TOTAL DÉPENSÉ</div>
        </div>
        <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:12px;text-align:center">
          <div style="font-size:20px;font-weight:800;color:var(--accent-crystal)">${orders.length}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px">COMMANDES</div>
        </div>
      </div>

      ${c.phone ? `<div class="info-row"><span class="info-row-label">📞 Téléphone</span><span class="info-row-val">${c.phone}</span></div>` : ''}
      ${c.email ? `<div class="info-row"><span class="info-row-label">✉️ Email</span><span class="info-row-val">${c.email}</span></div>` : ''}
      ${c.notes ? `<div style="margin:12px 0;font-size:13px;color:var(--text-secondary);padding:10px;background:var(--bg-elevated);border-radius:var(--radius-sm)">${c.notes}</div>` : ''}
      ${c.privateNote ? `<div class="client-private-note">🔒 ${c.privateNote}</div>` : ''}

      <div class="fin-section-title" style="margin-top:16px">HISTORIQUE COMMANDES</div>
      ${orders.length ? [...orders].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(o =>
        `<div class="transaction-item" onclick="Utils.closeModals();setTimeout(()=>Orders.openDetail('${o.id}'),200)">
          <div class="tx-dot ${o.status==='delivered'?'income':'expense'}"></div>
          <div class="tx-info">
            <div class="tx-label">${o.name}</div>
            <div class="tx-date">${Utils.formatDate(o.createdAt)} · ${Utils.statusLabel(o.status)}</div>
          </div>
          <div class="tx-amount ${o.status==='delivered'?'income':''}">${Utils.formatMoneyAbs(o.totalSell)}</div>
        </div>`).join('')
      : `<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Aucune commande</div>`}

      <div class="modal-actions" style="margin-top:16px">
        <button class="btn-danger" onclick="Clients._delete('${id}')">Supprimer</button>
        <button class="btn-secondary" onclick="Utils.closeModals();Clients.openEdit('${id}')">Modifier</button>
        <button class="btn-primary" onclick="Utils.closeModals();Orders.openNew();setTimeout(()=>{const i=document.getElementById('ord-client-input');if(i){i.value='${c.name.replace(/'/g,"\\'")}';i.dataset.clientId='${id}';}},150)">+ Commande</button>
      </div>
    `);
  }

  async function openEdit(id) {
    const c = await DB.get('clients', id);
    openForm(c);
  }

  function openForm(client) {
    const isEdit = !!client;
    Utils.modal(`
      <div class="modal-title">${isEdit ? 'Modifier client' : 'Nouveau client'}</div>
      <div class="form-group">
        <label class="form-label">NOM *</label>
        <input class="form-input" id="cli-name" placeholder="Prénom Nom" value="${client ? client.name : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">TÉLÉPHONE</label>
        <input class="form-input" id="cli-phone" placeholder="+33..." value="${client ? client.phone||'' : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">EMAIL</label>
        <input class="form-input" id="cli-email" placeholder="email@..." value="${client ? client.email||'' : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">NOTES</label>
        <textarea class="form-textarea" id="cli-notes">${client ? client.notes||'' : ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">🔒 NOTE PRIVÉE</label>
        <textarea class="form-textarea" id="cli-private" placeholder="Note confidentielle (non visible sur les exports)...">${client ? client.privateNote||'' : ''}</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="Utils.closeModals()">Annuler</button>
        <button class="btn-primary" onclick="Clients._save('${client ? client.id : ''}')">Sauvegarder</button>
      </div>
    `);
  }

  async function _save(existingId) {
    const name = document.getElementById('cli-name')?.value.trim();
    if (!name) { Utils.toast('⚠️ Nom requis'); return; }
    const client = {
      id:    existingId || Utils.uid(),
      name,
      phone: document.getElementById('cli-phone')?.value.trim() || '',
      email: document.getElementById('cli-email')?.value.trim() || '',
      notes: document.getElementById('cli-notes')?.value.trim() || '',
      privateNote: document.getElementById('cli-private')?.value.trim() || '',
    };
    await DB.put('clients', client);
    Utils.closeModals();
    await render();
    App.refreshHubBadges();
    Utils.toast(existingId ? '✅ Client modifié' : '✅ Client ajouté');
    return client;
  }

  async function _delete(id) {
    Utils.confirm('Supprimer ce client ?', async () => {
      await DB.del('clients', id);
      Utils.closeModals();
      await render();
      Utils.toast('🗑 Supprimé');
    });
  }

  async function getOrCreate(name) {
    if (!name) return null;
    const all = await DB.getAll('clients');
    let c = all.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!c) { c = { id: Utils.uid(), name }; await DB.put('clients', c); }
    return c;
  }

  async function getAll() { return DB.getAll('clients'); }

  return { init, render, setSearch, openAdd, openDetail, openEdit, openForm, _save, _delete, getOrCreate, getAll };
})();
