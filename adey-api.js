// ============================================================
//  adey-api.js  —  Shared API Client for all ADEY pages
//  Include this script in every HTML page:
//  <script src="adey-api.js"></script>
// ============================================================

const ADEY_API = (() => {

  // ── Config ─────────────────────────────────────────────────
  const BASE_URL = window.ADEY_BASE_URL || 'http://localhost:5000/api';

  // ── Token helpers ──────────────────────────────────────────
  const getToken   = ()        => localStorage.getItem('adey_access_token');
  const getRefresh = ()        => localStorage.getItem('adey_refresh_token');
  const setTokens  = (a, r)    => {
    localStorage.setItem('adey_access_token',  a);
    if (r) localStorage.setItem('adey_refresh_token', r);
  };
  const clearTokens = () => {
    localStorage.removeItem('adey_access_token');
    localStorage.removeItem('adey_refresh_token');
    localStorage.removeItem('adey_user');
  };

  // ── User helpers ───────────────────────────────────────────
  const getUser    = ()     => JSON.parse(localStorage.getItem('adey_user') || 'null');
  const setUser    = (u)    => localStorage.setItem('adey_user', JSON.stringify(u));
  const isLoggedIn = ()     => !!getToken();
  const isAdmin    = ()     => ['ADMIN','SUPERADMIN'].includes(getUser()?.role);
  const isStaff    = ()     => ['STAFF','ADMIN','SUPERADMIN'].includes(getUser()?.role);

  // ── Cart (localStorage) ────────────────────────────────────
  const getCart  = ()    => JSON.parse(localStorage.getItem('adey_cart') || '[]');
  const setCart  = (c)   => localStorage.setItem('adey_cart', JSON.stringify(c));
  const getCartCount = () => getCart().reduce((s, i) => s + i.quantity, 0);

  const addToCart = (product, variant, quantity = 1) => {
    const cart = getCart();
    const key  = `${product.id}_${JSON.stringify(variant)}`;
    const idx  = cart.findIndex(i => i.key === key);
    if (idx > -1) {
      cart[idx].quantity += quantity;
    } else {
      cart.push({ key, product, variant, quantity });
    }
    setCart(cart);
    _emit('cart:updated', getCartCount());
    return cart;
  };

  const removeFromCart = (key) => {
    setCart(getCart().filter(i => i.key !== key));
    _emit('cart:updated', getCartCount());
  };

  const updateCartQty = (key, qty) => {
    const cart = getCart().map(i => i.key === key ? { ...i, quantity: qty } : i);
    setCart(cart);
    _emit('cart:updated', getCartCount());
  };

  const clearCart = () => {
    setCart([]);
    _emit('cart:updated', 0);
  };

  // ── Event bus ──────────────────────────────────────────────
  const _listeners = {};
  const _emit = (event, data) => (_listeners[event] || []).forEach(fn => fn(data));
  const on    = (event, fn)   => {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
  };

  // ── Core fetch with auto token refresh ────────────────────
  let _refreshing = false;
  let _refreshQueue = [];

  const request = async (method, path, body, opts = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      ...opts,
    });

    // 401 → try token refresh once
    if (res.status === 401 && !opts._retry) {
      const refreshed = await _tryRefresh();
      if (refreshed) {
        return request(method, path, body, { ...opts, _retry: true });
      } else {
        clearTokens();
        _emit('auth:logout', null);
        throw new APIError('Session expired. Please sign in again.', 401);
      }
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new APIError(data.error || `Request failed (${res.status})`, res.status, data);
    }

    return data;
  };

  const _tryRefresh = async () => {
    const rt = getRefresh();
    if (!rt) return false;
    try {
      const data = await fetch(`${BASE_URL}/auth/refresh`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refreshToken: rt }),
      }).then(r => r.json());
      if (data.accessToken) {
        setTokens(data.accessToken, data.refreshToken);
        return true;
      }
    } catch {}
    return false;
  };

  const get    = (path, params) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request('GET', path + qs);
  };
  const post   = (path, body)   => request('POST',   path, body);
  const put    = (path, body)   => request('PUT',    path, body);
  const patch  = (path, body)   => request('PATCH',  path, body);
  const del    = (path)         => request('DELETE', path);

  // ── Custom error class ─────────────────────────────────────
  class APIError extends Error {
    constructor(message, status, data) {
      super(message);
      this.name   = 'APIError';
      this.status = status;
      this.data   = data;
    }
  }

  // ────────────────────────────────────────────────────────────
  //  AUTH
  // ────────────────────────────────────────────────────────────
  const auth = {

    async register({ firstName, lastName, email, phone, password }) {
      const data = await post('/auth/register', { firstName, lastName, email, phone, password });
      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
      _emit('auth:login', data.user);
      return data;
    },

    async login({ email, password }) {
      const data = await post('/auth/login', { email, password });
      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
      _emit('auth:login', data.user);
      return data;
    },

    async logout() {
      try { await post('/auth/logout', { refreshToken: getRefresh() }); } catch {}
      clearTokens();
      _emit('auth:logout', null);
    },

    async me() {
      const user = await get('/auth/me');
      setUser(user);
      return user;
    },

    isLoggedIn,
    isAdmin,
    isStaff,
    getUser,
  };

  // ────────────────────────────────────────────────────────────
  //  PRODUCTS
  // ────────────────────────────────────────────────────────────
  const products = {

    list(params = {}) {
      // params: { page, limit, category, search, minPrice, maxPrice,
      //           availability, sort, featured }
      return get('/products', params);
    },

    get(slug) {
      return get(`/products/${slug}`);
    },

    inventoryStats() {
      return get('/products/inventory');
    },

    create(data) {
      return post('/products', data);
    },

    update(id, data) {
      return patch(`/products/${id}`, data);
    },

    delete(id) {
      return del(`/products/${id}`);
    },
  };

  // ────────────────────────────────────────────────────────────
  //  ORDERS
  // ────────────────────────────────────────────────────────────
  const orders = {

    create(data) {
      // data: { items, addressId, deliveryMethod, deliveryFee, couponCode }
      return post('/orders', data);
    },

    mine(params = {}) {
      return get('/orders/mine', params);
    },

    get(reference) {
      return get(`/orders/${reference}`);
    },

    track(reference) {
      return get(`/shipments/track/${reference}`);
    },

    // Admin
    all(params = {}) {
      return get('/orders/all', params);
    },

    updateStatus(id, status) {
      return patch(`/orders/${id}/status`, { status });
    },

    revenueStats() {
      return get('/orders/stats');
    },
  };

  // ────────────────────────────────────────────────────────────
  //  PAYMENTS
  // ────────────────────────────────────────────────────────────
  const payments = {

    async initiate(orderReference, isDeposit = false) {
      const data = await post('/payments/initiate', { orderReference, isDeposit });
      // data.authorizationUrl → redirect to Paystack
      return data;
    },

    verify(reference) {
      return get(`/payments/verify/${reference}`);
    },
  };

  // ────────────────────────────────────────────────────────────
  //  SHIPMENTS
  // ────────────────────────────────────────────────────────────
  const shipments = {

    all(params = {}) {
      return get('/shipments', params);
    },

    create(data) {
      return post('/shipments', data);
    },

    updateStatus(id, status) {
      return patch(`/shipments/${id}/status`, { status });
    },

    track(orderRef) {
      return get(`/shipments/track/${orderRef}`);
    },
  };

  // ────────────────────────────────────────────────────────────
  //  WISHLIST
  // ────────────────────────────────────────────────────────────
  const wishlist = {
    get()            { return get('/wishlist'); },
    add(productId)   { return post(`/wishlist/${productId}`); },
    remove(productId){ return del(`/wishlist/${productId}`); },
  };

  // ────────────────────────────────────────────────────────────
  //  USER / ACCOUNT
  // ────────────────────────────────────────────────────────────
  const user = {
    updateProfile(data)  { return patch('/users/me', data); },
    getAddresses()       { return get('/users/addresses'); },
    addAddress(data)     { return post('/users/addresses', data); },
    deleteAddress(id)    { return del(`/users/addresses/${id}`); },
    getNotifications()   { return get('/users/notifications'); },
    markNotifsRead()     { return patch('/users/notifications/read'); },
  };

  // ────────────────────────────────────────────────────────────
  //  ADMIN
  // ────────────────────────────────────────────────────────────
  const admin = {
    summary()       { return get('/admin/summary'); },
    getCoupons()    { return get('/admin/coupons'); },
    createCoupon(d) { return post('/admin/coupons', d); },
    getUsers(p={})  { return get('/users', p); },
  };

  // ────────────────────────────────────────────────────────────
  //  UI HELPERS  (shared across pages)
  // ────────────────────────────────────────────────────────────
  const ui = {

    // Format ₦ currency
    naira(amount) {
      return '₦' + Number(amount).toLocaleString('en-NG');
    },

    // Show toast notification
    toast(message, type = 'success') {
      let el = document.getElementById('adey-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'adey-toast';
        el.style.cssText = `
          position:fixed; bottom:24px; right:24px; z-index:9999;
          background:#141A1F; border:1px solid #222D38; border-radius:12px;
          padding:14px 20px; display:flex; align-items:center; gap:10px;
          font-family:'Cabinet Grotesk',sans-serif; font-size:.88rem;
          color:#C8D8E4; box-shadow:0 8px 32px rgba(0,0,0,.5);
          transform:translateY(80px); opacity:0;
          transition:transform .3s,opacity .3s; max-width:340px;
          border-left:3px solid #F0A500;
        `;
        document.body.appendChild(el);
      }
      const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
      const colors = { success:'#00BFA5', error:'#E84B1A', info:'#1A8FD1', warning:'#F0A500' };
      el.style.borderLeftColor = colors[type] || colors.success;
      el.innerHTML = `<span>${icons[type]||'✅'}</span><span>${message}</span>`;
      el.style.transform = 'translateY(0)';
      el.style.opacity   = '1';
      clearTimeout(el._t);
      el._t = setTimeout(() => {
        el.style.transform = 'translateY(80px)';
        el.style.opacity   = '0';
      }, 3500);
    },

    // Show loading spinner on a button
    btnLoading(btn, text = 'Loading…') {
      btn._origText = btn.innerHTML;
      btn.innerHTML = `<span style="animation:spin .7s linear infinite;display:inline-block;">⟳</span> ${text}`;
      btn.disabled  = true;
    },

    btnDone(btn) {
      if (btn._origText) btn.innerHTML = btn._origText;
      btn.disabled = false;
    },

    // Render a product availability badge
    availBadge(availability) {
      const map = {
        IN_STOCK:    ['✓ In Stock',   'jade'],
        LOW_STOCK:   ['⚠ Low Stock',  'gold'],
        IN_TRANSIT:  ['🚢 In Transit','sky'],
        PRE_ORDER:   ['⏳ Pre-Order', 'ember'],
        OUT_OF_STOCK:['✕ Out of Stock','muted'],
      };
      const [label, color] = map[availability] || ['Unknown','muted'];
      const colors = { jade:'#00BFA5', gold:'#F0A500', sky:'#1A8FD1', ember:'#E84B1A', muted:'#4A6072' };
      return `<span style="color:${colors[color]};font-size:.75rem;font-weight:700;">${label}</span>`;
    },

    // Update all cart count badges on the page
    syncCartBadge() {
      const count = getCartCount();
      document.querySelectorAll('[data-cart-count]').forEach(el => {
        el.textContent = count;
        el.style.display = count > 0 ? 'flex' : 'none';
      });
    },

    // Redirect to login if not authenticated
    requireAuth(redirectBack = true) {
      if (!isLoggedIn()) {
        const back = redirectBack ? `?next=${encodeURIComponent(location.href)}` : '';
        location.href = `adey-auth.html${back}`;
        return false;
      }
      return true;
    },

    // Redirect to homepage if already logged in (for auth page)
    redirectIfLoggedIn() {
      if (isLoggedIn()) location.href = 'adey-dashboard.html';
    },

    // Require admin role
    requireAdmin() {
      if (!isAdmin()) {
        location.href = 'adey-homepage.html';
        return false;
      }
      return true;
    },

    // Build product card HTML
    productCard(product) {
      const badgeMap = {
        IN_STOCK:    ['', ''],
        LOW_STOCK:   ['⚠ Low Stock', 'gold'],
        IN_TRANSIT:  ['In Transit',  'transit'],
        PRE_ORDER:   ['Pre-Order',   'preorder'],
        OUT_OF_STOCK:['', ''],
      };
      const [badgeText, badgeClass] = badgeMap[product.availability] || ['', ''];
      const discount = product.comparePrice
        ? Math.round((1 - product.sellingPrice / product.comparePrice) * 100)
        : 0;
      const ctaText = {
        IN_STOCK:    'Add to Cart',
        LOW_STOCK:   'Add to Cart',
        IN_TRANSIT:  'Pre-Order',
        PRE_ORDER:   'Reserve Now',
        OUT_OF_STOCK:'Notify Me',
      }[product.availability] || 'Add to Cart';

      return `
        <div class="product-card" data-product-id="${product.id}" data-product-slug="${product.slug}">
          <div class="pc-img" onclick="location.href='adey-product.html?slug=${product.slug}'">
            ${product.images?.[0]
              ? `<img src="${product.images[0]}" alt="${product.name}" style="width:80%;height:80%;object-fit:contain;"/>`
              : `<span style="font-size:3.5rem;">${product.category?.icon || '📦'}</span>`
            }
            ${badgeText ? `<span class="pc-badge badge-${badgeClass}">${badgeText}</span>` : ''}
            ${discount >= 5 ? `<span class="pc-discount">${discount}%<br/>OFF</span>` : ''}
            <div class="pc-actions">
              <button class="pca-btn pca-main" onclick="event.stopPropagation();ADEY_API.cart.quickAdd('${product.id}',this)">${ctaText}</button>
              <button class="pca-btn pca-wish" onclick="event.stopPropagation();ADEY_API.cart.toggleWish('${product.id}',this)">♡</button>
            </div>
          </div>
          <div class="pc-body">
            <div class="pc-cat">${product.category?.name || ''}</div>
            <div class="pc-name" onclick="location.href='adey-product.html?slug=${product.slug}'">${product.name}</div>
            <div class="pc-rating-row">
              <span class="pc-stars">${'★'.repeat(Math.round(product.rating || 0))}${'☆'.repeat(5 - Math.round(product.rating || 0))}</span>
              <span class="pc-score">${(product.rating || 0).toFixed(1)}</span>
              <span class="pc-reviews">(${product.reviewCount || product.soldCount || 0})</span>
            </div>
            <div class="pc-footer">
              <div>
                <span class="pc-price">${this.naira(product.sellingPrice)}</span>
                ${product.comparePrice ? `<span class="pc-old">${this.naira(product.comparePrice)}</span>` : ''}
              </div>
              ${product.availability === 'LOW_STOCK'
                ? `<span class="pc-stock low">⚠ ${product.stockQty - product.reservedQty} left</span>`
                : product.availability === 'IN_TRANSIT'
                ? `<span class="pc-stock transit">🚢 ETA soon</span>`
                : `<span class="pc-stock">✓ In stock</span>`}
            </div>
          </div>
        </div>`;
    },

    // Render skeleton loader cards
    skeletonCards(count = 8) {
      return Array(count).fill(0).map(() => `
        <div class="product-card" style="pointer-events:none;">
          <div class="pc-img" style="background:linear-gradient(90deg,#1C2530 25%,#222D38 50%,#1C2530 75%);background-size:200%;animation:shimmer 1.5s infinite;"></div>
          <div class="pc-body">
            <div style="height:10px;width:60%;background:#1C2530;border-radius:4px;margin-bottom:8px;animation:shimmer 1.5s infinite;"></div>
            <div style="height:14px;width:90%;background:#1C2530;border-radius:4px;margin-bottom:8px;animation:shimmer 1.5s infinite;"></div>
            <div style="height:18px;width:40%;background:#1C2530;border-radius:4px;animation:shimmer 1.5s infinite;"></div>
          </div>
        </div>`).join('');
    },
  };

  // ────────────────────────────────────────────────────────────
  //  CART SHORTHAND (for inline HTML onclick)
  // ────────────────────────────────────────────────────────────
  const cart = {

    async quickAdd(productId, btnEl) {
      if (btnEl) ui.btnLoading(btnEl, 'Adding…');
      try {
        // Fetch product for snapshot
        const p = await products.list({ page: 1, limit: 1 }); // minimal — in real app pass product object
        addToCart({ id: productId }, null, 1);
        if (btnEl) {
          btnEl.innerHTML = '✓ Added!';
          btnEl.style.background = '#00BFA5';
          btnEl.style.color = '#fff';
          setTimeout(() => {
            if (btnEl._origText) ui.btnDone(btnEl);
            else { btnEl.innerHTML = btnEl.getAttribute('data-orig-text') || 'Add to Cart'; btnEl.style.background=''; btnEl.style.color=''; }
          }, 1800);
        }
        ui.syncCartBadge();
      } catch (err) {
        ui.toast(err.message, 'error');
        if (btnEl) ui.btnDone(btnEl);
      }
    },

    async toggleWish(productId, btnEl) {
      if (!isLoggedIn()) { ui.toast('Sign in to save to wishlist', 'info'); return; }
      const wished = btnEl.classList.contains('wishlisted');
      try {
        if (wished) {
          await wishlist.remove(productId);
          btnEl.classList.remove('wishlisted');
          btnEl.textContent = '♡';
        } else {
          await wishlist.add(productId);
          btnEl.classList.add('wishlisted');
          btnEl.textContent = '♥';
          btnEl.style.color = '#E84B1A';
        }
      } catch (err) {
        ui.toast(err.message, 'error');
      }
    },
  };

  // ────────────────────────────────────────────────────────────
  //  INIT  (runs on every page load)
  // ────────────────────────────────────────────────────────────
  const init = () => {
    // Add shimmer keyframe to page
    if (!document.getElementById('adey-api-styles')) {
      const style = document.createElement('style');
      style.id = 'adey-api-styles';
      style.textContent = `
        @keyframes shimmer {
          0%   { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        [data-cart-count] { display:flex; }
      `;
      document.head.appendChild(style);
    }

    // Sync cart badge on load
    ui.syncCartBadge();

    // Listen for cart updates to sync badge
    on('cart:updated', ui.syncCartBadge);

    // Sync user display name if logged in
    const u = getUser();
    if (u) {
      document.querySelectorAll('[data-user-name]').forEach(el => {
        el.textContent = u.firstName;
      });
    }

    // Show/hide auth-dependent elements
    document.querySelectorAll('[data-auth-show]').forEach(el => {
      el.style.display = isLoggedIn() ? '' : 'none';
    });
    document.querySelectorAll('[data-auth-hide]').forEach(el => {
      el.style.display = isLoggedIn() ? 'none' : '';
    });
  };

  document.addEventListener('DOMContentLoaded', init);

  // ── Public API ─────────────────────────────────────────────
  return {
    // Core
    get, post, put, patch, del, on,
    // Modules
    auth, products, orders, payments, shipments,
    wishlist, user, admin,
    // Cart
    cart, addToCart, removeFromCart, updateCartQty,
    clearCart, getCart, getCartCount,
    // UI
    ui,
    // Config
    BASE_URL,
    getUser, isLoggedIn, isAdmin, isStaff,
  };

})();
