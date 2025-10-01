# AI CV Evaluator Backend

Layanan backend untuk mengotomatiskan proses evaluasi kandidat.
Sistem ini menerima CV dan laporan proyek, lalu menganalisisnya terhadap deskripsi pekerjaan menggunakan alur kerja yang didukung AI.

---

## Arsitektur

Arsitektur ini dirancang untuk memproses evaluasi CV dan laporan proyek secara asinkron. Ini memastikan bahwa mendapatkan respons cepat tanpa harus menunggu proses AI yang kompleks selesai. Alur kerja dibagi menjadi beberapa tahap utama yang dikoordinasikan oleh API Layer, Worker, dan berbagai layanan pendukung.

![Diagram Arsitektur Sistem](arsitektur.png)

**1. Proses Unggah Dokumen**

- Permintaan Awal: Memulai proses dengan mengirimkan permintaan HTTP POST ke endpoint /upload. Permintaan ini berisi dua file: CV dan laporan proyek.

- Penanganan API: API Layer (NestJS) menerima file tersebut. Alih-alih langsung memprosesnya, API Layer mengunggah kedua file ke Object Storage (MinIO) untuk penyimpanan yang aman dan efisien.

- Pencatatan Awal: Setelah file berhasil diunggah, API Layer membuat entri baru di Database (PostgreSQL). Entri ini mencakup ID unik untuk sesi evaluasi ini, URL ke file yang disimpan di MinIO, dan status awal, yaitu "uploaded".

- Respons Cepat: Sistem segera mengembalikan ID unik dan URL file. Langkah ini sangat cepat karena tidak melibatkan pemrosesan AI.

**2. Memulai Proses Evaluasi**

- Pemicu Evaluasi: Dengan menggunakan ID yang diterima dari langkah pertama mengirimkan permintaan HTTP POST kedua ke endpoint /evaluations/:id. Ini berfungsi sebagai pemicu untuk memulai analisis dokumen.

- Penambahan Job: API Layer menerima permintaan ini, lalu menambahkan sebuah "job" baru ke dalam Job Queue (BullMQ on Redis). Job ini berisi ID evaluasi yang perlu diproses. Status entri di Database (PostgreSQL) diperbarui menjadi "queued".

- Respons Antrean: API Layer langsung merespons pengguna dengan status "queued", menandakan bahwa permintaan evaluasi telah diterima dan akan segera diproses.

**3. Eksekusi oleh Worker di Latar Belakang**

- Pengambilan Job: Sebuah Worker (NestJS), yang berjalan sebagai proses terpisah, terus memantau Job Queue. Ketika job baru tersedia, Worker akan mengambilnya.

- Pengambilan File: Worker menggunakan ID dari job untuk mengambil detail, termasuk URL file, dari Database. Selanjutnya, Worker mengunduh file CV dan laporan proyek dari Object Storage (MinIO).

- Eksekusi AI Pipeline: Dokumen yang telah diunduh kemudian dikirim ke AI Services untuk diproses. Proses ini melibatkan:

- Embedding (Cohere): Teks dari dokumen diubah menjadi representasi numerik (vektor) agar dapat dipahami oleh mesin.

- RAG (Retrieval-Augmented Generation): Vektor ini digunakan untuk mencari informasi relevan di Vector DB (ChromaDB), yang mungkin berisi kriteria penilaian atau data pendukung lainnya.

- LLM (OpenRouter): Hasil dari RAG dan konten asli dokumen dikirim ke Large Language Model untuk dianalisis, dinilai, dan diberi umpan balik sesuai kriteria.

- Penyimpanan Hasil: Setelah AI Services selesai menganalisis dan menghasilkan output (seperti skor, ringkasan, dan umpan balik), Worker menerima hasil ini.

- Pembaruan Status Akhir: Worker kemudian memperbarui entri yang sesuai di Database (PostgreSQL) dengan hasil evaluasi dan mengubah statusnya menjadi "completed".

**4. Mengecek dan Mengambil Hasil**

- Permintaan Status: Kapan saja setelah memulai evaluasi, Pengguna dapat mengirimkan permintaan HTTP GET ke endpoint /evaluations/:id.

- Pengecekan Database: API Layer akan memeriksa status entri di Database.

**5. Pengiriman Hasil:**

- Jika statusnya masih "queued" atau "processing", API akan mengembalikan status tersebut.

- Setelah Worker menyelesaikan tugasnya dan statusnya berubah menjadi "completed", API akan mengembalikan seluruh hasil evaluasi yang tersimpan di database.

---

## Dokumentasi Api
Untuk mempermudah pengujian endpoint, tersedia koleksi Postman yang bisa langsung diimpor.

File: [Dokumentasi API Postman](./AI%20CV%20Analyzer.json)

---

## Fitur Utama

- **Unggah File**: Mendukung unggahan CV dan laporan proyek dalam format `.pdf`, dan `.docx`.
- **Evaluasi Asinkron**: Proses evaluasi AI berjalan di latar belakang, memungkinkan API memberikan respons instan.
- **Retrieval-Augmented Generation (RAG)**: Mengambil konteks deskripsi pekerjaan dan rubrik dari Vector DB untuk meningkatkan akurasi LLM.
- **LLM Chaining**: Menggunakan serangkaian prompt untuk mengekstrak informasi, mengevaluasi, dan merangkum hasil secara bertahap.
- **Penanganan Kegagalan**: Mekanisme retry dengan exponential backoff untuk menangani kegagalan sementara saat memanggil API eksternal.

---

## Tech Stack

- **Framework**: NestJS (TypeScript)
- **Database**: PostgreSQL
- **Object Storage**: MinIO
- **Job Queue**: Redis dengan BullMQ
- **Vector DB**: ChromaDB
- **Containerization**: Docker & Docker Compose

### Layanan AI

- **Model Bahasa (LLM)**: OpenAI GPT-4o Mini (via OpenRouter)
- **Model Embedding**: Cohere Embed v3

---

## Instalasi & Konfigurasi

### Prasyarat

- Docker & Docker Compose
- Node.js 20.11.1

### 1. Clone & Konfigurasi Awal

```bash
# Clone repository
git clone <URL_REPOSITORY_ANDA>
cd <NAMA_FOLDER_REPOSITORY>

# Salin file environment dan isi nilainya
cp .env.example .env
```

Buka file `.env` dan isi semua variabel yang diperlukan, terutama:

- `OPENROUTER_API_KEY`
- `COHERE_API_KEY`
- Konfigurasi database dan MinIO

---

### 2. Jalankan Layanan

Perintah ini akan membangun image Docker dan menjalankan semua kontainer yang dibutuhkan (aplikasi, database, redis, minio, chroma):

```bash
docker-compose up --build -d
```

Aplikasi akan berjalan di [http://localhost:3000](http://localhost:3000).

---

### 3. Setup Awal (Hanya Sekali Jalan)

#### a. Jalankan Migration
```bash
docker-compose exec api pnpm run migration:run
```

#### b. Buat Bucket di MinIO

1. Akses konsol MinIO di [http://localhost:9001](http://localhost:9001).
2. Login dengan kredensial `MINIO_ROOT_USER` dan `MINIO_ROOT_PASSWORD` dari file `.env`.
3. Buat sebuah bucket baru. Nama bucket harus sama dengan nilai `MINIO_BUCKET` di `.env` (contoh: `cv-uploads`) samakan dengan yang ada `.env` .

#### c. Seed Data ke ChromaDB

Jalankan skrip seeding untuk mengisi Vector DB dengan deskripsi pekerjaan dan rubrik penilaian:

```bash
# Dari root folder proyek
docker-compose exec api pnpm exec ts-node src/database/seeds/seed.ts
```

---

## Alur API

### 1. Memulai Evaluasi Baru

Endpoint ini menerima file CV dan laporan proyek lalu mengunggahnya. Bisa gunakan file dummy [CV](./budi%20cv.pdf) dan [Project Report](./budi%20project%20report.pdf) yang ada

- **Endpoint**: `POST /upload`
- **Body**: `multipart/form-data`
  - `cv`: File CV (`.pdf`, `.docx`)
  - `projectReport`: File laporan proyek (`.pdf`, `.docx`)

**Contoh curl:**

```bash
curl -X POST http://localhost:3000/upload \
  -F 'cv=@"/path/to/your/cv.pdf"' \
  -F 'projectReport=@"/path/to/your/project.pdf"'
```

**Respons:**

```json
{
  "id": "3130fd2d-ec01-4aab-92b2-9078718f4646",
  "status": "uploaded",
  "cvUrl": "http://localhost:9000/cv-uploads/a8bb8234-a7e7-4b35-9e75-f474a59cfdc1-budi%20cv.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=minioadmin%2F20251001%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20251001T050401Z&X-Amz-Expires=3600&X-Amz-Signature=e4418aa39bcbd6d51f334685718b6506f6dae004db759f252d1a25c40d2bf080&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject",
  "projectReportUrl": "http://localhost:9000/cv-uploads/6915b11a-8830-4d98-9878-bc34ab29d9ab-budi%20project%20report.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=minioadmin%2F20251001%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20251001T050401Z&X-Amz-Expires=3600&X-Amz-Signature=5da1ede9cec7804d1b51e907b2fd0da37924a1c77e1cf1b1d7faa25dc2af6607&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject"
}
```

---

### 2. Mulai Evaluasi

Gunakan `id` dari langkah sebelumnya untuk melakukan proses evaluasi cv. Endpoint ini juga bisa digunakan untuk mengecek proses

- **Endpoint**: `POST /evaluations/:id`

**Contoh curl:**

```bash
curl -X POST http://localhost:3000/evaluations/b90f4b59-d8ca-4ae8-b37f-94b74c72459e
```

```json
{
  "id": "b90f4b59-d8ca-4ae8-b37f-94b74c72459e",
  "status": "queued"
}
```

### 3. Hasil Evaluasi

- **Endpoint**: `GET /evaluations/:id`
  Gunakan `id` untuk mengecek hasil evaluasi cv.

```bash
curl http://localhost:3000/evaluations/b90f4b59-d8ca-4ae8-b37f-94b74c72459e
```

**Respons (saat selesai):**

```json
{
  "id": "b90f4b59-d8ca-4ae8-b37f-94b74c72459e",
  "status": "completed",
  "result": {
    "cv_match_rate": 0.82,
    "cv_feedback": "Kandidat memiliki keahlian backend dan cloud yang kuat, namun pengalaman integrasi AI terbatas.",
    "project_score": 7.5,
    "project_feedback": "Memenuhi persyaratan prompt chaining, namun kurang dalam penanganan error yang tangguh.",
    "overall_summary": "Kandidat yang cocok, akan lebih baik jika memiliki pengetahuan RAG yang lebih dalam."
  }
}
```

## Pilihan Desain & Trade-offs

Setiap pilihan teknologi dalam proyek ini dibuat dengan mempertimbangkan kelebihan dan konsekuensinya.

- **Arsitektur Modular Monolith dengan Job Queue**

1. **Pilihan**: Menggunakan satu basis kode NestJS untuk API dan Worker (Modular Monolith), dipisahkan oleh job queue.

2. **Alasan**: Pendekatan ini secara signifikan mempercepat pengembangan awal karena logika bisnis, model data, dan utilitas dapat dibagikan dengan mudah antara API dan Worker. Ini juga menyederhanakan proses deployment dan pengujian lokal.

3. **Trade-off**: Meskipun job queue memungkinkan pemrosesan asinkron, skalabilitasnya tidak se-granular arsitektur microservices. Jika suatu saat Worker membutuhkan sumber daya (CPU/RAM) yang jauh lebih besar daripada API, kita harus menskalakan keduanya secara bersamaan. Arsitektur ini juga memiliki satu titik kegagalan (a single point of failure) di tingkat basis kode.

- **NestJS vs. Express.js**

1. **Pilihan**: NestJS.

2. **Alasan**: Dipilih karena strukturnya yang terorganisir dan "opinionated" (memiliki aturan yang jelas). Fitur seperti Dependency Injection, modularitas, dan dukungan TypeScript bawaan mempercepat pengembangan aplikasi yang kompleks dan mudah dipelihara.

3. **Trade-off**: Struktur NestJS yang kaku memiliki kurva belajar yang lebih curam dibandingkan dengan kerangka kerja minimalis seperti Express.js. Untuk proyek yang sangat sederhana, NestJS bisa terasa seperti overhead.

- **BullMQ vs. RabbitMQ**

1. **Pilihan**: BullMQ di atas Redis.

2. **Alasan**: BullMQ menawarkan integrasi yang sangat erat dengan ekosistem Node.js dan kemudahan penggunaan yang luar biasa untuk kasus penggunaan berbasis antrean tugas. API-nya modern (berbasis Promise) dan fiturnya (seperti rate limiting, tugas berulang) sudah lebih dari cukup untuk proyek ini.

3. **Trade-off**: Kami mengorbankan interoperabilitas antar bahasa dan protokol standar (AMQP) yang ditawarkan oleh message broker yang lebih matang seperti RabbitMQ. BullMQ juga mengikat kita pada Redis sebagai broker, sementara RabbitMQ adalah layanan mandiri yang lebih terisolasi.

- **ChromaDB vs. Pinecone/Weaviate**

1. **Pilihan**: ChromaDB.

2. **Alasan**: ChromaDB sangat mudah untuk di-setup dan dijalankan secara lokal (bahkan in-memory), membuatnya ideal untuk pengembangan dan prototipe cepat. Ini menghilangkan kebutuhan untuk mengelola layanan cloud eksternal selama tahap pengembangan.

3. **Trade-off**: Skalabilitas dan fitur ChromaDB mungkin tidak sekuat solusi vector database terkelola (managed) seperti Pinecone atau Weaviate untuk aplikasi skala produksi besar. Jika jumlah dokumen yang perlu diindeks tumbuh secara eksponensial, migrasi ke layanan yang lebih kuat mungkin diperlukan.

- **Docker Compose untuk Lingkungan Lokal**

1. **Pilihan**: Menggunakan Docker Compose untuk mengelola semua layanan.

2. **Alasan**: Menyederhanakan proses setup pengembangan secara drastis. Dengan satu perintah (docker-compose up), seluruh lingkungan (database, message queue, aplikasi) dapat berjalan secara konsisten di mesin setiap pengembang.

3. **Trade-off**: Docker Compose tidak dirancang untuk orkestrasi produksi skala besar. Untuk deployment produksi yang sesungguhnya, solusi seperti Kubernetes atau layanan container-as-a-service (misalnya AWS ECS, Google Cloud Run) akan menjadi pilihan yang lebih tangguh dan skalabel.
