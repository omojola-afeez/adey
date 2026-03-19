// adey-checkout-integration.js
// Add to adey-cart-checkout.html before </body>

(async function initCheckout() {

  // ── Populate cart from localStorage ─────────────────────────
  function renderCartItems() {
    const cart = ADEY_API.getCart();
    const panel = document.querySelector('.panel-body');
    const summaryItems = document.querySelector('.summary-items');
    if (!cart.length) return;

    // Clear existing placeholder items
    panel?.querySelectorAll('.cart-item').forEach(el => el.remove());

    let subtotal = 0;
    let totalOld = 0;

    cart.forEach((item, idx) => {
      const p = item.product;
      if (!p) return;
      const lineTotal = p.sellingPrice * item.quantity;
      subtotal += lineTotal;
      if (p.comparePrice) totalOld += p.comparePrice * item.quantity;

      const icon = p.images?.[0]
        ? `<img src="${p.images[0]}" style="width:100%;height:100%;object-fit:contain;" alt="${p.name}"/>`
        : (p.category?.icon || '📦');

      const statusIcon = {
        IN_STOCK:    'ci-badge-instock', LOW_STOCK:   'ci-badge-instock',
        IN_TRANSIT:  'ci-badge-transit', PRE_ORDER:   'ci-badge-po',
      }[p.availability] || 'ci-badge-instock';

      const statusLabel = { IN_STOCK:'✓', LOW_STOCK:'✓', IN_TRANSIT:'🚢', PRE_ORDER:'PO' }[p.availability] || '✓';

      // Cart item row
      const row = document.createElement('div');
      row.className = 'cart-item'; row.id = `liveItem${idx}`;
      row.innerHTML = `
        <div class="ci-img" style="font-size:${p.images?.[0]?'1rem':'2rem'};">
          ${icon}
          <span class="ci-badge ${statusIcon}">${statusLabel}</span>
        </div>
        <div class="ci-info">
          <div class="ci-cat">${p.category?.name || ''}</div>
          <div class="ci-name">${p.name}</div>
          <div class="ci-meta">${item.variant ? `<span>${item.variant.name}: ${item.variant.value}</span>` : ''}</div>
          <div class="ci-qty">
            <button class="ciq-btn" onclick="liveQty('${item.key}',${idx},-1)">−</button>
            <input class="ciq-num" id="liveQ${idx}" value="${item.quantity}" readonly/>
            <button class="ciq-btn" onclick="liveQty('${item.key}',${idx},1)">+</button>
          </div>
        </div>
        <div class="ci-right">
          <div>
            <div class="ci-price" id="liveP${idx}">${ADEY_API.ui.naira(lineTotal)}</div>
            ${p.comparePrice ? `<div class="ci-old">${ADEY_API.ui.naira(p.comparePrice * item.quantity)}</div>` : ''}
          </div>
          <button class="ci-remove" onclick="liveRemove('${item.key}',${lineTotal})">🗑 Remove</button>
        </div>`;
      panel?.appendChild(row);

      // Summary item
      if (summaryItems) {
        const si = document.createElement('div');
        si.className = 'si-row';
        si.innerHTML = `
          <div class="si-img" style="font-size:${p.images?.[0]?'1rem':'1.5rem'};">
            ${icon}<span class="si-qty" id="siQ${idx}">${item.quantity}</span>
          </div>
          <div class="si-info">
            <div class="si-name">${p.name}</div>
            <div class="si-variant">${item.variant ? `${item.variant.name}: ${item.variant.value}` : 'Standard'}</div>
          </div>
          <div class="si-price" id="siP${idx}">${ADEY_API.ui.naira(lineTotal)}</div>`;
        summaryItems.appendChild(si);
      }
    });

    updateTotals(subtotal, totalOld);
  }

  function updateTotals(subtotal, totalOld) {
    const savings    = Math.max(0, totalOld - subtotal);
    const delivery   = currentDeliveryFee;
    const couponOff  = couponApplied ? Math.round(subtotal * 0.1) : 0;
    const total      = subtotal - couponOff + delivery;

    document.getElementById('subtotalVal') && (document.getElementById('subtotalVal').textContent = ADEY_API.ui.naira(subtotal));
    document.getElementById('savingsVal')  && (document.getElementById('savingsVal').textContent  = '−' + ADEY_API.ui.naira(savings));
    document.getElementById('couponVal')   && (document.getElementById('couponVal').textContent   = '−' + ADEY_API.ui.naira(couponOff));
    document.getElementById('deliveryVal') && (document.getElementById('deliveryVal').textContent = delivery === 0 ? 'FREE' : ADEY_API.ui.naira(delivery));
    document.getElementById('totalVal')    && (document.getElementById('totalVal').textContent    = ADEY_API.ui.naira(total));
    document.getElementById('pageSub')     && (document.getElementById('pageSub').textContent     = `${ADEY_API.getCartCount()} items · ${ADEY_API.ui.naira(subtotal)}`);
    document.getElementById('transferAmt') && (document.getElementById('transferAmt').textContent = ADEY_API.ui.naira(total));
    window._currentTotal = total;
  }

  // ── Live qty / remove ────────────────────────────────────────
  let currentDeliveryFee = 1500;
  let couponApplied      = false;

  window.liveQty = (key, idx, delta) => {
    ADEY_API.updateCartQty(key, Math.max(1, ADEY_API.getCart().find(i => i.key === key)?.quantity + delta || 1));
    const cart = ADEY_API.getCart();
    const item = cart.find(i => i.key === key);
    if (!item) return;
    const lineTotal = item.product.sellingPrice * item.quantity;
    document.getElementById(`liveQ${idx}`) && (document.getElementById(`liveQ${idx}`).value = item.quantity);
    document.getElementById(`siQ${idx}`)   && (document.getElementById(`siQ${idx}`).textContent = item.quantity);
    document.getElementById(`liveP${idx}`) && (document.getElementById(`liveP${idx}`).textContent = ADEY_API.ui.naira(lineTotal));
    document.getElementById(`siP${idx}`)   && (document.getElementById(`siP${idx}`).textContent = ADEY_API.ui.naira(lineTotal));
    const all = ADEY_API.getCart().reduce((s,i) => s + i.product.sellingPrice * i.quantity, 0);
    const allOld = ADEY_API.getCart().reduce((s,i) => s + (i.product.comparePrice||i.product.sellingPrice) * i.quantity, 0);
    updateTotals(all, allOld);
  };

  window.liveRemove = (key, price) => {
    const row = document.querySelectorAll('.cart-item');
    row.forEach(r => {
      const btn = r.querySelector(`[onclick*="${key}"]`);
      if (btn) { r.style.opacity='0'; r.style.transform='translateX(20px)'; r.style.transition='opacity .3s,transform .3s,max-height .4s'; setTimeout(()=>r.remove(),300); }
    });
    ADEY_API.removeFromCart(key);
    const cart = ADEY_API.getCart();
    const sub  = cart.reduce((s,i) => s + i.product.sellingPrice * i.quantity, 0);
    const old  = cart.reduce((s,i) => s + (i.product.comparePrice||i.product.sellingPrice) * i.quantity, 0);
    updateTotals(sub, old);
  };

  // ── Delivery selection ───────────────────────────────────────
  document.querySelectorAll('.del-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.del-opt').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const priceText = opt.querySelector('.del-opt-price')?.textContent;
      if (priceText === 'FREE') currentDeliveryFee = 0;
      else if (priceText?.includes('From')) currentDeliveryFee = 2500;
      else currentDeliveryFee = parseInt((priceText||'').replace(/[^\d]/g,'')) || 0;
      const cart = ADEY_API.getCart();
      const sub = cart.reduce((s,i) => s + i.product.sellingPrice * i.quantity, 0);
      const old = cart.reduce((s,i) => s + (i.product.comparePrice||i.product.sellingPrice) * i.quantity, 0);
      updateTotals(sub, old);
    });
  });

  // ── Coupon ───────────────────────────────────────────────────
  window.applyCoupon = async () => {
    const code = document.getElementById('couponInput')?.value.trim().toUpperCase();
    if (!code) return;
    try {
      // In production: call backend to validate. Here we use known codes.
      const valid = ['ADEY10', 'WELCOME5K'];
      if (valid.includes(code)) {
        couponApplied = true;
        const couponRow = document.getElementById('couponRow');
        if (couponRow) couponRow.style.display = 'flex';
        const btn = document.querySelector('.coupon-btn');
        if (btn) { btn.textContent = '✓ Applied'; btn.style.color = 'var(--jade)'; btn.style.borderColor = 'var(--jade)'; }
        const inp = document.getElementById('couponInput');
        if (inp) { inp.disabled = true; }
        const cart = ADEY_API.getCart();
        const sub = cart.reduce((s,i) => s + i.product.sellingPrice * i.quantity, 0);
        const old = cart.reduce((s,i) => s + (i.product.comparePrice||i.product.sellingPrice) * i.quantity, 0);
        updateTotals(sub, old);
        ADEY_API.ui.toast(`Coupon ${code} applied — 10% off!`, 'success');
      } else {
        ADEY_API.ui.toast('Invalid coupon code', 'error');
      }
    } catch (err) { ADEY_API.ui.toast(err.message, 'error'); }
  };

  // ── Proceed to checkout ──────────────────────────────────────
  window.goToCheckout = () => {
    if (!ADEY_API.isLoggedIn()) {
      ADEY_API.ui.toast('Sign in to checkout', 'info');
      setTimeout(() => location.href = 'adey-auth.html?next=adey-cart-checkout.html', 1200);
      return;
    }
    // Switch to checkout form view
    document.getElementById('cartView').style.display = 'none';
    document.getElementById('checkoutView').style.display = 'block';
    document.getElementById('pageTitle').textContent = 'Checkout';

    // Pre-fill user info
    const u = ADEY_API.getUser();
    if (u) {
      const fn = document.getElementById('fname'); if (fn) fn.value = u.firstName;
      const ln = document.getElementById('lname'); if (ln) ln.value = u.lastName;
      const ph = document.getElementById('phone'); if (ph) ph.value = u.phone;
      const em = document.getElementById('email'); if (em) em.value = u.email;
    }

    // Pre-fill saved address
    if (ADEY_API.isLoggedIn()) {
      ADEY_API.user.getAddresses().then(addrs => {
        const def = addrs.find(a => a.isDefault) || addrs[0];
        if (def) {
          const addrEl = document.getElementById('address'); if (addrEl) addrEl.value = def.street;
          const cityEl = document.getElementById('city');    if (cityEl) cityEl.value = def.city;
          const stateEl = document.getElementById('state');  if (stateEl) stateEl.value = def.state;
        }
      }).catch(() => {});
    }

    // Update CTA
    const btn = document.getElementById('checkoutBtn');
    if (btn) { btn.textContent = 'Place Order →'; btn.onclick = validateAndPay; }
    document.getElementById('step2Item')?.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Validate and initiate payment ────────────────────────────
  window.validateAndPay = async () => {
    const fname   = document.getElementById('fname')?.value.trim();
    const phone   = document.getElementById('phone')?.value.trim();
    const address = document.getElementById('address')?.value.trim();

    let valid = true;
    [['fname','fnameField'],['phone','phoneField'],['address','addressField']].forEach(([id, fid]) => {
      const inp = document.getElementById(id);
      if (inp && !inp.value.trim()) {
        inp.classList.add('error');
        valid = false;
      } else if (inp) {
        inp.classList.remove('error');
      }
    });

    if (!valid) {
      ADEY_API.ui.toast('Please fill in all required fields', 'error');
      return;
    }

    const btn = document.getElementById('checkoutBtn');
    ADEY_API.ui.btnLoading(btn, 'Placing order…');

    try {
      const cart = ADEY_API.getCart();
      if (!cart.length) { ADEY_API.ui.toast('Your cart is empty', 'error'); return; }

      // 1. Create order
      const orderItems = cart.map(i => ({
        productId:   i.product.id,
        variantInfo: i.variant || null,
        quantity:    i.quantity,
      }));

      const deliveryMethod = document.querySelector('.del-opt.selected')?.querySelector('.del-opt-title')?.textContent?.toUpperCase().replace(/\s+/g,'_') || 'STANDARD';

      const order = await ADEY_API.orders.create({
        items:          orderItems,
        deliveryMethod: deliveryMethod === 'FREE_PICK-UP' ? 'PICKUP' : 'STANDARD',
        deliveryFee:    currentDeliveryFee,
        couponCode:     couponApplied ? document.getElementById('couponInput')?.value.trim() : undefined,
        notes:          '',
      });

      ADEY_API.ui.toast('Order created! Opening payment…', 'success');

      // 2. Initiate Paystack payment
      const payData = await ADEY_API.payments.initiate(order.reference);

      // 3. Redirect to Paystack
      if (payData.authorizationUrl) {
        // Store order ref for verification on return
        sessionStorage.setItem('adey_pending_order', order.reference);
        window.location.href = payData.authorizationUrl;
      } else {
        throw new Error('Payment URL not received');
      }

    } catch (err) {
      ADEY_API.ui.toast(err.message, 'error');
      ADEY_API.ui.btnDone(btn);
    }
  };

  // ── Handle payment return (verify on page load) ──────────────
  const urlParams    = new URLSearchParams(location.search);
  const paystackRef  = urlParams.get('reference') || urlParams.get('trxref');
  const pendingOrder = sessionStorage.getItem('adey_pending_order');

  if (paystackRef && pendingOrder) {
    try {
      await ADEY_API.payments.verify(paystackRef);
      ADEY_API.clearCart();
      sessionStorage.removeItem('adey_pending_order');
      // Show success screen
      document.getElementById('mainLayout')?.style && (document.getElementById('mainLayout').style.display = 'none');
      document.getElementById('pageTop')?.style && (document.getElementById('pageTop').style.display = 'none');
      const successScreen = document.getElementById('successScreen');
      if (successScreen) {
        successScreen.classList.add('active');
        const refEl = successScreen.querySelector('.or-value');
        if (refEl) refEl.textContent = '#' + pendingOrder;
      }
    } catch (err) {
      ADEY_API.ui.toast('Payment verification failed: ' + err.message, 'error');
    }
  }

  // ── Initialise ───────────────────────────────────────────────
  renderCartItems();

})();
