Oyna (modal) foydalanuvchini toʻxtatib, bitta qisqa vazifa yoki qarorni soʻraydi.

**Variantlar**
- **Oddiy** — qisqa forma (yangi ombor, tez tahrir). Uzun formalar alohida sahifada yoki yon panelda.
- **Tasdiqlash** — harakatdan oldingi savol: sarlavha savol shaklida («Kirimni tasdiqlaysizmi?»), matnda nima oʻzgarishi aniq yoziladi.
- **Xavfli tasdiqlash** — bekor qilish, oʻchirish, qaytarib boʻlmaydigan amallar: `danger-bg` doirada `triangle-alert`, «Bu amalni qaytarib boʻlmaydi», oqibatlar roʻyxati (raqamlar bilan), kerak boʻlsa sabab maydoni. Asosiy tugma `danger` va harakatni toʻliq nomlaydi: «Hujjatni bekor qilish».

**Oʻlchamlar:** 480px (`modal-sm`, tasdiqlash), 640px (`modal-md`, forma), 880px (`modal-lg`, jadvalli).

**Tuzilishi:** `surface`, `radius-modal` (12px), `shadow-overlay`, orqada `overlay`. Sarlavha `subtitle` (15/22) + yopish (x) tugmasi; tana `space-24` chetlar; pastda chiziq va tugmalar **oʻngda**: ikkinchi darajali «Ortga», keyin asosiy.

**Qoidalar**
- Bekor qilish tugmasi «Ortga» deb yoziladi — «Bekor qilish» soʻzi hujjatni bekor qilish bilan adashtirilmasin.
- Ochilganda fokus birinchi maydonga (tasdiqlashda — «Ortga» tugmasiga) tushadi; Tab oyna ichida aylanadi; Esc va x yopadi; yopilganda fokus chaqirgan elementga qaytadi.
- Xavfli oyna parda bosilganda yopilmaydi.
- Oyna ustiga oyna ochilmaydi.

**Isteʼmolchi beradi:** `open`, `onClose`, `title`, `size`, `tone` (`default` | `danger`), `children`, `primaryAction` (`{label, onClick, loading}`), `secondaryAction`.
