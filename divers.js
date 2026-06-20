// ── DIVERS MODULE ─────────────────────────────────────────────
const Divers = (() => {
  const DAY_KEYS = ['lun','mar','mer','jeu','ven','sam','dim'];
  const DAY_LABELS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

  async function init() {}

  async function render() {
    document.getElementById('divers-sub-content').innerHTML = '';
  }

  async function openMood() {
    document.getElementById('divers-sub-content').innerHTML = '';
    await Mood.renderStats();
  }

  async function openProgram() {
    const program = await DB.get('workout_program', 'main') || { id: 'main', days: {}, cycleLen: 7 };
    const container = document.getElementById('divers-sub-content');
    _renderProgramEditor(program, container);
  }

  function _renderProgramEditor(program, container) {
    const cycleLen = program.cycleLen || 7;
    const anchor = program.anchor;
    const anchorLabel = anchor
      ? `Aujourd'hui = Jour ${anchor.day} (défini le ${Utils.formatDate(anchor.date)})`
      : "Non défini — appuie sur \"Définir aujourd'hui\"";

    let rows = '';
    for (let i = 1; i <= cycleLen; i++) {
      const key = 'jour' + i;
      rows += `<div class="prog-day-row">
        <span class="prog-day-name">Jour ${i}</span>
        <input class="prog-day-input" id="prog-${key}" placeholder="Repos" value="${Utils.escAttr(program.days[key] || '')}">
      </div>`;
    }

    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h2 style="font-size:18px;font-weight:700">Programme</h2>
        <button class="btn-primary" onclick="Divers._saveProgram()">Sauvegarder</button>
      </div>

      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px;margin-bottom:12px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;font-weight:700">DURÉE DU CYCLE</div>
        <div style="display:flex;align-items:center;gap:12px">
          <button onclick="Divers._changeCycleLen(${Math.max(1, cycleLen-1)})"
            style="width:36px;height:36px;border-radius:50%;background:var(--bg-elevated);border:1px solid var(--border);font-size:20px;cursor:pointer;color:var(--text-secondary)">−</button>
          <div style="flex:1;text-align:center">
            <div style="font-size:28px;font-weight:900;color:var(--accent-crystal)">${cycleLen}</div>
            <div style="font-size:11px;color:var(--text-muted)">jours par cycle</div>
          </div>
          <button onclick="Divers._changeCycleLen(${Math.min(28, cycleLen+1)})"
            style="width:36px;height:36px;border-radius:50%;background:var(--bg-elevated);border:1px solid var(--border);font-size:20px;cursor:pointer;color:var(--text-secondary)">+</button>
        </div>
      </div>

      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px;margin-bottom:16px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;font-weight:700">JOUR ACTUEL DU CYCLE</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">${anchorLabel}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap" id="anchor-pills">
          ${Array.from({length: cycleLen}, (_,i) => `
            <button onclick="Divers._setAnchor(${i+1})"
              style="padding:6px 12px;border-radius:20px;font-size:13px;font-weight:700;cursor:pointer;border:1px solid;
                ${anchor?.day === i+1 ? 'background:var(--accent-crystal);color:#000;border-color:var(--accent-crystal)' : 'background:var(--bg-elevated);color:var(--text-secondary);border-color:var(--border)'}">
              Jour ${i+1}
            </button>`).join('')}
        </div>
      </div>

      <div class="program-editor">${rows}</div>
    `;
    window._currentCycleLen = cycleLen;
  }

  async function _changeCycleLen(newLen) {
    const program = await DB.get('workout_program', 'main') || { id: 'main', days: {}, cycleLen: 7 };
    const oldLen = window._currentCycleLen || program.cycleLen || 7;
    for (let i = 1; i <= oldLen; i++) {
      const key = 'jour' + i;
      const val = document.getElementById(`prog-${key}`)?.value.trim();
      if (val) program.days[key] = val;
      else delete program.days[key];
    }
    program.cycleLen = newLen;
    const container = document.getElementById('divers-sub-content');
    _renderProgramEditor(program, container);
  }

  async function _setAnchor(dayNum) {
    const program = await DB.get('workout_program', 'main') || { id: 'main', days: {}, cycleLen: 7 };
    // Save current inputs first
    const cycleLen = window._currentCycleLen || program.cycleLen || 7;
    for (let i = 1; i <= cycleLen; i++) {
      const key = 'jour' + i;
      const val = document.getElementById(`prog-${key}`)?.value.trim();
      if (val) program.days[key] = val;
      else delete program.days[key];
    }
    program.anchor = { date: Utils.today(), day: dayNum };
    await DB.put('workout_program', program);
    const container = document.getElementById('divers-sub-content');
    _renderProgramEditor(program, container);
    Utils.toast(`✅ Aujourd'hui = Jour ${dayNum}`);
    App.renderHome();
    Workout.render();
  }

  async function _saveProgram() {
    const cycleLen = window._currentCycleLen || 7;
    const days = {};
    for (let i = 1; i <= cycleLen; i++) {
      const key = 'jour' + i;
      const val = document.getElementById(`prog-${key}`)?.value.trim();
      if (val) days[key] = val;
    }
    const program = await DB.get('workout_program', 'main') || { id: 'main' };
    program.days = days;
    program.cycleLen = cycleLen;
    await DB.put('workout_program', program);
    Utils.toast('✅ Programme sauvegardé');
    App.renderHome();
    Workout.render();
  }

  async function openSettings() {
    const container = document.getElementById('divers-sub-content');
    const savedTemplate = await DB.getSetting('supplier_template') ||
      'Hello Oliver I would like to do an order of :\n{lines}';
    const savedLineTpl = await DB.getSetting('supplier_line_template') || '- {qty}x {name} {brand}';

    container.innerHTML = `
      <div style="margin-bottom:16px"><h2 style="font-size:18px;font-weight:700">Réglages</h2></div>

      <div class="fin-section-title">🎯 OBJECTIF FINANCIER (ACCUEIL)</div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px;margin-bottom:16px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Configure un objectif visible sur l'accueil avec une barre de progression, sur la durée de ton choix.</div>
        <div class="form-group">
          <label class="form-label">LIBELLÉ</label>
          <input class="form-input" id="fin-goal-label-input" placeholder="Ex: Objectif du mois, Target Juillet..."
            value="${await DB.getSetting('fin_goal_label') || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">MONTANT CIBLE (€ de bénéfice)</label>
          <input class="form-input" id="fin-goal-amount-input" type="number" placeholder="Ex: 2000"
            value="${await DB.getSetting('fin_goal_amount') || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">DURÉE DE L'OBJECTIF (JOURS)</label>
          <input class="form-input" id="fin-goal-days-input" type="number" min="1" placeholder="Ex: 10, 30, 60..."
            value="${await DB.getSetting('fin_goal_days') || ''}">
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
            Le compte à rebours redémarre dès que tu sauvegardes l'objectif. Laisse vide pour reprendre l'ancien comportement (jusqu'à la fin du mois civil).
          </div>
        </div>
        <button class="btn-primary" style="width:100%" onclick="Divers._saveGoal()">Sauvegarder l'objectif</button>
      </div>

      <div class="fin-section-title">MESSAGE FOURNISSEUR</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">
        Variables : <code style="color:var(--accent-crystal)">{lines}</code>,
        <code style="color:var(--accent-crystal)">{qty}</code>
        <code style="color:var(--accent-crystal)">{name}</code>
        <code style="color:var(--accent-crystal)">{brand}</code>
      </div>
      <textarea class="form-textarea" id="supplier-template" style="min-height:120px;font-family:monospace;font-size:13px">${Utils.escAttr(savedTemplate)}</textarea>
      <div style="font-size:11px;color:var(--text-muted);margin:6px 0 4px">Format d'une ligne produit :</div>
      <input class="form-input" id="supplier-line-tpl" style="font-family:monospace;font-size:13px"
        value="${Utils.escAttr(savedLineTpl)}"
        placeholder="- {qty}x {name} {brand}">
      <button class="btn-primary" style="width:100%;margin-top:10px;margin-bottom:20px" onclick="Divers._saveSupplierTemplate()">Sauvegarder le template</button>

      <div class="fin-section-title">MOOD — CRITÈRES PERSONNALISÉS</div>
      <div id="mood-criteria-editor" style="margin-bottom:12px"></div>
      <button class="btn-secondary" style="width:100%;margin-bottom:10px;font-size:13px" onclick="Divers._addMoodCriteria()">+ Ajouter un critère</button>
      <button class="btn-primary" style="width:100%;margin-bottom:20px" onclick="Divers._saveMoodCriteria()">Sauvegarder les critères</button>

      <div class="fin-section-title">CATALOGUE</div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;margin-bottom:20px">
        <div style="font-size:14px;font-weight:700;margin-bottom:4px">🎯 Réinitialiser la marge de tous les produits</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">Applique un nouveau % de marge à TOUS les produits du catalogue d'un coup (écrase la marge actuelle de chaque produit).</div>
        <button class="btn-primary" style="width:100%" onclick="Divers._openBulkMargin()">Modifier la marge de tout le catalogue</button>
      </div>

      <div class="fin-section-title">SAUVEGARDE & DONNÉES</div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;margin-bottom:12px">
        <div style="font-size:14px;font-weight:700;margin-bottom:4px">📤 Exporter</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">Télécharge toutes tes données en JSON pour les sauvegarder.</div>
        <button class="btn-primary" style="width:100%" onclick="Divers.exportData()">Exporter toutes les données</button>
      </div>
      <div style="background:var(--bg-card);border:1px solid rgba(255,77,109,0.2);border-radius:var(--radius-lg);padding:16px;margin-bottom:20px">
        <div style="font-size:14px;font-weight:700;margin-bottom:4px;color:var(--accent-red)">⚠️ Importer</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">
          <strong style="color:var(--accent-red)">Attention :</strong> l'import <strong>fusionne</strong> les données existantes avec le fichier importé. Les enregistrements avec le même ID seront écrasés.
        </div>
        <button class="btn-danger" style="width:100%" onclick="Divers._confirmImport()">Importer des données</button>
        <input type="file" id="import-file" accept=".json" style="display:none" onchange="Divers.importData(this)">
      </div>

      <div class="fin-section-title">À PROPOS</div>
      <div class="info-row"><span class="info-row-label">Version</span><span class="info-row-val">APEX v21</span></div>
      <div class="info-row"><span class="info-row-label">Stockage</span><span class="info-row-val">Firebase (Cloud)</span></div>
      <div class="info-row"><span class="info-row-label">Compte</span><span class="info-row-val" style="font-size:11px;color:var(--accent-crystal)">${Auth.getUser()?.email || '—'}</span></div>

      <div class="fin-section-title" style="margin-top:24px">COMPTE</div>
      <div style="background:var(--bg-card);border:1px solid rgba(255,77,109,0.15);border-radius:var(--radius-lg);padding:16px;margin-bottom:20px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Connecté en tant que <strong style="color:#fff">${Auth.getUser()?.displayName || Auth.getUser()?.email || '—'}</strong></div>
        <button class="btn-danger" style="width:100%" onclick="Utils.confirm('Se déconnecter ?', () => Auth.signOut().then(() => location.reload()))">Se déconnecter</button>
      </div>
    `;
    await _renderMoodCriteriaEditor();
  }

  // Bug 6 fix: confirm before import + validate JSON structure
  function _confirmImport() {
    Utils.confirm(
      '⚠️ Es-tu sûr ? Les données existantes avec le même ID seront écrasées. Il est recommandé d\'exporter d\'abord.',
      () => { document.getElementById('import-file').click(); }
    );
  }

  async function _saveGoal() {
    const label  = document.getElementById('fin-goal-label-input')?.value.trim() || 'Objectif du mois';
    const amount = parseFloat(document.getElementById('fin-goal-amount-input')?.value) || 0;
    const daysInput = document.getElementById('fin-goal-days-input')?.value;
    const days = daysInput ? parseInt(daysInput) : 0;
    await DB.setSetting('fin_goal_label', label);
    await DB.setSetting('fin_goal_amount', amount);
    await DB.setSetting('fin_goal_days', days > 0 ? days : '');
    // Redémarre le compte à rebours à partir de maintenant à chaque sauvegarde
    await DB.setSetting('fin_goal_start', Utils.today());
    Utils.toast('✅ Objectif sauvegardé');
    App.renderHome();
  }

  async function _saveSupplierTemplate() {
    const tpl  = document.getElementById('supplier-template')?.value || '';
    const line = document.getElementById('supplier-line-tpl')?.value || '- {qty}x {name} {brand}';
    await DB.setSetting('supplier_template', tpl);
    await DB.setSetting('supplier_line_template', line);
    Utils.toast('✅ Template sauvegardé');
  }

  async function _renderMoodCriteriaEditor() {
    const criteria = await Mood.getCriteria();
    window._moodCriteriaEdit = JSON.parse(JSON.stringify(criteria));
    const container = document.getElementById('mood-criteria-editor');
    if (!container) return;
    container.innerHTML = window._moodCriteriaEdit.map((c, i) => `
      <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
        <input class="form-input" style="width:44px;text-align:center;padding:8px;font-size:18px"
          value="${Utils.escAttr(c.emoji||'')}" placeholder="🔥"
          onchange="Divers._updateMoodCriteria(${i},'emoji',this.value)">
        <input class="form-input" style="flex:1" value="${Utils.escAttr(c.label)}"
          onchange="Divers._updateMoodCriteria(${i},'label',this.value)" placeholder="Nom du critère">
        <input class="form-input" style="width:90px" value="${Utils.escAttr(c.key)}"
          onchange="Divers._updateMoodCriteria(${i},'key',this.value)" placeholder="clé">
        <button onclick="Divers._removeMoodCriteria(${i})" style="color:var(--accent-red);font-size:20px;flex-shrink:0">×</button>
      </div>`).join('');
  }

  function _addMoodCriteria() {
    if (!window._moodCriteriaEdit) window._moodCriteriaEdit = [];
    window._moodCriteriaEdit.push({ key: 'custom_' + Date.now(), label: 'Nouveau critère', emoji: '⭐', color: '#7c6bff' });
    _renderMoodCriteriaEditor();
  }

  function _updateMoodCriteria(idx, field, val) {
    if (window._moodCriteriaEdit) window._moodCriteriaEdit[idx][field] = val;
  }

  function _removeMoodCriteria(idx) {
    if (window._moodCriteriaEdit) window._moodCriteriaEdit.splice(idx, 1);
    _renderMoodCriteriaEditor();
  }

  async function _saveMoodCriteria() {
    await DB.setSetting('mood_criteria', window._moodCriteriaEdit);
    Utils.toast('✅ Critères sauvegardés');
  }

  async function _openBulkMargin() {
    const products = await DB.getAll('catalogue');
    Utils.modal(`
      <div class="modal-title">Marge de tout le catalogue</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:16px">
        ${products.length} produit${products.length>1?'s':''} dans le catalogue. La nouvelle marge sera appliquée à TOUS (le prix de vente sera recalculé automatiquement à partir du prix d'achat de chaque produit).
      </div>
      <div style="background:var(--bg-elevated);border-radius:var(--radius-lg);padding:14px;margin-bottom:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:12px;font-weight:700;color:var(--text-muted)">NOUVELLE MARGE</span>
          <span id="bulk-margin-label" style="font-size:18px;font-weight:900;color:var(--accent-crystal)">50%</span>
        </div>
        <input type="range" id="bulk-margin-slider" min="0" max="200" step="1" value="50"
          oninput="Divers._updateBulkMarginLabel()"
          style="width:100%;accent-color:var(--accent-crystal);cursor:pointer">
        <div style="display:flex;justify-content:space-between;margin-top:4px">
          <span style="font-size:10px;color:var(--text-muted)">0%</span>
          <span style="font-size:10px;color:var(--text-muted)">200%</span>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="Utils.closeModals()">Annuler</button>
        <button class="btn-danger" onclick="Divers._confirmBulkMargin()">Appliquer à tout le catalogue</button>
      </div>
    `);
  }

  function _updateBulkMarginLabel() {
    const slider = document.getElementById('bulk-margin-slider');
    const label = document.getElementById('bulk-margin-label');
    if (slider && label) label.textContent = (parseInt(slider.value) || 0) + '%';
  }

  async function _confirmBulkMargin() {
    const slider = document.getElementById('bulk-margin-slider');
    const marginPct = parseInt(slider?.value) || 0;
    Utils.confirm(`Appliquer ${marginPct}% de marge à TOUS les produits du catalogue ? Cette action écrase la marge individuelle de chaque produit.`, async () => {
      const products = await DB.getAll('catalogue');
      for (const p of products) {
        const buyPrice = p.buyPrice || 0;
        const sellPrice = buyPrice ? Math.round(buyPrice * (1 + marginPct/100) * 100) / 100 : (p.sellPrice || 0);
        await DB.put('catalogue', { ...p, marginPct, sellPrice });
      }
      Utils.closeModals();
      Utils.toast(`✅ Marge de ${marginPct}% appliquée à ${products.length} produit${products.length>1?'s':''}`);
    });
  }

  async function exportData() {
    const data = await DB.exportAll();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apex-backup-${Utils.today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    Utils.toast('✅ Export téléchargé');
  }

  // Bug 4 fix: validate JSON + warn if backup is older than today
  async function importData(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const knownStores = ['orders','medocs','catalogue','clients','mood','todos','finances','protocoles','workout_program','settings'];
        const hasValidKey = Object.keys(data).some(k => knownStores.includes(k));
        if (!hasValidKey || typeof data !== 'object' || Array.isArray(data)) {
          Utils.toast('⚠️ Fichier invalide — ce n\'est pas un export APEX');
          return;
        }
        // Detect backup date from filename and warn if older than today
        const match = file.name.match(/(\d{4}-\d{2}-\d{2})/);
        const backupDate = match ? match[1] : null;
        const todayStr = Utils.today();
        const warnOld = backupDate && backupDate < todayStr;
        const msg = warnOld
          ? `⚠️ Ce backup date du ${backupDate}. Importer peut écraser des données plus récentes. Continuer quand même ?`
          : '⚠️ Les enregistrements avec le même ID seront écrasés. Continuer ?';
        Utils.confirm(msg, async () => {
          await DB.importAll(data);
          Utils.toast('✅ Import réussi — rechargement...');
          setTimeout(() => location.reload(), 1500);
        });
      } catch (err) {
        Utils.toast('⚠️ Erreur : fichier JSON invalide');
      }
    };
    reader.readAsText(file);
    input.value = '';
  }


  async function openVault() {
    const container = document.getElementById('divers-sub-content');
    container.innerHTML = '<div id="vault-main-container"></div>';
    await Vault.render(document.getElementById('vault-main-container'));
  }

  async function openNotifs() {
    const container = document.getElementById('divers-sub-content');
    container.innerHTML = '<div id="notif-settings-container"></div>';
    await Notifs.renderSettings(document.getElementById('notif-settings-container'));
  }

  async function openWeight() {
    document.getElementById('divers-sub-content').innerHTML = '';
    await Weight.render(document.getElementById('divers-sub-content'));
  }

  async function openRecap() {
    document.getElementById('divers-sub-content').innerHTML = '';
    await Recap.render(document.getElementById('divers-sub-content'), 0);
  }

  return { init, render, openMood, openProgram, openVault, openNotifs, openWeight, openRecap, _saveGoal, _saveProgram, _changeCycleLen, _setAnchor, openSettings, _confirmImport, _saveSupplierTemplate, _renderMoodCriteriaEditor, _addMoodCriteria, _updateMoodCriteria, _removeMoodCriteria, _saveMoodCriteria, exportData, importData, _openBulkMargin, _updateBulkMarginLabel, _confirmBulkMargin };
})();
