// ── CATALOGUE MODULE ──────────────────────────────────────────
const Catalogue = (() => {
  let searchQuery = '';
  let filterCatId = null;     // catégorie (ou sous-catégorie) sélectionnée, null = toutes
  let filterTagIds = [];      // tags actifs (combinables, ET logique)

  async function init() {}

  async function render() {
    const rawProducts = await DB.getAll('catalogue');
    const products = await Tags.hydrateProductTags(rawProducts);
    const tree = await Tags.getCategoryTree();
    const flatCats = [];
    tree.forEach(c => { flatCats.push(c); c.children.forEach(ch => flatCats.push(ch)); });

    const filterContainer = document.getElementById('catalogue-filters');
    if (filterContainer) {
      const activeTags = [];
      for (const id of filterTagIds) {
        const t = await DB.get('tags', id);
        if (t) activeTags.push(t);
      }
      filterContainer.innerHTML = `
        <div style="position:relative;margin-bottom:12px">
          <input class="form-input" id="cat-search" placeholder="🔍 Rechercher (nom, marque, tag...)"
            value="${Utils.escAttr(searchQuery)}"
            oninput="Catalogue.setSearch(this.value)"
            style="padding-left:16px">
        </div>
        <div class="cat-filter-row">
          <button class="filter-chip ${filterCatId===null?'active':''}" onclick="Catalogue.setCat(null)">Toutes</button>
          ${flatCats.map(c => `<button class="filter-chip ${filterCatId===c.id?'active':''}" onclick="Catalogue.setCat('${c.id}')">${c.parentId?'↳ ':''}${Utils.escAttr(c.name)}</button>`).join('')}
          <button class="filter-chip" style="border-style:dashed" onclick="Tags.openManageCategories()">⚙️ Gérer</button>
        </div>
        ${activeTags.length ? `<div class="cat-filter-row" style="margin-top:6px">
          ${activeTags.map(t => `<button class="filter-chip active" onclick="Catalogue.toggleTagFilter('${t.id}')">${Utils.escAttr(t.name)} ✕</button>`).join('')}
        </div>` : ''}
        <button class="btn-secondary" style="margin-top:8px;width:100%;font-size:12px" onclick="Catalogue.openTagFilterPicker()">🏷️ Filtrer par tag</button>
      `;
    }

    let filtered = products;
    if (filterCatId) filtered = filtered.filter(p => p.categoryId === filterCatId || p.subCategoryId === filterCatId);
    if (filterTagIds.length) filtered = filtered.filter(p => filterTagIds.every(tid => (p.tagIds||[]).includes(tid)));
    if (searchQuery.trim()) {
      filtered = await Tags.searchProducts(searchQuery, filtered);
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

    // Groupement par catégorie générale uniquement quand aucun filtre actif,
    // sinon liste plate triée par pertinence/nom pour ne pas casser le tri de recherche
    const noFilterActive = !filterCatId && !filterTagIds.length && !searchQuery.trim();

    if (noFilterActive) {
      const byCategory = {};
      filtered.forEach(p => {
        const cat = p.category || 'Sans catégorie';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(p);
      });
      list.innerHTML = Object.entries(byCategory).sort((a,b)=>a[0].localeCompare(b[0])).map(([cat, prods]) => `
        <div style="margin-bottom:20px">
          <div class="fin-section-title">${Utils.escAttr(cat)} (${prods.length})</div>
          ${prods.map(p => _productCardHtml(p)).join('')}
        </div>`).join('');
    } else {
      list.innerHTML = `<div class="picker-count" style="margin-bottom:8px">${filtered.length} résultat${filtered.length>1?'s':''}</div>`
        + filtered.map(p => _productCardHtml(p)).join('');
    }
  }

  function _productCardHtml(p) {
    const marginPct = p.marginPct !== undefined ? p.marginPct : 50;
    const sellPrice = p.buyPrice ? Math.round(p.buyPrice * (1 + marginPct/100) * 100)/100 : (p.sellPrice || 0);
    const tagChips = (p._tagNames||[]).slice(0,4).map(t => `<span class="picker-tag-chip">${Utils.escAttr(t)}</span>`).join('');
    return `<div class="product-card" onclick="Catalogue.openEdit('${p.id}')">
      <div class="product-thumb">${p.emoji || '💊'}</div>
      <div class="product-info">
        <div class="product-name">${p.name}</div>
        <div class="product-brand">${p.brand || ''} ${(p.mgTotal||p.mgPerUnit) ? '· '+(p.mgTotal||p.mgPerUnit)+'mg/boîte' : ''}</div>
        ${tagChips ? `<div class="picker-tags-row">${tagChips}</div>` : ''}
      </div>
      <div class="product-prices">
        <div class="product-sell">${Utils.formatMoneyAbs(sellPrice)}</div>
        <div class="product-buy">Achat: ${Utils.formatMoneyAbs(p.buyPrice)}</div>
        <div class="product-margin">+${marginPct}%</div>
      </div>
    </div>`;
  }

  function setCat(id) { filterCatId = id; render(); }
  function setSearch(q) { searchQuery = q; render(); }

  function toggleTagFilter(id) {
    filterTagIds = filterTagIds.filter(t => t !== id);
    render();
  }

  async function openTagFilterPicker() {
    await Tags.openTagPicker(filterTagIds, async (ids) => {
      filterTagIds = ids;
      await render();
    });
  }

  function openAdd() {
    window._reopeningProductId = null;
    openForm(null);
  }
  async function openEdit(id) {
    window._reopeningProductId = id;
    const p = await DB.get('catalogue', id);
    openForm(p);
  }

  async function openForm(product, opts = {}) {
    const isEdit = !!product;
    const isReopen = !!opts.preserveDraft;
    const marginPct = product?.marginPct !== undefined ? product.marginPct : 50;
    const buyPrice = product?.buyPrice || 0;
    const sellPrice = buyPrice ? Math.round(buyPrice * (1 + marginPct/100) * 100)/100 : (product?.sellPrice || 0);
    const tree = await Tags.getCategoryTree();
    const flatCats = [];
    tree.forEach(c => { flatCats.push(c); c.children.forEach(ch => flatCats.push(ch)); });

    // Brouillon préservé si on revient d'un sous-picker (tags), sinon (re)initialisé
    // depuis le produit ouvert (édition) ou vide (nouveau produit).
    if (!isReopen) {
      window._prodTagIds = product?.tagIds ? [...product.tagIds] : [];
      window._prodCategoryId = product?.categoryId || null;
    }

    Utils.modal(`
      <div class="modal-title">${isEdit ? 'Modifier produit' : 'Nouveau produit'}</div>
      <div class="form-group">
        <label class="form-label">NOM *</label>
        <input class="form-input" id="prod-name" placeholder="Ex: Testostérone Enanthate" value="${product ? Utils.escAttr(product.name) : ''}">
      </div>

      <div class="form-group">
        <label class="form-label">CATÉGORIE</label>
        ${flatCats.length ? `
          <div class="cat-filter-row" id="prod-cat-chips">
            ${flatCats.map(c => `<button type="button" class="filter-chip ${window._prodCategoryId===c.id?'active':''}" data-cat-id="${c.id}" onclick="Catalogue._setProdCategory('${c.id}')">${c.parentId?'↳ ':''}${Utils.escAttr(c.name)}</button>`).join('')}
          </div>
          <button class="btn-secondary" style="margin-top:6px;font-size:11px;padding:6px 12px" onclick="Tags.openManageCategories()">⚙️ Gérer les catégories</button>
        ` : `
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Aucune catégorie créée pour l'instant.</div>
          <button class="btn-secondary" style="font-size:12px" onclick="Tags.openManageCategories()">+ Créer des catégories</button>
        `}
      </div>

      <div class="form-group">
        <label class="form-label">MARQUE</label>
        <input class="form-input" id="prod-brand" placeholder="Ex: Pharma X" value="${product ? Utils.escAttr(product.brand||'') : ''}">
      </div>

      <div class="form-group">
        <label class="form-label">TAGS <span style="color:var(--text-muted);font-weight:400;text-transform:none;letter-spacing:0">— ester, concentration, type de prise, effets...</span></label>
        <div class="tag-chip-row" id="prod-tags-row"></div>
        <button class="btn-secondary" style="margin-top:8px;font-size:12px" onclick="Catalogue._openProdTagPicker()">+ Ajouter des tags</button>
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
    await _renderProdTagsRow();
  }

  function _setProdCategory(id) {
    window._prodCategoryId = (window._prodCategoryId === id) ? null : id;
    const chips = document.querySelectorAll('#prod-cat-chips .filter-chip');
    chips.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.catId === window._prodCategoryId);
    });
  }

  async function _renderProdTagsRow() {
    const row = document.getElementById('prod-tags-row');
    if (!row) return;
    const tags = [];
    for (const id of (window._prodTagIds || [])) {
      const t = await DB.get('tags', id);
      if (t) tags.push(t);
    }
    row.innerHTML = tags.length
      ? tags.map(t => `<span class="tag-chip-selected">${Utils.escAttr(t.name)} <span class="tag-chip-x" onclick="Catalogue._removeProdTag('${t.id}')">✕</span></span>`).join('')
      : '<span style="font-size:12px;color:var(--text-muted)">Aucun tag pour l’instant</span>';
  }

  function _removeProdTag(id) {
    window._prodTagIds = (window._prodTagIds || []).filter(t => t !== id);
    _renderProdTagsRow();
  }

  function _openProdTagPicker() {
    Tags.openTagPicker(window._prodTagIds || [], async (ids) => {
      window._prodTagIds = ids;
      await Catalogue._reopenFormAfterTags();
    });
  }

  async function _reopenFormAfterTags() {
    const id = window._reopeningProductId;
    const p = id ? await DB.get('catalogue', id) : null;
    await openForm(p, { preserveDraft: true });
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

    // Résout le nom de catégorie lisible (pour le regroupement visuel par catégorie générale)
    let categoryName = '';
    if (window._prodCategoryId) {
      const cat = await DB.get('categories', window._prodCategoryId);
      if (cat) {
        if (cat.parentId) {
          const parent = await DB.get('categories', cat.parentId);
          categoryName = parent ? parent.name : cat.name;
        } else {
          categoryName = cat.name;
        }
      }
    }

    const product = {
      id: existingId || Utils.uid(),
      name,
      category: categoryName,
      categoryId: window._prodCategoryId || null,
      brand: document.getElementById('prod-brand')?.value.trim() || '',
      tagIds: window._prodTagIds || [],
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
    if (product.tagIds.length) await Tags.incrementTagUsage(product.tagIds);
    window._reopeningProductId = null;
    window._prodTagIds = [];
    window._prodCategoryId = null;
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

  return {
    init, render, openAdd, openEdit, setCat, setSearch, toggleTagFilter, openTagFilterPicker,
    _save, _delete, getAll, _updateSellPreview, getEffectiveSellPrice,
    _setProdCategory, _removeProdTag, _openProdTagPicker, _reopenFormAfterTags,
  };
})();
