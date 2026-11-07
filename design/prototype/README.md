# Egasining Claude Design prototipi — UI uchun ASOSIY manba (07.11.2026)

**Talab: haqiqiy dastur UI'si shu prototip bilan AYNAN bir xil bo'lishi shart** (joylashuv, bloklar, kartalar, jadval ustunlari, yorliqlar, tugmalar, matnlar). Dizayn tizimi (`design/system/`) — faqat token manbai.

## Tarkib
- `Medix ERP.dc.html` — kirish nuqtasi (login → rolga qarab ekranlar; demo ma'lumot `medix-data.js`).
- `<Ekran>.dc.html` — har bir ekran/komponent manbasi (React + JSX, Babel standalone): Home, Orders, OrderEntry, OrderCard, Receipts, Stock, Products, Prices, Customers, Suppliers, Counterparties, Payments, Cash, CashClose, Bank, Receivables, Payables, Reconciliation, Reports, Settings, Admin*, WarehousePanel, PickerPanel, MarkerPanel, DriverPanel, CashierPanel, SupervisorPanel, Shipping, TripPage, Transfers, Inventory*, OpeningBalances, SetupWizard … va umumiy komponentlar (DataTable, FilterBar, PageHeader, StatusStepper, DocumentHeader …).
- `screenshots/` — egasi tasdiqlagan holatlar (t10b-*, y2-*): Direktor bosh sahifasi, hisobotlar, rollar va b.
- `vendor/` — React 18.3.1, ReactDOM, Babel standalone, Lucide (CDN o'rniga, tarmoqsiz ochish uchun).
- `notes/` (`design/notes`, `docs/notes`) — T12-topshirish, T12-audit.

## Ekranni ko'rish (tarmoqsiz)
```bash
NODE_PATH=$(npm root -g) node scripts/prototype-shot.cjs "Medix ERP" /tmp/p.png 1440x900 4000
```
Login va rol tanlash uchun skriptni nusxalab Playwright'da bosish qo'shing (prototipda demo foydalanuvchilar `medix-data.js` da).

## Ish tartibi (har ekran uchun)
1. Prototip ekranining manbasini (`<Ekran>.dc.html`) va skrinshotini o'rganing.
2. Haqiqiy sahifani shunga AYNAN moslang (komponent tuzilmasi, tartib, matnlar uch tilda).
3. **Prototipda bor, backendda yo'q** narsa bo'lsa — backend (migratsiya + API + test) majburiy yaratiladi.
4. Ikkala skrinshotni yonma-yon solishtiring; farq qolmaguncha davom eting.
5. PLAN.md → «UI moslash» ro'yxatida ekranni belgilang.
