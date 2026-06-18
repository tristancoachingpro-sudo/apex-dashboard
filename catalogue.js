// ── CATALOGUE MODULE ──────────────────────────────────────────
const Catalogue = (() => {
  let filterCat = 'all';
  let filterBrand = 'all';
  let searchQuery = '';

  async function init() {}

  async function render() {
    const products = await DB.getAll('catalogue');

    const cats = ['all', ...new Set(products.map(p => p.category).filter(Boolean))].sort((a,b) => a === 'all' ? -1 : a.localeCompare(b));
    const brands = ['all', ...new Set(products.map(p => p.brand).filter(Boolean))].sort((a,b) => a === 'all' ? -1 : a.localeCompare(b));

    const filterContainer = document.getElementById('catalogue-filters');
    if (filterContainer) {
      filterContainer.innerHTML = `
        <div style="position:relative;margin-bottom:12px">
          <input class="form-input" id="cat-search" placeholder="🔍 Rechercher un produit..."
            value="${searchQuery}"
            oninput="Catalogue.setSearch(this.value)"
            style="padding-left:16px">
        </div>
        <div class="cat-filter-row">
          ${cats.map(c => `<button class="filter-chip ${filterCat===c?'active':''}" onclick="Catalogue.setCat('${c}')">${c==='all'?'Tous':c}</button>`).join('')}
        </div>
        ${brands.length > 2 ? `<div class="cat-filter-row" style="margin-top:6px">
          ${brands.map(b => `<button class="filter-chip ${filterBrand===b?'active':''}" onclick="Catalogue.setBrand('${b}')">${b==='all'?'Toutes marques':b}</button>`).join('')}
        </div>` : ''}
      `;
    }

    let filtered = products;
    if (filterCat !== 'all') filtered = filtered.filter(p => p.category === filterCat);
    if (filterBrand !== 'all') filtered = filtered.filter(p => p.brand === filterBrand);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.brand||'').toLowerCase().includes(q) ||
        (p.category||'').toLowerCase().includes(q)
      );
    }

    const list = document.getElementById('catalogue-list');
    if (!list) return;

    if (!products.length) {
      list.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">📦</div>
        <div class="empty-state-text">Catalogue vide</div>
        <div class="empty-state-sub">Ajoute ton premier produit</div>
      </div>`;
      return;
    }
    if (!filtered.length) {
      list.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-text">Aucun résultat</div>
        <div class="empty-state-sub">Modifie ta recherche ou tes filtres</div>
      </div>`;
      return;
    }

    const byCategory = {};
    filtered.forEach(p => {
      const cat = p.category || 'Sans catégorie';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(p);
    });

    list.innerHTML = Object.entries(byCategory).map(([cat, prods]) => `
      <div style="margin-bottom:20px">
        <div class="fin-section-title">${cat} (${prods.length})</div>
        ${prods.map(p => {
          const marginPct = p.marginPct !== undefined ? p.marginPct : 50;
          const sellPrice = p.buyPrice ? Math.round(p.buyPrice * (1 + marginPct/100) * 100)/100 : (p.sellPrice || 0);
          return `<div class="product-card" onclick="Catalogue.openEdit('${p.id}')">
            <div class="product-thumb">${p.emoji || '💊'}</div>
            <div class="product-info">
              <div class="product-name">${p.name}</div>
              <div class="product-brand">${p.brand || ''} ${(p.mgTotal||p.mgPerUnit) ? '· '+(p.mgTotal||p.mgPerUnit)+'mg/boîte' : ''}</div>
            </div>
            <div class="product-prices">
              <div class="product-sell">${Utils.formatMoneyAbs(sellPrice)}</div>
              <div class="product-buy">Achat: ${Utils.formatMoneyAbs(p.buyPrice)}</div>
              <div class="product-margin">+${marginPct}%</div>
            </div>
          </div>`;
        }).join('')}
      </div>`).join('');
  }

  function setCat(cat) { filterCat = cat; render(); }
  function setBrand(brand) { filterBrand = brand; render(); }
  function setSearch(q) { searchQuery = q; render(); }

  function openAdd() { openForm(null); }
  async function openEdit(id) {
    const p = await DB.get('catalogue', id);
    openForm(p);
  }

  function openForm(product) {
    const isEdit = !!product;
    const marginPct = product?.marginPct !== undefined ? product.marginPct : 50;
    const buyPrice = product?.buyPrice || 0;
    const sellPrice = buyPrice ? Math.round(buyPrice * (1 + marginPct/100) * 100)/100 : (product?.sellPrice || 0);

    Utils.modal(`
      <div class="modal-title">${isEdit ? 'Modifier produit' : 'Nouveau produit'}</div>
      <div class="form-group">
        <label class="form-label">NOM *</label>
        <input class="form-input" id="prod-name" placeholder="Ex: Testostérone Enanthate" value="${product ? Utils.escAttr(product.name) : ''}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group">
          <label class="form-label">CATÉGORIE</label>
          <input class="form-input" id="prod-cat" placeholder="Ex: Testo, PCT..." value="${product ? Utils.escAttr(product.category||'') : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">MARQUE</label>
          <input class="form-input" id="prod-brand" placeholder="Ex: Pharma X" value="${product ? Utils.escAttr(product.brand||'') : ''}">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">PRIX D'ACHAT (€)</label>
        <input class="form-input" id="prod-buy" type="number" step="0.01" placeholder="0"
          value="${buyPrice || ''}"
          oninput="Catalogue._updateSellPreview()">
      </div>

      <div style="background:var(--bg-elevated);border-radius:var(--radius-lg);padding:14px;margin-bottom:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <label style="font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:.08em">MARGE</label>
          <span id="prod-margin-label" style="font-size:16px;font-weight:900;color:var(--accent-crystal)">${marginPct}%</span>
        </div>
        <input type="range" id="prod-margin" min="0" max="200" step="1" value="${marginPct}"
          oninput="Catalogue._updateSellPreview()"
          style="width:100%;accent-color:var(--accent-crystal);cursor:pointer">
        <div style="display:flex;justify-content:space-between;margin-top:4px">
          <span style="font-size:10px;color:var(--text-muted)">0%</span>
          <span style="font-size:10px;color:var(--text-muted)">100%</span>
          <span style="font-size:10px;color:var(--text-muted)">200%</span>
        </div>
      </div>

      <div style="background:var(--bg-card);border:1px solid rgba(124,107,255,0.3);border-radius:var(--radius-lg);padding:14px;margin-bottom:14px;text-align:center">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">PRIX DE VENTE CALCULÉ</div>
        <div id="prod-sell-preview" style="font-size:28px;font-weight:900;color:var(--accent-green)">${Utils.formatMoneyAbs(sellPrice)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">modifiable manuellement ci-dessous</div>
      </div>

      <div class="form-group">
        <label class="form-label">PRIX DE VENTE MANUEL (€) <span style="color:var(--text-muted);font-weight:400">— optionnel, écrase le calcul</span></label>
        <input class="form-input" id="prod-sell-override" type="number" step="0.01" placeholder="Laisser vide = prix calculé"
          value="${product?.sellOverride ? product.sellOverride : ''}">
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group">
          <label class="form-label">MG TOTAL / BOÎTE</label>
          <input class="form-input" id="prod-mg" type="number" placeholder="Ex: 2500" value="${product ? product.mgTotal||product.mgPerUnit||'' : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">EMOJI</label>
          <input class="form-input" id="prod-emoji" placeholder="💊" maxlength="2" value="${product ? product.emoji||'' : ''}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">NOTES</label>
        <textarea class="form-textarea" id="prod-notes" placeholder="Description, notes...">${product ? Utils.escAttr(product.notes||'') : ''}</textarea>
      </div>
      ${isEdit ? `<button class="btn-danger" style="width:100%;margin-bottom:8px;padding:12px" onclick="Catalogue._delete('${product.id}')">Supprimer</button>` : ''}
      <div class="modal-actions">
        <button class="btn-secondary" onclick="Utils.closeModals()">Annuler</button>
        <button class="btn-primary" onclick="Catalogue._save('${product ? product.id : ''}')">Sauvegarder</button>
      </div>
    `);
  }

  function _updateSellPreview() {
    const buy = parseFloat(document.getElementById('prod-buy')?.value) || 0;
    const margin = parseInt(document.getElementById('prod-margin')?.value) || 50;
    const sell = buy ? Math.round(buy * (1 + margin/100) * 100)/100 : 0;
    const preview = document.getElementById('prod-sell-preview');
    const label = document.getElementById('prod-margin-label');
    if (preview) preview.textContent = Utils.formatMoneyAbs(sell);
    if (label) label.textContent = margin + '%';
  }

  // Retourne le prix de vente effectif d'un produit
  function getEffectiveSellPrice(product) {
    if (product.sellOverride && product.sellOverride > 0) return product.sellOverride;
    const margin = product.marginPct !== undefined ? product.marginPct : 50;
    return product.buyPrice ? Math.round(product.buyPrice * (1 + margin/100) * 100)/100 : (product.sellPrice || 0);
  }

  async function _save(existingId) {
    const name = document.getElementById('prod-name')?.value.trim();
    if (!name) { Utils.toast('⚠️ Nom requis'); return; }
    const buy = parseFloat(document.getElementById('prod-buy')?.value) || 0;
    const marginPct = parseInt(document.getElementById('prod-margin')?.value) || 50;
    const sellOverride = parseFloat(document.getElementById('prod-sell-override')?.value) || 0;
    const effectiveSell = sellOverride > 0 ? sellOverride : (buy ? Math.round(buy * (1 + marginPct/100) * 100)/100 : 0);

    const product = {
      id: existingId || Utils.uid(),
      name,
      category: document.getElementById('prod-cat')?.value.trim() || '',
      brand: document.getElementById('prod-brand')?.value.trim() || '',
      buyPrice: buy,
      marginPct,
      sellOverride: sellOverride > 0 ? sellOverride : 0,
      sellPrice: effectiveSell,
      mgTotal: parseFloat(document.getElementById('prod-mg')?.value) || 0,
      mgPerUnit: parseFloat(document.getElementById('prod-mg')?.value) || 0, // backward compat
      emoji: document.getElementById('prod-emoji')?.value.trim() || '💊',
      notes: document.getElementById('prod-notes')?.value.trim() || '',
    };
    await DB.put('catalogue', product);
    Utils.closeModals();
    await render();
    Utils.toast(existingId ? '✅ Produit modifié' : '✅ Produit ajouté');
  }

  async function _delete(id) {
    Utils.confirm('Supprimer ce produit ?', async () => {
      await DB.del('catalogue', id);
      Utils.closeModals();
      await render();
      Utils.toast('🗑 Supprimé');
    });
  }

  async function getAll() { return DB.getAll('catalogue'); }

  return { init, render, openAdd, openEdit, setCat, setBrand, setSearch, _save, _delete, getAll, _updateSellPreview, getEffectiveSellPrice };
})();
