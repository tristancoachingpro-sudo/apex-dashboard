// ── APEX VAULT — Chiffrement AES-256-GCM + PIN ────────────────
// Tout est stocké chiffré dans IndexedDB, jamais en clair.
// La clé de chiffrement est dérivée du PIN via PBKDF2.

const Vault = (() => {

  // ── Crypto helpers ────────────────────────────────────────
  const SALT_KEY   = 'vault_salt';
  const VERIFY_KEY = 'vault_verify';
  const ITEMS_KEY  = 'vault_items';
  const ENC = new TextEncoder();
  const DEC = new TextDecoder();

  async function _derivKey(pin, salt) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw', ENC.encode(pin), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name:'PBKDF2', salt, iterations:200000, hash:'SHA-256' },
      keyMaterial,
      { name:'AES-GCM', length:256 },
      false,
      ['encrypt','decrypt']
    );
  }

  async function _encrypt(key, data) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt(
      { name:'AES-GCM', iv },
      key,
      ENC.encode(JSON.stringify(data))
    );
    // Store iv + ciphertext as base64
    const combined = new Uint8Array(iv.byteLength + enc.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(enc), iv.byteLength);
    return btoa(String.fromCharCode(...combined));
  }

  async function _decrypt(key, b64) {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const iv = bytes.slice(0, 12);
    const data = bytes.slice(12);
    const dec = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, data);
    return JSON.parse(DEC.decode(dec));
  }

  // ── Session: hold derived key in memory only ──────────────
  let _sessionKey = null;
  let _sessionTimeout = null;
  const SESSION_DURATION = 5 * 60 * 1000; // 5 min auto-lock

  function _setSession(key) {
    _sessionKey = key;
    if (_sessionTimeout) clearTimeout(_sessionTimeout);
    _sessionTimeout = setTimeout(() => { _sessionKey = null; }, SESSION_DURATION);
  }

  function _resetSessionTimer() {
    if (!_sessionKey) return;
    if (_sessionTimeout) clearTimeout(_sessionTimeout);
    _sessionTimeout = setTimeout(() => { _sessionKey = null; }, SESSION_DURATION);
  }

  function isUnlocked() { return _sessionKey !== null; }

  // ── PIN management ────────────────────────────────────────
  async function hasPIN() {
    const v = await DB.getSetting(VERIFY_KEY);
    return !!v;
  }

  async function createPIN(pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key  = await _derivKey(pin, salt);
    // Store salt
    const saltB64 = btoa(String.fromCharCode(...salt));
    await DB.setSetting(SALT_KEY, saltB64);
    // Store encrypted verification token
    const verify = await _encrypt(key, { ok: true, ts: Date.now() });
    await DB.setSetting(VERIFY_KEY, verify);
    _setSession(key);
    return true;
  }

  async function unlockPIN(pin) {
    const saltB64 = await DB.getSetting(SALT_KEY);
    if (!saltB64) return false;
    const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
    const key  = await _derivKey(pin, salt);
    try {
      const verify = await DB.getSetting(VERIFY_KEY);
      const result = await _decrypt(key, verify);
      if (result.ok) { _setSession(key); return true; }
      return false;
    } catch(e) { return false; }
  }

  function lock() {
    _sessionKey = null;
    if (_sessionTimeout) clearTimeout(_sessionTimeout);
  }

  async function changePIN(oldPin, newPin) {
    const ok = await unlockPIN(oldPin);
    if (!ok) return false;
    // Re-encrypt all items with new PIN
    const items = await _loadItems();
    const salt  = crypto.getRandomValues(new Uint8Array(16));
    const key   = await _derivKey(newPin, salt);
    const saltB64 = btoa(String.fromCharCode(...salt));
    await DB.setSetting(SALT_KEY, saltB64);
    const verify = await _encrypt(key, { ok: true, ts: Date.now() });
    await DB.setSetting(VERIFY_KEY, verify);
    _setSession(key);
    await _saveItems(items);
    return true;
  }

  // ── Items storage ─────────────────────────────────────────
  async function _loadItems() {
    if (!_sessionKey) return [];
    const enc = await DB.getSetting(ITEMS_KEY);
    if (!enc) return [];
    try { return await _decrypt(_sessionKey, enc); }
    catch(e) { return []; }
  }

  async function _saveItems(items) {
    if (!_sessionKey) return;
    const enc = await _encrypt(_sessionKey, items);
    await DB.setSetting(ITEMS_KEY, enc);
  }

  async function addItem(item) {
    _resetSessionTimer();
    const items = await _loadItems();
    const newItem = {
      id: Utils.uid(),
      type: item.type, // 'note' | 'password' | 'image' | 'file'
      title: item.title,
      content: item.content || '',
      meta: item.meta || {},
      tags: item.tags || [],
      createdAt: Utils.today(),
      updatedAt: Utils.today(),
      starred: false,
    };
    items.unshift(newItem);
    await _saveItems(items);
    return newItem;
  }

  async function updateItem(id, changes) {
    _resetSessionTimer();
    const items = await _loadItems();
    const idx = items.findIndex(i => i.id === id);
    if (idx < 0) return;
    items[idx] = { ...items[idx], ...changes, updatedAt: Utils.today() };
    await _saveItems(items);
  }

  async function deleteItem(id) {
    _resetSessionTimer();
    const items = await _loadItems();
    await _saveItems(items.filter(i => i.id !== id));
  }

  async function getAllItems() {
    _resetSessionTimer();
    return _loadItems();
  }

  async function toggleStar(id) {
    const items = await _loadItems();
    const item  = items.find(i => i.id === id);
    if (item) await updateItem(id, { starred: !item.starred });
  }

  // ── UI ────────────────────────────────────────────────────
  let _searchQ = '';
  let _filterType = 'all';

  async function render(container) {
    if (!container) return;

    if (!await hasPIN()) {
      _renderSetupPIN(container);
      return;
    }
    if (!isUnlocked()) {
      _renderLocked(container);
      return;
    }
    await _renderVault(container);
  }

  function _renderSetupPIN(container) {
    container.innerHTML = `
      <div class="vault-lock-screen">
        <div class="vault-lock-icon">🔐</div>
        <div class="vault-lock-title">Créer votre Vault</div>
        <div class="vault-lock-sub">Choisissez un PIN à 6 chiffres.<br>Il ne peut pas être récupéré si oublié.</div>

        <div class="pin-dots" id="pin-dots-setup">
          ${Array(6).fill('<div class="pin-dot"></div>').join('')}
        </div>
        <div id="pin-label-setup" style="font-size:12px;color:var(--text-muted);margin-bottom:16px;min-height:16px"></div>

        <div class="pin-pad">
          ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k => `
            <button class="pin-key ${k===''?'pin-key--empty':''}"
              onclick="Vault._pinKeySetup('${k}')">${k}</button>
          `).join('')}
        </div>
      </div>`;
    window._pinSetupStep = 1;
    window._pinFirst = '';
    window._pinCurrent = '';
  }

  function _renderLocked(container) {
    container.innerHTML = `
      <div class="vault-lock-screen">
        <div class="vault-lock-icon">🔒</div>
        <div class="vault-lock-title">Vault verrouillé</div>
        <div class="vault-lock-sub">Entrez votre PIN pour accéder</div>

        <div class="pin-dots" id="pin-dots-unlock">
          ${Array(6).fill('<div class="pin-dot"></div>').join('')}
        </div>
        <div id="pin-error" style="font-size:12px;color:var(--accent-red);margin-bottom:16px;min-height:16px"></div>

        <div class="pin-pad">
          ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k => `
            <button class="pin-key ${k===''?'pin-key--empty':''}"
              onclick="Vault._pinKeyUnlock('${k}')">${k}</button>
          `).join('')}
        </div>
      </div>`;
    window._pinUnlockCurrent = '';
  }

  async function _renderVault(container) {
    const items = await getAllItems();

    // Filter
    let filtered = items;
    if (_filterType !== 'all') filtered = filtered.filter(i => i.type === _filterType);
    if (_searchQ) {
      const q = _searchQ.toLowerCase();
      filtered = filtered.filter(i =>
        i.title.toLowerCase().includes(q) ||
        (i.content || '').toLowerCase().includes(q) ||
        (i.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }

    const starred = filtered.filter(i => i.starred);
    const unstarred = filtered.filter(i => !i.starred);

    const typeIcons = { note:'📝', password:'🔑', image:'🖼️', file:'📄' };
    const typeLabels = { all:'Tout', note:'Notes', password:'Mots de passe', image:'Images', file:'Fichiers' };

    container.innerHTML = `
      <div class="vault-header">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <span style="font-size:22px">🔐</span>
          <div>
            <div style="font-size:18px;font-weight:800">Vault</div>
            <div style="font-size:11px;color:var(--accent-green)">● Déverrouillé · Auto-lock 5 min</div>
          </div>
          <button class="btn-secondary" style="margin-left:auto;padding:7px 12px;font-size:12px" onclick="Vault.lock();Vault.render(document.getElementById('vault-container'))">🔒 Verrouiller</button>
        </div>

        <!-- Search -->
        <div style="position:relative;margin-bottom:10px">
          <input class="form-input" placeholder="🔍 Rechercher..." value="${Utils.escAttr(_searchQ)}"
            oninput="Vault._setSearch(this.value)" style="padding-left:16px">
        </div>

        <!-- Type filter -->
        <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin-bottom:14px;scrollbar-width:none">
          ${Object.entries(typeLabels).map(([k,l]) => `
            <button class="filter-chip ${_filterType===k?'active':''}" onclick="Vault._setFilter('${k}')">${l}</button>
          `).join('')}
        </div>

        <!-- Add button row -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
          <button class="vault-add-btn" onclick="Vault.openAdd('note')">📝 Note</button>
          <button class="vault-add-btn" onclick="Vault.openAdd('password')">🔑 Mot de passe</button>
          <button class="vault-add-btn" onclick="Vault.openAdd('image')">🖼️ Image</button>
          <button class="vault-add-btn" onclick="Vault.openAdd('file')">📄 Fichier</button>
        </div>
      </div>

      <div id="vault-container-inner">
        ${!filtered.length ? `
          <div class="empty-state" style="padding:32px 0">
            <div class="empty-state-icon">🔐</div>
            <div class="empty-state-text">${items.length ? 'Aucun résultat' : 'Vault vide'}</div>
            <div class="empty-state-sub">${items.length ? 'Modifie ta recherche' : 'Ajoute ta première entrée'}</div>
          </div>` : `

          ${starred.length ? `
            <div class="fin-section-title">⭐ FAVORIS</div>
            ${starred.map(item => _renderItem(item, typeIcons)).join('')}
          ` : ''}

          ${unstarred.length ? `
            ${starred.length ? '<div class="fin-section-title">ENTRÉES</div>' : ''}
            ${unstarred.map(item => _renderItem(item, typeIcons)).join('')}
          ` : ''}
        `}
      </div>

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border)">
        <button class="btn-secondary" style="width:100%;font-size:12px" onclick="Vault.openChangePIN()">🔑 Changer le PIN</button>
      </div>
    `;
  }

  function _renderItem(item, typeIcons) {
    const icon = typeIcons[item.type] || '📄';
    const preview = item.type === 'password'
      ? '••••••••'
      : item.type === 'image'
      ? '🖼️ Image'
      : item.type === 'file'
      ? `📄 ${item.meta?.filename || 'Fichier'}`
      : (item.content || '').slice(0, 60) + ((item.content || '').length > 60 ? '…' : '');

    return `<div class="vault-item" onclick="Vault.openDetail('${Utils.escAttr(item.id)}')">
      <div class="vault-item-icon">${icon}</div>
      <div class="vault-item-body">
        <div class="vault-item-title">${item.title}</div>
        <div class="vault-item-preview">${preview}</div>
        ${item.tags?.length ? `<div class="vault-item-tags">${item.tags.map(t=>`<span class="vault-tag">${t}</span>`).join('')}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px;flex-shrink:0">
        <button onclick="event.stopPropagation();Vault.toggleStar('${Utils.escAttr(item.id)}')"
          style="font-size:18px;padding:4px;color:${item.starred?'var(--accent-gold)':'var(--text-muted)'}">
          ${item.starred ? '⭐' : '☆'}
        </button>
        <span style="font-size:10px;color:var(--text-muted)">${item.updatedAt}</span>
      </div>
    </div>`;
  }

  // ── PIN input handlers ────────────────────────────────────
  function _updateDots(dotsId, pin) {
    const dots = document.querySelectorAll(`#${dotsId} .pin-dot`);
    dots.forEach((d, i) => d.classList.toggle('filled', i < pin.length));
  }

  function _pinKeySetup(key) {
    if (key === '') return;
    if (key === '⌫') {
      window._pinCurrent = (window._pinCurrent || '').slice(0, -1);
      _updateDots('pin-dots-setup', window._pinCurrent);
      return;
    }
    if ((window._pinCurrent || '').length >= 6) return;
    window._pinCurrent = (window._pinCurrent || '') + key;
    _updateDots('pin-dots-setup', window._pinCurrent);

    if (window._pinCurrent.length === 6) {
      if (window._pinSetupStep === 1) {
        window._pinFirst = window._pinCurrent;
        window._pinCurrent = '';
        const label = document.getElementById('pin-label-setup');
        if (label) label.textContent = 'Confirmez votre PIN';
        _updateDots('pin-dots-setup', '');
        window._pinSetupStep = 2;
      } else {
        if (window._pinCurrent === window._pinFirst) {
          createPIN(window._pinCurrent).then(() => {
            const container = document.getElementById('vault-main-container');
            if (container) Vault.render(container);
            Utils.toast('🔐 Vault créé !');
          });
        } else {
          window._pinCurrent = '';
          window._pinFirst = '';
          window._pinSetupStep = 1;
          _updateDots('pin-dots-setup', '');
          const label = document.getElementById('pin-label-setup');
          if (label) { label.textContent = '❌ PINs différents — recommencez'; label.style.color='var(--accent-red)'; }
          setTimeout(() => { if(label) { label.textContent=''; label.style.color=''; } }, 2000);
        }
      }
    }
  }

  function _pinKeyUnlock(key) {
    if (key === '') return;
    if (key === '⌫') {
      window._pinUnlockCurrent = (window._pinUnlockCurrent || '').slice(0, -1);
      _updateDots('pin-dots-unlock', window._pinUnlockCurrent);
      return;
    }
    if ((window._pinUnlockCurrent || '').length >= 6) return;
    window._pinUnlockCurrent = (window._pinUnlockCurrent || '') + key;
    _updateDots('pin-dots-unlock', window._pinUnlockCurrent);

    if (window._pinUnlockCurrent.length === 6) {
      unlockPIN(window._pinUnlockCurrent).then(ok => {
        if (ok) {
          const container = document.getElementById('vault-main-container');
          if (container) Vault.render(container);
        } else {
          window._pinUnlockCurrent = '';
          _updateDots('pin-dots-unlock', '');
          const err = document.getElementById('pin-error');
          if (err) err.textContent = '❌ PIN incorrect';
          // Haptic
          if (navigator.vibrate) navigator.vibrate([100,50,100]);
          setTimeout(() => { if(err) err.textContent=''; }, 2000);
        }
      });
    }
  }

  // ── Add / Edit items ──────────────────────────────────────
  function openAdd(type) {
    _resetSessionTimer();
    const titles = { note:'📝 Nouvelle note', password:'🔑 Nouveau mot de passe', image:'🖼️ Nouvelle image', file:'📄 Nouveau fichier' };

    Utils.modal(`
      <div class="modal-title">${titles[type]}</div>

      <div class="form-group">
        <label class="form-label">TITRE *</label>
        <input class="form-input" id="vault-add-title" placeholder="Ex: Accès fournisseur, Carte SIM...">
      </div>

      ${type === 'note' ? `
        <div class="form-group">
          <label class="form-label">CONTENU</label>
          <textarea class="form-textarea" id="vault-add-content" style="min-height:140px" placeholder="Ta note secrète..."></textarea>
        </div>` : ''}

      ${type === 'password' ? `
        <div class="form-group">
          <label class="form-label">IDENTIFIANT / EMAIL</label>
          <input class="form-input" id="vault-pwd-login" placeholder="email@exemple.com">
        </div>
        <div class="form-group">
          <label class="form-label">MOT DE PASSE</label>
          <div style="position:relative">
            <input class="form-input" id="vault-pwd-pass" type="password" placeholder="Mot de passe"
              style="padding-right:48px">
            <button onclick="Vault._togglePwdVis('vault-pwd-pass')"
              style="position:absolute;right:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:16px"
              id="vault-pwd-eye">👁</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">URL / APP</label>
          <input class="form-input" id="vault-pwd-url" placeholder="https://... ou nom de l'app">
        </div>
        <div class="form-group">
          <label class="form-label">NOTES</label>
          <textarea class="form-textarea" id="vault-add-content" placeholder="Infos supplémentaires..."></textarea>
        </div>` : ''}

      ${type === 'image' ? `
        <div class="form-group">
          <label class="form-label">IMAGE</label>
          <div class="vault-file-drop" id="vault-img-drop" onclick="document.getElementById('vault-img-input').click()">
            <div id="vault-img-preview" style="text-align:center;color:var(--text-muted)">
              <div style="font-size:32px;margin-bottom:8px">🖼️</div>
              <div style="font-size:13px">Appuie pour choisir une image</div>
            </div>
          </div>
          <input type="file" id="vault-img-input" accept="image/*" style="display:none"
            onchange="Vault._previewImg(this)">
        </div>
        <div class="form-group">
          <label class="form-label">DESCRIPTION</label>
          <input class="form-input" id="vault-add-content" placeholder="Description optionnelle">
        </div>` : ''}

      ${type === 'file' ? `
        <div class="form-group">
          <label class="form-label">FICHIER</label>
          <div class="vault-file-drop" id="vault-file-drop" onclick="document.getElementById('vault-file-input').click()">
            <div id="vault-file-preview" style="text-align:center;color:var(--text-muted)">
              <div style="font-size:32px;margin-bottom:8px">📄</div>
              <div style="font-size:13px">Appuie pour choisir un fichier</div>
              <div style="font-size:11px;margin-top:4px">Max 2MB</div>
            </div>
          </div>
          <input type="file" id="vault-file-input" style="display:none"
            onchange="Vault._previewFile(this)">
        </div>
        <div class="form-group">
          <label class="form-label">DESCRIPTION</label>
          <input class="form-input" id="vault-add-content" placeholder="Description optionnelle">
        </div>` : ''}

      <div class="form-group">
        <label class="form-label">TAGS (séparés par virgule)</label>
        <input class="form-input" id="vault-add-tags" placeholder="personnel, important, finance...">
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" onclick="Utils.closeModals()">Annuler</button>
        <button class="btn-primary" onclick="Vault._saveAdd('${type}')">Sauvegarder</button>
      </div>
    `);
    window._vaultAddImgData = null;
    window._vaultAddFileData = null;
  }

  function _togglePwdVis(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    const eye = document.getElementById('vault-pwd-eye');
    if (eye) eye.textContent = input.type === 'password' ? '👁' : '🙈';
  }

  function _previewImg(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { Utils.toast('⚠️ Image trop lourde (max 2MB)'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      window._vaultAddImgData = e.target.result; // base64
      const preview = document.getElementById('vault-img-preview');
      if (preview) preview.innerHTML = `<img src="${e.target.result}" style="max-width:100%;max-height:180px;border-radius:8px;object-fit:contain">`;
    };
    reader.readAsDataURL(file);
  }

  function _previewFile(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { Utils.toast('⚠️ Fichier trop lourd (max 2MB)'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      window._vaultAddFileData = { data: e.target.result, filename: file.name, size: file.size, mime: file.type };
      const preview = document.getElementById('vault-file-preview');
      if (preview) preview.innerHTML = `
        <div style="font-size:28px;margin-bottom:6px">📄</div>
        <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${file.name}</div>
        <div style="font-size:11px;color:var(--text-muted)">${(file.size/1024).toFixed(1)} KB</div>`;
    };
    reader.readAsDataURL(file);
  }

  async function _saveAdd(type) {
    const title = document.getElementById('vault-add-title')?.value.trim();
    if (!title) { Utils.toast('⚠️ Titre requis'); return; }

    const tagsRaw = document.getElementById('vault-add-tags')?.value || '';
    const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
    const content = document.getElementById('vault-add-content')?.value.trim() || '';

    let itemData = { type, title, content, tags, meta: {} };

    if (type === 'password') {
      itemData.meta = {
        login: document.getElementById('vault-pwd-login')?.value.trim() || '',
        password: document.getElementById('vault-pwd-pass')?.value || '',
        url: document.getElementById('vault-pwd-url')?.value.trim() || '',
      };
    } else if (type === 'image') {
      if (!window._vaultAddImgData) { Utils.toast('⚠️ Sélectionne une image'); return; }
      itemData.content = window._vaultAddImgData;
      itemData.meta = { isImage: true };
    } else if (type === 'file') {
      if (!window._vaultAddFileData) { Utils.toast('⚠️ Sélectionne un fichier'); return; }
      itemData.content = window._vaultAddFileData.data;
      itemData.meta = {
        filename: window._vaultAddFileData.filename,
        size: window._vaultAddFileData.size,
        mime: window._vaultAddFileData.mime,
      };
    }

    await addItem(itemData);
    Utils.closeModals();
    const container = document.getElementById('vault-main-container');
    if (container) await Vault.render(container);
    Utils.toast('✅ Ajouté au Vault');
    if (navigator.vibrate) navigator.vibrate(50);
  }

  async function openDetail(id) {
    _resetSessionTimer();
    const items = await getAllItems();
    const item = items.find(i => i.id === id);
    if (!item) return;

    const typeIcons = { note:'📝', password:'🔑', image:'🖼️', file:'📄' };

    let contentHtml = '';
    if (item.type === 'note') {
      contentHtml = `
        <div class="fin-section-title">CONTENU</div>
        <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:14px;font-size:14px;line-height:1.7;white-space:pre-wrap;color:var(--text-primary)">${item.content || '(vide)'}</div>`;
    } else if (item.type === 'password') {
      const m = item.meta || {};
      contentHtml = `
        ${m.login ? `<div class="info-row"><span class="info-row-label">Identifiant</span>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="info-row-val">${m.login}</span>
            <button onclick="Vault._copy('${Utils.escAttr(m.login)}')" style="color:var(--accent-crystal);font-size:12px">📋</button>
          </div></div>` : ''}
        <div class="info-row"><span class="info-row-label">Mot de passe</span>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="info-row-val" id="vault-pwd-display" style="font-family:monospace;letter-spacing:2px">••••••••</span>
            <button onclick="Vault._togglePwdDisplay('${Utils.escAttr(item.meta?.password||'')}')" style="font-size:14px">👁</button>
            <button onclick="Vault._copy('${Utils.escAttr(m.password||'')}')" style="color:var(--accent-crystal);font-size:12px">📋</button>
          </div>
        </div>
        ${m.url ? `<div class="info-row"><span class="info-row-label">URL / App</span>
          <span class="info-row-val" style="color:var(--accent-crystal)">${m.url}</span></div>` : ''}
        ${item.content ? `<div class="fin-section-title" style="margin-top:16px">NOTES</div>
          <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:12px;font-size:13px;color:var(--text-secondary)">${item.content}</div>` : ''}`;
    } else if (item.type === 'image') {
      contentHtml = `
        <div style="text-align:center;margin-bottom:12px">
          <img src="${item.content}" style="max-width:100%;border-radius:var(--radius-md);max-height:280px;object-fit:contain">
        </div>
        ${item.content ? `<button class="btn-secondary" style="width:100%;font-size:12px" onclick="Vault._downloadFile('${Utils.escAttr(item.content)}','image.jpg','image/jpeg')">⬇️ Télécharger</button>` : ''}`;
    } else if (item.type === 'file') {
      const m = item.meta || {};
      contentHtml = `
        <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:16px;text-align:center;margin-bottom:12px">
          <div style="font-size:36px;margin-bottom:8px">📄</div>
          <div style="font-size:14px;font-weight:700">${m.filename || 'Fichier'}</div>
          <div style="font-size:12px;color:var(--text-muted)">${m.size ? (m.size/1024).toFixed(1)+' KB' : ''}</div>
        </div>
        <button class="btn-primary" style="width:100%;margin-bottom:8px" onclick="Vault._downloadFile('${Utils.escAttr(item.content)}','${Utils.escAttr(m.filename||'fichier')}','${Utils.escAttr(m.mime||'')}')">⬇️ Télécharger</button>
        ${item.content_desc || item.meta?.desc ? `<div style="font-size:13px;color:var(--text-secondary)">${item.content_desc||item.meta.desc}</div>` : ''}`;
    }

    Utils.modal(`
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <span style="font-size:28px">${typeIcons[item.type]||'📄'}</span>
        <div style="flex:1">
          <div class="modal-title" style="margin-bottom:2px">${item.title}</div>
          <div style="font-size:11px;color:var(--text-muted)">Modifié le ${item.updatedAt}</div>
        </div>
        <button onclick="Vault.toggleStar('${Utils.escAttr(id)}')"
          style="font-size:22px;color:${item.starred?'var(--accent-gold)':'var(--text-muted)'}">
          ${item.starred?'⭐':'☆'}
        </button>
      </div>

      ${item.tags?.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${item.tags.map(t=>`<span class="vault-tag">${t}</span>`).join('')}</div>` : ''}

      ${contentHtml}

      <div class="modal-actions" style="margin-top:20px">
        <button class="btn-danger" onclick="Vault._confirmDelete('${Utils.escAttr(id)}')">🗑 Supprimer</button>
        <button class="btn-secondary" onclick="Utils.closeModals()">Fermer</button>
      </div>
    `);
  }

  function _togglePwdDisplay(pwd) {
    const el = document.getElementById('vault-pwd-display');
    if (!el) return;
    el.textContent = el.textContent.includes('•') ? pwd : '••••••••';
  }

  function _copy(text) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => Utils.toast('📋 Copié !'));
    if (navigator.vibrate) navigator.vibrate(40);
  }

  function _downloadFile(dataUrl, filename, mime) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  }

  function _confirmDelete(id) {
    Utils.confirm('Supprimer cette entrée du Vault ?', async () => {
      await deleteItem(id);
      Utils.closeModals();
      const container = document.getElementById('vault-main-container');
      if (container) await Vault.render(container);
      Utils.toast('🗑 Supprimé');
    });
  }

  function openChangePIN() {
    let step = 1, oldPin = '', newPin = '', current = '';

    const renderStep = () => {
      const labels = ['', 'Ancien PIN', 'Nouveau PIN (6 chiffres)', 'Confirmer le nouveau PIN'];
      document.getElementById('pin-change-label').textContent = labels[step];
      document.getElementById('pin-change-dots').innerHTML = Array(6).fill('<div class="pin-dot"></div>').join('');
      current = '';
    };

    Utils.modal(`
      <div class="modal-title">🔑 Changer le PIN</div>
      <div class="pin-dots" id="pin-change-dots">${Array(6).fill('<div class="pin-dot"></div>').join('')}</div>
      <div id="pin-change-label" style="font-size:13px;color:var(--text-muted);text-align:center;margin:10px 0 16px">Ancien PIN</div>
      <div id="pin-change-error" style="font-size:12px;color:var(--accent-red);text-align:center;min-height:16px;margin-bottom:8px"></div>
      <div class="pin-pad">
        ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k => `
          <button class="pin-key ${k===''?'pin-key--empty':''}" onclick="(function(){
            const k='${k}';
            if(k==='') return;
            if(k==='⌫'){ window._pcCurrent=(window._pcCurrent||'').slice(0,-1); }
            else if((window._pcCurrent||'').length<6){ window._pcCurrent=(window._pcCurrent||'')+k; }
            const dots=document.querySelectorAll('#pin-change-dots .pin-dot');
            dots.forEach((d,i)=>d.classList.toggle('filled',i<(window._pcCurrent||'').length));
            if((window._pcCurrent||'').length===6){ Vault._changePINStep(window._pcCurrent); window._pcCurrent=''; }
          })()">${k}</button>
        `).join('')}
      </div>
      <div class="modal-actions" style="margin-top:16px">
        <button class="btn-secondary" onclick="Utils.closeModals()">Annuler</button>
      </div>
    `);
    window._pcStep = 1;
    window._pcOld = '';
    window._pcNew = '';
    window._pcCurrent = '';
  }

  async function _changePINStep(pin) {
    const step = window._pcStep;
    const errEl = document.getElementById('pin-change-error');
    const labelEl = document.getElementById('pin-change-label');

    if (step === 1) {
      const ok = await unlockPIN(pin);
      if (!ok) {
        if (errEl) errEl.textContent = '❌ PIN incorrect';
        if (navigator.vibrate) navigator.vibrate([100,50,100]);
        setTimeout(() => { if(errEl) errEl.textContent=''; }, 2000);
        return;
      }
      window._pcOld = pin;
      window._pcStep = 2;
      if (labelEl) labelEl.textContent = 'Nouveau PIN (6 chiffres)';
      if (errEl) errEl.textContent = '';
      document.querySelectorAll('#pin-change-dots .pin-dot').forEach(d => d.classList.remove('filled'));
    } else if (step === 2) {
      window._pcNew = pin;
      window._pcStep = 3;
      if (labelEl) labelEl.textContent = 'Confirmer le nouveau PIN';
      document.querySelectorAll('#pin-change-dots .pin-dot').forEach(d => d.classList.remove('filled'));
    } else if (step === 3) {
      if (pin !== window._pcNew) {
        window._pcStep = 2;
        window._pcNew = '';
        if (errEl) errEl.textContent = '❌ PINs différents — recommencez';
        if (navigator.vibrate) navigator.vibrate([100,50,100]);
        if (labelEl) labelEl.textContent = 'Nouveau PIN (6 chiffres)';
        setTimeout(() => { if(errEl) errEl.textContent=''; }, 2000);
        document.querySelectorAll('#pin-change-dots .pin-dot').forEach(d => d.classList.remove('filled'));
        return;
      }
      const ok = await changePIN(window._pcOld, window._pcNew);
      if (ok) {
        Utils.closeModals();
        Utils.toast('✅ PIN modifié !');
      }
    }
  }

  async function _setSearch(q) {
    _searchQ = q;
    const container = document.getElementById('vault-main-container');
    if (container) await Vault.render(container);
  }

  async function _setFilter(type) {
    _filterType = type;
    const container = document.getElementById('vault-main-container');
    if (container) await Vault.render(container);
  }

  async function toggleStar(id) {
    await _toggleStarInternal(id);
    const container = document.getElementById('vault-main-container');
    if (container) await Vault.render(container);
    Utils.closeModals();
  }

  async function _toggleStarInternal(id) {
    _resetSessionTimer();
    const items = await _loadItems();
    const item  = items.find(i => i.id === id);
    if (item) {
      item.starred = !item.starred;
      item.updatedAt = Utils.today();
      await _saveItems(items);
    }
  }

  return {
    render, hasPIN, isUnlocked, lock,
    createPIN, unlockPIN, changePIN,
    addItem, updateItem, deleteItem, getAllItems, toggleStar,
    openAdd, openDetail, openChangePIN,
    _pinKeySetup, _pinKeyUnlock, _changePINStep,
    _togglePwdVis, _togglePwdDisplay, _previewImg, _previewFile,
    _saveAdd, _confirmDelete, _copy, _downloadFile,
    _setSearch, _setFilter,
  };
})();
