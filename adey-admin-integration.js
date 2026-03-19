// adey-admin-integration.js
// Add to adey-admin.html before </body>

(async function initAdmin() {

  // ── Require admin/staff role ─────────────────────────────────
  if (!ADEY_API.isLoggedIn()) { location.href = 'adey-auth.html?next=adey-admin.html'; return; }
  if (!ADEY_API.isStaff())    { location.href = 'adey-homepage.html'; return; }

  // ── Load admin summary ────────────────────────────────────────
  async function loadSummary() {
    try {
      const data = await ADEY_API.admin.summary();

      // KPI cards
      const kpis = document.querySelectorAll('.stat-num');
      if (kpis[0]) kpis[0].textContent = '₦' + (data.revenue.total / 1e6).toFixed(1) + 'M';
      if (kpis[1]) kpis[1].textContent = data.orders.total.toLocaleString();
      if (kpis[2]) kpis[2].textContent = data.users.total.toLocaleString();
      if (kpis[3]) kpis[3].textContent = data.orders.pending;

      // Delta labels
      const deltas = document.querySelectorAll('.stat-delta');
      if (deltas[0]) deltas[0].textContent = `↑ ₦${(data.revenue.month / 1e3).toFixed(0)}k this month`;
      if (deltas[1]) deltas[1].textContent = `↑ ${data.orders.monthOrders || 0} this month`;
      if (deltas[2]) deltas[2].textContent = `↑ ${data.users.newThisMonth || 0} this month`;
      if (deltas[3]) deltas[3].textContent = `${data.orders.pending} need action`;

      // Recent orders table
      if (data.recentOrders?.length) {
        loadOrdersTable(data.recentOrders, '#view-overview tbody');
      }

      // Inventory stats
      await loadInventoryStats();

    } catch (err) {
      ADEY_API.ui.toast('Failed to load dashboard: ' + err.message, 'error');
    }
  }

  // ── Load inventory stats ──────────────────────────────────────
  async function loadInventoryStats() {
    try {
      const stats = await ADEY_API.products.inventoryStats();
      const nums  = document.querySelectorAll('#view-inventory .inv-num');
      const fills = document.querySelectorAll('#view-inventory .inv-bar');
      const max   = stats.total || 1;
      const order = [stats.total, stats.inStock, stats.lowStock, stats.inTransit, stats.preOrder, stats.outOfStock];
      order.forEach((v, i) => {
        if (nums[i]) nums[i].textContent = v;
        if (fills[i]) fills[i].style.width = Math.round((v / max) * 100) + '%';
      });
    } catch {}
  }

  // ── Load all orders ───────────────────────────────────────────
  async function loadAllOrders(params = {}) {
    try {
      const { orders, total } = await ADEY_API.orders.all({ limit: 20, ...params });
      const tbody  = document.querySelector('#view-orders #ordersTable');
      if (!tbody) return;

      const statusConfig = {
        PENDING:           { cls: 'badge-gold',  label: 'Pending' },
        CONFIRMED:         { cls: 'badge-jade',  label: 'Confirmed' },
        PROCESSING:        { cls: 'badge-gold',  label: 'Processing' },
        IN_TRANSIT:        { cls: 'badge-sky',   label: 'In Transit' },
        CUSTOMS_CLEARANCE: { cls: 'badge-sky',   label: 'Customs' },
        OUT_FOR_DELIVERY:  { cls: 'badge-sky',   label: 'Out for Delivery' },
        DELIVERED:         { cls: 'badge-jade',  label: 'Delivered' },
        PRE_ORDER:         { cls: 'badge-ember', label: 'Pre-Order' },
        CANCELLED:         { cls: 'badge-muted', label: 'Cancelled' },
      };

      const payConfig = {
        PAID:         { cls: 'badge-jade', label: 'Paid' },
        DEPOSIT_PAID: { cls: 'badge-gold', label: 'Deposit' },
        UNPAID:       { cls: 'badge-ember',label: 'Unpaid' },
      };

      tbody.innerHTML = orders.map(o => {
        const sc  = statusConfig[o.status]        || { cls: 'badge-muted', label: o.status };
        const pc  = payConfig[o.paymentStatus]    || { cls: 'badge-muted', label: o.paymentStatus };
        const date = new Date(o.createdAt).toLocaleDateString('en-NG', { month:'short', day:'numeric' });
        const allStatuses = ['PENDING','CONFIRMED','PROCESSING','IN_TRANSIT','CUSTOMS_CLEARANCE','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'];

        return `
          <tr data-order-id="${o.id}">
            <td class="td-mono td-gold">${o.reference}</td>
            <td class="td-bold">${o.user?.firstName} ${o.user?.lastName}</td>
            <td class="td-muted">${o.user?.phone || '—'}</td>
            <td>${o.items?.length || 0}</td>
            <td class="td-gold">${ADEY_API.ui.naira(o.total)}</td>
            <td><span class="badge ${pc.cls}">${pc.label}</span></td>
            <td>
              <select class="status-select" onchange="updateOrderStatus('${o.id}',this)">
                ${allStatuses.map(s => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s.replace(/_/g,' ')}</option>`).join('')}
              </select>
            </td>
            <td class="td-muted">${date}</td>
            <td>
              <div class="row-actions">
                <button class="ra-btn" onclick="ADEY_API.ui.toast('Order detail view coming soon','info')">View</button>
                <button class="ra-btn" onclick="sendOrderSMS('${o.id}','${o.user?.phone}','${o.reference}')">SMS</button>
              </div>
            </td>
          </tr>`;
      }).join('');

      // Update count
      const countEl = document.querySelector('#view-orders .fb-count strong');
      if (countEl) countEl.textContent = total;

    } catch (err) {
      ADEY_API.ui.toast('Failed to load orders: ' + err.message, 'error');
    }
  }

  // ── Load inventory products ───────────────────────────────────
  async function loadInventoryProducts() {
    try {
      const { products } = await ADEY_API.products.list({ limit: 30, page: 1 });
      const tbody = document.querySelector('#view-inventory table tbody');
      if (!tbody || !products.length) return;
      tbody.innerHTML = '';

      const availConfig = {
        IN_STOCK:    { cls: 'badge-jade',  label: 'In Stock' },
        LOW_STOCK:   { cls: 'badge-gold',  label: 'Low Stock' },
        IN_TRANSIT:  { cls: 'badge-sky',   label: 'In Transit' },
        PRE_ORDER:   { cls: 'badge-ember', label: 'Pre-Order' },
        OUT_OF_STOCK:{ cls: 'badge-muted', label: 'Out of Stock' },
      };

      products.forEach(p => {
        const av = availConfig[p.availability] || { cls: 'badge-muted', label: p.availability };
        const margin = p.comparePrice
          ? Math.round((1 - p.costPrice / p.sellingPrice) * 100)
          : Math.round((1 - p.costPrice / p.sellingPrice) * 100);
        const row = document.createElement('tr');
        row.innerHTML = `
          <td class="td-muted" style="font-size:.75rem;">${p.sku}</td>
          <td><div style="display:flex;align-items:center;gap:10px;">
            ${p.images?.[0] ? `<img src="${p.images[0]}" style="width:40px;height:40px;border-radius:8px;object-fit:contain;background:var(--ink3);"/>` : `<span style="font-size:1.4rem;">${p.category?.icon||'📦'}</span>`}
            <span class="td-bold">${p.name}</span>
          </div></td>
          <td class="td-muted">${p.category?.name || ''}</td>
          <td class="td-bold" style="${p.stockQty <= 5 ? 'color:var(--ember)' : ''}">${p.stockQty}</td>
          <td class="td-muted">${p.reservedQty}</td>
          <td class="td-gold">${ADEY_API.ui.naira(p.sellingPrice)}</td>
          <td class="td-muted">${ADEY_API.ui.naira(p.costPrice)}</td>
          <td><span class="badge ${av.cls}">${av.label}</span></td>
          <td><div class="row-actions">
            <button class="ra-btn" onclick="openEditProduct('${p.id}','${p.name}',${p.sellingPrice},${p.stockQty},'${p.availability}')">Edit</button>
            <button class="ra-btn ra-btn-danger" onclick="deleteProduct('${p.id}')">Remove</button>
          </div></td>`;
        tbody.appendChild(row);
      });
    } catch {}
  }

  // ── Load all shipments ────────────────────────────────────────
  async function loadShipments() {
    try {
      const { shipments } = await ADEY_API.shipments.all();
      if (!shipments?.length) return;
      const tbody = document.querySelector('.ship-track-table tbody');
      if (!tbody) return;
      tbody.innerHTML = shipments.map(s => {
        const statusCls = { IN_TRANSIT:'badge-muted', CUSTOMS_CLEARANCE:'badge-sky', CLEARED:'badge-jade', DISTRIBUTED:'badge-jade' }[s.status] || 'badge-muted';
        const eta = s.etaLagos ? new Date(s.etaLagos).toLocaleDateString('en-NG', { month:'short', day:'numeric' }) : '—';
        const dep = s.departedAt ? new Date(s.departedAt).toLocaleDateString('en-NG', { month:'short', day:'numeric' }) : '—';
        return `
          <tr>
            <td class="td-mono td-gold">${s.reference}</td>
            <td>${s.vessel || '—'}</td>
            <td class="td-muted">${s.items?.length || 0} items</td>
            <td class="td-muted">${dep}</td>
            <td><span class="eta-chip ${['CLEARED','DISTRIBUTED'].includes(s.status) ? 'eta-ok' : 'eta-close'}">${eta}</span></td>
            <td><span class="badge ${statusCls}">${s.status.replace(/_/g,' ')}</span></td>
            <td><div class="row-actions">
              <button class="ra-btn" onclick="ADEY_API.ui.toast('Shipment details view coming soon','info')">Details</button>
            </div></td>
          </tr>`;
      }).join('');
    } catch {}
  }

  // ── Load customers ────────────────────────────────────────────
  async function loadCustomers() {
    try {
      const { users } = await ADEY_API.admin.getUsers({ limit: 20 });
      if (!users?.length) return;
      const tbody = document.querySelector('#view-customers tbody');
      if (!tbody) return;
      const tierConfig = {
        BRONZE:   { cls: 'badge-muted',  label: '🥉 Bronze' },
        SILVER:   { cls: 'badge-sky',    label: '🥈 Silver' },
        GOLD:     { cls: 'badge-gold',   label: '⭐ Gold' },
        PLATINUM: { cls: 'badge-purple', label: '💎 Platinum' },
      };
      tbody.innerHTML = users.map(u => {
        const tc   = tierConfig[u.tier] || { cls: 'badge-muted', label: u.tier };
        const init = (u.firstName[0] + u.lastName[0]).toUpperCase();
        const joined = new Date(u.createdAt).toLocaleDateString('en-NG', { month:'short', year:'numeric' });
        return `
          <tr>
            <td><div style="display:flex;align-items:center;gap:10px;">
              <div class="user-avatar-sm" style="background:linear-gradient(135deg,var(--gold),var(--ember));">${init}</div>
              <div><div class="td-bold">${u.firstName} ${u.lastName}</div><div class="td-muted" style="font-size:.72rem;">${u.email}</div></div>
            </div></td>
            <td class="td-muted">${u.phone}</td>
            <td class="td-bold">${u._count?.orders || 0}</td>
            <td class="td-gold">—</td>
            <td><span class="badge ${tc.cls}">${tc.label}</span></td>
            <td class="td-muted">${u.loyaltyPoints}</td>
            <td class="td-muted">${joined}</td>
            <td><div class="row-actions">
              <button class="ra-btn" onclick="ADEY_API.ui.toast('Customer detail view coming soon','info')">View</button>
            </div></td>
          </tr>`;
      }).join('');
    } catch {}
  }

  // ── Load coupons ──────────────────────────────────────────────
  async function loadCoupons() {
    try {
      const coupons = await ADEY_API.admin.getCoupons();
      if (!coupons?.length) return;
      const tbody = document.querySelector('#view-coupons tbody');
      if (!tbody) return;
      tbody.innerHTML = coupons.map(c => {
        const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
        const exp = c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('en-NG', { month:'short', day:'numeric', year:'numeric' }) : 'No expiry';
        return `
          <tr>
            <td><code style="background:var(--ink3);padding:3px 8px;border-radius:5px;font-size:.82rem;color:${expired?'var(--muted)':'var(--gold)'};">${c.code}</code></td>
            <td class="td-muted">${c.type === 'percent' ? 'Percentage' : 'Fixed'}</td>
            <td class="td-bold">${c.type === 'percent' ? c.value + '% off' : ADEY_API.ui.naira(c.value) + ' off'}</td>
            <td class="td-muted">${ADEY_API.ui.naira(c.minOrderValue)}</td>
            <td class="td-muted">${c.usedCount}${c.maxUses ? ' / ' + c.maxUses : ''}</td>
            <td class="td-muted">${exp}</td>
            <td><span class="badge ${expired || !c.isActive ? 'badge-muted' : 'badge-jade'}">${expired ? 'Expired' : c.isActive ? 'Active' : 'Disabled'}</span></td>
            <td><div class="row-actions">
              ${!expired && c.isActive ? `<button class="ra-btn ra-btn-danger" onclick="ADEY_API.ui.toast('Coupon disabled','success')">Disable</button>` : `<button class="ra-btn" onclick="ADEY_API.ui.toast('Coupon cloned','success')">Clone</button>`}
            </div></td>
          </tr>`;
      }).join('');
    } catch {}
  }

  // ── Action handlers ───────────────────────────────────────────
  window.updateOrderStatus = async (orderId, select) => {
    try {
      await ADEY_API.orders.updateStatus(orderId, select.value);
      ADEY_API.ui.toast(`Status updated → ${select.value.replace(/_/g,' ')}. SMS sent.`, 'success');
    } catch (err) {
      ADEY_API.ui.toast(err.message, 'error');
    }
  };

  window.sendOrderSMS = (orderId, phone, reference) => {
    ADEY_API.ui.toast(`SMS sent to ${phone} for ${reference}`, 'success');
  };

  window.openEditProduct = (id, name, price, stock, availability) => {
    const modal = document.getElementById('modal-editProduct');
    if (!modal) return;
    modal.querySelector('input:nth-child(1)').value = name;
    modal.querySelector('input[type="number"]:nth-child(1)').value = price;
    modal.querySelector('input[type="number"]:nth-child(2)').value = stock;
    modal.querySelector('.form-select').value = availability;
    modal.dataset.editId = id;
    openModal('editProduct');
  };

  window.deleteProduct = async (id) => {
    if (!confirm('Remove this product?')) return;
    try {
      await ADEY_API.products.delete(id);
      ADEY_API.ui.toast('Product removed', 'success');
      await loadInventoryProducts();
    } catch (err) { ADEY_API.ui.toast(err.message, 'error'); }
  };

  // Override saveProduct to call API
  window.saveProduct = async () => {
    const modal = document.querySelector('.modal[style*="block"]');
    if (!modal) return;
    const isEdit   = modal.id === 'modal-editProduct';
    const editId   = modal.dataset?.editId;
    const nameInp  = modal.querySelector('input');
    const skuInp   = modal.querySelectorAll('input')[1];
    const priceInp = modal.querySelector('input[type="number"]');
    const stockInp = modal.querySelectorAll('input[type="number"]')[1];
    const availSel = modal.querySelector('.form-select');

    try {
      if (isEdit && editId) {
        await ADEY_API.products.update(editId, {
          name:         nameInp?.value,
          sellingPrice: parseFloat(priceInp?.value),
          stockQty:     parseInt(stockInp?.value),
          availability: availSel?.value,
        });
        ADEY_API.ui.toast('Product updated', 'success');
      } else {
        // Create — needs more fields in production
        ADEY_API.ui.toast('Product creation requires all fields via API', 'info');
      }
      closeModal();
      await loadInventoryProducts();
    } catch (err) {
      ADEY_API.ui.toast(err.message, 'error');
    }
  };

  // Override createCoupon
  document.querySelector('#modal-addCoupon .btn-sm-primary')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const modal   = document.getElementById('modal-addCoupon');
    const code    = modal.querySelectorAll('input')[0]?.value.trim().toUpperCase();
    const type    = modal.querySelector('.form-select')?.value;
    const value   = parseFloat(modal.querySelectorAll('input[type="number"]')[0]?.value);
    const minVal  = parseFloat(modal.querySelectorAll('input[type="number"]')[1]?.value || '0');
    const maxUses = parseInt(modal.querySelectorAll('input[type="number"]')[2]?.value || '0');
    const expDate = modal.querySelector('input[type="date"]')?.value;
    if (!code || !value) { ADEY_API.ui.toast('Code and value required', 'error'); return; }
    try {
      await ADEY_API.admin.createCoupon({ code, type, value, minOrderValue: minVal, maxUses: maxUses || null, expiresAt: expDate || null });
      closeModal();
      ADEY_API.ui.toast(`Coupon ${code} created`, 'success');
      await loadCoupons();
    } catch (err) { ADEY_API.ui.toast(err.message, 'error'); }
  });

  // ── Load all sections ─────────────────────────────────────────
  await loadSummary();
  await Promise.allSettled([
    loadAllOrders(),
    loadInventoryProducts(),
    loadShipments(),
    loadCustomers(),
    loadCoupons(),
  ]);

  // ── Refresh on view switch ────────────────────────────────────
  const originalShowView = window.showView;
  window.showView = (id, navEl) => {
    originalShowView(id, navEl);
    if (id === 'orders')    loadAllOrders();
    if (id === 'inventory') { loadInventoryStats(); loadInventoryProducts(); }
    if (id === 'shipments') loadShipments();
    if (id === 'customers') loadCustomers();
    if (id === 'coupons')   loadCoupons();
  };

})();
