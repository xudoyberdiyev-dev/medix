# MEDIX

Farmatsevtika ulgurji distribyutsiyasi uchun ERP: kirim, qoldiqlar, buyurtma zanjiri, narxlar, mijozlar va yetkazib beruvchilar, pul, markirovka, hisobotlar.

- To'liq tavsif: [`docs/SPEC.md`](docs/SPEC.md)
- Ish rejasi va progress: [`PLAN.md`](PLAN.md)
- Sessiya hisobotlari: [`reports/`](reports/)
- Dizayn tizimi: [`design/`](design/)

## Lokal ishga tushirish
```bash
docker compose up -d          # http://localhost:3000 (frontend), :8080 (backend), /api/docs (OpenAPI)
```
Alohida:
```bash
cd backend && ./gradlew bootRun     # Java 25 kerak
cd frontend && pnpm install && pnpm dev
```

## Stek
Java 25 · Spring Boot 4.1 · PostgreSQL 18 · Flyway · Spring Modulith — Next.js 16 · React 19 · TypeScript · Tailwind 4
