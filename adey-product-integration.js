// adey-product-integration.js
// Add to adey-product.html before </body>:
// <script src="adey-api.js"></script>
// <script src="adey-product-integration.js"></script>

(async function initProductPage() {

  // ── Get slug from URL ────────────────────────────────────────
  const params = new URLSearchParams(location.search);
  const slug   = params.get('slug');
  if (!slug) { location.href = 'adey-shop.html'; return; }

  // ── Load product ─────────────────────────────────────────────
  let product, related;

  try {
    const res  = await ADEY_API.products.get(slug);
    product    = res.product;
    related    = res.related || [];
  } catch (err) {
    document.querySelector('.product-main').innerHTML = `
      <div style="grid-column:1/-1;padding:80px 40px;text-align:center;">
        <div style="font-size:3rem;margin-bottom:16px;">😕</div>
        <div style="font-family:'Clash Display',sans-serif;font-size:1.4rem;color:var(--white);margin-bottom:8px;">Product not found</div>
        <a href="adey-shop.html" style="color:var(--gold);">← Back to Shop</a>
      </div>`;
    return;
  }

  // ── Update page title & breadcrumb ───────────────────────────
  document.title = `ADEY — ${product.name}`;
  const breadcrumbItems = document.querySelectorAll('.breadcrumb a');
  if (breadcrumbItems.length >= 3) {
    breadcrumbItems[2].textContent = product.category?.name || 'Category';
    breadcrumbItems[2].href = `adey-shop.html?category=${product.category?.slug}`;
  }
  const breadcrumbSpan = document.querySelector('.breadcrumb span');
  if (breadcrumbSpan) breadcrumbSpan.textContent = product.name;

  // ── Update product info ───────────────────────────────────────
  const setEl = (sel, val, prop = 'textContent') => {
    const el = document.querySelector(sel);
    if (el) el[prop] = val;
  };

  setEl('.pi-cat', product.category?.name || '');
  setEl('.pi-sku', `SKU: ${product.sku}`);
  setEl('.pi-title', product.name);
  setEl('.rating-score', product.rating?.toFixed(1) || '0');
  setEl('.rating-count', `${product.reviewCount || 0} reviews`);
  setEl('.verified-badge', `✅ ${(product.soldCount || 0).toLocaleString()}+ sold`);

  // Price
  const priceMain = document.querySelector('.price-main');
  const priceOld  = document.querySelector('.price-old');
  const priceSave = document.querySelector('.price-save');
  if (priceMain) priceMain.textContent = ADEY_API.ui.naira(product.sellingPrice);
  if (priceOld && product.comparePrice) {
    priceOld.textContent = ADEY_API.ui.naira(product.comparePrice);
    const saved = product.comparePrice - product.sellingPrice;
    if (priceSave) priceSave.textContent = `Save ${ADEY_API.ui.naira(saved)}`;
  }

  // Stock
  const available   = product.stockQty - product.reservedQty;
  const stockText   = document.getElementById('stockText');
  const stockFill   = document.querySelector('.stock-fill');
  if (stockText) {
    if (available <= 0)  stockText.textContent = '✕ Out of stock';
    else if (available <= 5) { stockText.textContent = `⚠ Only ${available} left — order soon`; stockText.className = 'stock-text low'; }
    else { stockText.textContent = `✓ ${available} in stock`; stockText.className = 'stock-text ok'; }
  }
  if (stockFill) {
    const pct = Math.min(100, Math.round((available / Math.max(product.stockQty, 1)) * 100));
    stockFill.style.width = pct + '%';
  }

  // Availability badge on image
  const imgBadges = document.querySelector('.img-badges');
  if (imgBadges && product.availability !== 'IN_STOCK') {
    const badgeMap = {
      LOW_STOCK:   ['⚠ Low Stock', 'ibadge-sale'],
      IN_TRANSIT:  ['🚢 In Transit', 'ibadge-transit'],
      PRE_ORDER:   ['⏳ Pre-Order', 'ibadge-sale'],
      OUT_OF_STOCK:['✕ Out of Stock', 'ibadge-sale'],
    };
    const [label, cls] = badgeMap[product.availability] || [];
    if (label) {
      imgBadges.innerHTML = `<span class="img-badge ${cls}">${label}</span>`;
    }
  }

  // Discount circle
  if (product.comparePrice) {
    const disc = Math.round((1 - product.sellingPrice / product.comparePrice) * 100);
    const discEl = document.querySelector('.discount-circle');
    if (discEl && disc >= 5) discEl.textContent = `${disc}%\nOFF`;
    else if (discEl) discEl.style.display = 'none';
  }

  // Product image
  const mainEmoji = document.getElementById('mainEmoji');
  if (mainEmoji && product.images?.[0]) {
    const img = document.createElement('img');
    img.src = product.images[0];
    img.alt = product.name;
    img.style.cssText = 'width:80%;height:80%;object-fit:contain;position:relative;z-index:1;';
    mainEmoji.replaceWith(img);
  }

  // Update CTA button text based on availability
  const cartBtn  = document.getElementById('addCartBtn');
  const ctaLabel = {
    IN_STOCK:    '🛒 Add to Cart',
    LOW_STOCK:   '🛒 Add to Cart',
    IN_TRANSIT:  '⏳ Pre-Order',
    PRE_ORDER:   '⏳ Reserve Now',
    OUT_OF_STOCK:'🔔 Notify Me',
  }[product.availability] || '🛒 Add to Cart';
  if (cartBtn) cartBtn.innerHTML = ctaLabel;
  if (product.availability === 'OUT_OF_STOCK' && cartBtn) {
    cartBtn.style.background = 'var(--ink3)';
    cartBtn.style.color = 'var(--soft)';
  }

  // ── Variants ─────────────────────────────────────────────────
  if (product.variants?.length) {
    // Group by variant name
    const groups = product.variants.reduce((acc, v) => {
      if (!acc[v.name]) acc[v.name] = [];
      acc[v.name].push(v);
      return acc;
    }, {});

    const optGroups = document.querySelectorAll('.option-group');
    Object.entries(groups).forEach(([name, vals], i) => {
      const group = optGroups[i];
      if (!group) return;
      const labelEl = group.querySelector('.option-label');
      if (labelEl) labelEl.childNodes[0].textContent = name + ': ';

      const optsEl = group.querySelector('.variant-opts, .color-opts');
      if (optsEl) {
        optsEl.innerHTML = vals.map((v, vi) => `
          <button class="variant-opt ${vi === 0 ? 'active' : ''} ${v.stockQty === 0 ? 'out' : ''}"
                  data-variant='${JSON.stringify(v)}'
                  onclick="selectVariant(this,'${name}')">
            ${v.value}${v.priceAdj ? ` (+${ADEY_API.ui.naira(v.priceAdj)})` : ''}
          </button>`).join('');
      }
    });
  }

  window.selectVariant = (btn, name) => {
    btn.closest('.variant-opts, .color-opts').querySelectorAll('.variant-opt, .color-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const v = JSON.parse(btn.dataset.variant || '{}');
    const labelEl = btn.closest('.option-group')?.querySelector('.option-selected');
    if (labelEl) labelEl.textContent = v.value || '';
    // Update price if variant has adj
    if (v.priceAdj && priceMain) {
      priceMain.textContent = ADEY_API.ui.naira(product.sellingPrice + v.priceAdj);
    }
  };

  // ── Add to Cart ──────────────────────────────────────────────
  let qty = 1;
  window.addToCart = async () => {
    if (product.availability === 'OUT_OF_STOCK') {
      ADEY_API.ui.toast('Notify Me feature coming soon!', 'info');
      return;
    }
    const btn = document.getElementById('addCartBtn');
    ADEY_API.ui.btnLoading(btn, 'Adding…');

    // Get selected variant
    const activeVariant = document.querySelector('.variant-opt.active, .color-opt.active');
    const variantData   = activeVariant?.dataset?.variant ? JSON.parse(activeVariant.dataset.variant) : null;

    ADEY_API.addToCart(product, variantData, qty);
    ADEY_API.ui.syncCartBadge();

    setTimeout(() => {
      btn.innerHTML = '✓ Added to Cart!';
      btn.classList.add('added');
      setTimeout(() => {
        btn.innerHTML = ctaLabel;
        btn.classList.remove('added');
        btn.disabled = false;
      }, 2000);
    }, 400);

    ADEY_API.ui.toast(`${product.name} added to cart`, 'success');
  };

  // Qty controls
  window.changeQty = (delta) => {
    qty = Math.max(1, Math.min(available || 10, qty + delta));
    const qtyInput = document.getElementById('qtyInput');
    if (qtyInput) qtyInput.value = qty;
  };

  // Wishlist
  window.toggleWish = async () => {
    if (!ADEY_API.isLoggedIn()) {
      ADEY_API.ui.toast('Sign in to save to wishlist', 'info');
      setTimeout(() => location.href = 'adey-auth.html', 1200);
      return;
    }
    const btn = document.getElementById('wishBtn');
    const wished = btn.classList.contains('active');
    try {
      if (wished) { await ADEY_API.wishlist.remove(product.id); btn.classList.remove('active'); btn.textContent = '♡'; }
      else         { await ADEY_API.wishlist.add(product.id);    btn.classList.add('active');    btn.textContent = '♥'; btn.style.color = '#E84B1A'; }
    } catch (err) { ADEY_API.ui.toast(err.message, 'error'); }
  };

  // Buy now
  window.buyNow = async () => {
    if (!ADEY_API.isLoggedIn()) { location.href = 'adey-auth.html?next=' + encodeURIComponent(location.href); return; }
    await addToCart();
    location.href = 'adey-cart-checkout.html';
  };

  // ── Reviews ──────────────────────────────────────────────────
  if (product.reviews?.length) {
    const reviewsList = document.querySelector('.reviews-list');
    if (reviewsList) {
      reviewsList.innerHTML = product.reviews.map(r => `
        <div class="review-card">
          <div class="rv-header">
            <div class="rv-user">
              <div class="rv-avatar">${r.authorName.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}</div>
              <div>
                <div class="rv-name">${r.authorName}</div>
                <div class="rv-date">${new Date(r.createdAt).toLocaleDateString('en-NG', { year:'numeric', month:'long', day:'numeric' })}</div>
              </div>
            </div>
            <div>
              <div class="rv-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
              ${r.isVerified ? '<div class="rv-verified">✅ Verified Purchase</div>' : ''}
            </div>
          </div>
          ${r.title ? `<div class="rv-title">${r.title}</div>` : ''}
          <div class="rv-body">${r.body}</div>
        </div>`).join('');
    }

    // Update summary rating
    const bigScore = document.querySelector('.big-score');
    const bigSub   = document.querySelector('.big-sub');
    if (bigScore) bigScore.textContent = (product.rating || 0).toFixed(1);
    if (bigSub) bigSub.textContent = `${product.reviewCount || 0} verified reviews`;
  }

  // ── Related products ─────────────────────────────────────────
  if (related.length) {
    const relatedGrid = document.querySelector('.related-grid');
    if (relatedGrid) {
      relatedGrid.innerHTML = related.slice(0, 4).map(p => `
        <div class="rc" onclick="location.href='adey-product.html?slug=${p.slug}'">
          <div class="rc-img">${p.images?.[0] ? `<img src="${p.images[0]}" style="width:75%;height:75%;object-fit:contain;"/>` : p.category?.icon || '📦'}
            <div class="rc-actions"><button class="rca" onclick="event.stopPropagation();ADEY_API.addToCart(${JSON.stringify(p)},null,1);ADEY_API.ui.syncCartBadge();ADEY_API.ui.toast('Added to cart','success');this.textContent='✓ Added';this.style.background='#00BFA5';this.style.color='#fff'">Add to Cart</button></div>
          </div>
          <div class="rc-body">
            <div class="rc-cat">${p.category?.name || ''}</div>
            <div class="rc-name">${p.name}</div>
            <div><span class="rc-price">${ADEY_API.ui.naira(p.sellingPrice)}</span>${p.comparePrice ? `<span class="rc-old">${ADEY_API.ui.naira(p.comparePrice)}</span>` : ''}</div>
          </div>
        </div>`).join('');
    }
  }

  // ── Check if already wishlisted ──────────────────────────────
  if (ADEY_API.isLoggedIn()) {
    try {
      const wl = await ADEY_API.wishlist.get();
      const wished = wl.some(w => w.productId === product.id);
      const wishBtn = document.getElementById('wishBtn');
      if (wishBtn && wished) { wishBtn.classList.add('active'); wishBtn.textContent = '♥'; wishBtn.style.color = '#E84B1A'; }
    } catch {}
  }

})();
