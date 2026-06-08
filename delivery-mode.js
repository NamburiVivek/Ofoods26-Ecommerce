// ═══════════════════════════════════════════════════════════════
//  O FOODS — Delivery Mode State Manager (delivery-mode.js)
//  Include this file on ALL pages before page-specific scripts
// ═══════════════════════════════════════════════════════════════

const OFSTORES = [
  { id: '1', name: 'O Foods — Amaravathi', shortName: 'Amaravathi', address: 'Beside Of Police Station, Amaravathi - 522426', hours: 'Mon–Sun: 10:00 AM – 9:00 PM', phone: '+91 7981250665' },
];

const DeliveryMode = {
  // ── Core Getters/Setters ─────────────────────────────────────
  get() {
    return localStorage.getItem('of_delivery_mode') || null; // 'home' | 'pickup' | null
  },
  set(mode) {
    localStorage.setItem('of_delivery_mode', mode);
    window.dispatchEvent(new CustomEvent('delivery-mode-changed', { detail: { mode } }));
    // Broadcast to other tabs
    try { DeliveryMode._bc.postMessage({ type: 'mode-changed', mode }); } catch(e){}
  },
  isFirstLogin() {
    return !this.get() && !!localStorage.getItem('of_token');
  },

  // ── Preferences (store / address) ────────────────────────────
  getPrefs() {
    try { return JSON.parse(localStorage.getItem('of_prefs') || '{}'); } catch(e){ return {}; }
  },
  savePrefs(p) {
    localStorage.setItem('of_prefs', JSON.stringify(p));
  },
  getSelectedStore() {
    const p = this.getPrefs();
    return OFSTORES.find(s => s.id === p.store) || OFSTORES[0];
  },
  setSelectedStore(id) {
    const p = this.getPrefs();
    p.store = id;
    this.savePrefs(p);
    window.dispatchEvent(new CustomEvent('delivery-mode-changed', { detail: { mode: this.get() } }));
  },

  // ── User helpers ─────────────────────────────────────────────
  getUser() {
    try { return JSON.parse(localStorage.getItem('of_user') || 'null'); } catch(e){ return null; }
  },
  getToken() {
    return localStorage.getItem('of_token');
  },

  // ── BroadcastChannel for cross-tab sync ──────────────────────
  _bc: (function() {
    try { return new BroadcastChannel('of_delivery_sync'); } catch(e){ return { postMessage(){}, onmessage:null }; }
  })(),

  // ── Nav Location Badge Update ────────────────────────────────
  updateNavBadge() {
    const locTop = document.getElementById('nav-loc-top');
    const locName = document.getElementById('nav-loc-name');
    if (!locTop || !locName) return;
    const mode = this.get();
    if (mode === 'home') {
      locTop.textContent = 'Delivering to';
      // Try to show saved address city
      const p = this.getPrefs();
      locName.textContent = p.deliveryCity || 'All India 🇮🇳';
    } else if (mode === 'pickup') {
      locTop.textContent = 'Pickup from';
      const store = this.getSelectedStore();
      locName.textContent = store.shortName || store.name.replace('O Foods — ', '');
    } else {
      locTop.textContent = 'Select mode';
      locName.textContent = 'Tap here ▾';
    }
  },

  // ═══════════════════════════════════════════════════════════════
  //  PREFERENCE MODAL — Shown on first login
  // ═══════════════════════════════════════════════════════════════
  showPreferenceModal(onComplete) {
    if (document.getElementById('dm-pref-modal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'dm-pref-modal';
    overlay.innerHTML = `
      <style>
        #dm-pref-modal{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.85);backdrop-filter:blur(12px);animation:dm-fadeIn .3s ease}
        @keyframes dm-fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes dm-slideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
        .dm-card{background:linear-gradient(145deg,#1C1C1C,#141414);border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:48px 40px;max-width:520px;width:92%;text-align:center;animation:dm-slideUp .4s .1s both;box-shadow:0 32px 80px rgba(0,0,0,.7)}
        .dm-emoji{font-size:56px;margin-bottom:16px;display:block}
        .dm-title{font-family:'Cormorant Garamond',serif;font-size:32px;font-weight:700;color:#F5F0E8;margin-bottom:8px;letter-spacing:-1px}
        .dm-sub{font-size:14px;color:#7A7068;margin-bottom:36px;line-height:1.6}
        .dm-opts{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
        .dm-opt{background:#0D0D0D;border:2px solid rgba(255,255,255,.08);border-radius:18px;padding:32px 20px;cursor:pointer;transition:all .25s;position:relative;overflow:hidden}
        .dm-opt::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 50% 0%,rgba(212,13,13,.08),transparent 70%);opacity:0;transition:opacity .25s}
        .dm-opt:hover{border-color:rgba(212,13,13,.4);transform:translateY(-3px);box-shadow:0 12px 32px rgba(0,0,0,.5)}
        .dm-opt:hover::before{opacity:1}
        .dm-opt.selected{border-color:#d40d0d;background:rgba(212,13,13,.06)}
        .dm-opt.selected::before{opacity:1}
        .dm-opt-icon{font-size:40px;display:block;margin-bottom:12px;position:relative;z-index:1}
        .dm-opt-name{font-size:16px;font-weight:700;color:#F5F0E8;margin-bottom:4px;position:relative;z-index:1}
        .dm-opt-desc{font-size:12px;color:#7A7068;line-height:1.5;position:relative;z-index:1}
        .dm-opt .dm-check{position:absolute;top:12px;right:12px;width:24px;height:24px;border-radius:50%;border:2px solid rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;font-size:12px;color:transparent;transition:all .2s}
        .dm-opt.selected .dm-check{background:#d40d0d;border-color:#d40d0d;color:#fff}
        .dm-continue{width:100%;background:#d40d0d;color:#fff;border:none;border-radius:14px;padding:16px;font-family:'Outfit',sans-serif;font-size:16px;font-weight:700;cursor:pointer;transition:all .2s;letter-spacing:.3px;opacity:.4;pointer-events:none;box-shadow:0 0 30px rgba(212,13,13,.3)}
        .dm-continue.ready{opacity:1;pointer-events:auto}
        .dm-continue.ready:hover{background:#e83030;transform:translateY(-2px);box-shadow:0 8px 40px rgba(212,13,13,.5)}
      </style>
      <div class="dm-card">
        <span class="dm-emoji">🍽️</span>
        <div class="dm-title">Welcome to O Foods!</div>
        <div class="dm-sub">How would you like to get your order?<br>You can change this anytime.</div>
        <div class="dm-opts">
          <div class="dm-opt" data-mode="home" onclick="DeliveryMode._selectPrefOpt('home')">
            <div class="dm-check">✓</div>
            <span class="dm-opt-icon">🏠</span>
            <div class="dm-opt-name">Home Delivery</div>
            <div class="dm-opt-desc">Delivered to your doorstep<br>All India · 4–5 days</div>
          </div>
          <div class="dm-opt" data-mode="pickup" onclick="DeliveryMode._selectPrefOpt('pickup')">
            <div class="dm-check">✓</div>
            <span class="dm-opt-icon">🏪</span>
            <div class="dm-opt-name">Store Pickup</div>
            <div class="dm-opt-desc">Pick up from store<br>Ready in 1–2 hours</div>
          </div>
        </div>
        <button class="dm-continue" id="dm-pref-continue" onclick="DeliveryMode._confirmPref()">Continue →</button>
      </div>
    `;
    document.body.appendChild(overlay);
    DeliveryMode._prefCallback = onComplete || null;
    DeliveryMode._prefSelected = null;
  },

  _prefSelected: null,
  _prefCallback: null,

  _selectPrefOpt(mode) {
    DeliveryMode._prefSelected = mode;
    document.querySelectorAll('#dm-pref-modal .dm-opt').forEach(el => {
      el.classList.toggle('selected', el.dataset.mode === mode);
    });
    const btn = document.getElementById('dm-pref-continue');
    if (btn) btn.classList.add('ready');
  },

  _confirmPref() {
    const mode = DeliveryMode._prefSelected;
    if (!mode) return;
    DeliveryMode.set(mode);
    const modal = document.getElementById('dm-pref-modal');
    if (modal) {
      modal.style.animation = 'dm-fadeIn .2s ease reverse';
      setTimeout(() => modal.remove(), 200);
    }
    // If home delivery, show address modal. If pickup, show store modal.
    if (mode === 'home') {
      DeliveryMode.showAddressPrompt();
    } else {
      DeliveryMode.showStoreSelector();
    }
    if (DeliveryMode._prefCallback) DeliveryMode._prefCallback(mode);
  },

  // ═══════════════════════════════════════════════════════════════
  //  LOCATION SWITCHER — Shown when clicking nav location
  // ═══════════════════════════════════════════════════════════════
  showLocationSwitcher() {
    if (document.getElementById('dm-loc-modal')) return;
    const currentMode = this.get() || '';
    const overlay = document.createElement('div');
    overlay.id = 'dm-loc-modal';
    overlay.innerHTML = `
      <style>
        #dm-loc-modal{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);animation:dm-fadeIn .25s ease}
        .dm-loc-card{background:#1C1C1C;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:32px;max-width:440px;width:92%;animation:dm-slideUp .35s .05s both;box-shadow:0 24px 64px rgba(0,0,0,.7);position:relative}
        .dm-loc-close{position:absolute;top:16px;right:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#7A7068;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s}
        .dm-loc-close:hover{color:#F5F0E8;border-color:rgba(255,255,255,.2)}
        .dm-loc-title{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:700;color:#F5F0E8;margin-bottom:6px}
        .dm-loc-sub{font-size:12px;color:#7A7068;margin-bottom:22px}
        .dm-loc-opts{display:grid;gap:10px}
        .dm-loc-opt{display:flex;align-items:center;gap:14px;padding:16px 18px;border-radius:14px;border:2px solid rgba(255,255,255,.06);background:#111;cursor:pointer;transition:all .2s;position:relative}
        .dm-loc-opt:hover{border-color:rgba(212,13,13,.3);background:#161616}
        .dm-loc-opt.active{border-color:#d40d0d;background:rgba(212,13,13,.05)}
        .dm-loc-opt-icon{width:44px;height:44px;border-radius:12px;background:#0D0D0D;border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
        .dm-loc-opt-info{flex:1}
        .dm-loc-opt-name{font-size:15px;font-weight:700;color:#F5F0E8;margin-bottom:2px}
        .dm-loc-opt-desc{font-size:12px;color:#7A7068;line-height:1.4}
        .dm-loc-opt-radio{width:22px;height:22px;border-radius:50%;border:2px solid rgba(255,255,255,.12);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;transition:all .2s}
        .dm-loc-opt.active .dm-loc-opt-radio{background:#d40d0d;border-color:#d40d0d;color:#fff}
      </style>
      <div class="dm-loc-card">
        <button class="dm-loc-close" onclick="DeliveryMode._closeLocModal()">✕</button>
        <div class="dm-loc-title">How do you want your order?</div>
        <div class="dm-loc-sub">Choose your preferred delivery method</div>
        <div class="dm-loc-opts">
          <div class="dm-loc-opt ${currentMode==='home'?'active':''}" onclick="DeliveryMode._switchMode('home')">
            <div class="dm-loc-opt-icon">🏠</div>
            <div class="dm-loc-opt-info">
              <div class="dm-loc-opt-name">Home Delivery</div>
              <div class="dm-loc-opt-desc">All India · 4–5 business days</div>
            </div>
            <div class="dm-loc-opt-radio">${currentMode==='home'?'✓':''}</div>
          </div>
          <div class="dm-loc-opt ${currentMode==='pickup'?'active':''}" onclick="DeliveryMode._switchMode('pickup')">
            <div class="dm-loc-opt-icon">🏪</div>
            <div class="dm-loc-opt-info">
              <div class="dm-loc-opt-name">Store Pickup</div>
              <div class="dm-loc-opt-desc">Ready in 1–2 hours · Free</div>
            </div>
            <div class="dm-loc-opt-radio">${currentMode==='pickup'?'✓':''}</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) DeliveryMode._closeLocModal(); });
  },

  _closeLocModal() {
    const m = document.getElementById('dm-loc-modal');
    if (m) { m.style.animation = 'dm-fadeIn .2s ease reverse'; setTimeout(() => m.remove(), 200); }
  },

  _switchMode(mode) {
    DeliveryMode._closeLocModal();
    DeliveryMode.set(mode);
    DeliveryMode.updateNavBadge();
    if (mode === 'home') {
      setTimeout(() => DeliveryMode.showAddressPrompt(), 250);
    } else {
      setTimeout(() => DeliveryMode.showStoreSelector(), 250);
    }
  },

  // ═══════════════════════════════════════════════════════════════
  //  STORE SELECTOR MODAL
  // ═══════════════════════════════════════════════════════════════
  showStoreSelector(onSelect) {
    if (document.getElementById('dm-store-modal')) return;
    const selectedId = this.getPrefs().store || '1';
    const overlay = document.createElement('div');
    overlay.id = 'dm-store-modal';
    overlay.innerHTML = `
      <style>
        #dm-store-modal{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);animation:dm-fadeIn .25s ease}
        .dm-store-card{background:#1C1C1C;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:32px;max-width:480px;width:92%;max-height:80vh;overflow-y:auto;animation:dm-slideUp .35s .05s both;box-shadow:0 24px 64px rgba(0,0,0,.7);position:relative}
        .dm-store-close{position:absolute;top:16px;right:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#7A7068;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s}
        .dm-store-close:hover{color:#F5F0E8}
        .dm-store-title{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:700;color:#F5F0E8;margin-bottom:6px}
        .dm-store-sub{font-size:12px;color:#7A7068;margin-bottom:20px}
        .dm-store-list{display:grid;gap:10px}
        .dm-store-item{display:flex;align-items:center;gap:12px;padding:16px;border-radius:14px;border:2px solid rgba(255,255,255,.06);background:#111;cursor:pointer;transition:all .2s}
        .dm-store-item:hover{border-color:rgba(212,13,13,.3)}
        .dm-store-item.sel{border-color:#d40d0d;background:rgba(212,13,13,.05)}
        .dm-store-item-icon{width:40px;height:40px;border-radius:10px;background:#0D0D0D;border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
        .dm-store-item-info{flex:1}
        .dm-store-item-name{font-size:14px;font-weight:600;color:#F5F0E8}
        .dm-store-item-addr{font-size:11px;color:#7A7068;margin-top:2px}
        .dm-store-item-hrs{font-size:11px;color:#6BCF7F;margin-top:2px;font-weight:600}
        .dm-store-chk{width:22px;height:22px;border-radius:50%;border:2px solid rgba(255,255,255,.12);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;transition:all .2s}
        .dm-store-item.sel .dm-store-chk{background:#d40d0d;border-color:#d40d0d;color:#fff}
      </style>
      <div class="dm-store-card">
        <button class="dm-store-close" onclick="DeliveryMode._closeStoreModal()">✕</button>
        <div class="dm-store-title">Choose Pickup Store</div>
        <div class="dm-store-sub">Select a store near you — saved across all pages</div>
        <div class="dm-store-list">
          ${OFSTORES.map(s => `
            <div class="dm-store-item ${s.id===selectedId?'sel':''}" onclick="DeliveryMode._pickStore('${s.id}')">
              <div class="dm-store-item-icon">📍</div>
              <div class="dm-store-item-info">
                <div class="dm-store-item-name">${s.shortName}</div>
                <div class="dm-store-item-addr">${s.address}</div>
                <div class="dm-store-item-hrs">🟢 ${s.hours}</div>
              </div>
              <div class="dm-store-chk">${s.id===selectedId?'✓':''}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) DeliveryMode._closeStoreModal(); });
    DeliveryMode._storeCallback = onSelect || null;
  },

  _storeCallback: null,

  _pickStore(id) {
    DeliveryMode.setSelectedStore(id);
    DeliveryMode.updateNavBadge();
    DeliveryMode._closeStoreModal();
    if (DeliveryMode._storeCallback) DeliveryMode._storeCallback(id);
    DeliveryMode._toast('📍 Store updated to ' + (OFSTORES.find(s=>s.id===id)||{}).shortName);
  },

  _closeStoreModal() {
    const m = document.getElementById('dm-store-modal');
    if (m) { m.style.animation = 'dm-fadeIn .2s ease reverse'; setTimeout(() => m.remove(), 200); }
  },

  // ═══════════════════════════════════════════════════════════════
  //  ADDRESS PROMPT — Quick address save for home delivery
  // ═══════════════════════════════════════════════════════════════
  showAddressPrompt() {
    if (document.getElementById('dm-addr-modal')) return;
    const token = this.getToken();
    if (!token) return;
    // First, try to fetch existing addresses
    fetch('https://ofoods26-ecommerce.vercel.app/api/addresses', { headers: { 'Authorization': 'Bearer ' + token } })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.addresses && d.addresses.length > 0) {
          // User has addresses — show quick selector
          DeliveryMode._showAddrSelector(d.addresses);
        } else {
          // No addresses — show address form
          DeliveryMode._showAddrForm();
        }
      })
      .catch(() => DeliveryMode._showAddrForm());
  },

  _showAddrSelector(addresses) {
    const prefs = this.getPrefs();
    const selId = prefs.addressId || (addresses.find(a=>a.is_default)||addresses[0]).id;
    const overlay = document.createElement('div');
    overlay.id = 'dm-addr-modal';
    overlay.innerHTML = `
      <style>
        #dm-addr-modal{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);animation:dm-fadeIn .25s ease}
        .dm-addr-card{background:#1C1C1C;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:32px;max-width:480px;width:92%;max-height:80vh;overflow-y:auto;animation:dm-slideUp .35s .05s both;box-shadow:0 24px 64px rgba(0,0,0,.7);position:relative}
        .dm-addr-close{position:absolute;top:16px;right:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#7A7068;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s}
        .dm-addr-close:hover{color:#F5F0E8}
        .dm-addr-title{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:700;color:#F5F0E8;margin-bottom:6px}
        .dm-addr-sub{font-size:12px;color:#7A7068;margin-bottom:20px}
        .dm-addr-item{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:12px;border:2px solid rgba(255,255,255,.06);background:#111;cursor:pointer;transition:all .2s;margin-bottom:8px}
        .dm-addr-item:hover{border-color:rgba(212,13,13,.3)}
        .dm-addr-item.sel{border-color:#d40d0d;background:rgba(212,13,13,.05)}
        .dm-addr-item-icon{font-size:20px;flex-shrink:0}
        .dm-addr-item-info{flex:1}
        .dm-addr-item-label{font-size:13px;font-weight:600;color:#F5F0E8}
        .dm-addr-item-text{font-size:11px;color:#7A7068;margin-top:2px;line-height:1.4}
        .dm-addr-chk{width:20px;height:20px;border-radius:50%;border:2px solid rgba(255,255,255,.12);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;transition:all .2s}
        .dm-addr-item.sel .dm-addr-chk{background:#d40d0d;border-color:#d40d0d;color:#fff}
      </style>
      <div class="dm-addr-card">
        <button class="dm-addr-close" onclick="DeliveryMode._closeAddrModal()">✕</button>
        <div class="dm-addr-title">Deliver To</div>
        <div class="dm-addr-sub">Select your delivery address</div>
        ${addresses.map(a => {
          const icons = {Home:'🏠', Work:'🏢', Other:'📍'};
          const addrStr = [a.house, a.street, a.city, a.state, a.pincode].filter(Boolean).join(', ');
          const sel = a.id === selId;
          return `<div class="dm-addr-item ${sel?'sel':''}" onclick="DeliveryMode._pickAddr(${a.id}, '${(a.city||a.state||'').replace(/'/g,"\\'")}')">
            <div class="dm-addr-item-icon">${icons[a.label]||'📍'}</div>
            <div class="dm-addr-item-info">
              <div class="dm-addr-item-label">${a.label||'Address'} ${a.is_default?'<span style=\\"color:#6BCF7F;font-size:10px\\">✓ DEFAULT</span>':''}</div>
              <div class="dm-addr-item-text">${addrStr}</div>
            </div>
            <div class="dm-addr-chk">${sel?'✓':''}</div>
          </div>`;
        }).join('')}
        <div style="text-align:center;margin-top:12px">
          <button onclick="DeliveryMode._closeAddrModal();DeliveryMode._showAddrForm()" style="background:rgba(212,13,13,.06);border:1.5px dashed rgba(212,13,13,.3);border-radius:10px;padding:10px 18px;color:#d40d0d;font-family:'Outfit',sans-serif;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s">➕ Add New Address</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) DeliveryMode._closeAddrModal(); });
  },

  _pickAddr(id, city) {
    const p = DeliveryMode.getPrefs();
    p.addressId = id;
    p.deliveryCity = city;
    DeliveryMode.savePrefs(p);
    DeliveryMode.updateNavBadge();
    DeliveryMode._closeAddrModal();
    DeliveryMode._toast('📦 Delivery address updated');
    window.dispatchEvent(new CustomEvent('delivery-mode-changed', { detail: { mode: 'home' } }));
  },

  _closeAddrModal() {
    const m = document.getElementById('dm-addr-modal');
    if (m) { m.style.animation = 'dm-fadeIn .2s ease reverse'; setTimeout(() => m.remove(), 200); }
  },

  _showAddrForm() {
    if (document.getElementById('dm-addr-form-modal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'dm-addr-form-modal';
    overlay.innerHTML = `
      <style>
        #dm-addr-form-modal{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);animation:dm-fadeIn .25s ease}
        .dm-af-card{background:#1C1C1C;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:32px;max-width:480px;width:92%;max-height:85vh;overflow-y:auto;animation:dm-slideUp .35s .05s both;box-shadow:0 24px 64px rgba(0,0,0,.7);position:relative}
        .dm-af-close{position:absolute;top:16px;right:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#7A7068;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center}
        .dm-af-close:hover{color:#F5F0E8}
        .dm-af-title{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:700;color:#F5F0E8;margin-bottom:6px}
        .dm-af-sub{font-size:12px;color:#7A7068;margin-bottom:20px}
        .dm-af-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .dm-af-field{display:flex;flex-direction:column;gap:4px}
        .dm-af-field label{font-size:10px;font-weight:600;color:#7A7068;text-transform:uppercase;letter-spacing:.5px}
        .dm-af-field input,.dm-af-field select{background:#0D0D0D;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px 14px;font-family:'Outfit',sans-serif;font-size:13px;color:#F5F0E8;outline:none;transition:border-color .2s}
        .dm-af-field input:focus,.dm-af-field select:focus{border-color:#d40d0d}
        .dm-af-field input::placeholder{color:#555}
        .dm-af-save{width:100%;background:#d40d0d;color:#fff;border:none;border-radius:12px;padding:14px;font-family:'Outfit',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:all .2s;margin-top:16px;box-shadow:0 0 24px rgba(212,13,13,.3)}
        .dm-af-save:hover{background:#e83030;transform:translateY(-1px)}
      </style>
      <div class="dm-af-card">
        <button class="dm-af-close" onclick="DeliveryMode._closeAddrFormModal()">✕</button>
        <div class="dm-af-title">Add Delivery Address</div>
        <div class="dm-af-sub">Save your address for faster checkout</div>
        <div class="dm-af-grid">
          <div class="dm-af-field"><label>Label</label><select id="dm-af-label"><option value="Home">🏠 Home</option><option value="Work">🏢 Work</option><option value="Other">📍 Other</option></select></div>
          <div class="dm-af-field"><label>House / Flat</label><input id="dm-af-house" placeholder="e.g. 12B"></div>
          <div class="dm-af-field"><label>Street</label><input id="dm-af-street" placeholder="e.g. MG Road"></div>
          <div class="dm-af-field"><label>City *</label><input id="dm-af-city" placeholder="e.g. Guntur"></div>
          <div class="dm-af-field"><label>State *</label><input id="dm-af-state" placeholder="e.g. Andhra Pradesh"></div>
          <div class="dm-af-field"><label>Pincode *</label><input id="dm-af-pincode" placeholder="e.g. 522001" maxlength="6"></div>
          <div class="dm-af-field" style="grid-column:1/-1"><label>Landmark</label><input id="dm-af-landmark" placeholder="Optional"></div>
        </div>
        <button class="dm-af-save" onclick="DeliveryMode._saveNewAddr()">✅ Save Address</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) DeliveryMode._closeAddrFormModal(); });
  },

  _closeAddrFormModal() {
    const m = document.getElementById('dm-addr-form-modal');
    if (m) { m.style.animation = 'dm-fadeIn .2s ease reverse'; setTimeout(() => m.remove(), 200); }
  },

  async _saveNewAddr() {
    const token = DeliveryMode.getToken();
    if (!token) return;
    const city = document.getElementById('dm-af-city').value.trim();
    const state = document.getElementById('dm-af-state').value.trim();
    const pincode = document.getElementById('dm-af-pincode').value.trim();
    if (!city && !state && !pincode) { DeliveryMode._toast('⚠️ Please fill city, state, or pincode'); return; }
    const body = {
      label: document.getElementById('dm-af-label').value,
      house: document.getElementById('dm-af-house').value.trim(),
      street: document.getElementById('dm-af-street').value.trim(),
      city, state, pincode,
      landmark: document.getElementById('dm-af-landmark').value.trim(),
      is_default: true
    };
   const r = await fetch('https://ofoods26-ecommerce.vercel.app/api/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(body)
      });
      const d = await r.json();
      if (!d.success) { DeliveryMode._toast('❌ ' + (d.error || 'Failed')); return; }
      const p = DeliveryMode.getPrefs();
      p.addressId = d.addressId;
      p.deliveryCity = city || state;
      DeliveryMode.savePrefs(p);
      DeliveryMode.updateNavBadge();
      DeliveryMode._closeAddrFormModal();
      DeliveryMode._toast('✅ Address saved!');
      window.dispatchEvent(new CustomEvent('delivery-mode-changed', { detail: { mode: 'home' } }));
    } catch (e) { DeliveryMode._toast('❌ Could not save address'); }
  },

  // ── Toast ────────────────────────────────────────────────────
  _toastTimer: null,
  _toast(msg) {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.style.cssText = 'position:fixed;bottom:32px;left:50%;transform:translateX(-50%) translateY(80px);background:#1C1C1C;border:1px solid rgba(255,255,255,.1);color:#F5F0E8;border-radius:50px;padding:13px 28px;font-size:14px;font-weight:600;box-shadow:0 8px 32px rgba(0,0,0,.5);z-index:19998;pointer-events:none;transition:transform .35s cubic-bezier(.34,1.56,.64,1);white-space:nowrap';
      document.body.appendChild(t);
    }
    t.innerHTML = msg;
    t.classList.add('show');
    t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { t.style.transform = 'translateX(-50%) translateY(80px)'; t.classList.remove('show'); }, 2800);
  },

  // ── Init — call this at DOMContentLoaded on every page ───────
  init() {
    this.updateNavBadge();
    // Listen for cross-tab messages
    try {
      this._bc.onmessage = (e) => {
        if (e.data.type === 'mode-changed') {
          this.updateNavBadge();
          window.dispatchEvent(new CustomEvent('delivery-mode-changed', { detail: { mode: e.data.mode } }));
        }
      };
    } catch(e){}
    // Listen for localStorage changes from other tabs
    window.addEventListener('storage', (e) => {
      if (e.key === 'of_delivery_mode' || e.key === 'of_prefs') {
        this.updateNavBadge();
        window.dispatchEvent(new CustomEvent('delivery-mode-changed', { detail: { mode: this.get() } }));
      }
    });
    // Wire up nav location click
    const locBtn = document.getElementById('nav-loc-btn');
    if (locBtn) {
      locBtn.removeAttribute('href');
      locBtn.style.cursor = 'pointer';
      locBtn.onclick = (e) => { e.preventDefault(); this.showLocationSwitcher(); };
    }
    // Check first login
    if (this.isFirstLogin()) {
      setTimeout(() => this.showPreferenceModal(), 500);
    }
  }
};
