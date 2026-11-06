Tanlash roʻyxati maʼlum variantlardan birini (yoki bir nechtasini) tanlash uchun.

**Variantlar**
- **Oddiy** — 10 tagacha variant (ombor, birlik, toʻlov turi). Tanlangan element `primary-soft` fonda va oʻngda `check` ikonkasi.
- **Qidiruvli** — mahsulot, mijoz, yetkazib beruvchi kabi uzun roʻyxatlar. Menyu tepasida qidiruv maydoni; har bir variantda ikki qator: nom (`body`) va ikkinchi qator (`caption`, `text-secondary` — ishlab chiqaruvchi, STIR, manzil); oʻngda qisqa maʼlumot (qoldiq). Mos kelgan qism qalin (`600`). Qoldiq kam yoki 0 boʻlsa — `warning` rangida.
- **Koʻp tanlovli** — har bir variant oldida checkbox; tanlanganlar maydon ichida chip koʻrinishida, har birida «x».

**Klaviatura:** Enter/Space ochadi, ↑↓ harakatlanadi, Enter tanlaydi, Esc yopadi; qidiruvli variantda yozish darhol filtrlaydi. Faol variant `table-header` fon + `border` chiziq bilan.

**Holatlar:** oddiy, hover, fokus, xato, oʻchirilgan — xuddi `TextField` kabi. Menyu: `surface`, 1px `border`, `radius-card`, `shadow-overlay`.

**Isteʼmolchi beradi:** `options` (`{value, label, sub?, meta?, disabled?}`), `value`, `onChange`, `searchable`, `multiple`, `placeholder`, `label`, `error`, `loadOptions` (serverdan qidirish uchun).
