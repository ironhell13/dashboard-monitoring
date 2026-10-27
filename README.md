# 🚀 Dashboard Downtime BCA & Monitoring Operasional (Versi Vercel + Google Apps Script)

Dashboard Modern Monitoring Downtime & Problem Open BCA yang telah dioptimasi penuh untuk dideploy ke **Vercel** dengan arsitektur **Serverless API + Google Apps Script REST Backend**.

---

## 🏗️ Arsitektur Sistem

```
┌─────────────────────────────────┐        HTTPS JSON        ┌──────────────────────────────────┐
│   Vercel Frontend (Vite+React)  │ ───────────────────────> │  Google Apps Script (Web App)    │
│   • Live Problem Open & Counter │                          │  • REST API Router (doGet/doPost)│
│   • Tiket Follow-Up Modern      │ <─────────────────────── │  • High-Performance V8 Engine    │
│   • K-Means & Grafik Analisis   │        (Direct / Proxy)  └─────────────────┬────────────────┘
└─────────────────────────────────┘                                            │
                                                                               ▼
                                                             ┌──────────────────────────────────┐
                                                             │     Google Sheets Database       │
                                                             │  • DB_UPTIME / DB_MASTER         │
                                                             │  • DB_INCIDENTS / DB_ACTIONS     │
                                                             │  • DB_TIKET_FOLLOWUP             │
                                                             └──────────────────────────────────┘
```

1. **Frontend**: Vite + React + TypeScript + Tailwind CSS (Deploy ke Vercel).
2. **Backend**: Google Apps Script Web App mandiri (`apps_script_backend/Code.gs`), melayani REST API via `doGet` dan `doPost`.
3. **Database**: Google Sheets yang tersinkronisasi otomatis secara real-time.
4. **Vercel Serverless Proxy**: Mengatasi pembatasan CORS secara transparan melalui endpoint `/api/proxy`.

---

## 📋 Langkah 1: Setup Project Baru di Google Apps Script

Agar file Google Apps Script lama Anda tetap aman dan tidak tertimpa, buat project baru khusus untuk backend REST API:

1. Buka [script.google.com](https://script.google.com/) dan klik **+ Project Baru**.
2. Beri nama project, misalnya: `Backend API Monitoring BCA`.
3. Buka file [`apps_script_backend/Code.gs`](./apps_script_backend/Code.gs), salin (**Copy**) seluruh isinya, dan tempel (**Paste**) ke editor Google Apps Script (`Code.gs`).
4. Buka menu **Project Settings** (ikon gerigi di sebelah kiri) > Centang **"Show 'appsscript.json' manifest file in editor"**.
5. Kembali ke editor file > Buka `appsscript.json` > Ganti isinya dengan isi dari file [`apps_script_backend/appsscript.json`](./apps_script_backend/appsscript.json).
6. Klik ikon **Save** (Simpan).

### 🚀 Deploy Sebagai Web App:
1. Klik tombol **Deploy** di pojok kanan atas > Pilih **New deployment**.
2. Klik ikon gerigi di sebelah "Select type" > Pilih **Web app**.
3. Isi konfigurasi berikut:
   - **Description**: `v1 Production API`
   - **Execute as**: `Me (email anda)`
   - **Who has access**: `Anyone` *(Sangat penting: pilih Anyone agar frontend Vercel dapat mengakses API)*.
4. Klik **Deploy**.
5. Jika muncul permintaan izin (*Authorization*), klik **Review Permissions** > Pilih akun Google Anda > Klik **Advanced** > Klik **Go to Backend API Monitoring BCA (unsafe)** > Klik **Allow**.
6. Salin **Web app URL** yang muncul (format: `https://script.google.com/macros/s/AKfycb.../exec`).

---

## 📋 Langkah 2: Deploy Frontend ke Vercel

### Metode A: Via Vercel Dashboard (Rekomendasi)
1. Buka [vercel.com](https://vercel.com/) dan login menggunakan akun GitHub Anda.
2. Klik **Add New...** > **Project**.
3. Pilih repository GitHub: `ironhell13/dashboard-monitoring`.
4. Di bagian **Environment Variables**, tambahkan:
   - **Key**: `VITE_GAS_API_URL`
   - **Value**: Masukkan Web App URL dari Langkah 1 (`https://script.google.com/macros/s/.../exec`).
5. Klik **Deploy**. Selesai!

### Metode B: Mengatur URL Langsung dari UI Website
Jika Anda belum mengatur environment variable di Vercel, dashboard ini memiliki fitur pengaturan interaktif langsung di halaman muka:
1. Buka website Vercel Anda.
2. Di pojok kanan atas navbar, klik tombol status: **Setup API** / **GAS Connected**.
3. Masukkan URL Web App Apps Script Anda.
4. Klik **⚡ Test Koneksi** untuk memverifikasi koneksi.
5. Klik **Simpan Pengaturan**.

---

## 💻 Pengembangan Lokal (Local Development)

```bash
# Masuk ke folder migrasi
cd "Migrasi ke Vercel"

# Install dependensi
npm install

# Jalankan server development
npm run dev

# Build untuk verifikasi produksi
npm run build
```

---

## ✨ Fitur Unggulan yang Didukung

- ⚡ **Live Countdown & Durasi Problem Open**: Penghitungan durasi real-time per detik yang akurat sesuai jam kerja operasional mesin.
- 📝 **Tindakan & Penanganan Instan**: Update status penanganan langsung tersimpan ke audit log database dan riwayat penanganan mesin.
- 🎫 **Sistem Tiket Follow Up Modern**: Alur supervisi tiket dari Ka Ops / Ka Wil ke tim Monitoring (Req Close, Approval, Re-open dengan riwayat percakapan lengkap).
- 📊 **K-Means Clustering & Analisis Frekuensi**: Segmentasi mesin bermasalah berulang untuk tindakan preventif tim FLM / SLM / Vendor.
- 🗄️ **Riwayat Penanganan per WSID**: Pencarian cepat seluruh riwayat kendala masa lalu pada nomor WSID yang sama.
- 📤 **Chunked CSV Upload**: Mengunggah ribuan baris insiden harian secara bertahap tanpa khawatir batas kuota ataupun timeout 30 detik.
