const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "Content-Type, Authorization",
      "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS"
    }
  });

function randomCode(prefix = "") {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return prefix + [...bytes]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function body(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function requireAdmin(request, env) {
  const configured = env.ADMIN_KEY;
  if (!configured) return false;

  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${configured}`;
}

async function getProducts(env) {
  const result = await env.DB.prepare(`
    SELECT id, country, country_code, provider, price, currency, status, created_at
    FROM products
    WHERE status = 'available'
    ORDER BY id DESC
  `).all();

  return result.results;
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (path === "/api/health" && request.method === "GET") {
    return json({
      ok: true,
      service: "NokoHub",
      time: new Date().toISOString()
    });
  }

  if (path === "/api/products" && request.method === "GET") {
    return json({
      products: await getProducts(env)
    });
  }

  if (path === "/api/orders" && request.method === "POST") {
    const data = await body(request);

    const productId = Number(data.product_id);
    const customerName = String(data.customer_name || "")
      .trim()
      .slice(0, 100);

    const customerContact = String(data.customer_contact || "")
      .trim()
      .slice(0, 120);

    const note = String(data.note || "")
      .trim()
      .slice(0, 500);

    if (!productId || !customerName || !customerContact) {
      return json({
        error: "Data pemesan belum lengkap."
      }, 400);
    }

    const product = await env.DB.prepare(`
      SELECT id, price, currency, status
      FROM products
      WHERE id = ?
    `)
      .bind(productId)
      .first();

    if (!product || product.status !== "available") {
      return json({
        error: "Produk sudah tidak tersedia."
      }, 409);
    }

    const orderCode = "NK-" + randomCode();
    const accessToken = randomCode("A");
    const now = new Date().toISOString();

    const reserve = await env.DB.prepare(`
      UPDATE products
      SET status = 'reserved', updated_at = ?
      WHERE id = ? AND status = 'available'
    `)
      .bind(now, productId)
      .run();

    if (!reserve.meta.changes) {
      return json({
        error: "Produk baru saja dipesan orang lain."
      }, 409);
    }

    try {
      await env.DB.prepare(`
        INSERT INTO orders
        (
          order_code,
          access_token,
          product_id,
          customer_name,
          customer_contact,
          note,
          amount,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          orderCode,
          accessToken,
          productId,
          customerName,
          customerContact,
          note,
          product.price,
          now,
          now
        )
        .run();
    } catch (e) {
      await env.DB.prepare(`
        UPDATE products
        SET status = 'available', updated_at = ?
        WHERE id = ?
      `)
        .bind(now, productId)
        .run();

      return json({
        error: "Gagal membuat pesanan."
      }, 500);
    }

    return json({
      ok: true,
      order: {
        order_code: orderCode,
        access_token: accessToken,
        amount: product.price,
        currency: product.currency,
        payment_status: "pending",
        fulfillment_status: "pending"
      }
    }, 201);
  }

  if (path === "/api/orders/check" && request.method === "POST") {
    const data = await body(request);

    const code = String(data.order_code || "").trim();
    const token = String(data.access_token || "").trim();

    const order = await env.DB.prepare(`
      SELECT
        o.order_code,
        o.customer_name,
        o.customer_contact,
        o.amount,
        o.payment_status,
        o.fulfillment_status,
        o.created_at,
        o.note,
        p.country,
        p.provider,
        CASE
          WHEN o.fulfillment_status = 'fulfilled'
          THEN p.phone_number
          ELSE NULL
        END AS phone_number
      FROM orders o
      JOIN products p ON p.id = o.product_id
      WHERE o.order_code = ? AND o.access_token = ?
    `)
      .bind(code, token)
      .first();

    if (!order) {
      return json({
        error: "Pesanan tidak ditemukan."
      }, 404);
    }

    return json({
      order
    });
  }

  if (!requireAdmin(request, env)) {
    return json({
      error: "Unauthorized"
    }, 401);
  }

  if (path === "/api/admin/products" && request.method === "GET") {
    const result = await env.DB.prepare(`
      SELECT
        id,
        country,
        country_code,
        provider,
        phone_number,
        price,
        currency,
        status,
        created_at,
        updated_at
      FROM products
      ORDER BY id DESC
    `).all();

    return json({
      products: result.results
    });
  }

  if (path === "/api/admin/products" && request.method === "POST") {
    const data = await body(request);

    const country = String(data.country || "").trim();
    const countryCode = String(data.country_code || "")
      .trim()
      .toUpperCase();

    const provider = String(data.provider || "Manual").trim();
    const phone = String(data.phone_number || "").trim();
    const price = Number(data.price);

    if (
      !country ||
      !countryCode ||
      !phone ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      return json({
        error: "Data produk tidak valid."
      }, 400);
    }

    try {
      const result = await env.DB.prepare(`
        INSERT INTO products
        (
          country,
          country_code,
          provider,
          phone_number,
          price,
          currency,
          status
        )
        VALUES (?, ?, ?, ?, ?, 'IDR', 'available')
      `)
        .bind(
          country,
          countryCode,
          provider,
          phone,
          Math.round(price)
        )
        .run();

      return json({
        ok: true,
        id: result.meta.last_row_id
      }, 201);
    } catch {
      return json({
        error: "Nomor sudah ada atau data tidak valid."
      }, 409);
    }
  }

  const productMatch =
    path.match(/^\/api\/admin\/products\/(\d+)$/);

  if (productMatch && request.method === "PATCH") {
    const id = Number(productMatch[1]);
    const data = await body(request);

    const allowedStatus = [
      "available",
      "reserved",
      "sold",
      "disabled"
    ];

    const status =
      allowedStatus.includes(data.status)
        ? data.status
        : null;

    const price =
      data.price === undefined
        ? null
        : Number(data.price);

    if (!status && !Number.isFinite(price)) {
      return json({
        error: "Tidak ada perubahan valid."
      }, 400);
    }

    if (status && Number.isFinite(price)) {
      await env.DB.prepare(`
        UPDATE products
        SET status = ?, price = ?, updated_at = ?
        WHERE id = ?
      `)
        .bind(
          status,
          Math.round(price),
          new Date().toISOString(),
          id
        )
        .run();
    } else if (status) {
      await env.DB.prepare(`
        UPDATE products
        SET status = ?, updated_at = ?
        WHERE id = ?
      `)
        .bind(
          status,
          new Date().toISOString(),
          id
        )
        .run();
    } else {
      await env.DB.prepare(`
        UPDATE products
        SET price = ?, updated_at = ?
        WHERE id = ?
      `)
        .bind(
          Math.round(price),
          new Date().toISOString(),
          id
        )
        .run();
    }

    return json({
      ok: true
    });
  }

  const orderAdminMatch =
    path.match(/^\/api\/admin\/orders\/(\d+)$/);

  if (orderAdminMatch && request.method === "PATCH") {
    const id = Number(orderAdminMatch[1]);
    const data = await body(request);

    const payment = [
      "pending",
      "paid",
      "cancelled"
    ].includes(data.payment_status)
      ? data.payment_status
      : null;

    const fulfillment = [
      "pending",
      "processing",
      "fulfilled",
      "cancelled"
    ].includes(data.fulfillment_status)
      ? data.fulfillment_status
      : null;

    if (!payment && !fulfillment) {
      return json({
        error: "Status tidak valid."
      }, 400);
    }

    const current = await env.DB.prepare(`
      SELECT product_id
      FROM orders
      WHERE id = ?
    `)
      .bind(id)
      .first();

    if (!current) {
      return json({
        error: "Order tidak ditemukan."
      }, 404);
    }

    if (payment && fulfillment) {
      await env.DB.prepare(`
        UPDATE orders
        SET
          payment_status = ?,
          fulfillment_status = ?,
          updated_at = ?
        WHERE id = ?
      `)
        .bind(
          payment,
          fulfillment,
          new Date().toISOString(),
          id
        )
        .run();
    } else if (payment) {
      await env.DB.prepare(`
        UPDATE orders
        SET payment_status = ?, updated_at = ?
        WHERE id = ?
      `)
        .bind(
          payment,
          new Date().toISOString(),
          id
        )
        .run();
    } else {
      await env.DB.prepare(`
        UPDATE orders
        SET fulfillment_status = ?, updated_at = ?
        WHERE id = ?
      `)
        .bind(
          fulfillment,
          new Date().toISOString(),
          id
        )
        .run();
    }

    if (fulfillment === "fulfilled") {
      await env.DB.prepare(`
        UPDATE products
        SET status = 'sold', updated_at = ?
        WHERE id = ?
      `)
        .bind(
          new Date().toISOString(),
          current.product_id
        )
        .run();
    } else if (fulfillment === "cancelled") {
      await env.DB.prepare(`
        UPDATE products
        SET status = 'available', updated_at = ?
        WHERE id = ?
      `)
        .bind(
          new Date().toISOString(),
          current.product_id
        )
        .run();
    }

    return json({
      ok: true
    });
  }

  if (path === "/api/admin/orders" && request.method === "GET") {
    const result = await env.DB.prepare(`
      SELECT
        o.id,
        o.order_code,
        o.customer_name,
        o.customer_contact,
        o.note,
        o.amount,
        o.payment_status,
        o.fulfillment_status,
        o.created_at,
        o.updated_at,
        p.country,
        p.provider,
        p.phone_number
      FROM orders o
      JOIN products p ON p.id = o.product_id
      ORDER BY o.id DESC
      LIMIT 200
    `).all();

    return json({
      orders: result.results
    });
  }

  if (path === "/api/admin/stats" && request.method === "GET") {
    const stats = await env.DB.prepare(`
      SELECT
        (
          SELECT COUNT(*)
          FROM products
          WHERE status = 'available'
        ) AS available,

        (
          SELECT COUNT(*)
          FROM products
          WHERE status = 'sold'
        ) AS sold,

        (
          SELECT COUNT(*)
          FROM orders
        ) AS orders,

        COALESCE(
          (
            SELECT SUM(amount)
            FROM orders
            WHERE payment_status = 'paid'
          ),
          0
        ) AS revenue
    `).first();

    return json({
      stats
    });
  }

  return json({
    error: "Not found"
  }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env);
      } catch (error) {
        console.error(error);

        return json({
          error: "Internal server error."
        }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
