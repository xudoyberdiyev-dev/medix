# T12 — Claude Code uchun topshirish to'plami

Manba: prototip fayllari (Medix ERP.dc.html, 101 ta yordamchi DC, medix-data.js). Faqat prototipdagi haqiqiy holat yozildi. Noaniq joylar «aniqlanmagan» deb belgilangan.

## 1. Arxitektura (prototip)

- **Kirish nuqtasi.** `Medix ERP.dc.html`: login, rol/filial tanlash, menyu (NAV), sahifa almashtirish (`state.page` + URL hash), Ctrl+K, bildirishnomalar, til, demo menyusi.
- **Ma'lumot qatlami.** `medix-data.js` → `window.MedixData`: 636 ta eksport, 691 funksiya, bitta `store` obyekti. Barcha biznes qoidalari shu yerda, UI faqat chaqiradi.
- **Sahifalar va komponentlar.** Har sahifa alohida `.dc.html` (`<dc-import>`), props: `dict` (til matnlari), `role`, `branch`, `userName`, `narrow`, `on*`.
- **Saqlash.**
  - `store` faqat xotirada; `resetStore()` seed holatiga qaytaradi.
  - Brauzer xotirasida faqat: til (`LANG_KEY`), mahsulotlar (`PROD_KEY`), jadval ustunlari (`medix-stock-*`, Products `COL_KEY`), hisobot shablonlari (Reports `SKEY`), o'rnatish ustasi (`WIZ_KEY`), mahsulot oldindan to'ldirish (`medix-product-prefill`).
- **Vaqt.** `T0` — demo «bugun» (31.10.2026 emas, seed bazasi; `NOW = T0 + 15:30`). `nowStr()` / `nowMs()` demo soat bilan siljiydi.

## 2. Sahifalar xaritasi (6)

Manzil: `#<key>` yoki `#<key>?param=…`. Rollar — `navCan` (11-bo'limdagi jadval). URL parametrlari kodda ko'rilganlari; to'liq ro'yxat aniqlanmagan.

| Kalit | Nomi | Fayl | Vazifasi | Parametrlar |
|---|---|---|---|---|
| home | Bosh sahifa | Home; rolga qarab CashierPanel, PickerPanel, MarkerPanel, DriverPanel, SupervisorPanel (keeper) | Rol paneli yoki Direktor / filial bosh sahifasi | — |
| orders | Buyurtmalar | Orders (+ OrderEntry, OrderCard, ProductPicker) | Ro'yxat, kiritish, kartochka | `open=BY-…` |
| approvals | Tasdiqlash | Approvals (+ DecisionDialog) | Buyurtma va narx tasdig'i | aniqlanmagan |
| shipments | Jo'natish | Shipping (+ TripPage) | Reyslar, yuklash | aniqlanmagan |
| receipt | Kirim | Receipts | KR hujjatlari | aniqlanmagan |
| stock | Qoldiqlar | Stock (+ BatchPanel) | Partiyalar, zonalar | aniqlanmagan |
| expiry | Muddat nazorati | ExpiryControl | Muddat bo'yicha partiyalar | aniqlanmagan |
| transfer | Ko'chirish | Transfers (+ TransferDoc, TransferReceive) | ZK / OK / FS | aniqlanmagan |
| inventory | Inventarizatsiya | Inventory (+ InventoryDoc, InventoryCount) | IN | aniqlanmagan |
| creturns / writeoff / sreturns | Qaytarish va hisobdan chiqarish | StockDocs (kind: qm / hc / qy) | QM / HC / QY | aniqlanmagan |
| opening | Boshlang'ich qoldiq | OpeningBalances (+ OpeningDoc, ImportWizard) | BQ | aniqlanmagan |
| payments | To'lovlar | Payments (+ PaymentDoc, AllocationGrid, AdvanceDoc) | MT / YT / AV | aniqlanmagan |
| cash / bank | Kassa / Bank | Cash, Bank (+ MoneyOpDoc, CashClose) | KO / BO / IO, kunni yopish, ko'chirma | aniqlanmagan |
| cdebt / sdebt | Mijozlar / YB qarzi | Receivables, Payables (+ DebtCard) | Qarz, eskirish | aniqlanmagan |
| recon | Akt sverka | Reconciliation | AS | aniqlanmagan |
| products | Mahsulotlar | Products | Katalog, tarix | aniqlanmagan |
| clients / suppliers | Mijozlar / YB | Customers, Suppliers (+ Counterparties, CounterpartyCard, CounterpartyForm, BranchTermsPanel) | Kontragentlar | aniqlanmagan |
| prices | Narxlar | Prices (+ PriceHistoryPanel) | Narx turlari, NO | aniqlanmagan |
| lookups | Boshqa ma'lumotnomalar | Lookups (+ LookupPanel) | Ishlab chiqaruvchi, kategoriya, haydovchi, mashina, moddalar … | aniqlanmagan |
| reports | Hisobotlar | Reports | sv, op, sg, sc va boshqalar | `r=…` |
| company / branches / warehouses | Kompaniya / Filiallar / Omborlar | AdminOrg | Tashkilot tuzilmasi | aniqlanmagan |
| staff / roles | Xodimlar / Rollar | AdminStaff | Xodimlar, ruxsatlar | aniqlanmagan |
| audit | Audit jurnali | AuditLog | Audit | aniqlanmagan |
| settings | Sozlamalar | Settings | CONFIG | aniqlanmagan |
| marking | Markirovka | MarkingLog | Kodlar jurnali (menyuda yashirin) | aniqlanmagan |
| pickrep / markrep | Natijalar | PickerReport, MarkerReport | Yig'uvchi / markirovkachi natijasi | aniqlanmagan |
| delivery, interbranch | Yashirin | aniqlanmagan | Manzil saqlangan, menyuda yo'q | — |
| profile | Profil | Profile (+ PinSetup) | PIN, sessiyalar | — |

Login va o'rnatish ustasi: Medix ERP ichida (login) va SetupWizard (+ WizRoles, WizStaff, WizFinish).

## 2a. URL parametrlari (T12a da to'ldirildi)

Umumiy qoidalar (Medix ERP `openHref`):
- Format: `#<sahifa>?k=v&k2=v2`. Qiymatlar URL-kodlangan.
- `branch=TSH` — barcha sahifalarda: filialni almashtiradi (faqat barcha filiallarga ruxsati bo'lgan rolda yoki o'z filiali bo'lsa).
- `open=<raqam>` — hujjat yoki kartochkani ochadi (qaysi sahifa ekaniga qarab, quyida).
- `#picking` (eski manzil) → `#orders?status=picking`.
- Ruxsatsiz sahifa manzili ochilmaydi (`allowed` → `navCan`).

| Sahifa | Parametr | Ma'nosi |
|---|---|---|
| orders | open | BY raqami — buyurtma kartochkasi |
| orders | tab / status | Holat yorlig'i (draft, pending, queued, picking, marking, checking, docs, loading, shipped, delivered, undelivered, rejected, cancelled, all). Eski nomlar: qWait/qTime → queued, closed → cancelled, ready → loading |
| orders | late=1 | Faqat kechikkanlar (orderLateDays) |
| orders | date | Sana (KK.OO.YYYY) — bir kunlik filtr |
| orders | op | Operator nomi bo'yicha filtr |
| orders | pick | Kalit bo'lsa URL e'tiborsiz qoldiriladi (yig'ish oqimi uchun) |
| approvals | open | BY yoki NO raqami — tasdiq oynasi |
| shipments | tab | Yorliq (trips va boshqalar) |
| shipments | open | RS raqami — reys |
| receipt | open | KR raqami |
| stock | view | product / batch / wh — ko'rinish |
| stock | q | Qidiruv |
| stock | exp | Muddat guruhi (vergul bilan) |
| stock | zone, wh, stock, maker, cat, country, supply, supplier, flags | Filtrlar (vergul bilan bir nechta qiymat) |
| expiry | band | 0-30, 31-60, 61-90 (EXP_BANDS) |
| transfer | open | OK / ZK / FS raqami |
| transfer | status | Holat yorlig'i |
| transfer | recv | Qabul qilish oynasi (raqam) |
| inventory | open | IN raqami |
| inventory | status | draft, count, check, posted, cancelled |
| inventory | q | Qidiruv |
| creturns / writeoff / sreturns | open | QM / HC / QY raqami |
| creturns / writeoff / sreturns | status, q | Holat, qidiruv |
| opening | open | BQ raqami |
| payments | open | MT / YT / AV raqami |
| payments | new | mt / yt — yangi to'lov |
| payments | acct | Hisob kodi (new bilan) |
| payments | status | pending, cancelled, draft, posted |
| payments | kind | mt (kirim) / yt (chiqim) yorlig'i |
| payments | q, from, to, method | Qidiruv, davr, to'lov usuli |
| cash | open | KO / IO raqami |
| cash | new=ko | Yangi kassa operatsiyasi (acct bilan) |
| cash | acct | Hisob kartochkasi |
| cash | close | Hisob kodi — kunni yopish oynasi |
| bank | open, new=bo, acct, recon | Bank operatsiyasi, hisob, ko'chirma bilan solishtirish |
| cdebt | open | Mijoz id, nomi yoki STIR — qarz kartochkasi |
| cdebt | aging | current, 1-30, 31-60, 61-90, 90plus |
| cdebt | dueFrom, dueTo | To'lov kuni oralig'i |
| sdebt | tab=bonus | Bonuslar yorlig'i |
| sdebt | due | late, today, 3d, 7d (7), prepaid |
| sdebt | open | YB nomi (kartochka) yoki KR raqami (qidiruv) |
| recon | open | AS raqami |
| recon | status | made, sent, signed, diff |
| recon | kind | mt / yt |
| recon | q | Qidiruv |
| products | open | Mahsulot id yoki kodi |
| products | new | Yangi mahsulot formasi |
| products | q | Qidiruv |
| clients / suppliers | open | Kontragent kaliti |
| prices | open | NO raqami |
| prices | rc yoki mode=rc | Kirim bo'yicha narx (KR raqami) |
| prices | set | Narx turi id yoki kodi — Narx o'rnatish ekrani |
| prices | br, q | Filial va qidiruv (set bilan) |
| prices | tab | changes / types |
| marking | open, code | Kod jurnali, kod bo'yicha |
| reports | r | sv, gp, fs, op, sg, sc |
| reports | period | day, week, month, prevMonth, quarter, ytd |
| reports | from, to | Ixtiyoriy davr (custom) |
| reports | who | op / sg / sc da xodim yoki korxona (drill) |
| reports | cust, prod, cat, maker, region, ptype, op | Filtrlar (FK) |

URL parametri yo'q sahifalar: home, lookups, company, branches, warehouses, staff, roles, audit, settings, pickrep, markrep, profile. Ular faqat `branch` ni qabul qiladi.

## 3. Komponentlar (7)

Propslar — har faylning data-props ro'yxati. Qayerda ishlatilishi — 3a-bo'limda (to'liq).

| Komponent | Vazifasi | Propslar |
|---|---|---|
| DataTable | Ro'yxat jadvali: tanlash, saralash, ichki aylantirish | columns, rows, allState, onToggleAll, onSort, loading, scrollX, minWidth, selectAllLabel, rowActionsLabel |
| FilterBar | Qidiruv, filtr chiplari, sana, ustunlar | query, onQuery, searchPh, searchWidth, filters, chipLabels, dateFilter, hasActive, onClearAll, clearAllLabel, columns, onColumns, columnsLabel, columnsHint, narrow, slashFocus, clearLabel |
| FilterChip | Bitta ko'p tanlovli filtr | label, options, selected, onChange, searchPh, resetLabel, applyLabel, clearLabel, emptyLabel |
| SavedViews | Saqlangan ko'rinish yorliqlari | tabs |
| ColumnsMenu | Ustunlarni yoqish va tartiblash | columns, onChange, label, hint |
| Pagination | Sahifalash | total, page, perPage, perLabel, prevLabel, nextLabel, onPage, onPer |
| PageHeader | Sahifa sarlavhasi + bitta asosiy tugma + «…» | title, count, subtitle, moreLabel, secondary, more, primary |
| DocumentHeader | Hujjat sarlavhasi, holat, qadamlar | parentLabel, onParent, title, number, badge, status, stepLabels, autosave, secondary, more, primary, moreLabel |
| DocumentLinesGrid | Hujjat qatorlari (tahrirlanadigan) | columns, rows, options, editable, onEdit, onAdd, onRemove, onMark, onBarcode, focusReq, labels |
| ProductPicker | Mahsulot qidirish va katalog (buyurtma, kirim) | mode, doc, dict, role, narrow, onBack, onDone, onToast |
| PickConfirm | Yig'ishni tasdiqlash | orderId, dict, userName, narrow, onClose, onDone |
| ScanPanel | Skaner paneli (markirovka, tekshiruv) | title, subtitle, lines, lineValue, onLine, done, need, scans, errN, onTest, onUndo, onManual, onClose, width, labels |
| AllocationGrid | To'lovni hujjatlarga taqsimlash | kind, rows, editable, manual, onAuto, labels |
| MoneyInput | Summa maydoni | label, value, onChange, suffix, required, error, hint, readOnly, compact, bold, placeholder |
| DateRangePicker | Davr tanlash | label, from, to, today, onChange, labels, alignRight |
| Select | Tanlash (qidiruvli) | label, required, options, value, onChange, placeholder, searchable, error, locked, fieldKey |
| ConfirmDialog | Tasdiq oynasi (sabab bilan, xavfli) | title, text, items, withReason, reasonLabel, reason, reasonError, onReason, danger, confirmLabel, cancelLabel, onConfirm, onCancel |
| DecisionDialog | Buyurtma tasdig'i / rad etish | kind, orderId, dict, role, userName, onClose, onDone |
| EmptyState | Bo'sh holat | icon, title, text, tone, minHeight, primary, secondary |
| StatusBanner | Holat xabari | tone, icon, title, text |
| StatusStepper | Holat qadamlari | status, labels |
| HistoryTimeline | Tarix | filters, groups, emptyLabel |
| InfoGrid | Kalit–qiymat bloki | title, rows, stacked |
| FormSection / StickyFormFooter / ValidationSummary | Forma bo'limi, saqlash paneli, xatolar ro'yxati | title, description, stacked / dirty, dirtyLabel, cancelLabel, saveLabel, maxWidth, onCancel, onSave / title, subtitle, errors, warnings, warnTitle, closeLabel, onClose |
| TotalsFooter, SideSummary, BulkBar, AutosaveIndicator, RecordHeader | Jami qatori, yon xulosa, ommaviy amallar, avtosaqlash, yozuv sarlavhasi | fayldagi data-props |
| DebtCard | Qarz kartochkasi (MT / YT) | kind, party, branch, advOpen, advAct, cardKey, backLabel, dict, role, userName, readOnly, narrow, onBack, onToast, onNavigate |
| BatchPanel | Partiya paneli (tannarx `canCost`) | batch, dict, canCost, width, onClose, onOpenDoc, onToast |
| CustomerPanel | Buyurtmada mijoz ma'lumoti | custId, orderSum, compact, excludeNo, dict, onAdd, onDetails, onClose |
| PriceHistoryPanel | Narx tarixi | pid, type, branch, role, inline, dict, onClose, onOpenNo, onOpenSet |
| LookupPanel / BranchTermsPanel | Ma'lumotnoma yozuvi / filial shartlari | fayldagi data-props |
| TabletShell | Panel (planshet / telefon) qobig'i | title, sub, backLabel, user, scanner, compact, progress, flashColor, flashN, onBack, onTest, onScanner, testLabel, scannerOn, scannerOff |
| HandoffPanel | Buyurtmani topshirish | orderId, dict, userName, narrow, canAct, onClose, onToast |
| OrderStatus | Holat belgisi | status, label, dict |
| PrintPreview | Chop etish (props yo'q, `prPrints` / `printData` orqali) | — |

**Takrorlanadigan yordamchilar** (har faylda nusxa): `fN`, `fM`, `pD`, `fill`, `toLat`, `C2L`. Haqiqiy dasturda bitta modulga chiqarilsin.

## 3a. Komponentlar qayerda ishlatiladi (to'liq, T12a)

| Komponent | Qayerda (fayllar) |
|---|---|
| AdminOrg | Medix ERP |
| AdminStaff | Medix ERP |
| AdvanceDoc | DebtCard |
| AllocationGrid | AdvanceDoc, PaymentDoc |
| Approvals | Medix ERP |
| AuditLog | Medix ERP |
| AutosaveIndicator | DocumentHeader |
| Bank | Medix ERP |
| BatchPanel | ExpiryControl, Stock |
| BranchPanel | AdminOrg, SetupWizard |
| BranchTermsPanel | CounterpartyCard |
| BulkBar | Counterparties, InventoryDoc, Orders, Products, Receipts, Shipping |
| Cash | Bank, Medix ERP |
| CashClose | Cash |
| CashierPanel | Medix ERP |
| ColumnsMenu | Receipts, Reports |
| ConfirmDialog | AdminOrg, AdminStaff, AdvanceDoc, AuditLog, CashClose, Counterparties, CounterpartyCard, CounterpartyForm, HandoffPanel, ImportWizard, InventoryCount, InventoryDoc, Lookups, Medix ERP, MoneyOpDoc, OpeningBalances, OpeningDoc, OrderEntry, Payables, PaymentDoc, Prices, Products, Profile, Receipts, Settings, StockDocs, TransferDoc, TransferReceive, TripPage, WizFinish, WizRoles, WizStaff |
| Counterparties | Customers, Suppliers |
| CounterpartyCard | Counterparties |
| CounterpartyForm | Counterparties |
| CustomerPanel | OrderCard, OrderEntry |
| Customers | Medix ERP |
| DataTable | AdminOrg, AuditLog, Counterparties, DebtCard, ExpiryControl, Home, Inventory, InventoryDoc, Lookups, MarkingLog, OpeningBalances, OpeningDoc, Orders, Payables, Payments, Prices, Products, Receipts, Receivables, Reconciliation, Reports, Shipping, Stock, StockDocs, Transfers, WizStaff |
| DateRangePicker | DebtCard, FilterBar, MarkerPanel, MarkerReport, PickerReport, Reconciliation, Reports |
| DebtCard | Medix ERP, Payables, Receivables |
| DecisionDialog | Approvals, OrderCard |
| DocumentHeader | AdvanceDoc, CashClose, InventoryDoc, MoneyOpDoc, OpeningDoc, OrderCard, OrderEntry, PaymentDoc, Receipts, StockDocs, TransferDoc, TransferReceive, TripPage |
| DocumentLinesGrid | OrderEntry, Receipts, StockDocs, TransferDoc |
| DriverPanel | Medix ERP |
| EmptyState | AdvanceDoc, AuditLog, Cash, Counterparties, CounterpartyCard, CustomerPanel, DebtCard, ExpiryControl, Inventory, Lookups, MarkingLog, Medix ERP, OpeningBalances, OpeningDoc, OrderCard, Orders, Payables, PaymentDoc, Payments, Prices, Products, Receipts, Receivables, Reconciliation, Reports, Shipping, Stock, StockDocs, Transfers, TripPage, WizStaff |
| ExpiryControl | Medix ERP |
| FilterBar | AuditLog, Cash, Counterparties, Inventory, MarkingLog, OpeningBalances, Orders, Payables, Payments, Prices, ProductPicker, Products, Receipts, Receivables, Reconciliation, Reports, Stock, StockDocs, Transfers, WizRoles, WizStaff |
| FilterChip | FilterBar |
| FormSection | CounterpartyForm, MoneyOpDoc, PaymentDoc, Products |
| HandoffPanel | Shipping |
| HistoryTimeline | AdvanceDoc, CounterpartyCard, InventoryDoc, MarkingLog, MoneyOpDoc, OpeningDoc, OrderCard, PaymentDoc, Products, Receipts, StockDocs, TransferDoc |
| Home | Medix ERP |
| ImportWizard | Counterparties, OpeningDoc, Prices, Products |
| InfoGrid | AdminOrg, AdminStaff, AdvanceDoc, AuditLog, BatchPanel, CounterpartyCard, InventoryDoc, MoneyOpDoc, OpeningDoc, OrderCard, PaymentDoc, Products, Profile, Receipts, StockDocs, TransferDoc, WizStaff |
| Inventory | Medix ERP |
| InventoryCount | Inventory |
| InventoryDoc | Inventory |
| LookupPanel | Lookups |
| Lookups | Medix ERP |
| MarkerPanel | Medix ERP |
| MarkerReport | Medix ERP |
| MarkingLog | MarkerPanel, Medix ERP |
| MoneyInput | AllocationGrid, BranchTermsPanel, Cash, CashClose, CounterpartyForm, MoneyOpDoc, PaymentDoc, Reconciliation |
| MoneyOpDoc | Cash |
| OpeningBalances | Medix ERP |
| OpeningDoc | OpeningBalances |
| OrderCard | Orders |
| OrderEntry | Orders |
| OrderStatus | Approvals, CustomerPanel, HandoffPanel, TripPage |
| Orders | Medix ERP |
| PageHeader | AdminOrg, Approvals, AuditLog, Cash, Counterparties, Inventory, Lookups, MarkingLog, OpeningBalances, Orders, Payables, Payments, Prices, Products, Receipts, Receivables, Reconciliation, RecordHeader, Reports, Settings, Shipping, Stock, StockDocs, Transfers, WizRoles, WizStaff |
| Pagination | AuditLog, Counterparties, MarkingLog, OpeningDoc, Orders, Payables, Payments, Prices, Products, Receipts, Receivables, Reports, Stock, Transfers |
| Payables | Medix ERP |
| PaymentDoc | Payments |
| Payments | Medix ERP |
| PickConfirm | OrderCard, PickerPanel |
| PickerPanel | Medix ERP |
| PickerReport | Medix ERP |
| PinSetup | Medix ERP, Profile |
| PriceHistoryPanel | Prices, Products |
| Prices | Medix ERP |
| PrintPreview | Medix ERP |
| ProductPicker | Orders, Receipts |
| Products | Medix ERP |
| Profile | Medix ERP |
| Receipts | Medix ERP |
| Receivables | Medix ERP |
| Reconciliation | Medix ERP |
| RecordHeader | AdminOrg, AdminStaff, CounterpartyCard, DebtCard, Products |
| Reports | Medix ERP |
| SavedViews | Approvals, AuditLog, Counterparties, CounterpartyCard, DebtCard, Inventory, InventoryDoc, Lookups, MarkingLog, MoneyOpDoc, OpeningBalances, OpeningDoc, OrderCard, Payables, PaymentDoc, Payments, Prices, Products, Receipts, Receivables, Reconciliation, Reports, Shipping, Stock, StockDocs, TransferDoc, Transfers, WizStaff |
| ScanPanel | InventoryCount |
| Select | BranchTermsPanel, CounterpartyCard, CounterpartyForm, ImportWizard, InventoryDoc, LookupPanel, Lookups, MarkerPanel, MarkerReport, MoneyOpDoc, OpeningDoc, OrderEntry, PaymentDoc, PickerReport, PriceHistoryPanel, Prices, PrintPreview, Products, Receipts, Reconciliation, Reports, ScanPanel, Settings, StockDocs, TransferDoc, TransferReceive, TripPage, WizRoles, WizStaff |
| Settings | Medix ERP |
| SetupWizard | Medix ERP |
| Shipping | Medix ERP |
| SideSummary | AdvanceDoc, CashClose, CounterpartyCard, DebtCard, MoneyOpDoc, PaymentDoc, Products, TransferDoc, TransferReceive |
| StatusBanner | AdvanceDoc, Cash, CashClose, CounterpartyCard, DebtCard, ExpiryControl, HandoffPanel, ImportWizard, Inventory, InventoryCount, InventoryDoc, MoneyOpDoc, OpeningBalances, OpeningDoc, OrderCard, PaymentDoc, Prices, PrintPreview, Receipts, Reconciliation, Reports, StockDocs, TransferDoc, TransferReceive, Transfers, TripPage, WizRoles, WizStaff |
| StatusStepper | DocumentHeader |
| StickyFormFooter | CashClose, CounterpartyForm, ImportWizard, MoneyOpDoc, PaymentDoc, Products, Settings, WizRoles, WizStaff |
| Stock | Medix ERP |
| StockDocs | Medix ERP |
| SupervisorPanel | Medix ERP |
| Suppliers | Medix ERP |
| TabletShell | InventoryCount |
| TotalsFooter | Cash, CashClose, InventoryDoc, OpeningDoc, OrderCard, OrderEntry, PaymentDoc, Receipts, StockDocs, TripPage |
| TransferDoc | Transfers |
| TransferReceive | Transfers |
| Transfers | Medix ERP |
| TripPage | Shipping |
| ValidationSummary | AdvanceDoc, CashClose, InventoryDoc, MoneyOpDoc, OpeningDoc, OrderEntry, PaymentDoc, Receipts, StockDocs, TransferDoc, TransferReceive, WizFinish, WizStaff |
| WarehousePanel | AdminOrg, SetupWizard |
| WizFinish | SetupWizard |
| WizRoles | AdminStaff, SetupWizard |
| WizStaff | AdminStaff, SetupWizard |

Hech qayerda import qilinmaydigan fayllar: Admin.

## 4. Ma'lumot tuzilmalari (8)

Turlar seed dan olindi. «?» — har yozuvda bo'lmaydi (ixtiyoriy). Majburiylik qoidasi kodda e'lon qilinmagan: shu belgi bo'yicha va `orderCheck` / `*Validate` funksiyalari bo'yicha.

### Mahsulot — `store.products` (40)
- id:number, code:string, name, contractName, classifier, maker, country, cat, form, dose, pack, perPack, unit:string;
- barcodes:string[], ikpu, farmId, supplyBy:string;
- ctrl / mark / rx:boolean (nazoratli / markirovkali / retsept);
- vat:number (%), note:string, createdAt, createdBy:string, active:boolean;
- stock:number, minQty, maxQty:number|null.
- Bog'lanish: partiyalar (pid), narxlar (pid), buyurtma qatori (pid).

### Partiya — hisoblanadi: `batches()`, saqlanmaydi
- id, pid, branch, wh, zone, batch, exp, mfg, cost, qty, reserved, doc, docDate, supplier, bq;
- hisoblanadigan maydonlar: avail, days, status ('open' …), zoneType, resDocs[].
- Manba: KR qatorlari + BQ + harakatlar (sotuv, QM, QY, HC, IN, ko'chirish).

### Ombor va zona — `store.whs` (10)
- id, branch, name, address, ctrl:boolean, active, zones[].
- Zona turlari (`zoneType`): store, ctrl, cold, quar, recv, ship.

### Filial — `store.brs` (4)
- id, name, code (TSH / SMQ / BXR / FRG), legal, stir, vat:boolean, vatNo, region, address, same, actual, phone, banks[{bank, acc, main}], director, accountant, active.

### Kontragent — `store.kts` (26)
- key, stir, name, legal, type, region, address, phone, email, contacts[], bank{}, lic[];
- cust:number|null (mijoz id), sup:string|null (YB nomi);
- cTerms{}, sTerms{} (filial shartlari), status (active / blocked), reason, statusAt, statusBy, hist[], mainPay?, docPre?.
- Mijozning filial shartlari: `custAt(id, br)` → active, limit, days, disc, price (narx turi), minMonths, operator, addr.

### Narx turi — `store.ptypes` (8)
- id, code, name, alt, cur, kind, batch:boolean (partiya narxi), base:boolean, active, at, who, hist[].

### Narx yozuvi — `store.prices` (561)
- pid, type, br, price, eff (kuchga kirish sanasi), doc (NO raqami), batch?.

### NO, narx o'rnatish — `store.nos` (22)
- no, id, scope (all / branch), branch, type, eff, src, note, status (pending / posted …), seed;
- lines[{pid, price, old?, batch?, cost?}], createdBy, createdAt, postedBy, postedAt, log[], sentAt?, rc? (kirim raqami).

### Buyurtma — `store.orders` (52)
- no, id, branch, wh, date, time, cust, status, op, delivery (deliver / pickup), delivDate, delivTime?, note, payType, lines[];
- jarayon maydonlari: appr, rej, canc, log[], pk (yig'ish), picker, pickStart, pickEnd, mk (markirovka kodlari), markEnd, chk (tekshiruv), dc (hujjat), ship, sale, short (kamomad), ret (yetkazilmagan), issues[], fefoDev, tm, pays[], reason, arch, viaAppr, mgrNote.
- Qator: pid, qty, price:null (narx hisoblanadi), id, p0 (dastlabki narx), pb (partiya narxlari surati), fz (muzlatilgan narx / split).

### Kirim, KR — `store.receipts` (18)
- no, id, branch, wh, date, supplier, invNo, invDate, sfNo, note, status, createdBy, owner, payType, lines[], history[];
- sent?, acceptedAt / By?, postedAt / By?, cancelAt / By?, reason?, bonus?, due?, dueManual?, soldLine?, soldQty?.
- Qator: pid, batch, mfg, exp, zone, qty, price, bonusQty, id, fact?, diff?.

### BNS, bonus — `store.bns` (1)
- no, branch, supplier, rcNo, sum, date, status, by, at.

### Sotuv / HF — `store.sales` (21)
- no (SV), inv (HF raqami), nak, oid, ono, cust, branch, method, trip, at, sum (QQS bilan), qty, by, seed?.

### QM / HC / QY — `store.docs.qm | hc | qy` (7 / 5 / 4)
- Umumiy: kind, no, id, branch, wh, date, status (draft / posted / cancelled), note, createdBy, createdAt, lines[], log[], postedBy / At, cancelledBy / At / Reason.
- QM: cust, saleNo.
- HC: reason, commission[], actNo, file.
- QY: supplier, receiptNo, reason.

### Ochilish qarzlari — `store.arOpen` (52)
- kind (mt / yt), party, branch, no, date, due, sum, extNo.

### MT / YT to'lovlari — `store.pays` (33)
- no, id, kind (mt / yt), branch, date, party, method, acct, sum, alloc[{no, sum}], auto, status (draft / pending / posted / cancelled);
- payNo, bankDate, checkNo, note, src?, trip?, createdBy / At, sentBy / At?, postedBy / At?, cancelledBy / At / Reason?, log[].

### Avans, AV — `store.advs` (seed da 0)
- `saveAdv` maydonlari: kind, branch, party, date, auto, src, alloc, status.

### KO / BO / IO — `store.mops` (16)
- no, id, kind (ko / bo / io), branch, date, time, sum, item (modda), note, baseNo, file, status, createdBy / At, postedBy / At, log[], dir (in / out), acct;
- IO uchun: from, to, ioType.

### Hisoblar
- `accountsOf(br)` / `accById` — naqd kassa, Terminal, bank (K-TSH, … kodlar).
- Qoldiq: `accBalance(acct, null, date)`.
- Qattiq yozilgan boshlang'ich qiymat: `BANK_TSH1` va boshqalar (seed).

### Kunni yopish — `store.closes` (5)
- acct, date, by, at, system, counted, diff, note.
- Ko'chirma solishtiruvi: `store.recon[acct]`.

### Akt sverka, AS — `store.recons` (2)
- no, id, kind, party, branch, from, to, status (sent / signed), createdBy / At, theirs, diffNote, log[], sentAt, doneAt?.

### Reys, RS — `store.trips` (7)
- no, date, driver (id), car, exp, status (planned / transit / retwait / done), plannedAt / By, shippedAt / By?, doneAt / By?, branch, stops[], cashAcc[]?, finAt / By?.

### Ko'chirish — `store.transfers` (2)
- no, id, kind (zk / ok / fs), from{branch, wh}, to{branch, wh}, date, note, status (transit / received …), vat, lines[], createdBy / At, sentBy / At, inv? (HF), receivedBy / At?, log[].

### Inventarizatsiya, IN — `store.invs` (1)
- no, id, branch, wh, date, scope{}, commission[], chair, blind:boolean, status, lines[], note, createdBy / At, log[].

### BQ, boshlang'ich qoldiq — `store.bqs` (17)
- no, id, branch, type (goods / debt / money …), wh, cutoff, source, file, note, status, seed, lines[], createdBy / At, postedBy / At, log[].

### Markirovka kodi
- Saqlanmaydi, hisoblanadi: `marks()` / `markByCode`.
- Maydonlar: code, gtin, serial, batch, status, p.
- Buyurtmada: `o.mk.codes[]` (rm — olib tashlangan).

### Muammo — `o.issues[]`
- `issueAdd`, `openIssues`, `issueResolve`. Maydonlar to'liq aniqlanmagan.

### Xodim — `store.emps` (32)
- id, last, first, mid, role, branch, phone, status (active / new / blocked), whs[], cash[] (kassalar), login, blockReason.

### Rol va ruxsat — `store.rl`
- roles[{id, std, scope (all / own), active, home}];
- perms{rol: {kalit: true}} — 131 kalit.

### Bildirishnoma — `store.notifs` (seed da 0)
- id, to, time, kind, icon, text, orderId.
- Qolganlari hisoblanadi: `bhAttention`, `supReminders`.

### Audit — `store.audit` (7)
- kind, act?, who, at, obj, objType, page, text, key?, diff[]?, seed?, pid?.

### Sozlamalar — `store.cfg` (CFG0)
- orderLateDays 2, expiryWarnDays 90, invRemindDays 90, limitBranchPct 20, overdueDirDays 30, priceWarnPct 20;
- cashBranchApprove 2 000 000, hcDirApprove 5 000 000, ivDirApprove 5 000 000;
- vat 12, pwMin 8, sessionMin 30, pinTries 5, pinLockMin 15.
- QQS tarixi: `store.vatHist`.

### Boshqa
- `store.lk` (makers, cats, units, regions, drivers, cars, items, prodMaker, countries).
- `store.co` (kompaniya), `store.sess`, `store.pins`, `store.locks`.

## 5. Holatlar mashinalari (9)

### Buyurtma (`ORDER_STATUS`, `orderAct`, `submitOrder`, `start*` / `finish*`)

| Holat | Kim | Keyingi | Shart |
|---|---|---|---|
| draft | operator | pending yoki queued (`submitOrder`); cancelled (`cancelDraft`) | `orderCheck` xatosiz; `creditCheck.level` bo'lsa → pending |
| pending | filial rahbari yoki direktor (`canApprove`) | queued (approve), rejected (reject), draft (return) | level director: limit > limitBranchPct, muddati o'tgan > overdueDirDays kun yoki bloklangan |
| queued | ombor mudiri (navbat, vaqt) | picking (`startPick`) | rezerv |
| picking | yig'uvchi | marking (markirovkali bo'lsa) yoki checking (`finishPick`) | `pickDone` |
| marking | markirovkachi | checking (`finishMark`) | barcha kodlar skanerlangan yoki `markNone` |
| checking | ombor mudiri (`startCheck` / `finishCheck`) | docs; qaytarish (`checkReturn`) | — |
| docs | ombor mudiri | loading (reys) yoki olib ketish | `docsDone`, SV / HF yaratiladi (`mkSale`) |
| loading | ombor mudiri / haydovchi | shipped (`shipTrip`) | reys rejalangan |
| shipped | haydovchi | delivered / undelivered / qisman (`stopSet`, `applyStop`) | — |
| delivered, undelivered, rejected, cancelled | — | yakuniy | undelivered → `o.ret`, tovar qaytadi (`retAccept`) |

- `cancel` istalgan rezervli holatdan: markirovka kodlari bo'shaydi, reysdan chiqariladi.
- `return` → draft (cheklovsiz — auditdagi №22).

### Boshqa hujjatlar
- **Kirim (KR):** draft → accepted → posted; draft / accepted → cancelled; posted → cancelled (`receipt.cancelPosted`, harakatlar bo'lmasa).
- **MT / YT:** draft → pending (`sendPay`) → posted (`postPay`); pending → draft (`returnPay`); → cancelled (`cancelPay`).
- **KO / BO / IO:** draft → (tasdiq, agar `mopNeedsApproval`: KO chiqim > cashBranchApprove) → posted → cancelled.
- **NO:** draft → pending → posted (`nrApprove`); rejected (`nrReject`); cancelled (`nrCancel`).
- **Reys (RS):** planned → transit (`shipTrip`) → retwait (qaytgan tovar va pul kutilmoqda) → done (`finishTrip` / `tripSettle`); cancelled (`cancelTrip`).
- **Inventarizatsiya (IN):** draft → count → check → posted (`ivNeedsDir`: kamomad > ivDirApprove yoki nazoratli farq → direktor); cancelled. Faol bo'lsa `ivLock` qulfi.
- **Ko'chirish:** ZK (zona ichida) — `trNeedsAppr`: karantindan saqlash zonasiga → tasdiq. OK / FS: draft → transit (`trOut`) → received (`trIn`, kamomad → `resolveHc` / `resolveBack`).
- **QM / HC / QY:** draft → posted → cancelled. HC > hcDirApprove → direktor (`hcNeedsDirector`).
- **AS:** draft → sent → signed.

## 6. Biznes qoidalari (10)

1. **FEFO** — `fefoPick`: ochiq, muddati ≥ minDays, avail > 0; muddat bo'yicha o'sish tartibida. Yig'ish rejasi — `pickPlan` (zona tartibi: asosiy → seyf → sovuq).
2. **Narx** — `priceInfo` / `priceFor` / `linePrice`: mijoz narx turi + filial; partiya narxi (`batchPriceAt`) umumiy narxdan (`genPriceAt`) ustun.
3. **Narx muzlatish** — qoralamada surat (`priceSnap`, `l.pb`), tasdiqda muzlatish (`l.fz`, `freezeOrders`), partiyalarga bo'linish (`lineSplit` / `snapSplit`, `pickPrice`).
4. **Narx o'zgarishi** — NO orqali; ogohlantirish chegarasi priceWarnPct = 20%. Tannarxdan past narx → `prices.below` ruxsati.
5. **QQS** — `vatOf(pid)` (mahsulot vat %, vatNone → 0), `withVat`. Standart 12% (`cfg.vat`, tarix — `vatHist`). Sotuv summasi QQS bilan.
6. **Qarz** — `ledger(kind, id, branch)` → invoices (due, left), debt, overdue, overdueDays, aging, advance. `debtOf` filiallar bo'yicha jamlaydi. Muddat: `dueDate` / `rcDue` (shartlardagi days).
7. **Kredit limiti va tasdiq** — `creditCheck` (limit, overdue, maxQty, blocked) → level branch / director; sabablar `apprReasonsOf`.
8. **Min / max miqdor** — `maxQtyOver` (p.maxQty), minQty — qoldiq ogohlantirishi.
9. **To'lov taqsimoti** — `autoAlloc` (eski hujjatdan boshlab), avans — AV.
10. **100% oldindan to'lov (kirim)** — `rcPrepay`: YB avansi bo'lsa, kirim o'tkazilganda avtomatik AS yaratiladi.
11. **Bonus** — `bonusOf` (balans, kutilayotgan, tarix), `bonusDecide`, `rcBonusGoods` (bonus tovar).
12. **Markirovka** — `mkParse` / `markScan` / `markMismatch`: GTIN, partiya, takroriy kod, boshqa buyurtma kodi. Bekor qilishda kod bo'shaydi.
13. **Vaqt** — `setQueueTime` / `waitMin` / `markTimer` / `pickTimer`; kechikish — `orderLate` (orderLateDays = 2 kun).
14. **Kassa** — `mopNeedsApproval` (KO chiqim > 2 000 000); kassir faqat o'z kassasida (`empCash`, `tillAccts`); kunni yopish farqi → tuzatuvchi KO «Boshqa» / «Boshqa kirim».
15. **Haydovchi puli** — `drvCash`, `cashAccept` → MT. Online → Terminal hisobi.
16. **Muddat** — expiryWarnDays = 90, muddati o'tgan partiya sotilmaydi (`fefoPick` days ≥ 0).
17. **Sof savdo** — `rptFacts`: sotuv − yetkazilmagan (SV sanasida) − QM (o'z sanasida). Bosh sahifa, Operatorlar va Savdo hisoboti shu manbadan.
18. **Tannarx** — `costBasis` / `batchCost` / `avgCost` / `lastCost`; yalpi foyda — `grossProfit`.
19. **PIN imzo** — `pinCheck` / `pinSign` (pinTries 5, pinLockMin 15).
20. **Sessiya** — sessionMin 30; parol pwMin 8.

## 7. Rollar va ruxsatlar (11)

11 rol: director, admin, branch, operator, purchase, keeper, cashier, accountant, marker, picker, driver. `scope`: director va admin — all, qolganlari — own (o'z filiali).

### Menyu sahifalari (`menuCan` / `navCan`, T12a)

✓ — menyuda va ochiladi; (p) — menyuda yo'q, panel ichidan ochiladi (yig'uvchi, markirovkachi); bo'sh — ochilmaydi (URL orqali ham).

| Sahifa | director | admin | branch | operator | purchase | keeper | cashier | accountant | marker | picker | driver |
|---|---|---|---|---|---|---|---|---|---|---|---|
| home | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| orders | ✓ | ✓ | ✓ | ✓ |  | ✓ |  |  | (p) | (p) |  |
| approvals | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| shipments | ✓ | ✓ | ✓ | ✓ |  | ✓ |  |  |  |  |  |
| receipt | ✓ | ✓ | ✓ |  | ✓ | ✓ |  | ✓ |  |  |  |
| stock | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |
| expiry | ✓ | ✓ | ✓ |  | ✓ | ✓ |  |  |  |  |  |
| transfer | ✓ | ✓ | ✓ |  | ✓ | ✓ |  | ✓ |  |  |  |
| inventory | ✓ | ✓ | ✓ |  |  | ✓ |  | ✓ |  |  |  |
| creturns | ✓ | ✓ | ✓ | ✓ |  | ✓ |  |  |  |  |  |
| opening | ✓ | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| payments | ✓ | ✓ | ✓ |  |  |  | ✓ | ✓ |  |  |  |
| cash | ✓ | ✓ | ✓ |  |  |  | ✓ | ✓ |  |  |  |
| bank | ✓ | ✓ | ✓ |  |  |  | ✓ | ✓ |  |  |  |
| cdebt | ✓ | ✓ | ✓ |  |  |  | ✓ | ✓ |  |  |  |
| sdebt | ✓ | ✓ | ✓ |  | ✓ |  |  | ✓ |  |  |  |
| recon | ✓ | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| products | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  |  |  |
| clients | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |
| suppliers | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |
| prices | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |
| lookups | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |
| reports | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |  |  |  |
| company | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| branches | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| warehouses | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| staff | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| roles | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| audit | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| settings | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| delivery | ✓ | ✓ | ✓ | ✓ |  | ✓ |  |  |  |  |  |
| interbranch | ✓ | ✓ | ✓ | ✓ |  | ✓ |  |  | (p) | (p) |  |
| writeoff | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| sreturns | ✓ | ✓ | ✓ |  | ✓ | ✓ |  |  |  |  |  |
| pickrep | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| marking |  |  |  |  |  |  |  |  | (p) |  |  |
| markrep | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |

### Ruxsat kalitlari (`store.rl.perms`, 132 kalit, T12a)

| Kalit | director | admin | branch | operator | purchase | keeper | cashier | accountant | marker | picker | driver |
|---|---|---|---|---|---|---|---|---|---|---|---|
| adv.cancel | ✓ | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| adv.cancelAuto | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| adv.create | ✓ | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| approvals.branch | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| approvals.director | ✓ |  |  |  |  |  |  |  |  |  |  |
| approvals.view | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| audit.view | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| bank.view | ✓ | ✓ | ✓ |  |  |  | ✓ | ✓ |  |  |  |
| branches.view | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| cash.approve | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| cash.cancel | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| cash.close | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |  |
| cash.closeDiff | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| cash.create | ✓ | ✓ | ✓ |  |  |  | ✓ |  |  |  |  |
| cash.io | ✓ | ✓ | ✓ |  |  |  | ✓ | ✓ |  |  |  |
| cash.view | ✓ | ✓ | ✓ |  |  |  | ✓ | ✓ |  |  |  |
| cdebt.view | ✓ | ✓ | ✓ |  |  |  | ✓ | ✓ |  |  |  |
| clients.all | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| clients.bank | ✓ | ✓ |  |  |  |  |  | ✓ |  |  |  |
| clients.block | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| clients.contact | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| clients.create | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| clients.lic | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| clients.terms | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| clients.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |
| company.edit | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| company.view | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| expiry.view | ✓ | ✓ | ✓ |  | ✓ | ✓ |  |  |  |  |  |
| hc.approve | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| hc.create | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| hc.director | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| hc.view | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| inventory.approve | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| inventory.count | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| inventory.create | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| inventory.director | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| inventory.openCount | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| inventory.view | ✓ | ✓ | ✓ |  |  | ✓ |  | ✓ |  |  |  |
| lookups.cats | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |  |
| lookups.fleet | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| lookups.items | ✓ | ✓ |  |  |  |  |  | ✓ |  |  |  |
| lookups.makers | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |  |
| lookups.ptypes | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| lookups.regions | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| lookups.units | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| lookups.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |
| marking.export |  |  |  |  |  |  |  |  | ✓ |  |  |
| marking.scan |  |  |  |  |  |  |  |  | ✓ |  |  |
| marking.view |  |  |  |  |  |  |  |  | ✓ |  |  |
| opening.approve | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| opening.cancel | ✓ |  |  |  |  |  |  |  |  |  |  |
| opening.create | ✓ | ✓ |  |  |  |  |  | ✓ |  |  |  |
| opening.goods | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| opening.list | ✓ | ✓ |  |  |  |  |  | ✓ |  |  |  |
| opening.view | ✓ | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| orders.cancel | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| orders.cancelPick | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| orders.check | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| orders.create | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| orders.docs | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| orders.manage | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| orders.price | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| orders.queue | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| orders.view | ✓ | ✓ | ✓ | ✓ |  | ✓ |  |  | ✓ | ✓ |  |
| payments.cancel | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| payments.create | ✓ | ✓ |  |  |  |  | ✓ | ✓ |  |  |  |
| payments.mt | ✓ | ✓ |  |  |  |  | ✓ | ✓ |  |  |  |
| payments.noncash | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  |  |  |
| payments.view | ✓ | ✓ | ✓ |  |  |  | ✓ | ✓ |  |  |  |
| payments.yt | ✓ | ✓ |  |  |  |  | ✓ | ✓ |  |  |  |
| payments.ytApprove | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| payments.ytDirect | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| picking.do | ✓ |  |  |  |  |  |  |  |  | ✓ |  |
| prices.all | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| prices.approve | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| prices.below | ✓ |  |  |  |  |  |  |  |  |  |  |
| prices.cost | ✓ | ✓ | ✓ |  | ✓ |  |  | ✓ |  |  |  |
| prices.create | ✓ | ✓ | ✓ |  | ✓ |  |  |  |  |  |  |
| prices.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |
| products.create | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |  |
| products.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  |  |  |
| qm.approve | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| qm.create | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |
| qm.view | ✓ | ✓ | ✓ | ✓ |  | ✓ |  |  |  |  |  |
| qy.approve | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| qy.create | ✓ | ✓ | ✓ |  | ✓ | ✓ |  |  |  |  |  |
| qy.view | ✓ | ✓ | ✓ |  | ✓ | ✓ |  |  |  |  |  |
| receipt.accept | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| receipt.cancel | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| receipt.cancelPosted | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| receipt.create | ✓ | ✓ | ✓ |  | ✓ | ✓ |  |  |  |  |  |
| receipt.post | ✓ | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| receipt.view | ✓ | ✓ | ✓ |  | ✓ | ✓ |  | ✓ |  |  |  |
| recon.create | ✓ | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| recon.view | ✓ | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| reports.all | ✓ | ✓ |  |  |  |  |  | ✓ |  |  |  |
| reports.markers | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| reports.own | ✓ |  |  | ✓ |  |  |  |  |  |  |  |
| reports.pickers | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| reports.view | ✓ | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| roles.view | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| sdebt.view | ✓ | ✓ | ✓ |  | ✓ |  |  | ✓ |  |  |  |
| settings.view | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| shipments.ship | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| shipments.trip | ✓ | ✓ | ✓ | ✓ |  | ✓ |  |  |  |  |  |
| shipments.view | ✓ | ✓ | ✓ | ✓ |  | ✓ |  |  |  |  |  |
| special.cost | ✓ | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |
| special.ctrl | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| special.till |  |  |  |  |  |  | ✓ |  |  |  |  |
| special.whs |  |  |  |  |  | ✓ |  |  |  |  |  |
| staff.edit | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| staff.view | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| stock.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |
| supplierBonus.confirm | ✓ | ✓ |  |  |  |  |  | ✓ |  |  |  |
| supplierBonus.notify | ✓ | ✓ |  |  |  |  |  | ✓ |  |  |  |
| supplierPay.notify | ✓ | ✓ |  |  |  |  |  | ✓ |  |  |  |
| suppliers.block | ✓ | ✓ | ✓ |  | ✓ |  |  |  |  |  |  |
| suppliers.contact | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |  |
| suppliers.create | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |  |
| suppliers.terms | ✓ | ✓ | ✓ |  | ✓ |  |  |  |  |  |  |
| suppliers.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |
| transfer.cancel | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| transfer.fs | ✓ | ✓ | ✓ |  | ✓ |  |  |  |  |  |  |
| transfer.ok | ✓ | ✓ | ✓ |  | ✓ | ✓ |  |  |  |  |  |
| transfer.quar | ✓ | ✓ | ✓ |  |  |  |  |  |  |  |  |
| transfer.receive | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| transfer.resolve | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| transfer.send | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| transfer.view | ✓ | ✓ | ✓ |  | ✓ | ✓ |  | ✓ |  |  |  |
| transfer.zk | ✓ | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |
| trip.driver | ✓ |  |  |  |  |  |  |  |  |  | ✓ |
| warehouses.view | ✓ | ✓ |  |  |  |  |  |  |  |  |  |

## 8. Raqamlash (12)

- **Format:** `PREFIKS-FILIAL-NNNNNN` (6 xona, `pad6`). Hisoblagich prefiks va filial bo'yicha alohida (`nextDocNo`, `nextPayNo`, `nextMopNo`, `nextTripNo` …).
- **Prefikslar va seed dagi oxirgi raqamlar:**
  - AS-TSH-000002 (2), BO-TSH-000002 (3), BQ-TSH-000005 (17), BY-TSH-000356 (52), FS-SMQ-000001 (1);
  - HC-TSH-000007 (5), IN-TSH-000001 (1), IO-TSH-000004 (4), KO-TSH-000006 (9), KR-TSH-000129 (18);
  - MT-TSH-000016 (24), NO-TSH-000013 (22), OK-TSH-000001 (1), QM-TSH-000012 (7), QY-TSH-000004 (4);
  - RS-TSH-000048 (7), SV-TSH-000218 (21), YT-TSH-000006 (9).
- **Seed da yo'q, kodda bor:** ZK (ko'chirish turi), AV (avans), BNS (bonus), HF (faktura, `nextHfNo`), nakladnoy (`nextNak`).
- **HF (hisob-faktura):** `HF-<filial>-NNNNNN`.
  - Sotuvda (`mkSale`) HF raqami SV raqami bilan bir xil tartib raqamni oladi: SV-TSH-000218 → HF-TSH-000218, hisoblagich `store.saleSeq[filial]`.
  - Beriladi: buyurtma hujjatlashtirilganda (docs) va jo'natilganda (`doShip`).
  - Filiallararo sotuvda (ko'chirish FS) alohida hisoblagich bor: `nextHfNo`, FS saqlanganda.
- **Nakladnoy:** `NK-<filial>-NNNNNN` (`nextNak`, hisoblagich `store.nakSeq`), hujjatlashtirishda beriladi.

## 9. Seed (13)

- **Hajm:**
  - 4 filial, 10 ombor, 40 mahsulot, 26 kontragent, 8 narx turi, 561 narx yozuvi, 22 NO;
  - 52 buyurtma, 18 kirim, 21 sotuv, 52 ochilish qarzi, 33 to'lov, 16 KO / BO / IO, 5 kunni yopish;
  - 7 reys, 2 ko'chirish, 1 inventarizatsiya, 17 BQ, 7 QM, 5 HC, 4 QY, 1 BNS, 2 AS, 32 xodim.
- **Asosiy raqamlar (T11a / T11b):**
  - mijozlar qarzi 465 077 280, shundan muddati o'tgan 19 806 000;
  - Savdo kartasi: oy 106 335 530, bugun 82 824 610.
- **Real importda nimaga almashadi:**
  - mahsulotlar, kontragentlar, narxlar, qoldiqlar va qarzlar — BQ import (ImportWizard: goods / prices / debt …, `bqAutoMap`);
  - xodimlar — AdminStaff;
  - tarixiy buyurtmalar, sotuvlar va to'lovlar — import qilinmaydi (aniqlanmagan);
  - seed generatorlari (`seed*`, `mulberry`, `genCode`) olib tashlanadi.

## 10. Soxta yoki vaqtincha narsalar (14)

| Narsa | Joyi | Haqiqiy dasturda |
|---|---|---|
| Demo soat (`clkAdd`, `NOW`) | Panellar, `demoUi()` | Server vaqti |
| Demo skaner / «Test» tugmasi | TabletShell, ScanPanel | Haqiqiy skaner (HID / kamera) |
| «Namuna rasm» | DriverPanel | Kamera yoki fayl yuklash |
| Namunaviy import fayli (`bqSample`, `prodSampleRows`) | ImportWizard | Shablon yuklab olish |
| PIN maslahati | PinSetup | Olib tashlanadi |
| Demo holatlar menyusi (`demo*`) va rol almashtirish | Medix ERP | Olib tashlanadi; rol — login orqali |
| `resetStore`, `bqDemoClear`, `demoSale` | Ma'lumot qatlami | Olib tashlanadi |
| Login (har parol yoki demo foydalanuvchi) | Medix ERP `USERS` | Haqiqiy autentifikatsiya, sessiya |
| Ma'lumot xotirada + brauzer xotirasi | `store`, localStorage | Server API + ma'lumotlar bazasi |
| Eksport toast (Kirim) | Receipts | Haqiqiy xlsx |
| Bank MFO, rekvizitlar (`bankMfo`, `BR_INFO`) | Seed | Ma'lumotnomadan |
| `BANK_TSH1` va boshlang'ich qoldiqlar | Seed | BQ (pul) |
| Chop etish (`printData`, `code128`) | PrintPreview | Server PDF yoki brauzer chop etishi (aniqlanmagan) |
| Lucide CDN (unpkg) | helmet | Mahalliy paket |

Demo rejimi o'chirgichi: `store.demoUi` (T11a).

## 11. Qilinmagan yoki keyinga qoldirilganlar (15)

- **Akt sverka:** sahifa va AS hujjati bor; to'liq jarayon V1 dan keyin.
- **Integratsiyalar (V3):** soliq (HF), markirovka milliy tizimi, bank ko'chirmasi, 1C — prototipda yo'q.
- **Kirill va rus tarjimasi (V2):** 5 385 kalit.
- **Server:** API, sessiya, ko'p foydalanuvchi bilan bir vaqtda ishlash, qulflar (`store.locks` — faqat demo).
- **Yashirin sahifalar:** `delivery`, `interbranch` — tarkibi aniqlanmagan.
- **Kirim eksporti, bildirishnomalarni yuborish (push / SMS):** yo'q.

## 13. V1 da tuzatiladi (audit dagi O'rta va Kichik kamchiliklar)

Loyiha egasi qarori: quyidagilar prototipda o'zgartirilmaydi, haqiqiy dasturda (V1) tuzatiladi. Raqamlar — notes/T12-audit.md, 5-bo'lim.

- **O'rta**
  - №4 Kirim «…» Eksport fayl bermaydi → xlsx eksport (`xlsxBlob`).
  - №5 Ctrl+K RS, BNS va xodimlarni topmaydi → qidiruv indeksiga qo'shish.
  - №11 Buyurtmalarda 1280–1399 px da «To'lov turi» yashirinadi → «Yetkazish» o'rniga qoldirish yoki «Summa» ostida ikkinchi qator.
  - №12 Pul formatlovchilari 2 xil, ~30 nusxa; Haydovchida tiyinsiz; 3 faylda manfiy belgi yo'q → bitta `formatMoney`.
  - №13 Token yo'q, ~25 hex palitradan tashqari → CSS o'zgaruvchilar.
  - №17 Home, Kassir paneli va Hisobotlar o'z gridini chizadi → DataTable (Ustunlar, saralash, sahifalash).
  - №19 Faqat ikonkali tugmalarda aria-label to'liq emas → lint qoidasi.
  - №23 Qotib qolish nuqtalari (reys retwait, ko'chirish transit, inventarizatsiya qulfi) → muddatli eslatma va mas'ul.
  - №26 Tezlik: `cmdData` va bosh sahifa hisoblari har renderda → server indeksi, kesh.
- **Kichik**
  - №9 Kassirda Narxlar sahifasi → olib tashlash yoki faqat ko'rish.
  - №10 Direktor menyusida «Markirovka» jurnali yo'q → ochish.
  - №14 Masofalar 4 ga karrali emas → 4 / 8 / 12 / 16 shkala.
  - №15 17 xil shrift o'lchami → 6–7 pog'ona.
  - №16 12 radius, 55 soya → 3 radius, 4 soya tokeni.
  - №18 Haydovchi panelida 3 tugma < 48 px → ≥ 48 px.
  - №20 Shaxsiy bildirishnomalar va `apprReasonsOf` qattiq o'zbekcha matn → kalit + o'rinbosar.
  - №21 5 385 kalit faqat lotinda → V2 tarjima.
  - №24 Bosh sahifa 1024 px da qarzlar jadvali 5 px aylanadi.
  - №25 `ORDER_STATUS.ready` ishlatilmaydi → olib tashlash.
- **T12a da tuzatildi (V1 ro'yxatidan chiqdi):** №22 (qoralamaga qaytarish), №3 (kontrast), №6 (panel rollari menyusi), №7 (Xarid — YB qarzi), №8 (Operator — o'z savdosi).
- **O'zgartirilmaydi (qaror):** №1 Admin — Direktor kabi barcha sahifalar; №2 xotira — haqiqiy dasturda ma'lumotlar bazasi.

## 14. T12a o'zgarishlari

1. **Qoralamaga qaytarish (№22).**
   - Faqat «Tasdiqlashda» (pending) holatidan, tasdiqlovchi (`approvals.branch` yoki tegishli daraja), sabab majburiy.
   - Ma'lumot qatlami: `orderAct(id, 'return', who, {note})` boshqa holatda, sababsiz yoki tasdiqlash ruxsati bo'lmagan xodimda `null` qaytaradi, buyurtma o'zgarmaydi.
   - UI: OrderCard «Navbatda» holatidagi «Qaytarish» tugmasi olib tashlandi; DecisionDialog da sabab doim majburiy, rad etilsa oyna yopiladi.
   - Navbatda va keyingi holatlarda faqat bekor qilish (sabab, `orders.cancel` / `orders.manage`) yoki «Yig'ishga qaytarish» (`checkReturn`, hisobdan o'tkazishda).
2. **Kontrast (№3).**
   - #8A9B9A va #94A3A1 → #647574 (oqda 4.84:1, #F5F7F8 da 4.50:1), barcha fayllarda.
   - Matn rangi #0D9488 → #0F766E (5.47:1).
   - Havola: a #0F766E, a:hover #115E59.
   - Fon va chegara sifatidagi #0D9488 (tugma, fokus halqasi) o'zgarmadi.
3. **Ruxsatlar.**
   - Xarid: `sdebt.view` qo'shildi (faqat ko'rish; to'lov, avans va bonus kalitlari yo'q — to'lov tugmasi «ruxsat yo'q» xabarini beradi).
   - Operator: yangi `reports.own` kaliti. Hisobotlar menyusi ochiladi, katalogda faqat «Savdo» bor. Faktlar `op === userName` bo'yicha filtrlanadi, boshqa hisobotlar (op, fs, sg, sc, gp) ochilmaydi. Tannarx va yalpi foyda ko'rinmaydi (`special.cost` yo'q).
   - Yig'uvchi va Markirovkachi: yangi `menuCan(role, page)` (`PANEL_ONLY`) — menyuda faqat Panel. `navCan` o'zgarmadi: panel ichidan buyurtma kartochkasi (`#orders?open=`) ochilishda davom etadi.
4. **URL orqali ruxsatsiz sahifa (yangi Jiddiy topilma).** `onHash` endi `allowed()` ni tekshiradi: ruxsatsiz sahifa manzili ochilmaydi, «ruxsat yo'q» xabari chiqadi, manzil joriy sahifaga qaytadi.
5. Matritsa (7-bo'lim) yangilandi: 132 kalit (yangi — `reports.own`), menyu ustunida `(p)` belgisi.
6. Tekshiruv: 11 rol × menyudagi barcha sahifalar (jami 137 ochilish) — konsol xatosi 0, NaN 0. Ruxsatsiz manzil 15 holatda sinaldi — hammasida ochilmadi.

## 12. I18N tizimi

- **Tuzilma.** `I18N` obyekti: `kalit → [uz, cy, ru]`.
  - Guruhlar alohida konstantalarda yoziladi (KBSTR, NQSTR, BHSTR, BSSTR, RLSTR, OESTR, Y2STR …) va prefiks bilan qo'shiladi (`kb_`, `nq_`, `bh_`, `bs_`, `rl_`, `oe_` …).
  - `Object.entries(XSTR).forEach(([k, v]) => I18N[pfx + k] = [v])` — faqat lotin.
- **Til tanlash.** `pickL(lang)` → `v[LI[lang]] ?? v[0]` (tarjima yo'q bo'lsa lotin).
- **Uzatish.** `L` obyekti sahifalarga `dict` prop orqali beriladi; komponentlar `L.kalit` ishlatadi.
- **O'rinbosarlar.** `{n}`, `{who}`, `{d}` — `fill(t, o)`.
- **Funksiyali kalitlar.** Ba'zi kalitlar funksiya (LT.wrong(n), L.cmdCount(n)).
- **Login sahifasi** alohida `LT` obyektida, 3 tilda to'liq.
- **Komponentlarning ichki matnlari** (masalan CashierPanel `T`), bildirishnomalar va `apprReasonsOf` — I18N dan tashqarida.
- **Hajm.** Jami 6 255 kalit, 870 tasi 3 tilda, 5 385 tasi faqat lotinda.
- **Haqiqiy dasturga taklif:** JSON resurs fayllari (uz-Latn, uz-Cyrl, ru), kalit tekshiruvi CI da, ICU formatlash.
