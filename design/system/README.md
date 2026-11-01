# Medix dizayn tizimi (Claude Design'dan nusxa)

Manba: Claude Design → «Medix» dizayn tizimi (artifact slug `0d2b9f01-6b42-4ace-b640-776421274a90`).
Tokenlar: `tokens.json`. Komponentlar API: `components.d.ts`. Har komponentning batafsil qoidalari: `components/<Nomi>/README.md`, asl uslublar: `components/bundle.css` (01.11.2026 nusxasi). React komponentlari: `frontend/components/ui/`, koʻrgazma: `MEDIX_UI_KIT=1 pnpm build && pnpm start` → `/ui-kit`.

Uslub: Linear, Stripe Dashboard, Dynamics 365 kabi toza va jiddiy — **qimmat koʻrinish intizomdan keladi, bezakdan emas**.

## Tamoyillar
1. **Intizom, bezak emas.** Gradient, neon, katta soya, dekorativ illyustratsiya, keraksiz animatsiya yoʻq. Har oʻlcham — token.
2. **Tushunarlilik birinchi.** Har tugma nima qilishini soʻz bilan aytadi. Faqat-ikonka tugma — faqat jadval qatorida, doim tooltip bilan.
3. **Bitta ekran — bitta asosiy harakat.** Bitta `primary` tugma, qolganlari `secondary`/`tertiary`.
4. **Holat hech qachon faqat rang bilan emas** — doim ikonka + soʻz + rang.
5. **Ikki zichlik.** Login, sozlash, formalar — keng (`control-lg` 44px). Kundalik ish ekranlari — ixcham (`control-sm` 32px, `row-md` 40px / `row-sm` 36px).
6. **Klaviatura bilan ishlash.** Koʻrinadigan fokus halqasi, mantiqiy Tab tartibi, jadvalda strelkalar.
7. **Xavfli harakatlar alohida** — tasdiqlash oynasi, oqibati raqamlar bilan.
8. **Yolgʻon maʼlumot yoʻq.** Toʻqilgan «oʻsish» grafiklari yoʻq.

## Matn va til
- Tillar: oʻzbek (lotin) — asosiy; kirill va rus (V2). Ruscha matn 20–30% uzunroq: matn uchun qatʼiy kenglik yoʻq.
- Tugmalar feʼl bilan: «Saqlash», «Kirimni tasdiqlash». «OK», «Yuborish» emas.
- Murojaat «siz», keraksiz «iltimos» va undovsiz.
- Xato = nima boʻldi + nima qilish kerak. Texnik kodlar koʻrsatilmaydi.
- Sarlavhalarda faqat birinchi harf katta. BUTUN KATTA HARF faqat qisqartmalar (STIR, MChJ).
- Atamalar bir xil: «Partiya», «Kirim», «Qoldiq», «Band qilingan», «Yaroqlilik muddati», «Filial», «Ombor», «Mijoz», «Yetkazib beruvchi».
- Imlo: `ʻ` (U+02BB) va `ʼ` (U+02BC). Oddiy `'` ishlatilmaydi.
- Xavfli oynada bekor tugmasi «Ortga».

## Raqamlar, pul, sana
- Pul: `1.250.000,50 soʻm` — minglar nuqta, tiyin vergul, doim tiyini bilan.
- Miqdor: `1.240 dona`. Sahifalash: `1–50 / 1.240`.
- Sana `04.10.2026`, vaqt `16:40`.
- `tabular-nums`, raqamli ustunlar oʻngga.
- Hujjat raqami, partiya, shtrix-kod, zona, STIR — mono (JetBrains Mono 13px).

## Rang
- Palitra tasdiqlangan — boshqa rang qoʻshilmaydi; kodda doim token nomi, HEX emas.
- Sahifa `background`; kartalar/jadvallar/oynalar `surface` + 1px `border`.
- Asosiy tugma: `primary-button` fon, oq matn; hover `primary-button-hover`. **`primary` tugma foni boʻlmaydi.**
- `primary` — faol ikonka, tab chizigʻi, progress, fokus halqasi. Havola matni `primary-button`.
- Tanlangan qator — `primary-soft`; hover va jadval sarlavhasi — `table-header`.
- Sidebar `brand-900`; yozuvlar `sidebar-text`; faol: oq matn, `sidebar-item-active-bg`, chapda 3px `sidebar-active`.
- Holat ranglari juft: fon `*-bg` → matn shu rang.

## Oʻlcham va tartib
- Masofa 4px ga karrali. Sidebar 240/64px, topbar 56px, sahifa cheti 24px (planshet 16px), kartalar orasi 16px.
- Tugma/maydon: 36 (standart), 32 (jadval), 44 (login, usta). Jadval qatori 40/36.
- Radius: 6 (tugma, maydon), 8 (karta, jadval), 12 (oyna); 4 faqat checkbox; full faqat avatar/radio/switch/qadam.
- Soya faqat oyna, menyu, yon panel, bildirishnomada. Kartalarda soya yoʻq.
- Fokus: `outline: 2px solid var(--primary); outline-offset: 2px`, faqat `:focus-visible`.
- Animatsiya faqat holat oʻzgarishida, 150ms ease-out; `prefers-reduced-motion`.

## Ikonkalar
Faqat Lucide, `stroke-width: 1.5`, `currentColor`. 16px (jadval, tugma, badge), 20px (menyu). Qoldiqlar `boxes`, Kirim `package-plus`, Koʻchirish `arrow-left-right`, Filial `building-2`, Ombor `warehouse`, Excel `file-spreadsheet`, qator menyusi `ellipsis`.

## Logotip
Hali yoʻq. Sidebarda `primary-button` kvadratda «M» + «MEDIX» (Inter 600).

## Komponentlar roʻyxati
Button, TextField, Select, DatePicker, SelectionControls, Badge, **Table** (eng muhim), Card, Tabs, Modal, Drawer, Toast, Alert, Stepper, Sidebar, TopBar, BranchSwitcher, Pagination, Avatar, Tooltip, SystemStates (yuklanish, boʻsh, xato, ruxsat yoʻq), LengthTest.
