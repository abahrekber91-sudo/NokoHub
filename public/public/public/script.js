let products = [];
let activeCountry = "all";

const flags = {
  ID: "🇮🇩",
  US: "🇺🇸",
  GB: "🇬🇧",
  MY: "🇲🇾",
  SG: "🇸🇬",
  PH: "🇵🇭",
  TH: "🇹🇭",
  VN: "🇻🇳",
  IN: "🇮🇳",
  BR: "🇧🇷",
  CA: "🇨🇦",
  AU: "🇦🇺",
  DE: "🇩🇪",
  FR: "🇫🇷",
  ES: "🇪🇸"
};

function formatPrice(value, currency = "IDR") {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

function scrollToProducts() {
  document.querySelector("#products").scrollIntoView({
    behavior: "smooth"
  });
}

async function loadProducts() {
  const container = document.querySelector("#products");

  try {
    const response = await fetch("/api/products");
    const data = await response.json();

    products = Array.isArray(data.products)
      ? data.products
      : [];

    document.querySelector("#availableCount").textContent =
      products.length;

    buildFilters();
    renderProducts();

  } catch (error) {
    container.innerHTML = `
      <div class="loading">
        <p>Gagal memuat produk.</p>
        <small>Coba refresh halaman.</small>
      </div>
    `;
  }
}

function buildFilters() {
  const filterBox = document.querySelector("#filters");

  const countries = [
    ...new Map(
      products.map(product => [
        product.country_code,
        product.country
      ])
    )
  ];

  filterBox.innerHTML = `
    <button class="filter ${activeCountry === "all" ? "active" : ""}"
      onclick="setCountry('all')">
      Semua
    </button>
  `;

  countries.forEach(([code, country]) => {
    filterBox.innerHTML += `
      <button
        class="filter ${activeCountry === code ? "active" : ""}"
        onclick="setCountry('${escapeHtml(code)}')">
        ${flags[code] || "🌎"} ${escapeHtml(country)}
      </button>
    `;
  });
}

function setCountry(country) {
  activeCountry = country;
  buildFilters();
  renderProducts();
}

function renderProducts() {
  const container = document.querySelector("#products");
  const empty = document.querySelector("#emptyState");
  const search = document
    .querySelector("#searchInput")
    .value
    .trim()
    .toLowerCase();

  const filtered = products.filter(product => {
    const countryMatch =
      activeCountry === "all" ||
      product.country_code === activeCountry;

    const searchMatch =
      !search ||
      String(product.country || "")
        .toLowerCase()
        .includes(search) ||
      String(product.provider || "")
        .toLowerCase()
        .includes(search);

    return countryMatch && searchMatch;
  });

  if (!filtered.length) {
    container.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");

  container.innerHTML = filtered.map(product => `
    <article class="product-card">
      <div class="product-top">
        <div class="country">
          <span class="flag">
            ${flags[product.country_code] || "🌎"}
          </span>

          <div>
            <b>${escapeHtml(product.country)}</b>
            <small>${escapeHtml(product.provider || "Manual")}</small>
          </div>
        </div>

        <span class="available">● Available</span>
      </div>

      <div class="phone">
        ${maskPhone(product.phone_number)}
      </div>

      <div class="product-bottom">
        <div class="product-price">
          <small>Harga</small>
          <strong>
            ${formatPrice(product.price, product.currency || "IDR")}
          </strong>
        </div>

        <button
          class="buy-btn"
          onclick="openOrder(${Number(product.id)})">
          Beli
        </button>
      </div>
    </article>
  `).join("");
}

function maskPhone(phone) {
  if (!phone) return "Nomor tersedia";

  const value = String(phone);

  if (value.length <= 6) {
    return value;
  }

  return (
    value.slice(0, 4) +
    " ••• " +
    value.slice(-3)
  );
}

function openOrder(id) {
  const product = products.find(
    item => Number(item.id) === Number(id)
  );

  if (!product) return;

  document.querySelector("#productId").value = product.id;

  document.querySelector("#selectedProduct").textContent =
    `${flags[product.country_code] || "🌎"} ${
      product.country
    } • ${formatPrice(
      product.price,
      product.currency || "IDR"
    )}`;

  document.querySelector("#orderMessage").innerHTML = "";

  document.querySelector("#orderModal")
    .classList.remove("hidden");

  document.body.style.overflow = "hidden";
}

function closeModal() {
  document.querySelector("#orderModal")
    .classList.add("hidden");

  document.body.style.overflow = "";
}

document.querySelector("#orderForm")
  .addEventListener("submit", async event => {
    event.preventDefault();

    const message = document.querySelector("#orderMessage");

    message.innerHTML = "Memproses pesanan...";

    const payload = {
      product_id: Number(
        document.querySelector("#productId").value
      ),
      customer_name:
        document.querySelector("#customerName").value,
      customer_contact:
        document.querySelector("#customerContact").value,
      note:
        document.querySelector("#orderNote").value
    };

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Gagal membuat pesanan."
        );
      }

      message.innerHTML = `
        <div class="result-success">
          <b>Pesanan berhasil dibuat!</b><br><br>
          Kode Order:
          <strong>${escapeHtml(data.order.order_code)}</strong><br>
          Access Token:
          <strong>${escapeHtml(data.order.access_token)}</strong><br><br>
          Simpan kedua data ini untuk mengecek pesanan.
        </div>
      `;

      document.querySelector("#orderForm")
        .reset();

      loadProducts();

    } catch (error) {
      message.innerHTML = `
        <div class="result-error">
          ${escapeHtml(error.message)}
        </div>
      `;
    }
  });

document.querySelector("#checkForm")
  .addEventListener("submit", async event => {
    event.preventDefault();

    const result =
      document.querySelector("#checkResult");

    result.innerHTML = "Mengecek...";

    try {
      const response = await fetch("/api/orders/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          order_code:
            document.querySelector("#orderCode").value,
          access_token:
            document.querySelector("#accessToken").value
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Pesanan tidak ditemukan."
        );
      }

      const order = data.order;

      result.innerHTML = `
        <div class="result-success">
          <b>Order ditemukan</b><br><br>
          Status pembayaran:
          <strong>${escapeHtml(order.payment_status)}</strong><br>
          Status pemenuhan:
          <strong>${escapeHtml(order.fulfillment_status)}</strong>
        </div>
      `;

    } catch (error) {
      result.innerHTML = `
        <div class="result-error">
          ${escapeHtml(error.message)}
        </div>
      `;
    }
  });

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

loadProducts();
