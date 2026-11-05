/* =====================================================================
   WatchShop — browser edition.  A real SQL database (SQLite compiled to
   WebAssembly via sql.js) runs inside the page; data is saved in this
   browser's localStorage.  Same tables, keys, triggers & views as MySQL.
   ===================================================================== */
const store = {
  get: k => { try { return localStorage.getItem(k) } catch (e) { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v); return true } catch (e) { return false } },
  del: k => { try { localStorage.removeItem(k) } catch (e) {} }
};
const DBKEY = 'watchshop_db_v1';
let SQL, db, flashMsg = null;

/* ---------------- database helpers ---------------- */
function rows(sql, p = []) {
  const st = db.prepare(sql); st.bind(p); const out = [];
  while (st.step()) out.push(st.getAsObject());
  st.free(); return out;
}
const one = (s, p) => rows(s, p)[0] || null;
const val = (s, p) => { const r = one(s, p); return r ? Object.values(r)[0] : null; };
function run(sql, p = []) { db.run(sql, p); return val('SELECT last_insert_rowid()'); }
function tx(fn) {                                 // transaction: all or nothing
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); save(); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
function save() {
  const bytes = db.export(); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  store.set(DBKEY, btoa(bin));
  db.exec('PRAGMA foreign_keys = ON');
}
async function freshDB() {
  db = new SQL.Database();
  db.exec(await (await fetch('schema.sql')).text());
  save();
}
function niceErr(e) {
  const m = String(e.message || e);
  if (m.includes('UNIQUE') && m.includes('serial_no')) return 'Serial number already sold. Use a unique serial.';
  if (m.includes('UNIQUE') && m.includes('sale_return')) return 'This item is already returned.';
  if (m.includes('UNIQUE')) return 'This value already exists.';
  if (m.includes('FOREIGN KEY')) return 'Cannot delete: this record is used in other records.';
  if (m.includes('CHECK')) return 'Invalid value (negative numbers or wrong option are not allowed).';
  return m;
}

/* ---------------- small UI helpers ---------------- */
const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tk = n => '৳ ' + Math.round(+n || 0).toLocaleString('en-US');
const L = (en, bn) => `<span class="i18n" data-en="${e(en)}" data-bn="${e(bn)}">${e(store.get('lang') === 'bn' ? bn : en)}</span>`;
const fmtD = d => d ? new Date(d.replace(' ', 'T')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const fmtDT = d => d ? new Date(d.replace(' ', 'T')).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const today = () => val("SELECT date('now','localtime')");
const me = () => { try { return JSON.parse(store.get('ws_user')) } catch (x) { return null } };
const isAdmin = () => me()?.role === 'Admin';
const flash = (m, t = 'ok') => { flashMsg = [m, t]; };
const go = h => { if (location.hash === h) route(); else location.hash = h; };
const PH = 'assets/watches/placeholder.svg';
const thumb = src => `<img class="thumb" src="${e(src || PH)}" alt="">`;
function badge(s) {
  const c = { Paid: 'g', Active: 'g', Received: 'b', Delivered: 'g', Ready: 'g', Partial: 'y', 'In Repair': 'y', Pending: 'y', Due: 'r', Void: 'r', Expired: 'r', Cancelled: 'r' }[s] || 'b';
  return `<span class="badge ${c}">${e(s)}</span>`;
}
const opts = (sql, sel) => rows(sql).map(r => { const v = Object.values(r); return `<option value="${e(v[0])}"${v[0] == sel ? ' selected' : ''}>${e(v[1])}</option>`; }).join('');
const formData = f => Object.fromEntries(new FormData(f).entries());

const ICONS = {
  dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  watch: '<circle cx="12" cy="12" r="6"/><path d="M12 9v3l1.5 1.5M9 3h6l1 3.5M9 21h6l1-3.5M8 6.5 9 3M8 17.5 9 21"/>',
  sale: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M17.5 14.5A5 5 0 0 1 22 19.5"/>',
  truck: '<path d="M2 6h11v10H2zM13 10h4l4 4v2h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  tag: '<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  grid: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  up: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'
};
const icon = n => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;

/* ---------------- theme & language ---------------- */
function applyTheme(t) { document.documentElement.dataset.theme = t; document.querySelectorAll('#themeBtn').forEach(b => b.textContent = t === 'dark' ? '☀️' : '🌙'); }
function applyLang() {
  const l = store.get('lang') || 'en';
  document.documentElement.lang = l;
  document.querySelectorAll('.i18n').forEach(s => s.textContent = s.dataset[l]);
  document.querySelectorAll('#langBtn').forEach(b => b.textContent = l === 'bn' ? 'English' : 'বাংলা');
}
document.addEventListener('click', ev => {
  if (ev.target.closest('#themeBtn')) { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; store.set('theme', t); applyTheme(t); }
  if (ev.target.closest('#langBtn')) { store.set('lang', (store.get('lang') || 'en') === 'bn' ? 'en' : 'bn'); applyLang(); }
});

/* ---------------- layout ---------------- */
function page(title, html) {
  const u = me(), h = location.hash || '#/';
  const nav = [['Main', 'মূল'], ['#/', 'dash', 'Dashboard', 'ড্যাশবোর্ড'], ['#/sales', 'sale', 'Sales', 'বিক্রয়'],
    ['#/warranty', 'tool', 'Warranty & Repair', 'ওয়ারেন্টি ও মেরামত'], ['#/reports', 'chart', 'Reports & Analytics', 'রিপোর্ট ও অ্যানালিটিক্স'],
    ['Inventory', 'ইনভেন্টরি'], ['#/crud/watch', 'watch', 'Watches', 'ঘড়ি'], ['#/purchases', 'box', 'Purchases', 'ক্রয়'],
    ['#/crud/brand', 'tag', 'Brands', 'ব্র্যান্ড'], ['#/crud/category', 'grid', 'Categories', 'ক্যাটাগরি'],
    ['People', 'মানুষ'], ['#/crud/customer', 'users', 'Customers', 'কাস্টমার'], ['#/crud/supplier', 'truck', 'Suppliers', 'সাপ্লায়ার']];
  if (isAdmin()) nav.push(['#/crud/user', 'lock', 'Users', 'ইউজার']);
  nav.push(['Database', 'ডেটাবেস'], ['#/sql', 'db', 'SQL Console', 'SQL কনসোল']);
  const active = k => (k === '#/' ? (h === '#/' || h === '#') : h.startsWith(k)) ? ' on' : '';
  const plain = title.replace(/<[^>]+>/g, '');
  document.title = plain + ' · WatchShop';
  document.getElementById('app').innerHTML = `
  <aside class="side"><div class="logo"><span class="mark">${icon('watch')}</span><div><b>Watch</b>Shop<small>Business Manager</small></div></div><nav>
  ${nav.map(n => n.length === 2 ? `<div class="navhead">${L(n[0], n[1])}</div>` : `<a class="nav${active(n[0])}" href="${n[0]}">${icon(n[1])}${L(n[2], n[3])}</a>`).join('')}
  </nav><div class="demo-note">${icon('db')}<div><b>${L('Live SQL demo', 'লাইভ SQL ডেমো')}</b>${L('Data is saved in your browser.', 'ডেটা আপনার ব্রাউজারে সেভ থাকে।')}
  <button class="btn sm ghost" data-act="reset">${icon('reset')} ${L('Reset data', 'ডেটা রিসেট')}</button></div></div></aside>
  <div class="scrim" data-act="menu"></div>
  <main><header class="top"><button class="btn ghost icon-btn menu-btn" data-act="menu" aria-label="Menu">${icon('grid')}</button><div class="ttl"><div class="crumb">WatchShop / ${e(plain)}</div><h1>${title}</h1></div><div class="tools">
  <button class="btn ghost" id="langBtn">বাংলা</button><button class="btn ghost icon-btn" id="themeBtn">🌙</button>
  <div class="who"><span class="avatar">${e(u.full_name[0])}</span><div>${e(u.full_name)}<small>${e(u.role)}</small></div></div>
  <a class="btn ghost icon-btn" href="#/logout" title="Logout">${icon('out')}</a></div></header>
  <div class="content">${flashMsg ? `<div class="flash ${flashMsg[1]}">${e(flashMsg[0])}</div>` : ''}${html}</div>
  <nav class="tabbar">
    <a href="#/" class="${active('#/')}">${icon('dash')}<span>${L('Home', 'হোম')}</span></a>
    <a href="#/sales" class="${h.startsWith('#/sales') && h !== '#/sales/new' || h.startsWith('#/sale/') ? ' on' : ''}">${icon('sale')}<span>${L('Sales', 'বিক্রয়')}</span></a>
    <a href="#/sales/new" class="fab" aria-label="New sale">${icon('plus')}</a>
    <a href="#/crud/watch" class="${active('#/crud/watch')}">${icon('watch')}<span>${L('Watches', 'ঘড়ি')}</span></a>
    <a href="#/reports" class="${active('#/reports')}">${icon('chart')}<span>${L('Reports', 'রিপোর্ট')}</span></a>
  </nav></main>`;
  document.body.classList.remove('nav-open');
  flashMsg = null;
  applyTheme(document.documentElement.dataset.theme); applyLang(); window.scrollTo(0, 0);
}

/* ======================= PAGES ======================= */
function loginPage(err) {
  document.title = 'Login · WatchShop';
  document.getElementById('app').innerHTML = `<div class="login-bg">
  <section class="login-art"><div class="logo"><span class="mark">${icon('watch')}</span><div><b>Watch</b>Shop<small>Business Manager</small></div></div><div class="dial"></div>
  <div><h2>${L('Every second of your', 'আপনার ঘড়ির ব্যবসার')} <em>${L('watch business,', 'প্রতিটি মুহূর্ত,')}</em> ${L('in one place.', 'এক জায়গায়।')}</h2>
  <p>${L('Inventory, sales, warranty, repairs and analytics, powered by a real SQL database running right in your browser.', 'ইনভেন্টরি, বিক্রয়, ওয়ারেন্টি, মেরামত ও অ্যানালিটিক্স — আসল SQL ডেটাবেস, সরাসরি আপনার ব্রাউজারে।')}</p></div>
  <div class="feats"><span>${icon('box')} Inventory</span><span>${icon('sale')} Sales</span><span>${icon('tool')} Warranty</span><span>${icon('chart')} Analytics</span></div></section>
  <section class="login-side"><div class="tools fixed"><button class="btn ghost" id="langBtn">বাংলা</button><button class="btn ghost icon-btn" id="themeBtn">🌙</button></div>
  <form class="login" data-act="login"><h1>${L('Welcome back', 'স্বাগতম')}</h1><p class="sub">${L('Sign in to manage your store.', 'আপনার স্টোর ম্যানেজ করতে লগইন করুন।')}</p>
  ${err ? `<div class="flash err">${e(err)}</div><br>` : ''}
  <label>${L('Email', 'ইমেইল')}<input name="email" type="email" required value="admin@watchshop.com"></label>
  <label>${L('Password', 'পাসওয়ার্ড')}<input name="password" type="password" required value="admin123"></label>
  <button class="btn primary full">${L('Sign in', 'লগইন')} →</button>
  <div class="hint"><b>Demo accounts</b><br>Admin — admin@watchshop.com / admin123<br>Salesperson — sales@watchshop.com / sales123</div>
  <p class="small muted" style="margin-top:14px">CSE311L · Group 08 · North South University</p></form></section></div>`;
  applyTheme(document.documentElement.dataset.theme); applyLang();
}

function dashboard() {
  const k = one(`SELECT
   (SELECT COALESCE(SUM(total_amount),0) FROM sale WHERE date(sale_date)=date('now','localtime')) today,
   (SELECT COALESCE(SUM(total_amount),0) FROM sale WHERE strftime('%Y-%m',sale_date)=strftime('%Y-%m','now','localtime')) month,
   (SELECT COALESCE(SUM(stock_qty*purchase_price),0) FROM watch) stock_value, (SELECT COALESCE(SUM(stock_qty),0) FROM watch) units,
   (SELECT COALESCE(SUM(due),0) FROM v_sale_summary) dues, (SELECT COUNT(*) FROM v_low_stock) low,
   (SELECT COUNT(*) FROM repair WHERE status<>'Delivered') repairs, (SELECT COUNT(*) FROM customer) customers`);
  const map = Object.fromEntries(rows(`SELECT date(sale_date) d, SUM(total_amount) t FROM sale WHERE date(sale_date) >= date('now','localtime','-13 day') GROUP BY d`).map(r => [r.d, r.t]));
  const mx = Math.max(1, ...Object.values(map));
  const days = [...Array(14)].map((_, i) => val(`SELECT date('now','localtime','-${13 - i} day')`));
  const hr = new Date().getHours(), greet = hr < 12 ? ['Good morning', 'শুভ সকাল'] : hr < 17 ? ['Good afternoon', 'শুভ অপরাহ্ন'] : ['Good evening', 'শুভ সন্ধ্যা'];
  const cards = [['Today\'s Sales', 'আজকের বিক্রয়', tk(k.today), 'money'], ['This Month', 'এই মাসে', tk(k.month), 'cal'], ['Stock Value', 'স্টকের মূল্য', tk(k.stock_value), 'box', k.units + ' units'],
    ['Outstanding Dues', 'বকেয়া', tk(k.dues), 'alert'], ['Low Stock Items', 'কম স্টক', k.low, 'down'], ['Pending Repairs', 'চলমান মেরামত', k.repairs, 'tool'], ['Customers', 'কাস্টমার', k.customers, 'users']];
  const best = rows(`SELECT w.image, w.model_name, b.brand_name, w.sale_price, COALESCE(SUM(si.quantity),0) sold FROM watch w JOIN brand b USING(brand_id)
    LEFT JOIN sale_item si ON si.watch_id = w.watch_id GROUP BY w.watch_id ORDER BY sold DESC, w.sale_price DESC LIMIT 5`);
  const low = rows('SELECT * FROM v_low_stock ORDER BY stock_qty');
  const first = me().full_name.split(' ')[1] || me().full_name;
  page(L('Dashboard', 'ড্যাশবোর্ড'), `
  <section class="hero"><div style="position:relative;z-index:1"><small>${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</small>
    <h2>${L(greet[0], greet[1])}, ${e(first)}</h2><p>${L('Here is how your watch store is doing today.', 'আজ আপনার ঘড়ির দোকানের অবস্থা।')}</p></div>
    <div class="stat"><small>${L('This month', 'এই মাসে')}</small><b>${tk(k.month)}</b><a class="btn primary" href="#/sales/new">${icon('plus')} ${L('New Sale', 'নতুন বিক্রয়')}</a></div></section>
  <div class="kpis">${cards.map(c => `<div class="kpi"><i class="k-${c[3]}">${icon(c[3])}</i><div><small>${L(c[0], c[1])}</small><b>${c[2]}</b>${c[4] ? `<small class="muted">${c[4]}</small>` : ''}</div></div>`).join('')}</div>
  <div class="card"><div class="row between"><h3>${L('Best Sellers', 'সেরা বিক্রিত ঘড়ি')}</h3><a class="btn ghost sm" href="#/crud/watch">${L('View all watches', 'সব ঘড়ি দেখুন')} →</a></div><div class="strip">
  ${best.map((w, i) => `<div class="mini-card"><span class="rank">#${i + 1}</span><img src="${e(w.image || PH)}" alt=""><small>${e(w.brand_name)}</small><b>${e(w.model_name)}</b>
    <div class="row between"><span>${tk(w.sale_price)}</span><span class="badge g">${w.sold} ${L('sold', 'বিক্রি')}</span></div></div>`).join('')}</div></div>
  <div class="grid2"><div class="card"><h3>${L('Sales — last 14 days', 'বিক্রয় — গত ১৪ দিন')}</h3><div class="bars">
  ${days.map(d => `<div class="bar" data-v="${fmtD(d)} · ${tk(map[d] || 0)}"><span style="height:${Math.round((map[d] || 0) / mx * 100)}%"></span><em>${d.slice(8)}</em></div>`).join('')}</div></div>
  <div class="card"><h3>${L('Low Stock Alert', 'কম স্টক সতর্কতা')}</h3><table><thead><tr><th>Watch</th><th>Stock</th><th>Reorder at</th></tr></thead><tbody>
  ${low.map(w => `<tr class="warn"><td><div class="prod">${thumb(w.image)}${e(w.brand_name + ' ' + w.model_name)}</div></td><td>${w.stock_qty}</td><td>${w.reorder_level}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">All stock OK ✓</td></tr>'}
  </tbody></table>${isAdmin() ? `<a class="btn ghost sm mt" href="#/purchases">+ ${L('Create purchase order', 'ক্রয় অর্ডার তৈরি')}</a>` : ''}</div></div>
  <div class="card"><div class="row between"><h3>${L('Recent Sales', 'সাম্প্রতিক বিক্রয়')}</h3><a class="btn primary" href="#/sales/new">+ ${L('New Sale', 'নতুন বিক্রয়')}</a></div>
  <table><thead><tr><th>#</th><th>Date</th><th>Customer</th><th>Total</th><th>Due</th><th>Status</th></tr></thead><tbody>
  ${rows('SELECT * FROM v_sale_summary ORDER BY sale_date DESC LIMIT 6').map(s => `<tr class="click" data-href="#/sale/${s.sale_id}"><td>${s.sale_id}</td><td>${fmtD(s.sale_date)}</td><td>${e(s.customer_name)}</td><td>${tk(s.total_amount)}</td><td>${tk(s.due)}</td><td>${badge(s.payment_status)}</td></tr>`).join('')}
  </tbody></table></div>`);
}

/* ---------- generic CRUD (watch, customer, supplier, brand, category, user) ---------- */
const T = {
  watch: ['Watches', 'ঘড়ি', 'watch', 'watch_id', {
    model_name: ['Model', 'মডেল', 'text'], brand_id: ['Brand', 'ব্র্যান্ড', 'select', 'SELECT brand_id, brand_name FROM brand ORDER BY brand_name'],
    category_id: ['Category', 'ক্যাটাগরি', 'select', 'SELECT category_id, category_name FROM category ORDER BY category_name'],
    purchase_price: ['Purchase Price', 'ক্রয় মূল্য', 'number'], sale_price: ['Sale Price', 'বিক্রয় মূল্য', 'number'], stock_qty: ['Stock', 'স্টক', 'number'],
    reorder_level: ['Reorder Level', 'রিঅর্ডার লেভেল', 'number'], warranty_months: ['Warranty (months)', 'ওয়ারেন্টি (মাস)', 'number'], image: ['Product Photo', 'পণ্যের ছবি', 'file']
  }, `SELECT w.watch_id, w.image, w.model_name, b.brand_name, c.category_name, w.purchase_price, w.sale_price, w.stock_qty, w.reorder_level, w.warranty_months
      FROM watch w JOIN brand b USING(brand_id) JOIN category c USING(category_id) ORDER BY b.brand_name, w.model_name`],
  customer: ['Customers', 'কাস্টমার', 'customer', 'customer_id', { customer_name: ['Name', 'নাম', 'text'], phone: ['Phone', 'ফোন', 'text'], email: ['Email', 'ইমেইল', 'email'], address: ['Address', 'ঠিকানা', 'text'] },
    `SELECT c.*, (SELECT COUNT(*) FROM sale s WHERE s.customer_id=c.customer_id) AS sales, (SELECT COALESCE(SUM(total_amount),0) FROM sale s WHERE s.customer_id=c.customer_id) AS spent FROM customer c ORDER BY customer_name`, true],
  supplier: ['Suppliers', 'সাপ্লায়ার', 'supplier', 'supplier_id', { supplier_name: ['Name', 'নাম', 'text'], phone: ['Phone', 'ফোন', 'text'], email: ['Email', 'ইমেইল', 'email'], address: ['Address', 'ঠিকানা', 'text'] },
    'SELECT * FROM supplier ORDER BY supplier_name'],
  brand: ['Brands', 'ব্র্যান্ড', 'brand', 'brand_id', { brand_name: ['Brand', 'ব্র্যান্ড', 'text'], country: ['Country', 'দেশ', 'text'] },
    'SELECT b.*, (SELECT COUNT(*) FROM watch w WHERE w.brand_id=b.brand_id) AS models FROM brand b ORDER BY brand_name'],
  category: ['Categories', 'ক্যাটাগরি', 'category', 'category_id', { category_name: ['Category', 'ক্যাটাগরি', 'text'] },
    'SELECT c.*, (SELECT COUNT(*) FROM watch w WHERE w.category_id=c.category_id) AS models FROM category c ORDER BY category_name'],
  user: ['Users', 'ইউজার', 'user', 'user_id', { full_name: ['Full Name', 'নাম', 'text'], email: ['Email', 'ইমেইল', 'email'], phone: ['Phone', 'ফোন', 'text'], role: ['Role', 'রোল', 'enum', ['Admin', 'Salesperson']], password: ['Password', 'পাসওয়ার্ড', 'password'] },
    'SELECT user_id, full_name, email, phone, role FROM user ORDER BY role, full_name']
};
function crudPage(t, editId) {
  if (!T[t]) return go('#/');
  if (t === 'user' && !isAdmin()) { flash('Only Admin can do this.', 'err'); return go('#/'); }
  const [en, bn, table, pk, F, listSql, open] = T[t];
  const canEdit = isAdmin() || open;
  const ed = editId ? one(`SELECT * FROM ${table} WHERE ${pk} = ?`, [editId]) : null;
  const list = rows(listSql);
  const form = !canEdit ? '' : `<form class="card form" data-act="crud" data-t="${t}"><h3>${ed ? L('Edit', 'এডিট') : L('Add New', 'নতুন যোগ করুন')}</h3>
   <input type="hidden" name="id" value="${e(ed?.[pk] || '')}">
   ${Object.entries(F).map(([f, d]) => { const v = ed?.[f] ?? ''; let inp;
     if (d[2] === 'select') inp = `<select name="${f}" required>${opts(d[3], v)}</select>`;
     else if (d[2] === 'enum') inp = `<select name="${f}">${d[3].map(o => `<option${o == v ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
     else if (d[2] === 'file') inp = `<div class="upload"><img id="imgPrev" src="${e(v || PH)}" alt=""><input type="file" name="${f}" accept="image/*"></div>`;
     else if (d[2] === 'password') inp = `<input type="password" name="${f}" ${ed ? 'placeholder="Leave blank to keep"' : 'required'}>`;
     else inp = `<input type="${d[2]}" name="${f}" value="${e(v)}" ${d[2] === 'number' ? 'step="any" min="0"' : ''} ${['email', 'address', 'country'].includes(f) ? '' : 'required'}>`;
     return `<label>${L(d[0], d[1])}${inp}</label>`; }).join('')}
   <div class="row"><button class="btn primary">${L('Save', 'সেভ')}</button>${ed ? `<a class="btn ghost" href="#/crud/${t}">${L('Cancel', 'বাতিল')}</a>` : ''}</div></form>`;
  let body;
  if (t === 'watch') {
    body = `<div class="gallery" id="tbl"><div class="gwrap">${list.map(r => { const lowS = r.stock_qty <= r.reorder_level, mg = r.sale_price > 0 ? Math.round((r.sale_price - r.purchase_price) / r.sale_price * 100) : 0;
      return `<article class="pcard"><div class="pimg"><img src="${e(r.image || PH)}" alt="" loading="lazy"><span class="badge ${lowS ? 'r' : 'g'} pstock">${r.stock_qty} ${L('in stock', 'স্টকে')}</span><span class="pcat">${e(r.category_name)}</span></div>
      <div class="pbody"><small>${e(r.brand_name)}</small><h4>${e(r.model_name)}</h4><div class="pprice"><b>${tk(r.sale_price)}</b><span class="muted small">${L('cost', 'ক্রয়')} ${tk(r.purchase_price)} · ${mg}% ${L('margin', 'মার্জিন')}</span></div>
      <div class="pmeta"><span>${icon('tool')} ${r.warranty_months} ${L('mo warranty', 'মাস ওয়ারেন্টি')}</span>${canEdit ? `<span class="actions"><a class="btn sm" href="#/crud/watch/${r.watch_id}">✎</a>${isAdmin() ? `<button class="btn sm danger" data-act="del" data-t="watch" data-id="${r.watch_id}">✕</button>` : ''}</span>` : ''}</div></div></article>`; }).join('')}</div></div>`;
  } else {
    const cols = list.length ? Object.keys(list[0]) : [];
    body = `<div class="tablewrap"><table id="tbl"><thead><tr>${cols.map(c => `<th>${e(c.replace(/_/g, ' ').replace(/\b\w/g, x => x.toUpperCase()))}</th>`).join('')}${canEdit ? '<th></th>' : ''}</tr></thead><tbody>
    ${list.map(r => `<tr>${cols.map(c => `<td>${/price|spent/.test(c) ? tk(r[c]) : e(r[c])}</td>`).join('')}${canEdit ? `<td class="actions"><a class="btn sm" href="#/crud/${t}/${r[pk]}">✎</a>${isAdmin() ? `<button class="btn sm danger" data-act="del" data-t="${t}" data-id="${r[pk]}">✕</button>` : ''}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  }
  page(L(en, bn), `<div class="grid2">${form}<div class="card ${canEdit ? '' : 'span2'}"><div class="row between"><h3>${L('All ' + en, 'সব ' + bn)} <small class="muted">(${list.length})</small></h3>
  <input class="search" data-search="#tbl" placeholder="Search..."></div>${body}</div></div>`);
}
async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
function shrink(file) {                                   // resize photo to ~420px so it fits in browser storage
  return new Promise((res, rej) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 8 * 1024 * 1024) return rej(new Error('Photo must be a JPG/PNG/WEBP image under 8 MB.'));
    const img = new Image(); img.onload = () => { const s = Math.min(1, 420 / Math.max(img.width, img.height)); const c = document.createElement('canvas');
      c.width = img.width * s; c.height = img.height * s; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .82)); };
    img.onerror = () => rej(new Error('Could not read this image.')); img.src = URL.createObjectURL(file);
  });
}
async function saveCrud(f) {
  const t = f.dataset.t, [, , table, pk, F, , open] = T[t];
  if (!(isAdmin() || open)) throw new Error('Only Admin can change this.');
  const d = formData(f), cols = [], vals = [];
  for (const [k, def] of Object.entries(F)) {
    let v = typeof d[k] === 'string' ? d[k].trim() : d[k];
    if (def[2] === 'password') { if (!v) continue; v = await sha(v); }
    if (def[2] === 'file') { const file = f.querySelector(`[name=${k}]`).files[0]; if (!file) continue; v = await shrink(file); }
    cols.push(k); vals.push(v === '' ? null : v);
  }
  tx(() => d.id ? run(`UPDATE ${table} SET ${cols.map(c => c + ' = ?').join(', ')} WHERE ${pk} = ?`, [...vals, d.id])
                : run(`INSERT INTO ${table} (${cols}) VALUES (${cols.map(() => '?')})`, vals));
  flash(d.id ? 'Updated.' : 'Added.'); go('#/crud/' + t);
}

/* ---------- sales ---------- */
function salesPage(status = '') {
  const list = rows('SELECT * FROM v_sale_summary' + (status ? ' WHERE payment_status = ?' : '') + ' ORDER BY sale_date DESC', status ? [status] : []);
  page(L('Sales', 'বিক্রয়'), `<div class="card"><div class="row between"><div class="row"><a class="btn primary" href="#/sales/new">+ ${L('New Sale', 'নতুন বিক্রয়')}</a>
  ${['', 'Paid', 'Partial', 'Due'].map(k => `<a class="chip${status === k ? ' on' : ''}" href="#/sales${k ? '/' + k : ''}">${k || 'All'}</a>`).join('')}</div><input class="search" data-search="#tbl" placeholder="Search..."></div>
  <div class="tablewrap"><table id="tbl"><thead><tr><th>#</th><th>Date</th><th>Customer</th><th>Salesperson</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>
  ${list.map(s => `<tr><td>${s.sale_id}</td><td>${fmtD(s.sale_date)}</td><td>${e(s.customer_name)}</td><td>${e(s.salesperson)}</td><td>${tk(s.total_amount)}</td><td>${tk(s.paid)}</td><td>${tk(s.due)}</td><td>${badge(s.payment_status)}</td><td><a class="btn sm" href="#/sale/${s.sale_id}">${L('Open', 'দেখুন')}</a></td></tr>`).join('')}
  </tbody></table></div></div>`);
}
function newSalePage() {
  const ws = rows(`SELECT w.watch_id, b.brand_name || ' ' || w.model_name || ' (stock ' || w.stock_qty || ')' n, w.sale_price FROM watch w JOIN brand b USING(brand_id) WHERE w.stock_qty > 0 ORDER BY n`);
  const wopt = '<option value="">— select —</option>' + ws.map(w => `<option value="${w.watch_id}" data-price="${w.sale_price}">${e(w.n)}</option>`).join('');
  page(L('Sales', 'বিক্রয়'), `<form class="card form" data-act="sale" data-calc><h3>${L('New Sale / Invoice', 'নতুন বিক্রয় / ইনভয়েস')}</h3>
  <div class="grid3"><label>${L('Customer', 'কাস্টমার')}<select name="customer_id" required>${opts("SELECT customer_id, customer_name || ' — ' || phone FROM customer ORDER BY customer_name")}</select>
  <a class="small" href="#/crud/customer">+ ${L('new customer', 'নতুন কাস্টমার')}</a></label>
  <label>${L('Salesperson', 'বিক্রেতা')}<input value="${e(me().full_name)}" disabled></label><label>${L('Date', 'তারিখ')}<input value="${fmtD(today())}" disabled></label></div>
  <table class="items"><thead><tr><th>${L('Watch', 'ঘড়ি')}</th><th>${L('Serial No', 'সিরিয়াল নং')}</th><th>${L('Qty', 'পরিমাণ')}</th><th>${L('Unit Price', 'দাম')}</th><th></th></tr></thead>
  <tbody id="rows"><tr><td><select name="watch_id" data-autoprice required>${wopt}</select></td><td><input name="serial" required placeholder="e.g. CAS-GA21-0010"></td>
  <td><input class="qty" name="qty" type="number" min="1" value="1" data-def="1"></td><td><input class="price" name="price" type="number" step="any" min="0" required></td>
  <td><button type="button" class="btn sm danger del-row">✕</button></td></tr></tbody></table>
  <button type="button" class="btn ghost" data-add-row="#rows">+ ${L('Add item', 'আইটেম যোগ')}</button>
  <div class="grid3 mt"><label>${L('Discount', 'ডিসকাউন্ট')}<input name="discount" type="number" step="any" min="0" value="0"></label>
  <label>${L('Paid now', 'এখন পরিশোধ')}<input name="paid" type="number" step="any" min="0" value="0"></label>
  <label>${L('Method', 'মাধ্যম')}<select name="method"><option>Cash</option><option>bKash</option><option>Nagad</option><option>Card</option></select></label></div>
  <div class="row between mt"><div class="total">${L('Total', 'মোট')}: <b id="total">৳ 0</b></div><button class="btn primary">${L('Save Sale', 'বিক্রয় সেভ')}</button></div></form>`);
}
function saveSale(f) {
  const tr = [...f.querySelectorAll('#rows tr')], items = tr.map(r => [r.querySelector('[name=watch_id]').value, r.querySelector('[name=serial]').value.trim(), +r.querySelector('[name=qty]').value, +r.querySelector('[name=price]').value]).filter(x => x[0] && x[2] > 0);
  if (!items.length) throw new Error('Add at least one watch.');
  const d = formData(f), sub = items.reduce((a, x) => a + x[2] * x[3], 0), disc = +d.discount || 0, total = Math.max(sub - disc, 0);
  const sid = tx(() => {
    const id = run("INSERT INTO sale (customer_id, salesperson_id, sale_date, discount, total_amount) VALUES (?,?,datetime('now','localtime'),?,?)", [d.customer_id, me().user_id, disc, total]);
    items.forEach(([w, s, q, p]) => run('INSERT INTO sale_item (sale_id, watch_id, serial_no, quantity, unit_price) VALUES (?,?,?,?,?)', [id, w, s, q, p]));
    const pay = Math.min(+d.paid || 0, total); if (pay > 0) run('INSERT INTO payment (sale_id, amount, method) VALUES (?,?,?)', [id, pay, d.method]);
    return id;
  });
  flash(`Sale #${sid} saved. Stock updated & warranty created by triggers.`); go('#/sale/' + sid);
}
function saleView(id) {
  const s = one('SELECT v.*, s.discount, c.phone, c.address FROM v_sale_summary v JOIN sale s USING(sale_id) JOIN customer c ON c.customer_id = s.customer_id WHERE v.sale_id = ?', [id]);
  if (!s) return go('#/sales');
  const items = rows(`SELECT si.*, b.brand_name, w.model_name, w.image, wa.end_date, r.return_id, r.return_date, r.refund_amount FROM sale_item si JOIN watch w USING(watch_id) JOIN brand b USING(brand_id)
     LEFT JOIN warranty wa ON wa.sale_item_id = si.sale_item_id LEFT JOIN sale_return r ON r.sale_item_id = si.sale_item_id WHERE si.sale_id = ?`, [id]);
  const pays = rows('SELECT * FROM payment WHERE sale_id = ? ORDER BY paid_at', [id]);
  page(L('Invoice #' + id, 'ইনভয়েস #' + id), `<div class="card invoice"><div class="row between"><div><h2><span class="mark">${icon('watch')}</span> WatchShop</h2>
  <p class="muted">${L('Sales Invoice', 'বিক্রয় ইনভয়েস')} #${id} · ${fmtDT(s.sale_date)}</p></div><div class="right"><b>${e(s.customer_name)}</b><br>${e(s.phone)}<br><span class="muted">${e(s.address)}</span></div></div>
  <table><thead><tr><th>Watch</th><th>Serial</th><th>Qty</th><th>Price</th><th>Amount</th><th>Warranty till</th><th class="noprint"></th></tr></thead><tbody>
  ${items.map(it => `<tr><td><div class="prod">${thumb(it.image)}<div><small class="muted">${e(it.brand_name)}</small><br><b>${e(it.model_name)}</b></div></div></td><td>${e(it.serial_no)}</td><td>${it.quantity}</td>
   <td>${tk(it.unit_price)}</td><td>${tk(it.unit_price * it.quantity)}</td><td>${it.return_id ? badge('Void') : fmtD(it.end_date)}</td><td class="noprint">
   ${it.return_id ? `<span class="badge r">Returned ${fmtD(it.return_date)} · ${tk(it.refund_amount)}</span>` : `<details><summary class="btn sm">${L('Return', 'রিটার্ন')}</summary>
   <form class="mini" data-act="return" data-sale="${id}"><input type="hidden" name="sale_item_id" value="${it.sale_item_id}"><input name="reason" placeholder="Reason" required>
   <input name="refund" type="number" step="any" min="0" value="${it.unit_price * it.quantity}"><button class="btn sm danger">${L('Confirm', 'নিশ্চিত')}</button></form></details>`}</td></tr>`).join('')}</tbody>
  <tfoot><tr><td colspan="4" class="right">Discount</td><td>- ${tk(s.discount)}</td><td colspan="2"></td></tr><tr><td colspan="4" class="right"><b>Total</b></td><td><b>${tk(s.total_amount)}</b></td><td colspan="2"></td></tr>
  <tr><td colspan="4" class="right">Paid</td><td>${tk(s.paid)}</td><td colspan="2">${badge(s.payment_status)}</td></tr><tr><td colspan="4" class="right">Due</td><td><b>${tk(s.due)}</b></td><td colspan="2"></td></tr></tfoot></table>
  <div class="inv-sum"><div><span>Discount</span><b>- ${tk(s.discount)}</b></div><div><span>Total</span><b>${tk(s.total_amount)}</b></div>
  <div><span>Paid</span><b>${tk(s.paid)}</b></div><div class="due"><span>Due ${badge(s.payment_status)}</span><b>${tk(s.due)}</b></div></div>
  <p class="muted small">Salesperson: ${e(s.salesperson)}</p><button class="btn ghost noprint" onclick="print()">${icon('print')} ${L('Print', 'প্রিন্ট')}</button></div>
  <div class="grid2 noprint"><div class="card"><h3>${L('Payment History', 'পেমেন্ট হিস্ট্রি')}</h3><table><thead><tr><th>Date</th><th>Method</th><th>Amount</th></tr></thead><tbody>
  ${pays.map(p => `<tr><td>${fmtD(p.paid_at)}</td><td>${e(p.method)}</td><td>${tk(p.amount)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No payment yet</td></tr>'}</tbody></table></div>
  ${s.due > 0 ? `<form class="card form" data-act="pay" data-sale="${id}"><h3>${L('Add Payment', 'পেমেন্ট যোগ')}</h3><label>${L('Amount', 'পরিমাণ')}<input name="amount" type="number" step="any" min="1" max="${s.due}" value="${s.due}"></label>
  <label>${L('Method', 'মাধ্যম')}<select name="method"><option>Cash</option><option>bKash</option><option>Nagad</option><option>Card</option></select></label><button class="btn primary">${L('Receive Payment', 'পেমেন্ট নিন')}</button></form>` : ''}</div>`);
}

/* ---------- purchases ---------- */
function purchasesPage(view) {
  const pos = rows(`SELECT po.*, s.supplier_name, u.full_name, (SELECT SUM(quantity) FROM purchase_item WHERE po_id = po.po_id) units FROM purchase_order po
     JOIN supplier s USING(supplier_id) JOIN user u ON u.user_id = po.created_by ORDER BY po.po_id DESC`);
  const wopt = '<option value="">— select —</option>' + rows("SELECT w.watch_id, b.brand_name || ' ' || w.model_name n, w.purchase_price FROM watch w JOIN brand b USING(brand_id) ORDER BY n").map(w => `<option value="${w.watch_id}" data-price="${w.purchase_price}">${e(w.n)}</option>`).join('');
  page(L('Purchase Orders', 'ক্রয় অর্ডার'), `<div class="grid2">${isAdmin() ? `<form class="card form" data-act="po" data-calc><h3>${L('New Purchase Order', 'নতুন ক্রয় অর্ডার')}</h3>
  <label>${L('Supplier', 'সাপ্লায়ার')}<select name="supplier_id" required>${opts('SELECT supplier_id, supplier_name FROM supplier ORDER BY supplier_name')}</select></label>
  <table class="items"><thead><tr><th>Watch</th><th>Qty</th><th>Unit Cost</th><th></th></tr></thead><tbody id="rows"><tr><td><select name="watch_id" data-autoprice required>${wopt}</select></td>
  <td><input class="qty" name="qty" type="number" min="1" value="1" data-def="1"></td><td><input class="price" name="price" type="number" step="any" min="0" required></td><td><button type="button" class="btn sm danger del-row">✕</button></td></tr></tbody></table>
  <button type="button" class="btn ghost" data-add-row="#rows">+ ${L('Add item', 'আইটেম যোগ')}</button>
  <div class="row between mt"><div class="total">${L('Total', 'মোট')}: <b id="total">৳ 0</b></div><button class="btn primary">${L('Create Order', 'অর্ডার তৈরি')}</button></div></form>` : ''}
  <div class="card ${isAdmin() ? '' : 'span2'}"><h3>${L('All Purchase Orders', 'সব ক্রয় অর্ডার')}</h3><div class="tablewrap"><table><thead><tr><th>#</th><th>Date</th><th>Supplier</th><th>Units</th><th>Total Cost</th><th>Status</th><th></th></tr></thead><tbody>
  ${pos.map(p => `<tr><td>${p.po_id}</td><td>${fmtD(p.order_date)}</td><td>${e(p.supplier_name)}</td><td>${p.units}</td><td>${tk(p.total_cost)}</td><td>${badge(p.status)}</td>
   <td class="actions"><a class="btn sm" href="#/purchases/${p.po_id}">👁</a>${isAdmin() && p.status === 'Pending' ? `<button class="btn sm primary" data-act="postatus" data-id="${p.po_id}" data-s="Received" title="Mark received">✓</button><button class="btn sm danger" data-act="postatus" data-id="${p.po_id}" data-s="Cancelled" title="Cancel">✕</button>` : ''}</td></tr>
   ${view == p.po_id ? `<tr class="sub"><td colspan="7">${rows("SELECT b.brand_name || ' ' || w.model_name n, pi.quantity, pi.unit_cost FROM purchase_item pi JOIN watch w USING(watch_id) JOIN brand b USING(brand_id) WHERE po_id=?", [p.po_id]).map(i => `${e(i.n)} × ${i.quantity} @ ${tk(i.unit_cost)}`).join('<br>')}<br><span class="muted small">Created by ${e(p.full_name)}</span></td></tr>` : ''}`).join('')}
  </tbody></table></div></div></div>`);
}
function savePO(f) {
  const items = [...f.querySelectorAll('#rows tr')].map(r => [r.querySelector('[name=watch_id]').value, +r.querySelector('[name=qty]').value, +r.querySelector('[name=price]').value]).filter(x => x[0] && x[1] > 0);
  if (!items.length) throw new Error('Add at least one watch.');
  const po = tx(() => { const id = run("INSERT INTO purchase_order (supplier_id, created_by, order_date, status, total_cost) VALUES (?,?,date('now','localtime'),'Pending',?)",
    [formData(f).supplier_id, me().user_id, items.reduce((a, x) => a + x[1] * x[2], 0)]);
    items.forEach(([w, q, c]) => run('INSERT INTO purchase_item (po_id, watch_id, quantity, unit_cost) VALUES (?,?,?,?)', [id, w, q, c])); return id; });
  flash(`Purchase order #${po} created (Pending).`); go('#/purchases');
}

/* ---------- warranty & repair ---------- */
function warrantyPage(find = '', exp = false) {
  const w = [], p = [];
  if (find) { w.push('(si.serial_no LIKE ? OR c.customer_name LIKE ? OR c.phone LIKE ?)'); p.push(`%${find}%`, `%${find}%`, `%${find}%`); }
  if (exp) w.push("wa.status = 'Active' AND wa.end_date BETWEEN date('now','localtime') AND date('now','localtime','+90 day')");
  const war = rows(`SELECT wa.*, si.serial_no, w.image, b.brand_name || ' ' || w.model_name watch, c.customer_name, c.phone,
     CASE WHEN wa.status='Void' THEN 'Void' WHEN wa.end_date < date('now','localtime') THEN 'Expired' ELSE 'Active' END state
     FROM warranty wa JOIN sale_item si USING(sale_item_id) JOIN sale s USING(sale_id) JOIN customer c USING(customer_id) JOIN watch w ON w.watch_id = si.watch_id JOIN brand b USING(brand_id)
     ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY wa.end_date`, p);
  const reps = rows(`SELECT r.*, si.serial_no, w.image, b.brand_name || ' ' || w.model_name watch, c.customer_name FROM repair r JOIN warranty wa USING(warranty_id) JOIN sale_item si USING(sale_item_id)
     JOIN sale s USING(sale_id) JOIN customer c USING(customer_id) JOIN watch w ON w.watch_id = si.watch_id JOIN brand b USING(brand_id)
     ORDER BY CASE r.status WHEN 'Received' THEN 1 WHEN 'In Repair' THEN 2 WHEN 'Ready' THEN 3 ELSE 4 END, r.received_date DESC`);
  page(L('Warranty & Repair', 'ওয়ারেন্টি ও মেরামত'), `<div class="card"><h3>${L('Repair Requests', 'মেরামতের অনুরোধ')}</h3><div class="tablewrap"><table><thead><tr><th>#</th><th>Received</th><th>Customer</th><th>Watch / Serial</th><th>Issue</th><th>Status · Cost</th><th>Delivered</th></tr></thead><tbody>
  ${reps.map(r => `<tr><td>${r.repair_id}</td><td>${fmtD(r.received_date)}</td><td>${e(r.customer_name)}</td><td><div class="prod">${thumb(r.image)}<div>${e(r.watch)}<br><small class="muted">${e(r.serial_no)}</small></div></div></td><td>${e(r.issue)}</td>
   <td><form class="mini" data-act="repupd"><input type="hidden" name="repair_id" value="${r.repair_id}"><select name="status">${['Received', 'In Repair', 'Ready', 'Delivered'].map(o => `<option${o === r.status ? ' selected' : ''}>${o}</option>`).join('')}</select>
   <input name="cost" type="number" step="any" min="0" value="${r.repair_cost}" style="width:90px"><button class="btn sm">💾</button></form></td><td>${r.delivered_date ? fmtD(r.delivered_date) : badge(r.status)}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="card"><form class="row between" data-act="wfind"><h3>${L('Warranties', 'ওয়ারেন্টি')}</h3><div class="row"><input class="search" name="find" value="${e(find)}" placeholder="Serial / customer / phone">
  <label class="chk"><input type="checkbox" name="exp" ${exp ? 'checked' : ''}> ${L('Expiring in 90 days', '৯০ দিনে মেয়াদ শেষ')}</label><button class="btn ghost">🔍</button></div></form>
  <div class="tablewrap"><table><thead><tr><th>#</th><th>Customer</th><th>Watch / Serial</th><th>Start</th><th>End</th><th>Status</th><th>${L('New Repair', 'নতুন মেরামত')}</th></tr></thead><tbody>
  ${war.map(x => `<tr><td>${x.warranty_id}</td><td>${e(x.customer_name)}<br><small class="muted">${e(x.phone)}</small></td><td><div class="prod">${thumb(x.image)}<div>${e(x.watch)}<br><small class="muted">${e(x.serial_no)}</small></div></div></td>
   <td>${fmtD(x.start_date)}</td><td>${fmtD(x.end_date)}</td><td>${badge(x.state)}</td><td>${x.state !== 'Void' ? `<details><summary class="btn sm">+ ${L('Repair', 'মেরামত')}</summary>
   <form class="mini" data-act="repnew"><input type="hidden" name="warranty_id" value="${x.warranty_id}"><input name="issue" placeholder="Issue" required>${x.state === 'Expired' ? '<input name="cost" type="number" min="0" placeholder="Cost">' : ''}<button class="btn sm primary">Save</button></form></details>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No warranty found</td></tr>'}
  </tbody></table></div></div>`);
}

/* ---------- reports ---------- */
function hbars(data, money = true) {
  if (!data.length) return '<p class="muted">No data in this period</p>';
  const m = Math.max(...data.map(d => d.v)) || 1;
  return '<div class="hbars">' + data.map(d => `<div class="hb"><span>${e(d.label)}</span><div><i style="width:${Math.round(d.v / m * 100)}%"></i></div><b>${money ? tk(d.v) : d.v}</b></div>`).join('') + '</div>';
}
function reportsPage(from, to) {
  from = from || val("SELECT date('now','localtime','-90 day')"); to = to || today();
  const R = [from, to], IN = 'date(s.sale_date) BETWEEN ? AND ?', NR = 'NOT EXISTS (SELECT 1 FROM sale_return r WHERE r.sale_item_id = si.sale_item_id)';
  const sum = one(`SELECT COUNT(DISTINCT s.sale_id) n, COALESCE(SUM(si.unit_price*si.quantity),0) gross, COALESCE(SUM((si.unit_price-w.purchase_price)*si.quantity),0) gp, COALESCE(SUM(si.quantity),0) units
     FROM sale s JOIN sale_item si USING(sale_id) JOIN watch w ON w.watch_id=si.watch_id WHERE ${IN} AND ${NR}`, R);
  const disc = val(`SELECT COALESCE(SUM(discount),0) FROM sale s WHERE ${IN}`, R), refund = val('SELECT COALESCE(SUM(refund_amount),0) FROM sale_return WHERE return_date BETWEEN ? AND ?', R);
  const maxDay = one(`SELECT date(s.sale_date) d, SUM(s.total_amount) t, COUNT(*) n FROM sale s WHERE ${IN} GROUP BY d ORDER BY t DESC LIMIT 1`, R);
  const top = ord => rows(`SELECT b.brand_name || ' ' || w.model_name watch, w.image, SUM(si.quantity) qty, SUM(si.unit_price*si.quantity) rev FROM sale s JOIN sale_item si USING(sale_id)
     JOIN watch w ON w.watch_id=si.watch_id JOIN brand b USING(brand_id) WHERE ${IN} AND ${NR} GROUP BY w.watch_id ORDER BY ${ord} LIMIT 5`, R);
  const topQty = top('qty DESC, rev DESC'), topRev = top('rev DESC');
  const topCust = rows(`SELECT c.customer_name, c.phone, COUNT(*) orders, SUM(s.total_amount) spent FROM sale s JOIN customer c USING(customer_id) WHERE ${IN} GROUP BY c.customer_id ORDER BY spent DESC LIMIT 5`, R);
  const grp = (lab, join, g) => rows(`SELECT ${lab} label, SUM(si.unit_price*si.quantity) v FROM sale s JOIN sale_item si USING(sale_id) JOIN watch w ON w.watch_id=si.watch_id ${join} WHERE ${IN} AND ${NR} GROUP BY ${g} ORDER BY v DESC`, R);
  const byBrand = grp('b.brand_name', 'JOIN brand b USING(brand_id)', 'b.brand_id'), byCat = grp('c.category_name', 'JOIN category c USING(category_id)', 'c.category_id');
  const bySp = rows(`SELECT u.full_name label, SUM(s.total_amount) v FROM sale s JOIN user u ON u.user_id=s.salesperson_id WHERE ${IN} GROUP BY u.user_id ORDER BY v DESC`, R);
  const byMonth = rows(`SELECT strftime('%Y-%m', s.sale_date) label, SUM(s.total_amount) v FROM sale s WHERE ${IN} GROUP BY label ORDER BY label`, R)
    .map(r => ({ ...r, label: new Date(r.label + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) }));
  const byMethod = rows('SELECT method label, SUM(amount) v FROM payment WHERE date(paid_at) BETWEEN ? AND ? GROUP BY method ORDER BY v DESC', R);
  const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const byWd = rows(`SELECT strftime('%w', s.sale_date) label, SUM(s.total_amount) v FROM sale s WHERE ${IN} GROUP BY label ORDER BY label`, R).map(r => ({ ...r, label: WD[+r.label] }));
  const dues = rows('SELECT * FROM v_sale_summary WHERE due > 0 ORDER BY due DESC');
  const dead = rows(`SELECT b.brand_name || ' ' || w.model_name watch, w.image, w.stock_qty, w.stock_qty*w.purchase_price val,
     (SELECT MAX(s.sale_date) FROM sale_item si JOIN sale s USING(sale_id) WHERE si.watch_id=w.watch_id) last_sold FROM watch w JOIN brand b USING(brand_id)
     WHERE w.stock_qty > 0 AND w.watch_id NOT IN (SELECT si.watch_id FROM sale_item si JOIN sale s USING(sale_id) WHERE s.sale_date >= date('now','localtime','-30 day')) ORDER BY val DESC`);
  const repBrand = rows(`SELECT b.brand_name label, COUNT(*) v FROM repair r JOIN warranty wa USING(warranty_id) JOIN sale_item si USING(sale_item_id) JOIN watch w ON w.watch_id=si.watch_id JOIN brand b USING(brand_id) GROUP BY b.brand_id ORDER BY v DESC`);
  const topTbl = l => `<table><thead><tr><th>#</th><th>Watch</th><th>Qty</th><th>Revenue</th></tr></thead><tbody>${l.map((r, i) => `<tr><td>${i + 1}</td><td><div class="prod">${thumb(r.image)}${e(r.watch)}</div></td><td>${r.qty}</td><td>${tk(r.rev)}</td></tr>`).join('')}</tbody></table>`;
  const quick = [[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '1 year']];
  page(L('Reports & Analytics', 'রিপোর্ট ও অ্যানালিটিক্স'), `<form class="card row" data-act="rep"><label class="inline">${L('From', 'থেকে')} <input type="date" name="from" value="${from}"></label>
  <label class="inline">${L('To', 'পর্যন্ত')} <input type="date" name="to" value="${to}"></label><button class="btn primary">${L('Apply', 'দেখুন')}</button>
  ${quick.map(([d, l]) => `<a class="chip" href="#/reports/${val(`SELECT date('now','localtime','-${d} day')`)}/${today()}">${l}</a>`).join('')}<button type="button" class="btn ghost" onclick="print()">${icon('print')}</button></form>
  <div class="kpis"><div class="kpi"><i>${icon('sale')}</i><div><small>${L('Sales', 'বিক্রয়')}</small><b>${sum.n}</b><small class="muted">${sum.units} watches</small></div></div>
  <div class="kpi"><i class="k-money">${icon('money')}</i><div><small>${L('Net Revenue', 'নিট আয়')}</small><b>${tk(sum.gross - disc)}</b><small class="muted">after discount, excl. returns</small></div></div>
  <div class="kpi"><i class="k-up">${icon('up')}</i><div><small>${L('Profit', 'লাভ')}</small><b>${tk(sum.gp - disc)}</b><small class="muted">sale − purchase − discount</small></div></div>
  <div class="kpi"><i class="k-alert">${icon('undo')}</i><div><small>${L('Refunds', 'রিফান্ড')}</small><b>${tk(refund)}</b></div></div>
  <div class="kpi hl"><i>${icon('trophy')}</i><div><small>${L('Max Sales Day', 'সর্বোচ্চ বিক্রয়ের দিন')}</small><b>${maxDay ? fmtD(maxDay.d) : '—'}</b><small class="muted">${maxDay ? tk(maxDay.t) + ' · ' + maxDay.n + ' sales' : ''}</small></div></div></div>
  <div class="grid2"><div class="card"><h3>${L('Top 5 Best-Selling Watches (by quantity)', 'সেরা ৫ ঘড়ি (পরিমাণে)')}</h3>${topTbl(topQty)}</div>
  <div class="card"><h3>${L('Top 5 Watches (by revenue)', 'সেরা ৫ ঘড়ি (আয়ে)')}</h3>${topTbl(topRev)}</div>
  <div class="card"><h3>${L('Top 5 Customers', 'সেরা ৫ কাস্টমার')}</h3><table><thead><tr><th>#</th><th>Customer</th><th>Orders</th><th>Spent</th></tr></thead><tbody>
  ${topCust.map((r, i) => `<tr><td>${i + 1}</td><td>${e(r.customer_name)}<br><small class="muted">${e(r.phone)}</small></td><td>${r.orders}</td><td>${tk(r.spent)}</td></tr>`).join('')}</tbody></table></div>
  <div class="card"><h3>${L('Monthly Sales', 'মাসিক বিক্রয়')}</h3>${hbars(byMonth)}</div><div class="card"><h3>${L('Sales by Brand', 'ব্র্যান্ড অনুযায়ী')}</h3>${hbars(byBrand)}</div>
  <div class="card"><h3>${L('Sales by Category', 'ক্যাটাগরি অনুযায়ী')}</h3>${hbars(byCat)}</div><div class="card"><h3>${L('Sales by Salesperson', 'বিক্রেতা অনুযায়ী')}</h3>${hbars(bySp)}</div>
  <div class="card"><h3>${L('Payments by Method', 'পেমেন্ট মাধ্যম')}</h3>${hbars(byMethod)}</div><div class="card"><h3>${L('Sales by Day of Week', 'সপ্তাহের দিন অনুযায়ী')}</h3>${hbars(byWd)}</div>
  <div class="card"><h3>${L('Most Repaired Brands', 'সবচেয়ে বেশি মেরামত')}</h3>${hbars(repBrand, false)}</div></div>
  <div class="grid2"><div class="card"><h3>${L('Outstanding Dues', 'বকেয়া')} <small class="muted">(${tk(dues.reduce((a, d) => a + d.due, 0))})</small></h3><table><thead><tr><th>Sale</th><th>Customer</th><th>Total</th><th>Due</th></tr></thead><tbody>
  ${dues.map(d => `<tr class="click" data-href="#/sale/${d.sale_id}"><td>#${d.sale_id}</td><td>${e(d.customer_name)}</td><td>${tk(d.total_amount)}</td><td><b>${tk(d.due)}</b></td></tr>`).join('') || '<tr><td colspan="4" class="muted">No dues ✓</td></tr>'}</tbody></table></div>
  <div class="card"><h3>${L('Slow-Moving Stock (no sale in 30 days)', 'ধীর গতির স্টক (৩০ দিনে বিক্রি নেই)')}</h3><table><thead><tr><th>Watch</th><th>Stock</th><th>Value</th><th>Last sold</th></tr></thead><tbody>
  ${dead.map(d => `<tr><td><div class="prod">${thumb(d.image)}${e(d.watch)}</div></td><td>${d.stock_qty}</td><td>${tk(d.val)}</td><td>${d.last_sold ? fmtD(d.last_sold) : 'Never'}</td></tr>`).join('')}</tbody></table></div></div>`);
}

/* ---------- SQL console ---------- */
const SAMPLES = [
  ['Top 5 customers', `SELECT c.customer_name, COUNT(*) AS orders, SUM(s.total_amount) AS spent\nFROM sale s JOIN customer c ON c.customer_id = s.customer_id\nGROUP BY c.customer_id ORDER BY spent DESC LIMIT 5;`],
  ['Max sales day', `SELECT date(sale_date) AS day, SUM(total_amount) AS total\nFROM sale GROUP BY day ORDER BY total DESC LIMIT 1;`],
  ['Low stock (view)', 'SELECT * FROM v_low_stock;'],
  ['Dues (view)', 'SELECT sale_id, customer_name, total_amount, paid, due FROM v_sale_summary WHERE due > 0;'],
  ['All tables', "SELECT name, type FROM sqlite_master WHERE type IN ('table','view','trigger') AND name NOT LIKE 'sqlite_%' ORDER BY type, name;"],
  ['Foreign keys of sale_item', "SELECT * FROM pragma_foreign_key_list('sale_item');"]
];
function sqlPage(q) {
  q = q ?? SAMPLES[0][1];
  let out = '';
  try {
    const t0 = performance.now(), res = db.exec(q), ms = (performance.now() - t0).toFixed(1);
    if (!/^\s*(select|pragma|with)/i.test(q)) save();
    out = res.length ? res.map(r => `<div class="tablewrap"><table><thead><tr>${r.columns.map(c => `<th>${e(c)}</th>`).join('')}</tr></thead><tbody>
      ${r.values.slice(0, 300).map(v => `<tr>${v.map(x => `<td>${typeof x === 'string' && x.startsWith('data:') ? '[image]' : e(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="muted small">${r.values.length} row(s) · ${ms} ms</p>`).join('') : `<div class="flash ok">Query OK · ${db.getRowsModified()} row(s) changed · ${ms} ms</div>`;
  } catch (x) { out = `<div class="flash err">${e(x.message)}</div>`; }
  page(L('SQL Console', 'SQL কনসোল'), `<div class="card"><div class="row between"><h3>${icon('db')} ${L('Run SQL on the live database', 'লাইভ ডেটাবেসে SQL চালান')}</h3>
  <div class="row">${SAMPLES.map((s, i) => `<button class="chip" data-act="sample" data-i="${i}">${e(s[0])}</button>`).join('')}</div></div>
  <form data-act="sql"><textarea name="q" class="sqlbox" spellcheck="false">${e(q)}</textarea><div class="row between mt"><span class="muted small">${L('Engine: SQLite (WebAssembly) — same tables, keys, triggers and views as the MySQL version.', 'ইঞ্জিন: SQLite (WebAssembly) — MySQL ভার্সনের মতোই টেবিল, কি, ট্রিগার ও ভিউ।')}</span>
  <button class="btn primary">▶ ${L('Run', 'চালান')}</button></div></form></div><div class="card">${out}</div>`);
}

/* ======================= ROUTER ======================= */
function route() {
  const parts = (location.hash || '#/').slice(2).split('/').map(decodeURIComponent);
  if (parts[0] === 'logout') { store.del('ws_user'); location.hash = '#/login'; return; }
  if (!me()) return loginPage();
  if (parts[0] === 'login') return go('#/');
  try {
    switch (parts[0]) {
      case '': return dashboard();
      case 'crud': return crudPage(parts[1], parts[2]);
      case 'sales': return parts[1] === 'new' ? newSalePage() : salesPage(parts[1] || '');
      case 'sale': return saleView(+parts[1]);
      case 'purchases': return purchasesPage(+parts[1] || 0);
      case 'warranty': return warrantyPage(parts[1] || '', parts[2] === '1');
      case 'reports': return reportsPage(parts[1], parts[2]);
      case 'sql': return sqlPage(sessionStorage.getItem('ws_sql'));
      default: return go('#/');
    }
  } catch (x) { console.error(x); flash(niceErr(x), 'err'); if (parts[0]) go('#/'); }
}
window.addEventListener('hashchange', route);

/* ======================= EVENTS ======================= */
document.addEventListener('submit', async ev => {
  const f = ev.target, act = f.dataset.act; if (!act) return; ev.preventDefault();
  try {
    if (act === 'login') {
      const d = formData(f), u = one('SELECT user_id, full_name, email, role, password FROM user WHERE email = ?', [d.email.trim()]);
      if (!u || u.password !== await sha(d.password)) return loginPage('Wrong email or password');
      delete u.password; store.set('ws_user', JSON.stringify(u)); return go('#/');
    }
    if (act === 'crud') return await saveCrud(f);
    if (act === 'sale') return saveSale(f);
    if (act === 'po') return savePO(f);
    if (act === 'pay') { const id = +f.dataset.sale, d = formData(f), due = val('SELECT due FROM v_sale_summary WHERE sale_id=?', [id]), amt = Math.min(+d.amount, due);
      if (amt <= 0) throw new Error('Nothing due.'); tx(() => run('INSERT INTO payment (sale_id, amount, method) VALUES (?,?,?)', [id, amt, d.method])); flash('Payment added. Status updated by trigger.'); return go('#/sale/' + id); }
    if (act === 'return') { if (!confirm('Return this item?')) return; const d = formData(f);
      tx(() => run("INSERT INTO sale_return (sale_item_id, return_date, reason, refund_amount) VALUES (?,date('now','localtime'),?,?)", [d.sale_item_id, d.reason, +d.refund || 0]));
      flash('Return saved. Stock updated and warranty voided (trigger).'); return go('#/sale/' + f.dataset.sale); }
    if (act === 'repnew') { const d = formData(f), w = one('SELECT status, end_date FROM warranty WHERE warranty_id = ?', [d.warranty_id]);
      if (w.status === 'Void') throw new Error('This warranty is void (item returned).');
      tx(() => run("INSERT INTO repair (warranty_id, received_date, issue, repair_cost, status) VALUES (?,date('now','localtime'),?,?,'Received')", [d.warranty_id, d.issue, w.end_date >= today() ? 0 : (+d.cost || 0)]));
      flash('Repair request logged.'); return route(); }
    if (act === 'repupd') { const d = formData(f);
      tx(() => run("UPDATE repair SET status = ?, repair_cost = ?, delivered_date = CASE WHEN ? = 'Delivered' THEN date('now','localtime') ELSE NULL END WHERE repair_id = ?", [d.status, +d.cost || 0, d.status, d.repair_id]));
      flash('Repair updated.'); return route(); }
    if (act === 'wfind') { const d = formData(f); return go(`#/warranty/${encodeURIComponent(d.find || '')}/${d.exp ? 1 : 0}`); }
    if (act === 'rep') { const d = formData(f); return go(`#/reports/${d.from}/${d.to}`); }
    if (act === 'sql') { sessionStorage.setItem('ws_sql', formData(f).q); return sqlPage(formData(f).q); }
  } catch (x) { flash(niceErr(x), 'err'); route(); }
});
document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-act]'); const tr = ev.target.closest('tr[data-href]');
  if (tr && !b) return go(tr.dataset.href);
  if (!b || b.tagName === 'FORM') return;
  const act = b.dataset.act;
  try {
    if (act === 'del') { if (!confirm('Delete?')) return; const [, , table, pk] = T[b.dataset.t]; tx(() => run(`DELETE FROM ${table} WHERE ${pk} = ?`, [b.dataset.id])); flash('Deleted.'); route(); }
    if (act === 'postatus') { tx(() => run("UPDATE purchase_order SET status = ? WHERE po_id = ? AND status = 'Pending'", [b.dataset.s, b.dataset.id]));
      flash(b.dataset.s === 'Received' ? 'Marked Received. Stock updated by trigger.' : 'Order cancelled.'); route(); }
    if (act === 'menu') { document.body.classList.toggle('nav-open'); return; }
    if (act === 'sample') { const q = SAMPLES[+b.dataset.i][1]; sessionStorage.setItem('ws_sql', q); sqlPage(q); }
    if (act === 'reset') { if (!confirm('Reset all data to the original sample data?')) return; await freshDB(); flash('Demo data reset.'); route(); }
  } catch (x) { flash(niceErr(x), 'err'); route(); }
});
// dynamic item rows, live total, image preview, table search
document.addEventListener('click', ev => {
  const add = ev.target.closest('[data-add-row]');
  if (add) { const tb = document.querySelector(add.dataset.addRow), r = tb.rows[0].cloneNode(true); r.querySelectorAll('input').forEach(i => i.value = i.dataset.def || ''); r.querySelector('select').value = ''; tb.appendChild(r); calc(); }
  if (ev.target.matches('.del-row')) { const tb = ev.target.closest('tbody'); if (tb.rows.length > 1) ev.target.closest('tr').remove(); calc(); }
});
function calc() {
  const f = document.querySelector('form[data-calc]'); if (!f) return; let sum = 0;
  f.querySelectorAll('tbody tr').forEach(r => { sum += (+r.querySelector('.price')?.value || 0) * (+r.querySelector('.qty')?.value || 0); });
  const out = f.querySelector('#total'); if (out) out.textContent = '৳ ' + Math.max(sum - (+(f.querySelector('[name=discount]')?.value) || 0), 0).toLocaleString('en-US');
}
document.addEventListener('change', ev => {
  const s = ev.target;
  if (s.matches('select[data-autoprice]')) { const p = s.closest('tr').querySelector('.price'); p.value = s.selectedOptions[0]?.dataset.price || ''; }
  if (s.matches('input[type=file]') && s.files[0]) { const im = document.getElementById('imgPrev'); if (im) im.src = URL.createObjectURL(s.files[0]); }
  if (s.matches('[name=exp]')) s.form.requestSubmit();
  calc();
});
document.addEventListener('input', ev => {
  calc();
  const inp = ev.target; if (!inp.dataset.search) return;
  const v = inp.value.toLowerCase();
  document.querySelectorAll(inp.dataset.search + ' tbody tr, ' + inp.dataset.search + ' .pcard').forEach(r => r.style.display = r.textContent.toLowerCase().includes(v) ? '' : 'none');
});

/* ======================= BOOT ======================= */
(async function boot() {
  applyTheme(store.get('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  try {
    SQL = await initSqlJs({ locateFile: f => 'vendor/' + f });
    const saved = store.get(DBKEY);
    if (saved) { const bin = atob(saved), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); db = new SQL.Database(u8); }
    else await freshDB();
    db.exec('PRAGMA foreign_keys = ON');
    route();
  } catch (x) {
    console.error(x);
    document.getElementById('app').innerHTML = `<div class="install"><div class="card login"><h2>Could not start the database</h2><p class="muted">${e(x.message)}</p>
      <button class="btn primary" onclick="localStorage.clear();location.reload()">Reset & reload</button></div></div>`;
  }
})();
