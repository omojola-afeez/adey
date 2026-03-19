// adey-dashboard-integration.js
// Add to adey-dashboard.html before </body>

(async function initDashboard() {

  // ── Require login ────────────────────────────────────────────
  if (!ADEY_API.ui.requireAuth()) return;
  const currentUser = ADEY_API.getUser();

  // ── Update user info in sidebar ──────────────────────────────
  function updateUserInfo(user) {
    const initials = (user.firstName[0] + user.lastName[0]).toUpperCase();
    document.querySelectorAll('.user-avatar').forEach(el => el.textContent = initials);
    document.querySelectorAll('.user-name').forEach(el => el.textContent = `${user.firstName} ${user.lastName}`);
    document.querySelectorAll('.user-email').forEach(el => el.textContent = user.email);
    const tierMap = { BRONZE:'🥉 Bronze', SILVER:'🥈 Silver', GOLD:'⭐ Gold', PLATINUM:'💎 Platinum' };
    document.querySelectorAll('.user-tier').forEach(el => el.textContent = tierMap[user.tier] || user.tier);
    document.querySelector('.section-title') && (document.querySelector('.section-title').textContent = `Good afternoon, ${user.firstName} 👋`);
  }

  updateUserInfo(currentUser);

  // ── Load fresh user profile ──────────────────────────────────
  try {
    const me = await ADEY_API.auth.me();
    updateUserInfo(me);
    // Update loyalty points
    const loyaltyEl = document.querySelector('.lc-points');
    if (loyaltyEl) loyaltyEl.textContent = (me.loyaltyPoints || 0).toLocaleString() + ' pts';
    const lbFill = document.querySelector('.lc-bar-fill');
    if (lbFill) {
      const pct = Math.min(100, Math.round((me.loyaltyPoints / 2000) * 100));
      lbFill.style.width = pct + '%';
    }
  } catch {}

  // ── Load stats ───────────────────────────────────────────────
  async function loadStats() {
    try {
      const { orders } = await ADEY_API.orders.mine({ limit: 100 });
      const total    = orders.length;
      const transit  = orders.filter(o => ['IN_TRANSIT','CUSTOMS_CLEARANCE','OUT_FOR_DELIVERY'].includes(o.status)).length;
      const totalSpend = orders.filter(o => o.paymentStatus === 'PAID').reduce((s, o) => s + o.total, 0);

      const statNums = document.querySelectorAll('.stat-num');
      if (statNums[0]) statNums[0].textContent = total;
      if (statNums[1]) statNums[1].textContent = transit;
    } catch {}
  }

  // ── Load recent orders ────────────────────────────────────────
  async function loadRecentOrders() {
    try {
      const { orders } = await ADEY_API.orders.mine({ limit: 4 });
      if (!orders.length) return;

      const container = document.querySelector('.recent-orders');
      if (!container) return;

      const statusConfig = {
        DELIVERED:    { cls: 'status-delivered',  label: 'Delivered' },
        IN_TRANSIT:   { cls: 'status-transit',     label: 'In Transit' },
        PROCESSING:   { cls: 'status-processing',  label: 'Processing' },
        PRE_ORDER:    { cls: 'status-preorder',     label: 'Pre-Order' },
        CONFIRMED:    { cls: 'status-confirmed',    label: 'Confirmed' },
        PENDING:      { cls: 'status-processing',  label: 'Pending' },
        CUSTOMS_CLEARANCE: { cls: 'status-transit', label: 'Customs' },
        OUT_FOR_DELIVERY:  { cls: 'status-transit', label: 'Out for Delivery' },
      };

      // Remove existing placeholder items
      container.querySelectorAll('.ro-item').forEach(el => el.remove());

      orders.forEach(order => {
        const item = order.items?.[0];
        const prodName = item?.product?.name || 'Product';
        const icon = item?.product?.images?.[0]
          ? `<img src="${item.product.images[0]}" style="width:100%;height:100%;object-fit:contain;"/>`
          : '📦';
        const sc = statusConfig[order.status] || { cls: 'status-processing', label: order.status };
        const date = new Date(order.createdAt).toLocaleDateString('en-NG', { month:'short', day:'numeric' });

        const row = document.createElement('div');
        row.className = 'ro-item';
        row.innerHTML = `
          <div class="ro-img" style="${item?.product?.images?.[0]?'font-size:.1rem;':'font-size:1.5rem;'}">${icon}</div>
          <div class="ro-info">
            <div class="ro-name">${prodName}${order.items?.length > 1 ? ` +${order.items.length - 1} more` : ''}</div>
            <div class="ro-meta">${date} · ${order.reference}</div>
          </div>
          <div class="ro-right">
            <div class="ro-price">${ADEY_API.ui.naira(order.total)}</div>
            <div class="ro-status ${sc.cls}">${sc.label}</div>
          </div>`;
        container.appendChild(row);
      });
    } catch {}
  }

  // ── Load full orders list ────────────────────────────────────
  async function loadOrdersList() {
    try {
      const { orders } = await ADEY_API.orders.mine({ limit: 20 });
      const container = document.getElementById('view-orders');
      if (!container || !orders.length) return;

      const existing = container.querySelectorAll('.order-card');
      existing.forEach(e => e.remove());

      orders.forEach(order => {
        const sc = {
          DELIVERED:    { cls: 'status-delivered',  label: 'Delivered' },
          IN_TRANSIT:   { cls: 'status-transit',     label: 'In Transit' },
          PROCESSING:   { cls: 'status-processing',  label: 'Processing' },
          PRE_ORDER:    { cls: 'status-preorder',     label: 'Pre-Order' },
          CONFIRMED:    { cls: 'status-confirmed',    label: 'Confirmed' },
          PENDING:      { cls: 'status-processing',  label: 'Pending' },
        }[order.status] || { cls: 'status-processing', label: order.status };

        const date = new Date(order.createdAt).toLocaleDateString('en-NG', { year:'numeric', month:'long', day:'numeric' });

        const card = document.createElement('div');
        card.className = 'order-card';
        card.innerHTML = `
          <div class="oc-header">
            <div><div class="oc-ref">${order.reference}</div><div class="oc-date">${date}</div></div>
            <span class="ro-status ${sc.cls}">${sc.label}</span>
          </div>
          <div class="oc-body">
            <div class="oc-items">
              ${(order.items || []).slice(0,2).map(i => `
                <div class="oc-item">
                  <div class="oc-img">${i.product?.images?.[0] ? `<img src="${i.product.images[0]}" style="width:100%;height:100%;object-fit:contain;"/>` : '📦'}</div>
                  <div class="oc-name">${i.product?.name || 'Product'}<div class="oc-qty">Qty: ${i.quantity}</div></div>
                  <div class="oc-itemprice">${ADEY_API.ui.naira(i.totalPrice)}</div>
                </div>`).join('')}
            </div>
            <div class="oc-footer">
              <div class="oc-total">Total: <span>${ADEY_API.ui.naira(order.total)}</span></div>
              <div class="oc-actions">
                <button class="oc-btn oc-btn-outline" onclick="trackOrder('${order.reference}')">Track</button>
                ${order.status === 'DELIVERED' ? `<button class="oc-btn oc-btn-filled" onclick="location.href='adey-shop.html'">Reorder</button>` : ''}
                ${order.status === 'PENDING'   ? `<button class="oc-btn oc-btn-danger">Cancel</button>` : ''}
              </div>
            </div>
          </div>`;
        container.appendChild(card);
      });
    } catch {}
  }

  // ── Shipment tracking ─────────────────────────────────────────
  window.trackOrder = async (reference) => {
    showView('tracking', null);
    const inp = document.getElementById('trackInputField');
    if (inp) inp.value = reference;
    await doTrack();
  };

  window.doTrack = async () => {
    const ref = document.getElementById('trackInputField')?.value.trim();
    if (!ref) return;

    const card = document.getElementById('trackDetailCard');
    if (card) card.style.opacity = '.5';

    try {
      const { order, timeline } = await ADEY_API.orders.track(ref);
      if (card) card.style.opacity = '1';

      // Update reference display
      card?.querySelector('.tdc-ref') && (card.querySelector('.tdc-ref').textContent = order.reference);

      // Update timeline
      const tlContainer = card?.querySelector('.timeline');
      if (tlContainer && timeline) {
        tlContainer.innerHTML = timeline.map((step, i) => {
          const isDone   = step.done;
          const isActive = !step.done && timeline[i-1]?.done;
          const time = step.time ? new Date(step.time).toLocaleString('en-NG', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : 'Pending';
          const icons = ['📋','💳','🏭','🚢','🛃','🚚','🏠'];
          return `
            <div class="tl-item ${isDone ? 'done' : isActive ? 'active' : ''}">
              <div class="tl-dot">${isDone ? '✅' : icons[i] || '⬡'}</div>
              <div class="tl-body">
                <div class="tl-title">${step.stage}</div>
                <div class="tl-time">${isDone || isActive ? time : 'Awaiting previous step'}</div>
              </div>
            </div>`;
        }).join('');
      }

      // Update status chip
      const chip = card?.querySelector('.tdc-chips');
      if (chip) {
        chip.innerHTML = `
          <span class="tdc-chip chip-sky">📦 ${order.status?.replace(/_/g,' ')}</span>
          ${order.deliveredAt ? `<span class="tdc-chip chip-jade">✅ Delivered</span>` : `<span class="tdc-chip chip-gold">⏱ ${ADEY_API.ui.naira(order.total)}</span>`}`;
      }

    } catch (err) {
      ADEY_API.ui.toast('Order not found: ' + ref, 'error');
      if (card) card.style.opacity = '1';
    }
  };

  // ── Load wishlist ─────────────────────────────────────────────
  async function loadWishlist() {
    try {
      const items = await ADEY_API.wishlist.get();
      const grid  = document.querySelector('.wishlist-grid');
      if (!grid || !items.length) return;
      grid.innerHTML = '';

      items.forEach(w => {
        const p   = w.product;
        const avail = { IN_STOCK: null, LOW_STOCK: 'Low Stock', IN_TRANSIT: 'In Transit', PRE_ORDER: 'Pre-Order' }[p.availability];
        const card = document.createElement('div');
        card.className = 'wl-card';
        card.innerHTML = `
          <div class="wl-img">
            ${p.images?.[0] ? `<img src="${p.images[0]}" style="width:70%;height:70%;object-fit:contain;"/>` : p.category?.icon || '📦'}
            <button class="wl-remove" onclick="removeWish('${p.id}',this)">✕</button>
            ${avail ? `<span class="wl-badge badge-new" style="position:absolute;top:10px;left:10px;padding:3px 9px;border-radius:100px;font-size:.62rem;font-weight:700;background:rgba(26,143,209,.18);color:var(--sky);border:1px solid rgba(26,143,209,.3);">${avail}</span>` : ''}
          </div>
          <div class="wl-body">
            <div class="wl-cat">${p.category?.name || ''}</div>
            <div class="wl-name">${p.name}</div>
            <div class="wl-footer">
              <span class="wl-price">${ADEY_API.ui.naira(p.sellingPrice)}</span>
              <button class="wl-btn" onclick="addFromWish('${p.id}',${JSON.stringify(p).replace(/"/g,'&quot;')},this)">
                ${p.availability === 'IN_TRANSIT' || p.availability === 'PRE_ORDER' ? 'Pre-Order' : 'Add to Cart'}
              </button>
            </div>
          </div>`;
        grid.appendChild(card);
      });

    } catch {}
  }

  window.removeWish = async (productId, btn) => {
    const card = btn.closest('.wl-card');
    card.style.opacity='0'; card.style.transform='scale(.9)'; card.style.transition='all .3s';
    try {
      await ADEY_API.wishlist.remove(productId);
      setTimeout(() => card.remove(), 300);
      ADEY_API.ui.toast('Removed from wishlist', 'success');
    } catch (err) {
      card.style.opacity='1'; card.style.transform='';
      ADEY_API.ui.toast(err.message, 'error');
    }
  };

  window.addFromWish = (productId, product, btn) => {
    ADEY_API.addToCart(product, null, 1);
    ADEY_API.ui.syncCartBadge();
    btn.textContent = '✓ Added'; btn.style.background = '#00BFA5'; btn.style.color = '#fff';
    setTimeout(() => { btn.textContent = 'Add to Cart'; btn.style.background = ''; btn.style.color = ''; }, 1800);
    ADEY_API.ui.toast('Added to cart', 'success');
  };

  // ── Load notifications ────────────────────────────────────────
  async function loadNotifications() {
    try {
      const notifs = await ADEY_API.user.getNotifications();
      const feed   = document.querySelector('.notif-feed');
      if (!feed || !notifs.length) return;

      feed.innerHTML = notifs.slice(0, 10).map(n => {
        const iconMap = { order_update:'📦', shipment:'🚢', promo:'🔥', system:'ℹ️' };
        const time = new Date(n.createdAt).toLocaleDateString('en-NG', { month:'short', day:'numeric' });
        return `
          <div class="nf-item ${n.isRead ? '' : 'unread'}">
            <div class="nf-dot ${n.isRead ? 'read' : ''}"></div>
            <div class="nf-icon">${iconMap[n.type] || '🔔'}</div>
            <div class="nf-body">
              <div class="nf-text">${n.body}</div>
              <div class="nf-time">${time}</div>
            </div>
          </div>`;
      }).join('');

      // Update nav badge
      const unread = notifs.filter(n => !n.isRead).length;
      document.querySelectorAll('.nav-badge').forEach((b, i) => {
        if (i === 4) b.textContent = unread || ''; // notifications nav item
      });
    } catch {}
  }

  // ── Profile editing ──────────────────────────────────────────
  window.saveEdit = async (cardId) => {
    const card = document.getElementById(cardId);
    const firstName = card.querySelector('#regFirst, input[value="Emeka"]')?.value || currentUser.firstName;
    const lastName  = card.querySelector('#regLast,  input[value="Okafor"]')?.value || currentUser.lastName;
    const phone     = card.querySelector('input[type="tel"]')?.value || currentUser.phone;

    try {
      await ADEY_API.user.updateProfile({ firstName, lastName, phone });
      ADEY_API.ui.toast('Profile updated', 'success');
      card.classList.remove('edit-mode');
      const saveRow = card.querySelector('[id$="Save"]');
      if (saveRow) saveRow.style.display = 'none';
      card.querySelector('.pc-edit') && (card.querySelector('.pc-edit').textContent = '✏️ Edit');
      // Update visible values
      card.querySelectorAll('.pfield').forEach(f => {
        const inp = f.querySelector('.pfield-input');
        const val = f.querySelector('.pfield-val');
        if (inp && val) val.textContent = inp.value;
      });
    } catch (err) {
      ADEY_API.ui.toast(err.message, 'error');
    }
  };

  // ── Mark all notifications read ──────────────────────────────
  window.markAllRead = async () => {
    try {
      await ADEY_API.user.markNotifsRead();
      document.querySelectorAll('.nf-item').forEach(n => {
        n.classList.remove('unread');
        n.querySelector('.nf-dot')?.classList.add('read');
      });
      ADEY_API.ui.toast('All notifications marked as read', 'success');
    } catch {}
  };

  // ── Load addresses ────────────────────────────────────────────
  async function loadAddresses() {
    try {
      const addrs   = await ADEY_API.user.getAddresses();
      const list    = document.querySelector('.address-list');
      if (!list || !addrs.length) return;
      list.innerHTML = addrs.map(a => `
        <div class="addr-item ${a.isDefault ? 'default' : ''}">
          ${a.isDefault ? '<div class="addr-default-badge">⭐ Default Address</div>' : ''}
          <div class="addr-name">${ADEY_API.getUser()?.firstName} ${ADEY_API.getUser()?.lastName}</div>
          <div class="addr-text">${a.street}<br/>${a.city}, ${a.state}${a.landmark ? ' · ' + a.landmark : ''}</div>
          <div class="addr-actions">
            <button class="addr-btn">Edit</button>
            <button class="addr-btn">Set Default</button>
            ${!a.isDefault ? `<button class="addr-btn" style="color:var(--ember);" onclick="deleteAddr('${a.id}',this)">Remove</button>` : ''}
          </div>
        </div>`).join('');
    } catch {}
  }

  window.deleteAddr = async (id, btn) => {
    const item = btn.closest('.addr-item');
    try {
      await ADEY_API.user.deleteAddress(id);
      item.style.opacity = '0'; item.style.transition = 'opacity .3s';
      setTimeout(() => item.remove(), 300);
      ADEY_API.ui.toast('Address removed', 'success');
    } catch (err) { ADEY_API.ui.toast(err.message, 'error'); }
  };

  // ── Logout ────────────────────────────────────────────────────
  document.querySelector('.logout-btn')?.addEventListener('click', async () => {
    await ADEY_API.auth.logout();
    location.href = 'adey-homepage.html';
  });

  // ── Load all data ─────────────────────────────────────────────
  await Promise.allSettled([
    loadStats(),
    loadRecentOrders(),
    loadOrdersList(),
    loadWishlist(),
    loadNotifications(),
    loadAddresses(),
  ]);

})();
