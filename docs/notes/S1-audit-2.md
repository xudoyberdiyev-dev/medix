# S1 — texnik audit, 2-qism (22.11.2026 tungi oyna)

## Sinov muhiti

- Mahalliy PostgreSQL 16 (2 CPU, 7 GB RAM, `shared_buffers=1GB`), barcha Flyway migratsiyalari + sintetik hajm:
  `scripts/s1/run.sh 730 1500 15 10` (generator `scripts/s1/gen.sql`, oʻlchagich `scripts/s1/bench.py`).
- Hajm (**2 yil**, S1 modelining yarmi — disk chegarasi sababli): 4 filial, 8 ombor, 150 xodim, 15 000 mahsulot, 120 000 partiya,
  5 000 mijoz + 300 YB; **1,1 mln buyurtma, 16,4 mln buyurtma qatori, 1,07 mln sotuv, 16 mln sotuv qatori, 19,3 mln ombor
  harakati, 2,1 mln qarz yozuvi, 5,5 mln markirovka kodi, 4,4 mln audit yozuvi**. Baza 13 GB.
- Vaqtlar — issiq kesh, 3 marta oʻlchovning medianasi, `EXPLAIN (ANALYZE, BUFFERS)`. 4 yilda «butun tarixni oʻqiydigan»
  soʻrovlar taxminan **2 baravar** sekinlashadi; indeks bilan ishlaydiganlar deyarli oʻzgarmaydi.

## Natijalar (oldin → keyin)

| Sahifa / soʻrov | Oldin (2 yil) | Keyin | Tuzatish |
|---|---|---|---|
| Buyurtmalar roʻyxati, sahifa (filial / Direktor) | 158 / 960 ms | 3 / 3 ms | V106: `(branch_id, created_at, id)`, `(created_at, id)` |
| Buyurtmalar, «Bugun» / davr filtri | 79 ms | 0,1 ms | V106: `(branch_id, order_date)` |
| Buyurtmalar, holat yorliqlari (filial / Direktor) | 159 / 478 ms | 46 / 228 ms | ortiqcha JOIN olib tashlandi, index-only |
| Buyurtmalar, jami soni | 142 ms | 0 (soʻrov yoʻq) | yorliqlardan hisoblanadi |
| Buyurtmalar roʻyxati — bitta ochilish jami (filial) | ~970 ms | ~180 ms | |
| Savdo hisoboti, joriy oy / 366 kun | 2,0 s / **17,3 s** | 0,3 s / 1,9 s | `sale.discount_total` (V106), `sale(sale_date)`, JIT oʻchiq |
| Ctrl+K, buyurtma/sotuv/HF raqami | 1,8–2,3 s | 0,3–25 ms | trigram indekslar (V106) + `ANY(ARRAY(…))` |
| Mijozlar qarzi (filial / barchasi) | 1,4 / **4,8 s** | 13 / 52 ms | V107 `party_doc_balance` (hosila jadval, trigger) |
| Bosh sahifalar (Direktor, Buxgalter, Xaridchi), toʻlov muddati kartasi, YB hisob-fakturalari | har biri 1–5 s | 10–60 ms | V107 |
| Filiallar sahifasi — mijozlar qarzi | 1,2 s | 9 ms | V107/V108 |
| Audit jurnali, standart «oxirgi 7 kun» / 30 kun | **37,7 s** / — | 0,12 / 0,21 s | V109: «Nazoratdagi» belgisi yozuv paytida saqlanadi |
| Fakturalar navbati (Buxgalter) | ~1,5 s | ~0,2 s | yorliqlar faqat `invoice_task`, jami — yorliqlardan, tafsilot — 50 qator |
| Buyurtmalar, filtr variantlari (mijoz/operator/hudud) | 3 × 70–90 ms | 130 ms (bitta skan) | bitta guruhlash |
| Qoldiqlar (filial) | 274 ms | — | hajm vaqt bilan oʻsmaydi, yaxshi |
| Markirovka: takror kod tekshiruvi, mahsulot harakati tarixi, akt sverka, saldo | < 1 ms | — | indekslar yetarli |

**JIT:** PostgreSQL JIT kompilyatsiyasi ogʻir hisobot rejalarida 0,5–1,5 s qoʻshardi → ulanishda `SET jit = off`
(`application.yml`, Hikari `connection-init-sql`).

## V107 — hujjat boʻyicha ochiq qarz (party_doc_balance)

- Avval «Mijozlar qarzi» va 6 ta boshqa joy har safar **butun qarz jurnalini** hujjat boʻyicha guruhlardi (own + app) — hajm
  bilan cheksiz oʻsadi.
- Endi: jurnalga har yozuv qoʻshilganda `AFTER INSERT` trigger **shu tranzaksiyada** hujjat qatorini yangilaydi
  (`own_amount`, `applied_amount`, `open_amount` = yigʻindi, `due_date`/`first_at`/`doc_number` = min). Jurnal append-only, shuning
  uchun faqat INSERT. Qoida oʻzgarmagan; jurnal — yagona haqiqat manbai, jadval undan qayta quriladi.
- Tekshiruv: sintetik 2,1 mln yozuvda eski soʻrov bilan **toʻliq tenglik** (28 423 ochiq hujjat, EXCEPT ikki tomonga 0);
  chekka holatlar (qisman toʻlov, ortiqcha qaytarish → manfiy, avans, bekor qilish, mavjud boʻlmagan hujjatga qoʻllash) —
  tenglik; `PartyDocBalanceIT` (ketma-ket + 40 ta parallel toʻlov bitta hujjatga).
- Qolgan: `PartyLedger.openDocs` / `nextDue` (bitta mijoz boʻyicha, indeks bilan, tez) — oʻzgartirilmadi.

## Qolgan topilmalar (keyingi qism)

1. **Buyurtmalar roʻyxati — filtr variantlari va holat yorliqlari** hali butun tarix boʻyicha (filial ~180 ms, Direktor ~0,7 s;
   4 yilda ×2). Keyingi qadam (kerak boʻlsa): filtr variantlarini alohida endpoint orqali faqat menyu ochilganda olish.
2. Buyurtmalar qidiruvi (`ILIKE` raqam + mijoz nomi, filial): 190–260 ms, hajm bilan oʻsadi. Trigram bilan qayta yozish
   sinab koʻrildi — keng soʻzda («apteka») 2 s gacha yomonlashdi, shuning uchun oʻzgartirilmadi.
3. Savdo hisoboti 366 kun — 1,9 s (sotuv × buyurtma JOIN); qabul qilinadi. Audit 1 yil — 3 s (kamdan-kam).
4. `(CAST(:b AS BIGINT) IS NULL OR col = :b)` naqshi (toʻlovlar roʻyxati va boshqalar): umumiy (generic) rejada indeks ishlatilmaydi;
   hozircha PostgreSQL maxsus rejani tanlaydi — yuklama sinovida kuzatiladi.
5. Yozish tomoni: indekslar soni oshdi (`sales_order` +4, `sale` +4, `customer_payment` +1, `audit_log` +1) va 2 ta trigger
   (`party_ledger` → `party_doc_balance`, `audit_log` belgisi) — har yozuvga mikrosoniyalar; kuniga ~1 500 buyurtmada ahamiyatsiz.
6. Migratsiya vaqti (2 yillik hajmda): V106 ~42 s, V107 ~34 s, V109 ~8 daqiqa (4,4 mln audit). Production hozir kichik — soniyalar.
7. Hali oʻlchanmagan: yuklama sinovi (bir vaqtda 50/150/300 foydalanuvchi), `stock_reservation` tarixi, `notification`,
   `msg_*`, Next.js sahifa tezligi, JVM xotirasi, zaxira nusxadan tiklash vaqti.
