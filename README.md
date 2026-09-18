# NokoHub v1

NokoHub adalah marketplace sederhana untuk inventori dan pemesanan nomor virtual yang dapat dijalankan sebagai Cloudflare Worker + Workers Static Assets + D1.

## Fitur
- Katalog nomor tersedia
- Filter negara
- Order pelanggan
- Kode order + access token
- Cek status order
- Dashboard admin
- Tambah nomor
- Update status stok
- Update status pembayaran/pemenuhan
- D1 database
- Static frontend di Cloudflare

## 1. Prasyarat

Install Node.js, lalu login ke Cloudflare:

```bash
npx wrangler login
```

## 2. Buat database D1

```bash
npx wrangler d1 create nokohub-db
```

Perintah tersebut akan memberi `database_id`. Masukkan UUID tersebut ke `wrangler.jsonc` pada:

```json
"database_id": "PASTE_YOUR_D1_DATABASE_ID_HERE"
```

## 3. Jalankan migration

```bash
npx wrangler d1 migrations apply nokohub-db --remote
```

## 4. Buat secret admin

Jangan taruh password admin di `script.js`.

```bash
npx wrangler secret put ADMIN_KEY
```

Masukkan password/token admin yang panjang dan acak ketika diminta.

## 5. Test lokal

```bash
npx wrangler dev
```

Untuk pengujian lokal dengan D1 lokal, migration dapat dijalankan:

```bash
npx wrangler d1 migrations apply nokohub-db --local
```

## 6. Deploy

```bash
npx wrangler deploy
```

Cloudflare akan memberikan URL `workers.dev`.

## 7. Domain sendiri

Setelah Worker aktif, tambahkan custom domain dari dashboard Cloudflare pada Worker tersebut.

## Catatan produksi

Versi ini sengaja memakai pembayaran manual dan provider `Manual`. Untuk penjualan nomor secara otomatis, buat adapter API provider yang legal dan simpan API key sebagai Cloudflare secret, bukan di frontend.

Jangan memasukkan nomor/API provider ke GitHub jika datanya bersifat rahasia.

Sebelum menerima pembayaran sungguhan, tambahkan:
- payment gateway/webhook
- customer authentication
- rate limiting
- audit log
- verifikasi webhook
- kebijakan refund
- Terms & Privacy
- validasi provider dan penggunaan nomor sesuai hukum/ToS
