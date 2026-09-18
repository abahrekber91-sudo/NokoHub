const $ = s => document.querySelector(s);
let products = [];
let selectedProduct = null;
let adminKey = localStorage.getItem("nokohub_admin_key") || "";

const money = (n) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0
}).format(Number(n));

async function api(path, options = {}) {
  const headers = {"Content-Type":"application/json", ...(options.headers || {})};
  if (adminKey && path.startsWith("/api/admin")) headers.Authorization = `Bearer ${adminKey}`;
  const res = await fetch(path, {...options, headers});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request gagal");
  return data;
}

function countryFlag(code) {
  if (!code || code.length !== 2) return "📱";
  return [...code.toUpperCase()].map(c => String.fromCodePoint(c.charCodeAt(0)+127397)).join("");
}

function renderProducts(list = products) {
  const grid = $("#productsGrid");
  if (!list.length) {
    grid.innerHTML = `<div class="loading">Tidak ada nomor tersedia.</div>`;
    return;
  }
  grid.innerHTML = list.map(p => `
    <article class="card">
      <div class="flag">${countryFlag(p.country_code)}</div>
      <div class="meta">${escapeHtml(p.provider || "Provider")}</div>
      <h3>${escapeHtml(p.country)}</h3>
      <div class="price">${money(p.price)}</div>
      <div class="meta">Nomor tersedia · ${escapeHtml(p.country_code)}</div>
      <button class="button primary" onclick="openOrder(${p.id})">Pesan</button>
    </article>
  `).join("");
}

async function loadProducts() {
  try {
    const data = await api("/api/products");
    products = data.products || [];
    const countries = [...new Set(products.map(p => p.country))].sort();
    $("#countryFilter").innerHTML = `<option value="">Semua negara</option>` +
      countries.map(c => `<option>${escapeHtml(c)}</option>`).join("");
    renderProducts();
  } catch (e) {
    $("#productsGrid").innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
  }
}

$("#countryFilter").addEventListener("change", e => {
  renderProducts(e.target.value ? products.filter(p => p.country === e.target.value) : products);
});

window.openOrder = (id) => {
  selectedProduct = products.find(p => p.id === id);
  if (!selectedProduct) return;
  $("#modalTitle").textContent = `${selectedProduct.country} · ${selectedProduct.provider}`;
  $("#modalPrice").textContent = money(selectedProduct.price);
  $("#orderResult").innerHTML = "";
  $("#orderModal").classList.remove("hidden");
};

$("#closeModal").onclick = () => $("#orderModal").classList.add("hidden");

$("#orderForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!selectedProduct) return;
  const result = $("#orderResult");
  result.innerHTML = "Membuat pesanan...";
  try {
    const data = await api("/api/orders", {
      method:"POST",
      body:JSON.stringify({
        product_id:selectedProduct.id,
        customer_name:$("#customerName").value,
        customer_contact:$("#customerContact").value,
        note:$("#customerNote").value
      })
    });
    result.innerHTML = `<div class="success">
      <b>Pesanan dibuat.</b><br>
      Kode: <strong>${escapeHtml(data.order.order_code)}</strong><br>
      Access token: <strong>${escapeHtml(data.order.access_token)}</strong><br>
      Total: <strong>${money(data.order.amount)}</strong><br><br>
      Simpan kode dan token ini. Pembayaran/penyerahan nomor diproses oleh admin.
    </div>`;
    $("#orderForm").reset();
    loadProducts();
  } catch (e) {
    result.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
  }
});

$("#checkForm").addEventListener("submit", async e => {
  e.preventDefault();
  const box = $("#checkResult");
  box.innerHTML = "Mengecek...";
  try {
    const data = await api("/api/orders/check", {
      method:"POST",
      body:JSON.stringify({
        order_code:$("#checkCode").value,
        access_token:$("#checkToken").value
      })
    });
    const o = data.order;
    box.innerHTML = `<div class="success">
      <b>${escapeHtml(o.order_code)}</b><br>
      Status pembayaran: <strong>${escapeHtml(o.payment_status)}</strong><br>
      Status pemenuhan: <strong>${escapeHtml(o.fulfillment_status)}</strong><br>
      Negara: ${escapeHtml(o.country)}<br>
      ${o.phone_number ? `Nomor: <strong>${escapeHtml(o.phone_number)}</strong>` : "Nomor belum ditampilkan."}
    </div>`;
  } catch (e) {
    box.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
  }
});

$("#adminLoginBtn").onclick = async () => {
  const key = prompt("Masukkan ADMIN_KEY Cloudflare:");
  if (!key) return;
  adminKey = key;
  localStorage.setItem("nokohub_admin_key", key);
  await loadAdmin();
};

async function loadAdmin() {
  if (!adminKey) return;
  try {
    const [stats, prods, orders] = await Promise.all([
      api("/api/admin/stats"), api("/api/admin/products"), api("/api/admin/orders")
    ]);
    $("#adminPanel").classList.remove("hidden");
    $("#stats").innerHTML = [
      ["Tersedia",stats.stats.available],["Terjual",stats.stats.sold],
      ["Order",stats.stats.orders],[ "Revenue",money(stats.stats.revenue)]
    ].map(x=>`<div class="stat"><small>${x[0]}</small><b>${x[1]}</b></div>`).join("");
    renderAdminProducts(prods.products);
    renderAdminOrders(orders.orders);
    $("#adminLoginBtn").textContent = "Refresh Admin";
  } catch(e) {
    localStorage.removeItem("nokohub_admin_key");
    adminKey = "";
    alert(e.message);
  }
}

function renderAdminProducts(items) {
  $("#adminProducts").innerHTML = `<div class="table">` + items.map(p => `
    <div class="row">
      <div><b>${escapeHtml(p.country)}</b><br><small>${escapeHtml(p.phone_number)}</small></div>
      <div>${money(p.price)}<br><small>${escapeHtml(p.status)}</small></div>
      <div><button class="button" onclick="setProduct(${p.id},'available')">Ready</button></div>
      <div><button class="button" onclick="setProduct(${p.id},'disabled')">Off</button></div>
    </div>`).join("") + `</div>`;
}

window.setProduct = async (id,status) => {
  try { await api(`/api/admin/products/${id}`,{method:"PATCH",body:JSON.stringify({status})}); loadAdmin(); loadProducts(); }
  catch(e){alert(e.message)}
};

function renderAdminOrders(items) {
  $("#adminOrders").innerHTML = `<div class="table">` + items.map(o => `
    <div class="row" style="grid-template-columns:1.3fr 1fr 1fr 1fr 1fr">
      <div><b>${escapeHtml(o.order_code)}</b><br><small>${escapeHtml(o.customer_name)} · ${escapeHtml(o.customer_contact)}</small></div>
      <div>${escapeHtml(o.country)}<br><small>${escapeHtml(o.phone_number)}</small></div>
      <div>${money(o.amount)}</div>
      <div><small>Pay:</small> ${escapeHtml(o.payment_status)}<br><small>Fulfill:</small> ${escapeHtml(o.fulfillment_status)}</div>
      <div>
        <button class="button" onclick="setOrder(${o.id},{payment_status:'paid',fulfillment_status:'processing'})">Paid</button>
        <button class="button" onclick="setOrder(${o.id},{payment_status:'paid',fulfillment_status:'fulfilled'})">Fulfill</button>
      </div>
    </div>`).join("") + `</div>`;
}

window.setOrder = async (id, payload) => {
  try { await api(`/api/admin/orders/${id}`,{method:"PATCH",body:JSON.stringify(payload)}); loadAdmin(); loadProducts(); }
  catch(e){alert(e.message)}
};

$("#productForm").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await api("/api/admin/products", {
      method:"POST",
      body:JSON.stringify({
        country:$("#pCountry").value, country_code:$("#pCode").value,
        provider:$("#pProvider").value || "Manual",
        phone_number:$("#pPhone").value, price:Number($("#pPrice").value)
      })
    });
    e.target.reset(); $("#productMsg").textContent = "Produk ditambahkan.";
    loadAdmin(); loadProducts();
  } catch(e) { $("#productMsg").textContent = e.message; }
});

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

loadProducts();
if (adminKey) loadAdmin();
