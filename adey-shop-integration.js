// adey-shop-integration.js
// Drop this <script src="adey-shop-integration.js"></script>
// into adey-shop.html just before </body>
// Also add <script src="adey-api.js"></script> before it.

(async function initShop() {

  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  // ── State ────────────────────────────────────────────────────
  let state = {
    page:         1,
    limit:        12,
    category:     '',
    search:       '',
    minPrice:     '',
    maxPrice:     '',
    availability: '',
    sort:         'newest',
    totalPages:   1,
    loading:      false,
  };

  // ── Show skeleton while loading ──────────────────────────────
  function showSkeleton() {
    grid.innerHTML = ADEY_API.ui.skeletonCards(12);
  }

  // ── Fetch and render products ────────────────────────────────
  async function loadProducts(append = false) {
    if (state.loading) return;
    state.loading = true;

    if (!append) showSkeleton();

    try {
      const params = {
        page:   state.page,
        limit:  state.limit,
        sort:   state.sort,
      };
      if (state.category)     params.category     = state.category;
      if (state.search)       params.search       = state.search;
      if (state.minPrice)     params.minPrice     = state.minPrice;
      if (state.maxPrice)     params.maxPrice     = state.maxPrice;
      if (state.availability) params.availability = state.availability;

      const { products, pagination } = await ADEY_API.products.list(params);

      state.totalPages = pagination.pages;

      // Update result count
      const countEl = document.querySelector('.result-info strong');
      if (countEl) countEl.textContent = pagination.total;

      if (products.length === 0 && !append) {
        grid.innerHTML = `
          <div style="grid-column:1/-1;padding:80px 40px;text-align:center;">
            <div style="font-size:3.5rem;margin-bottom:16px;opacity:.3;">🔍</div>
            <div style="font-family:'Clash Display',sans-serif;font-size:1.3rem;font-weight:700;color:var(--white);margin-bottom:8px;">No products found</div>
            <div style="font-size:.88rem;color:var(--muted);">Try adjusting your filters</div>
          </div>`;
        return;
      }

      const html = products.map(p => ADEY_API.ui.productCard(p)).join('');
      if (append) {
        grid.insertAdjacentHTML('beforeend', html);
      } else {
        grid.innerHTML = html;
        // Scroll reveal
        animateCards();
      }

      // Update load-more button
      const lmBtn = document.getElementById('loadMoreBtn');
      if (lmBtn) {
        if (state.page >= state.totalPages) {
          lmBtn.style.display = 'none';
        } else {
          lmBtn.style.display = 'flex';
          lmBtn.innerHTML = '<span class="lm-text">Load More Products</span>';
        }
      }

    } catch (err) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;padding:60px 40px;text-align:center;">
          <div style="font-size:.95rem;color:var(--ember);">⚠️ ${err.message}</div>
          <button onclick="loadProducts()" style="margin-top:16px;height:40px;padding:0 20px;background:var(--gold);border:none;border-radius:8px;color:var(--ink);font-weight:700;font-size:.85rem;">Retry</button>
        </div>`;
    } finally {
      state.loading = false;
    }
  }

  // ── Card entrance animation ──────────────────────────────────
  function animateCards() {
    const cards = grid.querySelectorAll('.product-card');
    cards.forEach((c, i) => {
      c.style.opacity = '0';
      c.style.transform = 'translateY(14px)';
      c.style.transition = `opacity .35s ${i * 0.04}s ease, transform .35s ${i * 0.04}s ease, border-color .25s, box-shadow .25s`;
    });
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.style.opacity = '1';
          e.target.style.transform = 'translateY(0)';
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.08 });
    cards.forEach(c => obs.observe(c));
  }

  // ── Category pills ───────────────────────────────────────────
  document.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      // Extract slug from pill text (simplified — real app maps labels to slugs)
      const labelMap = {
        'All': '', '📱 Phones': 'phones-tablets', '🎧 Audio': 'audio',
        '💡 Gadgets': 'smart-gadgets', '👟 Fashion': 'fashion',
        '🏠 Home': 'home-kitchen', '⌚ Wearables': 'wearables',
      };
      state.category = labelMap[pill.textContent.trim()] || '';
      state.page = 1;
      loadProducts();
    });
  });

  // ── Sort select ──────────────────────────────────────────────
  const sortEl = document.getElementById('sortSelect');
  if (sortEl) {
    sortEl.addEventListener('change', () => {
      const sortMap = {
        'Sort: Featured':       'popular',
        'Price: Low to High':   'price_asc',
        'Price: High to Low':   'price_desc',
        'Newest First':         'newest',
        'Best Rated':           'rating',
        'Most Popular':         'popular',
      };
      state.sort = sortMap[sortEl.value] || 'newest';
      state.page = 1;
      loadProducts();
    });
  }

  // ── Availability checkboxes ──────────────────────────────────
  document.querySelectorAll('.check-item').forEach(item => {
    item.addEventListener('click', () => {
      const label = item.querySelector('.check-label')?.textContent.trim();
      const availMap = {
        'In Stock':    'IN_STOCK',
        'In Transit':  'IN_TRANSIT',
        'Pre-Order':   'PRE_ORDER',
        'Out of Stock':'OUT_OF_STOCK',
      };
      // If clicking a checked item → clear filter; else set it
      if (item.classList.contains('checked')) {
        state.availability = availMap[label] || '';
      } else {
        state.availability = '';
      }
      state.page = 1;
      loadProducts();
    });
  });

  // ── Price range slider ───────────────────────────────────────
  const rangeSlider = document.getElementById('rangeSlider');
  if (rangeSlider) {
    let priceTimer;
    rangeSlider.addEventListener('input', () => {
      clearTimeout(priceTimer);
      priceTimer = setTimeout(() => {
        state.maxPrice = rangeSlider.value;
        state.page = 1;
        loadProducts();
      }, 600);
    });
  }

  // ── Load More ────────────────────────────────────────────────
  const lmBtn = document.getElementById('loadMoreBtn');
  if (lmBtn) {
    lmBtn.addEventListener('click', async () => {
      if (state.page >= state.totalPages) return;
      lmBtn.classList.add('loading');
      state.page++;
      await loadProducts(true);
      lmBtn.classList.remove('loading');
    });
  }

  // ── Coupon validation on cart page ──────────────────────────
  window.validateCoupon = async (code) => {
    if (!code) return null;
    try {
      // Real validation happens at checkout — here just give feedback
      const knownCodes = ['ADEY10', 'WELCOME5K'];
      if (knownCodes.includes(code.toUpperCase())) {
        ADEY_API.ui.toast(`Coupon "${code.toUpperCase()}" applied!`, 'success');
        return true;
      } else {
        ADEY_API.ui.toast('Invalid coupon code', 'error');
        return false;
      }
    } catch (err) {
      ADEY_API.ui.toast(err.message, 'error');
      return false;
    }
  };

  // ── Initial load ─────────────────────────────────────────────
  await loadProducts();

  // ── Inventory stats for sidebar filter counts ────────────────
  if (ADEY_API.isStaff()) {
    try {
      const stats = await ADEY_API.products.inventoryStats();
      // Update sidebar filter counts if present
      const countMap = {
        'In Stock':    stats.inStock,
        'In Transit':  stats.inTransit,
        'Pre-Order':   stats.preOrder,
        'Out of Stock':stats.outOfStock,
      };
      document.querySelectorAll('.check-item').forEach(item => {
        const label = item.querySelector('.check-label')?.textContent.trim();
        const countEl = item.querySelector('[style*="font-size:.72rem"]');
        if (countEl && countMap[label] !== undefined) {
          countEl.textContent = countMap[label];
        }
      });
    } catch {}
  }

})();
