Jadval — tizimning eng muhim komponenti: minglab qatorli roʻyxatlarni (mahsulotlar, partiyalar, hujjatlar) koʻrish, saralash, tanlash va ochish uchun.

**Tuzilishi (yuqoridan pastga)**
1. **Asboblar paneli** — qidiruv (32px, `search`), «Filtr» tugmasi (faol filtrlar soni bilan), oʻngda «Ustunlar» va «Excel».
2. **Faol filtrlar** — chip koʻrinishida («Ombor: Markaziy ombor ×»), oxirida «Filtrlarni tozalash».
3. **Ommaviy tanlash paneli** — kamida bitta qator tanlanganda asboblar paneli oʻrnida: `primary-soft` fon, «3 ta tanlandi», harakatlar, oʻngda «Tanlovni bekor qilish».
4. **Sarlavha** — `table-header` fon, `caption-medium`, `text-secondary`, saralash ikonkasi (`chevrons-up-down`; saralanganda `arrow-up`/`arrow-down` `primary` rangida). Aylantirganda yopishib turadi (`position: sticky`).
5. **Qatorlar** — `table` uslubi (13/18). Standart 40px, ixcham 36px. Hover `table-header`, tanlangan `primary-soft`. Qatorni bosish yozuvni ochadi (odatda yon panelda).
6. **Jami qatori** — `table-header` fon, `600`, faqat raqamli ustunlar uchun.
7. **Sahifalash** — `Pagination`.

**Ustun qoidalari**
- Raqam va summa ustunlari oʻngga tekislanadi, `tabular-nums`. Summa: `1.250.000,50` (minglar nuqta, tiyin vergul, doim 2 xona). Miqdor: `1.240`.
- Partiya, hujjat raqami, zona, shtrix-kod: `mono` (13px).
- Ikki qatorli katak: asosiy qiymat + `caption` `text-secondary` (masalan, mahsulot nomi + ishlab chiqaruvchi).
- Sana: `04.10.2026`. Muddati yaqin sana — `warning`, oʻtgan — `danger` matn; holat doim `Badge` bilan ham koʻrsatiladi.
- Birinchi ustun — checkbox (44px); sarlavhadagi checkbox «qisman» holatga ega. Oxirgi ustun — `…` menyusi (faqat-ikonka tugma, tooltip bilan).
- Matn kesilmaydi (`nowrap`); joy yetmasa jadval gorizontal aylanadi, birinchi ustunlar joyida qoladi.

**Klaviatura:** Tab jadvalga kiradi, ↑↓ qatorlar, Enter ochadi, Space tanlaydi.

**Holatlar:** yuklanish (skelet qatorlar), boʻsh, qidiruv natija bermadi, xato, ruxsat yoʻq — `SystemStates` sahifasiga qarang.

**Isteʼmolchi beradi:** `columns` (`{key, title, align, width, sortable, render}`), `rows`, `rowKey`, `density` (`standard` | `compact`), `selectable`, `selectedKeys`, `onSelectionChange`, `bulkActions`, `sort`, `onSortChange`, `onRowClick`, `rowActions`, `totals`, `loading`, `emptyState`, `pagination`. Minglab qatorlar uchun virtualizatsiya (masalan, TanStack Virtual) tavsiya etiladi.
