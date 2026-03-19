# ADEY Frontend ↔ Backend Integration Guide

## What's in this folder

| File | Purpose |
|------|---------|
| `adey-api.js` | Core API client — shared across ALL pages |
| `adey-auth.html` | Login & Register page (fully standalone) |
| `adey-shop-integration.js` | Wires up the shop/catalogue page |
| `adey-product-integration.js` | Wires up the product detail page |
| `adey-checkout-integration.js` | Wires up cart & checkout with Paystack |
| `adey-dashboard-integration.js` | Wires up customer dashboard |
| `adey-admin-integration.js` | Wires up admin dashboard |

---

## Setup: 2 steps before anything else

### Step 1 — Start your backend
```bash
cd adey-backend
npm install
npx prisma db push
node prisma/seed.js
npm run dev
# API running at http://localhost:5000
```

### Step 2 — Set API URL (optional)
By default, `adey-api.js` points to `http://localhost:5000/api`.

To change it, add this **before** the script tag on any page:
```html
<script>window.ADEY_BASE_URL = 'https://your-api.railway.app/api';</script>
<script src="adey-api.js"></script>
```

---

## Exact script tags to add to each HTML page

### adey-homepage.html
Add just before `</body>`:
```html
<script src="adey-api.js"></script>
<script>
  // Update cart badge on load
  document.querySelectorAll('.cart-badge').forEach(el => {
    el.setAttribute('data-cart-count','');
  });
  ADEY_API.ui.syncCartBadge();

  // Wire up all "Add to Cart" buttons
  document.querySelectorAll('.pca-btn.pca-main, .cta-main').forEach(btn => {
    if (btn.textContent.includes('Shop')) return;
    btn.addEventListener('click', () => {
      ADEY_API.ui.toast('Added to cart!', 'success');
      ADEY_API.ui.syncCartBadge();
    });
  });
</script>
```

### adey-shop.html
Add just before `</body>`:
```html
<script src="adey-api.js"></script>
<script src="adey-shop-integration.js"></script>
```

Also add `data-cart-count` to your cart badge span:
```html
<span class="cart-badge" data-cart-count>0</span>
```

### adey-product.html
Add just before `</body>`:
```html
<script src="adey-api.js"></script>
<script src="adey-product-integration.js"></script>
```

Link from shop cards using URL params:
```
adey-product.html?slug=pro-wireless-earbuds-anc
```

### adey-cart-checkout.html
Add just before `</body>`:
```html
<script src="adey-api.js"></script>
<script src="adey-checkout-integration.js"></script>
```

Your Paystack callback URL should point back to this page:
```
http://localhost:3000/adey-cart-checkout.html
```
Set this in your `.env`: `FRONTEND_URL=http://localhost:3000`
And in Paystack dashboard under Callback URL.

### adey-dashboard.html
Add just before `</body>`:
```html
<script src="adey-api.js"></script>
<script src="adey-dashboard-integration.js"></script>
```

### adey-admin.html
Add just before `</body>`:
```html
<script src="adey-api.js"></script>
<script src="adey-admin-integration.js"></script>
```
Admin is role-protected — only ADMIN/STAFF roles can access it.

---

## Nav link updates — add to every page's nav

Replace static Sign In button with:
```html
<!-- Show when logged OUT -->
<button data-auth-hide onclick="location.href='adey-auth.html'">Sign In</button>

<!-- Show when logged IN -->
<button data-auth-show onclick="location.href='adey-dashboard.html'" data-user-name>
  Hi, Emeka
</button>
<button data-auth-show onclick="ADEY_API.auth.logout().then(()=>location.reload())">
  Sign Out
</button>
```

Cart badge — add `data-cart-count` attribute:
```html
<span class="cart-badge" data-cart-count>0</span>
```

---

## What each integration does

### adey-api.js (core client)
- Auth: register, login, logout, token refresh (automatic)
- Products: list with filters/pagination, get by slug
- Orders: create, track, list mine, admin list
- Payments: initiate Paystack, verify on return
- Shipments: track by order reference
- Wishlist: add/remove
- Cart: localStorage-based, syncs badge across pages
- UI helpers: toast, naira formatter, skeleton cards, product card builder
- Auto-injects shimmer CSS for skeleton loading

### adey-shop-integration.js
- Replaces static cards with live products from API
- Category pill filtering
- Sort dropdown
- Availability filter
- Price range filter (debounced 600ms)
- Load More with real pagination
- Scroll-reveal animation on loaded cards

### adey-product-integration.js
- Reads `?slug=` from URL, fetches product
- Populates all fields: name, price, stock, rating, availability
- Renders live reviews from DB
- Loads wishlisted state
- Variant selection updates price
- Add to Cart writes to localStorage + syncs badge
- Buy Now creates order + initiates Paystack
- Related products rendered dynamically

### adey-checkout-integration.js
- Reads cart from localStorage, renders all items
- Live qty/remove with price recalculation
- Delivery method selection updates total
- Coupon validation
- Checkout: creates order on backend → initiates Paystack → redirects
- On return from Paystack: auto-verifies payment, clears cart, shows success screen

### adey-dashboard-integration.js
- Loads real order history
- Live shipment tracking via timeline
- Real wishlist items
- Real notifications with mark-read
- Editable profile (saves to API)
- Saved addresses from DB
- Role-aware (customer only)

### adey-admin-integration.js
- Real KPI cards from /api/admin/summary
- Orders table with live status dropdowns (PATCH to API + SMS trigger)
- Inventory table from real products
- Edit/delete products via API
- Shipment status management
- Customer CRM from real users
- Live coupons table + create form
- Role-gated: STAFF/ADMIN only

---

## Authentication flow

```
User visits any protected page
  → ADEY_API.ui.requireAuth() checks localStorage
    → If no token → redirect to adey-auth.html?next=<current-page>
    → On login → token stored → redirect back to original page

Admin pages additionally check:
  → ADEY_API.isStaff() → if false → redirect to homepage
```

Tokens stored in localStorage:
- `adey_access_token` — expires in 15 min
- `adey_refresh_token` — expires in 7 days (auto-refreshed)
- `adey_user` — cached user object

---

## Test credentials (after running seed)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@adeyimports.com | Admin@1234 |
| Staff | staff@adeyimports.com | Staff@1234 |
| Customer | emeka@gmail.com | Customer@1234 |
