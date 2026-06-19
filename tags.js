// ── TAGS & CATEGORIES MODULE ────────────────────────────────────
// Gère : catégories pré-créées (2 niveaux), tags libres réutilisables,
// recherche floue, et le composant "Smart Picker" plein écran utilisé
// partout où on devait avant choisir un produit dans un <select>.

const Norm = (() => {
  // Normalise une chaîne pour comparaison tolérante (accents, casse, espaces)
  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  // Distance de Levenshtein simple, plafonnée pour la perf
  function levenshtein(a, b) {
    if (a === b) return 0;
    const al = a.length, bl = b.length;
    if (al === 0) return bl;
    if (bl === 0) return al;
    if (Math.abs(al - bl) > 4) return 99; // trop différent, pas la peine de calculer
    let prev = Array(bl + 1).fill(0).map((_, i) => i);
    for (let i = 1; i <= al; i++) {
      const cur = [i];
      for (let j = 1; j <= bl; j++) {
        const cost = a[i-1] === b[j-1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + cost);
      }
      prev = cur;
    }
    return prev[bl];
  }

  // Score de correspondance entre une requête et un texte cible.
  // 0 = pas de match, plus haut = meilleur match.
  function matchScore(query, text) {
    const q = norm(query);
    const t = norm(text);
    if (!q) return 1;
    if (!t) return 0;
    if (t === q) return 100;
    if (t.startsWith(q)) return 90;
    if (t.includes(q)) return 70;

    // Match mot par mot (utile pour "testo enan" → "Testostérone Enanthate")
    const qWords = q.split(' ').filter(Boolean);
    const tWords = t.split(' ').filter(Boolean);
    if (qWords.length > 1) {
      let allFound = true;
      for (const qw of qWords) {
        const found = tWords.some(tw => tw.startsWith(qw) || tw.includes(qw));
        if (!found) { allFound = false; break; }
      }
      if (allFound) return 60;
    }

    // Tolérance aux fautes de frappe sur des mots courts (un seul mot tapé)
    if (qWords.length === 1 && q.length >= 3) {
      let best = 99;
      for (const tw of tWords) {
        if (Math.abs(tw.length - q.length) > 3) continue;
        const d = levenshtein(q, tw);
        if (d < best) best = d;
      }
      const threshold = q.length <= 4 ? 1 : 2;
      if (best <= threshold) return 40 - best * 5;
    }
    return 0;
  }

  return { norm, levenshtein, matchScore };
})();

const Tags = (() => {

  // ── Catégories (2 niveaux : générale + sous-catégorie) ────────
  async function getCategories() {
    return DB.getAll('categories');
  }

  // Renvoie les catégories triées + organisées en arbre {id,name,parentId,children:[]}
  async function getCategoryTree() {
    const all = await getCategories();
    const roots = all.filter(c => !c.parentId).sort((a,b) => a.name.localeCompare(b.name));
    return roots.map(r => ({
      ...r,
      children: all.filter(c => c.parentId === r.id).sort((a,b) => a.name.localeCompare(b.name))
    }));
  }

  async function addCategory(name, parentId) {
    const clean = name.trim();
    if (!clean) return null;
    const cat = { id: Utils.uid(), name: clean, parentId: parentId || null };
    await DB.put('categories', cat);
    return cat;
  }

  async function renameCategory(id, name) {
    const cat = await DB.get('categories', id);
    if (!cat) return;
    cat.name = name.trim();
    await DB.put('categories', cat);
  }

  async function deleteCategory(id) {
    // Supprime aussi les sous-catégories
    const all = await getCategories();
    const children = all.filter(c => c.parentId === id);
    for (const child of children) await DB.del('categories', child.id);
    await DB.del('categories', id);
  }

  // ── Tags libres réutilisables ──────────────────────────────────
  async function getAllTags() {
    return DB.getAll('tags');
  }

  // Recherche floue de tags existants (pour éviter les doublons "Enanthate"/"Enanthates")
  async function searchTags(query) {
    const all = await getAllTags();
    if (!query || !query.trim()) {
      return all.sort((a,b) => (b.useCount||0) - (a.useCount||0)).slice(0, 30);
    }
    return all
      .map(t => ({ tag: t, score: Norm.matchScore(query, t.name) }))
      .filter(r => r.score > 0)
      .sort((a,b) => b.score - a.score)
      .map(r => r.tag);
  }

  // Trouve un tag existant qui correspond EXACTEMENT (normalisé) au nom donné
  async function findExactTag(name) {
    const all = await getAllTags();
    const n = Norm.norm(name);
    return all.find(t => Norm.norm(t.name) === n) || null;
  }

  // Récupère ou crée un tag par son nom (utilisé à la sauvegarde produit)
  async function getOrCreateTag(name) {
    const clean = name.trim();
    if (!clean) return null;
    const existing = await findExactTag(clean);
    if (existing) return existing;
    const tag = { id: Utils.uid(), name: clean, useCount: 0 };
    await DB.put('tags', tag);
    return tag;
  }

  async function incrementTagUsage(tagIds) {
    for (const id of tagIds) {
      const tag = await DB.get('tags', id);
      if (tag) { tag.useCount = (tag.useCount || 0) + 1; await DB.put('tags', tag); }
    }
  }

  // ── Recherche produit (catalogue) avec tolérance ──────────────
  // Cherche sur nom, marque, catégorie, tags. Renvoie triés par pertinence.
  async function searchProducts(query, products, opts = {}) {
    const { categoryId = null, tagIds = [] } = opts;
    let pool = products;

    if (categoryId) pool = pool.filter(p => p.categoryId === categoryId || p.subCategoryId === categoryId);
    if (tagIds.length) pool = pool.filter(p => tagIds.every(tid => (p.tagIds||[]).includes(tid)));

    if (!query || !query.trim()) return pool;

    const scored = pool.map(p => {
      const tagNames = (p._tagNames || []).join(' ');
      const fields = [
        { text: p.name, weight: 1 },
        { text: p.brand || '', weight: 0.85 },
        { text: p.category || '', weight: 0.6 },
        { text: tagNames, weight: 0.7 },
      ];
      let best = 0;
      for (const f of fields) {
        const s = Norm.matchScore(query, f.text) * f.weight;
        if (s > best) best = s;
      }
      return { product: p, score: best };
    }).filter(r => r.score > 0);

    scored.sort((a,b) => b.score - a.score);
    return scored.map(r => r.product);
  }

  // ── Helper : enrichit une liste de produits avec leurs noms de tags ─
  async function hydrateProductTags(products) {
    const allTags = await getAllTags();
    const byId = {};
    allTags.forEach(t => byId[t.id] = t.name);
    return products.map(p => ({
      ...p,
      _tagNames: (p.tagIds || []).map(id => byId[id]).filter(Boolean)
    }));
  }

  // ════════════════════════════════════════════════════════════
  // SMART PICKER — composant plein écran réutilisable
  // Remplace tous les <select> de choix de produit dans l'app.
  // ════════════════════════════════════════════════════════════
  let _pickerState = null;

  // opts: { title, products (déjà chargés), onSelect(product), allowCustom, onCustom }
  async function openProductPicker(opts) {
    const products = await hydrateProductTags(opts.products);
    const categories = await getCategoryTree();

    // On cache (sans le détruire) le contenu déjà ouvert pour pouvoir le restaurer
    // à la fermeture du picker, plutôt que de le perdre comme closeModals() le ferait.
    const modalsEl = document.getElementById('modals');
    const previousChildren = Array.from(modalsEl.children);
    previousChildren.forEach(el => { el.style.display = 'none'; });

    _pickerState = {
      query: '',
      categoryId: null,
      products,
      categories,
      onSelect: opts.onSelect,
      onCustom: opts.onCustom || null,
      title: opts.title || 'Choisir un produit',
      _previousChildren: previousChildren,
    };

    const flatCats = [];
    categories.forEach(c => { flatCats.push(c); c.children.forEach(ch => flatCats.push(ch)); });

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay picker-overlay';
    overlay.innerHTML = `
      <div class="modal-sheet picker-sheet">
        <div class="modal-handle"></div>
        <div class="picker-header">
          <div class="modal-title" style="margin-bottom:0">${_pickerState.title}</div>
          <button class="picker-close" onclick="Tags._closePicker()">✕</button>
        </div>
        <div class="picker-search-wrap">
          <span class="picker-search-icon">🔍</span>
          <input class="form-input picker-search-input" id="picker-search"
            placeholder="Nom, marque, tag..." autocomplete="off" autofocus>
        </div>
        <div class="cat-filter-row" id="picker-cat-chips" style="margin-bottom:10px"></div>
        <div id="picker-results"></div>
        ${_pickerState.onCustom ? `<button class="btn-secondary" style="width:100%;margin-top:10px;font-size:12px" onclick="Tags._pickerCustom()">+ Produit hors catalogue</button>` : ''}
      </div>
    `;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) _closePicker(); });
    modalsEl.appendChild(overlay);
    history.pushState({ modal: true, picker: true }, '');

    _pickerState.flatCats = flatCats;
    _renderPickerChips();
    _renderPickerResults();

    const input = document.getElementById('picker-search');
    input.addEventListener('input', () => {
      _pickerState.query = input.value;
      _renderPickerResults();
    });
    setTimeout(() => input.focus(), 250);
  }

  function _renderPickerChips() {
    const wrap = document.getElementById('picker-cat-chips');
    if (!wrap || !_pickerState) return;
    const chips = [{ id: null, name: 'Toutes' }, ..._pickerState.flatCats];
    wrap.innerHTML = chips.map(c => `
      <button class="filter-chip ${_pickerState.categoryId === c.id ? 'active' : ''}"
        onclick="Tags._pickerSetCat(${c.id ? `'${c.id}'` : 'null'})">${c.name}</button>
    `).join('');
  }

  function _pickerSetCat(id) {
    if (!_pickerState) return;
    _pickerState.categoryId = id;
    _renderPickerChips();
    _renderPickerResults();
  }

  async function _renderPickerResults() {
    const list = document.getElementById('picker-results');
    if (!list || !_pickerState) return;
    const results = await searchProducts(_pickerState.query, _pickerState.products, {
      categoryId: _pickerState.categoryId,
    });

    if (!results.length) {
      list.innerHTML = `<div class="empty-state" style="padding:30px 10px">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-text">Aucun résultat</div>
        <div class="empty-state-sub">Essaie un autre mot-clé</div>
      </div>`;
      return;
    }

    const countLabel = `<div class="picker-count">${results.length} résultat${results.length>1?'s':''}</div>`;
    list.innerHTML = countLabel + results.slice(0, 100).map(p => {
      const sell = (typeof Catalogue !== 'undefined') ? Catalogue.getEffectiveSellPrice(p) : (p.sellPrice||0);
      const tagChips = (p._tagNames||[]).slice(0,3).map(t => `<span class="picker-tag-chip">${t}</span>`).join('');
      return `<div class="picker-result-card" onclick="Tags._pickerChoose('${p.id}')">
        <div class="product-thumb">${p.emoji || '💊'}</div>
        <div class="product-info">
          <div class="product-name">${p.name}</div>
          <div class="picker-tags-row">${tagChips}</div>
        </div>
        <div class="product-prices">
          <div class="product-sell">${Utils.formatMoneyAbs(sell)}</div>
        </div>
      </div>`;
    }).join('');
  }

  function _pickerChoose(id) {
    if (!_pickerState) return;
    const product = _pickerState.products.find(p => p.id === id);
    if (!product) return;
    const cb = _pickerState.onSelect;
    _closePicker();
    if (cb) cb(product);
  }

  function _pickerCustom() {
    if (!_pickerState) return;
    const cb = _pickerState.onCustom;
    _closePicker();
    if (cb) cb();
  }

  function _closePicker() {
    const modalsEl = document.getElementById('modals');
    const overlay = modalsEl.querySelector('.picker-overlay');
    if (overlay) overlay.remove();
    const prev = _pickerState?._previousChildren || [];
    prev.forEach(el => { el.style.display = ''; });
    _pickerState = null;
  }

  // ════════════════════════════════════════════════════════════
  // TAG PICKER — recherche + sélection/création de tags (pour fiche produit)
  // ════════════════════════════════════════════════════════════
  let _tagPickerState = null;

  // opts: { currentTagIds: [], onChange(tagIds) }
  async function openTagPicker(currentTagIds, onChange) {
    _tagPickerState = {
      selectedIds: [...currentTagIds],
      onChange,
      query: '',
    };
    await _renderTagPickerModal();
  }

  async function _renderTagPickerModal() {
    const selectedTags = [];
    for (const id of _tagPickerState.selectedIds) {
      const t = await DB.get('tags', id);
      if (t) selectedTags.push(t);
    }
    const html = `
      <div class="modal-title">Tags du produit</div>
      <div class="tag-chip-row" id="tag-selected-row">
        ${selectedTags.map(t => `<span class="tag-chip-selected">${Utils.escAttr(t.name)} <span onclick="Tags._removeSelectedTag('${t.id}')" class="tag-chip-x">✕</span></span>`).join('') || '<span style="font-size:12px;color:var(--text-muted)">Aucun tag pour l’instant</span>'}
      </div>
      <div class="form-group" style="margin-top:14px">
        <input class="form-input" id="tag-search-input" placeholder="Tape pour chercher ou créer un tag..." autocomplete="off">
      </div>
      <div id="tag-search-results"></div>
      <div class="modal-actions">
        <button class="btn-primary" style="width:100%" onclick="Tags._confirmTagPicker()">Valider</button>
      </div>
    `;
    Utils.closeModals();
    Utils.modal(html);
    const input = document.getElementById('tag-search-input');
    input.addEventListener('input', () => { _tagPickerState.query = input.value; _renderTagSearchResults(); });
    setTimeout(() => input.focus(), 250);
    _renderTagSearchResults();
  }

  async function _renderTagSearchResults() {
    const box = document.getElementById('tag-search-results');
    if (!box || !_tagPickerState) return;
    const q = _tagPickerState.query.trim();
    const results = await searchTags(q);
    const filtered = results.filter(t => !_tagPickerState.selectedIds.includes(t.id));

    let html = filtered.slice(0, 20).map(t => `
      <div class="tag-suggest-row" onclick="Tags._addSelectedTag('${t.id}')">
        <span>${Utils.escAttr(t.name)}</span>
        <span class="tag-suggest-meta">${t.useCount ? `déjà utilisé · ${t.useCount} produit${t.useCount>1?'s':''}` : ''}</span>
      </div>
    `).join('');

    const exact = q && results.find(t => Norm.norm(t.name) === Norm.norm(q));
    if (q && !exact) {
      html += `<div class="tag-suggest-row tag-suggest-create" onclick="Tags._createAndAddTag()">
        <span>+ Créer le tag "${Utils.escAttr(q)}"</span>
      </div>`;
    }
    box.innerHTML = html || '<div style="font-size:12px;color:var(--text-muted);padding:10px 2px">Tape pour chercher dans les tags existants</div>';
  }

  function _addSelectedTag(id) {
    if (!_tagPickerState.selectedIds.includes(id)) _tagPickerState.selectedIds.push(id);
    _tagPickerState.query = '';
    _renderTagPickerModal();
  }

  async function _createAndAddTag() {
    const q = _tagPickerState.query.trim();
    if (!q) return;
    const tag = await getOrCreateTag(q);
    _tagPickerState.selectedIds.push(tag.id);
    _tagPickerState.query = '';
    _renderTagPickerModal();
  }

  function _removeSelectedTag(id) {
    _tagPickerState.selectedIds = _tagPickerState.selectedIds.filter(i => i !== id);
    _renderTagPickerModal();
  }

  function _confirmTagPicker() {
    const cb = _tagPickerState.onChange;
    const ids = _tagPickerState.selectedIds;
    _tagPickerState = null;
    Utils.closeModals();
    if (cb) cb(ids);
  }

  // ════════════════════════════════════════════════════════════
  // ÉCRAN "GÉRER LES CATÉGORIES"
  // ════════════════════════════════════════════════════════════
  async function openManageCategories() {
    await _renderManageCategoriesModal();
  }

  async function _renderManageCategoriesModal() {
    const tree = await getCategoryTree();
    const html = `
      <div class="modal-title">Gérer les catégories</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:16px">
        Crée tes catégories générales et, si besoin, des sous-catégories. Elles seront proposées sur chaque produit.
      </div>
      <div id="cat-manage-list">
        ${tree.length ? tree.map(c => `
          <div class="cat-manage-group">
            <div class="cat-manage-row cat-manage-root">
              <span class="cat-manage-name">${Utils.escAttr(c.name)}</span>
              <span class="cat-manage-actions">
                <button onclick="Tags._addSubCategoryPrompt('${c.id}')" title="Ajouter sous-catégorie">+ sous-cat</button>
                <button onclick="Tags._renameCategoryPrompt('${c.id}','${Utils.escAttr(c.name)}')">✎</button>
                <button onclick="Tags._deleteCategoryPrompt('${c.id}')" class="cat-manage-del">🗑</button>
              </span>
            </div>
            ${c.children.map(ch => `
              <div class="cat-manage-row cat-manage-child">
                <span class="cat-manage-name">↳ ${Utils.escAttr(ch.name)}</span>
                <span class="cat-manage-actions">
                  <button onclick="Tags._renameCategoryPrompt('${ch.id}','${Utils.escAttr(ch.name)}')">✎</button>
                  <button onclick="Tags._deleteCategoryPrompt('${ch.id}')" class="cat-manage-del">🗑</button>
                </span>
              </div>
            `).join('')}
          </div>
        `).join('') : '<div style="font-size:12px;color:var(--text-muted);padding:10px 0">Aucune catégorie pour l’instant</div>'}
      </div>
      <div class="form-group" style="margin-top:14px">
        <label class="form-label">NOUVELLE CATÉGORIE GÉNÉRALE</label>
        <div style="display:flex;gap:8px">
          <input class="form-input" id="new-cat-name" placeholder="Ex: Stéroïdes injectables" style="flex:1">
          <button class="btn-primary" onclick="Tags._addRootCategory()" style="padding:9px 16px">Ajouter</button>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" style="width:100%" onclick="Utils.closeModals()">Fermer</button>
      </div>
    `;
    Utils.closeModals();
    Utils.modal(html);
  }

  async function _addRootCategory() {
    const input = document.getElementById('new-cat-name');
    const name = input?.value.trim();
    if (!name) { Utils.toast('⚠️ Nom requis'); return; }
    await addCategory(name, null);
    await _renderManageCategoriesModal();
  }

  function _addSubCategoryPrompt(parentId) {
    Utils.modal(`
      <div class="modal-title">Nouvelle sous-catégorie</div>
      <div class="form-group">
        <input class="form-input" id="new-subcat-name" placeholder="Ex: Esters longs" autofocus>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="Tags._renderManageCategoriesModal()">Annuler</button>
        <button class="btn-primary" onclick="Tags._confirmAddSubCategory('${parentId}')">Ajouter</button>
      </div>
    `);
  }

  async function _confirmAddSubCategory(parentId) {
    const name = document.getElementById('new-subcat-name')?.value.trim();
    if (!name) { Utils.toast('⚠️ Nom requis'); return; }
    await addCategory(name, parentId);
    await _renderManageCategoriesModal();
  }

  function _renameCategoryPrompt(id, currentName) {
    Utils.modal(`
      <div class="modal-title">Renommer</div>
      <div class="form-group">
        <input class="form-input" id="rename-cat-input" value="${currentName}" autofocus>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="Tags._renderManageCategoriesModal()">Annuler</button>
        <button class="btn-primary" onclick="Tags._confirmRenameCategory('${id}')">Sauvegarder</button>
      </div>
    `);
  }

  async function _confirmRenameCategory(id) {
    const name = document.getElementById('rename-cat-input')?.value.trim();
    if (!name) { Utils.toast('⚠️ Nom requis'); return; }
    await renameCategory(id, name);
    await _renderManageCategoriesModal();
  }

  function _deleteCategoryPrompt(id) {
    Utils.confirm('Supprimer cette catégorie ? Les produits qui l\'utilisent ne seront pas supprimés, juste désaffectés.', async () => {
      await deleteCategory(id);
      await _renderManageCategoriesModal();
    });
  }

  return {
    Norm,
    getCategories, getCategoryTree, addCategory, renameCategory, deleteCategory,
    getAllTags, searchTags, findExactTag, getOrCreateTag, incrementTagUsage,
    searchProducts, hydrateProductTags,
    openProductPicker, _pickerSetCat, _pickerChoose, _pickerCustom, _closePicker,
    openTagPicker, _addSelectedTag, _createAndAddTag, _removeSelectedTag, _confirmTagPicker,
    openManageCategories, _renderManageCategoriesModal,
    _addRootCategory, _addSubCategoryPrompt, _confirmAddSubCategory,
    _renameCategoryPrompt, _confirmRenameCategory, _deleteCategoryPrompt,
  };
})();
