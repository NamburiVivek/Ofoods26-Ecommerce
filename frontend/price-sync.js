// price-sync.js — fetches live prices from the Admin-managed database
// and patches them into a page's local product array before it renders.

const OF_PRICE_API = 'https://ofoods26-ecommerce.vercel.app/api/products';

window.OFLivePrices = null; // {id: {price, mrp, sizes, name}}

async function loadLivePrices() {
  try {
    const r = await fetch(OF_PRICE_API);
    const d = await r.json();
    if (d.success) window.OFLivePrices = d.products;
  } catch (e) {
    console.warn('Live prices unavailable, using fallback prices:', e);
  }
  return window.OFLivePrices;
}

// For flat product arrays with a `.price` field (menu, cart, all-items, pickles, spices, papad, snacks)
function applyLivePricesFlat(list) {
  if (!window.OFLivePrices) return;
  list.forEach(p => {
    const live = window.OFLivePrices[p.id];
    if (live && typeof live.price === 'number') p.price = live.price;
  });
}

// For ALL_PRODUCTS-style arrays with a `.sizes[]` field (product.html, review.html)
function applyLivePricesSized(list) {
  if (!window.OFLivePrices) return;
  list.forEach(p => {
    const live = window.OFLivePrices[p.id];
    if (live && Array.isArray(live.sizes) && live.sizes.length) {
      p.sizes = live.sizes.map(s => ({ ...s }));
    }
  });
}