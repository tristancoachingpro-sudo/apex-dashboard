// ── PROTOCOLES MODULE ─────────────────────────────────────────
const Protocoles = (() => {
  async function init() {}

  async function render() {
    const protos = await DB.getAll('protocoles');
    const list = document.getElementById('protocoles-list');
    if (!list) return;
    if (!protos.length) {
      list.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-text">Aucun protocole</div>
        <div class="empty-state-sub">Crée ton premier protocole client</div>
      </div>`;
      return;
    }
    list.innerHTML = protos.map(p => {
      const weeks = p.weeks || [];
      const maxWeek = weeks.length;
      const productNames = [...new Set(weeks.flatMap(w => Object.keys(w.doses||{})))];
      return `<div class="proto-card" onclick="Protocoles.openDetail('${Utils.escAttr(p.id)}')">
        <div class="proto-top">
          <span class="proto-name">${p.name}</span>
          <span class="proto-duration">${maxWeek} sem.</span>
        </div>
        <div class="proto-products">
          ${productNames.slice(0,6).map(n => `<span class="proto-product-chip">${n}</span>`).join('')}
          ${productNames.length > 6 ? `<span class="proto-product-chip">+${productNames.length-6}</span>` : ''}
        </div>
        <div style="margin-top:12px;display:flex;gap:8px">
          <button class="btn-primary" style="font-size:12px;padding:8px 14px" onclick="event.stopPropagation();Protocoles.createOrderFromProto('${Utils.escAttr(p.id)}')">🛒 Créer commande</button>
          <button class="btn-secondary" style="font-size:12px;padding:8px 14px" onclick="event.stopPropagation();Protocoles.openEdit('${Utils.escAttr(p.id)}')">✏️ Modifier</button>
          <button class="btn-danger" style="font-size:12px;padding:8px 14px" onclick="event.stopPropagation();Protocoles._delete('${Utils.escAttr(p.id)}')">🗑</button>
        </div>
      </div>`;
    }).join('');
  }

  function openNew() { _openEditor(null); }
  async function openEdit(id) {
    const p = await DB.get('protocoles', id);
    _openEditor(p);
  }

  async function _openEditor(proto) {
    let numWeeks = proto ? Math.max(proto.weeks?.length || 4, 4) : 8;
    window._protoData = {
      name: proto?.name || '',
      notes: proto?.notes || '',
      weeks: proto?.weeks ? JSON.parse(JSON.stringify(proto.weeks)) : Array.from({length: numWeeks}, () => ({doses: {}})),
      productRows: proto?._productRows || [],
    };

    const existingProds = new Set();
    window._protoData.weeks.forEach(w => Object.keys(w.doses||{}).forEach(k => existingProds.add(k)));
    window._protoData.productRows = [...existingProds];

    Utils.modal(`
      <div class="modal-title">${proto ? 'Modifier protocole' : 'Nouveau protocole'}</div>
      <div class="form-group">
        <label class="form-label">NOM *</label>
        <input class="form-input" id="proto-name" value="${Utils.escAttr(proto?.name||'')}" placeholder="Ex: Cycle Testo 12 semaines">
      </div>

      <div class="form-group" style="display:flex;align-items:center;gap:12px">
        <label class="form-label" style="margin:0;white-space:nowrap">SEMAINES :</label>
        <input class="form-input" id="proto-numweeks" type="number" min="1" max="28" value="${numWeeks}"
          style="width:70px" onchange="Protocoles._resizeWeeks(this.value)">
        <span style="font-size:12px;color:var(--text-muted)">(max 28)</span>
      </div>

      <div class="form-group">
        <label class="form-label">PRODUITS DANS LE PROTOCOLE</label>
        <button class="btn-primary" onclick="Protocoles._openProductPicker()" style="width:100%;padding:12px;font-size:14px">🔍 Ajouter un produit du catalogue</button>
        <input class="form-input" id="proto-prod-custom" placeholder="Ou nom personnalisé" style="margin-top:8px">
        <button class="btn-secondary" style="width:100%;margin-top:6px;font-size:12px" onclick="Protocoles._addCustomRow()">+ Ajouter nom personnalisé</button>
      </div>

      <div id="proto-table-container" style="overflow-x:auto;margin-bottom:16px;-webkit-overflow-scrolling:touch"></div>

      <div class="form-group">
        <label class="form-label">NOTES</label>
        <textarea class="form-textarea" id="proto-notes" placeholder="Description...">${Utils.escAttr(proto?.notes||'')}</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="Utils.closeModals()">Annuler</button>
        <button class="btn-primary" onclick="Protocoles._save('${Utils.escAttr(proto?.id||'')}')">Sauvegarder</button>
      </div>
    `);
    _renderProtoTable();
  }

  function _resizeWeeks(n) {
    n = Math.max(1, Math.min(28, parseInt(n)||1));
    const current = window._protoData.weeks.length;
    if (n > current) {
      for (let i = current; i < n; i++) window._protoData.weeks.push({doses: {}});
    } else {
      window._protoData.weeks = window._protoData.weeks.slice(0, n);
    }
    _renderProtoTable();
  }

  async function _openProductPicker() {
    const products = await DB.getAll('catalogue');
    await Tags.openProductPicker({
      title: 'Ajouter un produit',
      products,
      onSelect: (product) => {
        if (!window._protoData.productRows.includes(product.name)) {
          window._protoData.productRows.push(product.name);
        }
        _renderProtoTable();
      },
    });
  }

  function _addCustomRow() {
    const input = document.getElementById('proto-prod-custom');
    const val = input?.value.trim();
    if (!val) return;
    if (!window._protoData.productRows.includes(val)) {
      window._protoData.productRows.push(val);
    }
    if (input) input.value = '';
    _renderProtoTable();
  }

  function _renderProtoTable() {
    const container = document.getElementById('proto-table-container');
    if (!container) return;
    const { weeks, productRows } = window._protoData;

    if (!productRows.length) {
      container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:13px;background:var(--bg-elevated);border-radius:var(--radius-md)">Ajoute des produits pour créer le tableau</div>`;
      return;
    }

    // Bug 5 (UX): Better table with larger cells and bigger copy buttons
    let html = `<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">← Glisse horizontalement pour voir toutes les semaines</div>
    <table class="proto-table">
      <thead><tr>
        <th class="proto-th-prod">Produit</th>
        ${weeks.map((_, i) => `<th class="proto-th-week">S${i+1}</th>`).join('')}
        <th style="width:30px;background:var(--bg-elevated)"></th>
      </tr></thead>
      <tbody>`;

    productRows.forEach((prod, ri) => {
      html += `<tr>
        <td class="proto-td-prod">${prod}</td>
        ${weeks.map((w, wi) => {
          const val = w.doses?.[prod] || '';
          return `<td class="proto-td-cell">
            <div class="proto-cell-wrap">
              <input class="proto-cell-input" value="${Utils.escAttr(val)}"
                onchange="Protocoles._setCellValue(${ri},${wi},'${Utils.escAttr(prod)}',this.value)"
                placeholder="—">
              ${wi > 0 ? `<button class="proto-copy-prev" title="Copier S${wi}" onclick="Protocoles._copyPrev(${ri},${wi},'${Utils.escAttr(prod)}')">↑</button>` : ''}
            </div>
          </td>`;
        }).join('')}
        <td style="border-top:1px solid var(--border);padding:4px 6px">
          <button onclick="Protocoles._removeRow('${Utils.escAttr(prod)}')" style="color:var(--accent-red);font-size:18px;padding:4px 6px;line-height:1">×</button>
        </td>
      </tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  function _setCellValue(rowIdx, weekIdx, prod, val) {
    if (!window._protoData.weeks[weekIdx].doses) window._protoData.weeks[weekIdx].doses = {};
    window._protoData.weeks[weekIdx].doses[prod] = val;
  }

  function _copyPrev(rowIdx, weekIdx, prod) {
    if (weekIdx < 1) return;
    const prevVal = window._protoData.weeks[weekIdx-1]?.doses?.[prod] || '';
    if (!window._protoData.weeks[weekIdx].doses) window._protoData.weeks[weekIdx].doses = {};
    window._protoData.weeks[weekIdx].doses[prod] = prevVal;
    _renderProtoTable();
  }

  function _removeRow(prod) {
    window._protoData.productRows = window._protoData.productRows.filter(p => p !== prod);
    window._protoData.weeks.forEach(w => { if (w.doses) delete w.doses[prod]; });
    _renderProtoTable();
  }

  async function _save(existingId) {
    const name = document.getElementById('proto-name')?.value.trim();
    if (!name) { Utils.toast('⚠️ Nom requis'); return; }
    if (!window._protoData.productRows.length) { Utils.toast('⚠️ Ajoute au moins un produit'); return; }

    document.querySelectorAll('.proto-cell-input').forEach(input => {
      const row = input.closest('tr');
      const rowIdx = [...row.parentElement.children].indexOf(row);
      const prod = window._protoData.productRows[rowIdx];
      const colIdx = [...input.closest('td').parentElement.children].indexOf(input.closest('td')) - 1;
      if (prod && colIdx >= 0 && window._protoData.weeks[colIdx]) {
        if (!window._protoData.weeks[colIdx].doses) window._protoData.weeks[colIdx].doses = {};
        window._protoData.weeks[colIdx].doses[prod] = input.value;
      }
    });

    // Bug 7 fix: don't put undefined in createdAt
    const proto = {
      id: existingId || Utils.uid(),
      name,
      notes: document.getElementById('proto-notes')?.value.trim() || '',
      weeks: window._protoData.weeks,
      _productRows: window._protoData.productRows,
    };
    if (!existingId) proto.createdAt = Utils.today();

    await DB.put('protocoles', proto);
    Utils.closeModals();
    await render();
    Utils.toast(existingId ? '✅ Protocole modifié' : '✅ Protocole créé');
  }

  async function openDetail(id) {
    const p = await DB.get('protocoles', id);
    if (!p) return;
    const productRows = p._productRows || [];
    const weeks = p.weeks || [];

    Utils.modal(`
      <div class="modal-title">${p.name}</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">${weeks.length} semaines · ${productRows.length} produits</div>

      <div style="overflow-x:auto;margin-bottom:16px;-webkit-overflow-scrolling:touch">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">← Glisse horizontalement</div>
        <table class="proto-table">
          <thead><tr>
            <th class="proto-th-prod">Produit</th>
            ${weeks.map((_,i) => `<th class="proto-th-week">S${i+1}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${productRows.map(prod => `<tr>
              <td class="proto-td-prod">${prod}</td>
              ${weeks.map(w => `<td class="proto-td-cell proto-td-cell--view">${w.doses?.[prod] || '—'}</td>`).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>

      ${p.notes ? `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">${p.notes}</div>` : ''}

      <div class="modal-actions">
        <button class="btn-danger" onclick="Protocoles._delete('${Utils.escAttr(id)}')">Supprimer</button>
        <button class="btn-secondary" onclick="Utils.closeModals();Protocoles.openEdit('${Utils.escAttr(id)}')">Modifier</button>
        <button class="btn-primary" onclick="Utils.closeModals();Protocoles.createOrderFromProto('${Utils.escAttr(id)}')">🛒 Commande</button>
      </div>
    `);
  }

  async function createOrderFromProto(id) {
    const p = await DB.get('protocoles', id);
    if (!p) return;
    const products = await DB.getAll('catalogue');
    const productRows = p._productRows || [];
    const weeks = p.weeks || [];

    // Calcul mg totaux par produit
    const totals = {};
    productRows.forEach(prod => {
      let total = 0;
      weeks.forEach(w => {
        const val = w.doses?.[prod];
        if (val) {
          const match = String(val).match(/(\d+(?:\.\d+)?)/);
          if (match) total += parseFloat(match[1]);
        }
      });
      totals[prod] = total;
    });

    const prefill = [];
    let summaryRows = '';

    productRows.forEach(prod => {
      const catProd = products.find(cp =>
        cp.name.toLowerCase().includes(prod.toLowerCase()) ||
        prod.toLowerCase().includes(cp.name.toLowerCase())
      );
      const totalMg = totals[prod] || 0;
      const mgTotal = catProd?.mgTotal || catProd?.mgPerUnit || 0;
      let qty = 1;
      let calcDetail = '';

      if (mgTotal > 0 && totalMg > 0) {
        const exact = totalMg / mgTotal;
        qty = Math.ceil(exact);
        calcDetail = totalMg + 'mg ÷ ' + mgTotal + 'mg/boîte = ' + exact.toFixed(2) + ' → <strong>' + qty + ' boîte' + (qty>1?'s':'') + '</strong>';
      } else if (totalMg > 0) {
        calcDetail = totalMg + 'mg total — <span style="color:var(--accent-gold)">mg/boîte non renseigné dans le catalogue</span>';
      } else {
        calcDetail = '<span style="color:var(--text-muted)">Aucune dose renseignée</span>';
      }

      summaryRows += '<div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:12px;margin-bottom:8px">' +
        '<div style="font-size:13px;font-weight:700;margin-bottom:4px">' + prod + '</div>' +
        '<div style="font-size:12px;color:var(--text-muted)">' + calcDetail + '</div>' +
        '</div>';

      prefill.push({
        productId: catProd?.id || '',
        name: prod,
        brand: catProd?.brand || '',
        sellPrice: catProd ? (catProd.sellOverride || Math.round(catProd.buyPrice * (1 + (catProd.marginPct||50)/100) * 100)/100) : 0,
        buyPrice: catProd?.buyPrice || 0,
        qty: Math.max(1, qty),
      });
    });

    const prefillJson = JSON.stringify(prefill);
    Utils.modal(
      '<div class="modal-title">🛒 Récapitulatif protocole</div>' +
      '<div style="font-size:13px;color:var(--text-muted);margin-bottom:14px">' + weeks.length + ' semaines · calcul des quantités</div>' +
      summaryRows +
      '<div class="modal-actions">' +
      '<button class="btn-secondary" onclick="Utils.closeModals()">Annuler</button>' +
      '<button class="btn-primary" id="proto-order-btn">Créer la commande →</button>' +
      '</div>'
    );
    setTimeout(() => {
      const btn = document.getElementById('proto-order-btn');
      if (btn) btn.addEventListener('click', () => {
        window._protoPrefill = prefill;
        Utils.closeModals();
        App.goToBusiness('orders');
        setTimeout(() => Orders.openNew(window._protoPrefill), 100);
      });
    }, 50);
  }

  async function _delete(id) {
    Utils.confirm('Supprimer ce protocole ?', async () => {
      await DB.del('protocoles', id);
      Utils.closeModals();
      await render();
      Utils.toast('🗑 Supprimé');
    });
  }

  return { init, render, openNew, openEdit, openDetail, createOrderFromProto, _openProductPicker, _addCustomRow, _resizeWeeks, _renderProtoTable, _setCellValue, _copyPrev, _removeRow, _save, _delete };
})();
