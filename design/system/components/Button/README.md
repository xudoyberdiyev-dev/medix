Tugma bitta harakatni boshlaydi va doim fe'l bilan nomlanadi: «Saqlash», «Kirimni tasdiqlash», «Kirim yaratish».

**Variantlar**
- `primary` — ekrandagi yagona asosiy harakat. Fon `primary-button`, matn oq; hover/bosilgan `primary-button-hover`. Bir ekranda bittadan ortiq boʻlmaydi.
- `secondary` — oq fon, 1px `border`. Qolgan barcha harakatlar (Excel, Filtr, Ortga).
- `tertiary` — faqat matn (`primary-button` rangida). Kam ahamiyatli harakatlar: «Filtrlarni tozalash», «Barchasini koʻrish».
- `danger` — fon `danger`, matn oq. Faqat qaytarib boʻlmaydigan harakatni tasdiqlash oynasi ichida: «Hujjatni bekor qilish», «Oʻchirish».
- `icon` — faqat ikonka. **Faqat jadval qatorlarida** (… menyusi, tahrirlash) va doim `title`/tooltip + `aria-label` bilan.

**Oʻlchamlar:** `sm` 32px (jadval ichida, filtr panelida), `md` 36px (standart), `lg` 44px (login, sozlash ustasi).

**Holatlar:** oddiy, hover, fokus (2px `primary` halqa, 2px oraliq), bosilgan, oʻchirilgan (`background` fon, `text-disabled` matn), yuklanmoqda (matn oʻrnida spinner, kenglik oʻzgarmaydi, `aria-busy="true"`).

**Qoidalar**
- Ikonka (Lucide, 16px) matndan oldin; ikonka ixtiyoriy, matn majburiy.
- Tugmalar guruhi: asosiy tugma oʻngda oxirgi; ikkinchi darajalilar undan chapda.
- Tugma matni hech qachon qisqartirilmaydi (`…`) — rus/kirill matnda tugma kengayadi.
- Yuklanish vaqtida tugma `disabled` emas, balki `aria-busy`; ikki marta bosish bloklanadi.

**Isteʼmolchi beradi:** `variant`, `size`, `icon` (Lucide nomi), `loading`, `disabled`, `children` (matn), `onClick`. Faqat-ikonka uchun `aria-label` majburiy.
