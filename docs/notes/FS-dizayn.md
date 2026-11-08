# FS — Filiallararo savdo: dizayn (07.11.2026, keyingi sessiya uchun)

Manba: SPEC 2-jadval («Guruh ichida tannarxda, hisob-faktura va QQS bilan. Guruh ichidagi qarz umumiy jamiga kirmaydi»),
SPEC 4 hujjatlar (FS), T12-topshirish (`transfer.fs`, draft → transit → received, kamomad → hal qilish; alohida HF hisoblagichi).
Namuna: OK — `inventory/transfer/WarehouseTransfers` (V35) va kamomadni hal qilish (V38).

## Oqim
1. **Qoralama** (`transfer.fs`): sotuvchi filial ombori + zona → xaridor filial (va uning ombori). Qatorlar: mahsulot, partiya, miqdor.
2. **Jo'natish** (`transfer.send`) — BITTA tranzaksiya:
   - tovar sotuvchi zonadan chiqadi (StockLedger, `FOR UPDATE`, qoldiq ≥ 0);
   - har qator narxi = partiya tannarxi (`batch.cost`, QQS bilan — sotuvdagi kabi summalar QQS bilan saqlanadi), QQS ajratiladi `product.vat_rate` bo'yicha (`amount × rate / (100 + rate)`, HALF_UP);
   - **HF** raqami (alohida hisoblagich, `DocumentSequenceService.next("HF", sellerBranch)`), FS PDF/chop etish;
   - **filiallararo qarz**: xaridor filial sotuvchiga qarzdor (`branch_ledger`, + summa);
   - holat «Yo'lda» (IN_TRANSIT), xaridor filial `transfer.receive` egalariga bildirishnoma.
3. **Qabul** (xaridor filial, `transfer.receive`) — qabul zonasi tanlanadi; partiya o'sha (tannarx o'zgarmaydi), kamomad bo'lsa `shortage_qty`.
4. **Kamomad** (`transfer.resolve`): OK dagi kabi — HC (sabab «Kamomad», kim zimmasida) yoki sotuvchiga qaytarish. HC qilinsa qarz o'zgarmaydi
   (tovar xaridorniki bo'lgan); sotuvchi aybi deb topilsa — sotuvchi tomondan tuzatuvchi yozuv (`branch_ledger`, − summa).
5. **Bekor qilish** — faqat qoralamada. Jo'natilgan FS o'zgarmaydi (trigger).

## Jadvallar (V41)
- `branch_sale` (FS): number UNIQUE, seller_branch_id, buyer_branch_id (CHECK ≠), from_warehouse_id/from_zone_id, to_warehouse_id, to_zone_id,
  status (DRAFT/IN_TRANSIT/RECEIVED/CANCELLED), total, vat_total, invoice_number UNIQUE, shortage_qty, sent/received/cancelled by/at, version.
  Filial filtri: ro'yxatda sotuvchi YOKI xaridor filial (`actor.canAccessBranch` ikkalasidan biri).
- `branch_sale_line`: product_id, batch_id, qty > 0, unit_cost, amount, vat_rate, vat_amount, received_qty.
- `branch_ledger` (faqat qo'shiladi): debtor_branch_id, creditor_branch_id, amount (± ), doc_type/doc_id, occurred_at, created_by.
  `party_ledger` ga yozilmaydi → mijoz/YB qarzi jamlariga kirmaydi (SPEC). Hisob-kitob (filiallar o'rtasida to'lov) — keyingi qadam, Kassa bilan.
- Triggerlar: jo'natilgan hujjat va qatorlar summasi o'zgarmaydi; `branch_ledger` UPDATE/DELETE taqiq.

## Ruxsatlar (mavjud, V9)
`transfer.fs` (tuzish), `transfer.send`, `transfer.receive`, `transfer.resolve`, `transfer.cancel`, `transfer.view`. Tannarx/summa —
faqat `special.cost` egalariga (API ham yubormaydi), qolganlarga faqat miqdor.

## Testlar (majburiy — pul va qoldiq)
IT: jo'natish (qoldiq − , qarz + , HF raqami, QQS), qabul (xaridor qoldig'i +, tannarx o'sha), kamomad, ikki parallel jo'natish bitta partiyadan
(qoldiq manfiy bo'lmaydi), boshqa filial xodimi ko'rmaydi, `special.cost` siz summa yo'q. E2E: CEO (2 filial) → FS → xaridor qabul qiladi.

## Ochiq savol (egasiga, bloklamaydi)
- FS summasi = partiya tannarxi (QQS shu ichida, sotuvdagi kabi). QQS ustiga qo'shilishi kerak bo'lsa — ayting.

## Joriy qilindi (07.11.2026, ertalabki oyna)
- **Kamomad (V42, `inventory.writeoff.BranchSaleShortages`, `/api/branch-sales/{id}/shortage`):** WRITE_OFF + BUYER (HC xaridor zonasida, qarz
  o'zgarmaydi), WRITE_OFF + SELLER (HC sotuvchi zonasida, xaridor qarzi − kamomad summasi), RETURN (sotuvchi zonaga kirim, qarz −). Qarz
  tuzatish `branch_ledger` doc_type `FSK`: kerakli − avval yozilgan (faqat qo'shiladi). HC rad etilsa — kamomad yana ochiq. Hal qiluvchi —
  tovar harakati bo'ladigan filial xodimi (`transfer.fs.sellerOnly` / `buyerOnly`).
- **Hisob-kitob (V43, `finance.cash.BranchPayments`, `/api/branch-payments`):** qarzdor filial hisobidan → kreditor filial hisobiga, qarz −;
  raqam IO hisoblagichidan, pul jurnalida `FIO`. Qarzdan oshmaydi (filiallar juftligi FOR UPDATE, parallel test). Bekor qilish — teskari.
  `inventory.BranchDebts` — branch_ledger uchun ochiq API.
- UI: FS oynasida kamomad paneli (3 yo'l), FS sahifasida «To'lash» va to'lovlar ro'yxati, Ombor mudiri «Ko'chirish qabuli» da FS, «Diqqat».
