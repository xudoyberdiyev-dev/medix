Bildirishnoma (toast) bajarilgan harakat natijasini qisqa xabar qiladi; oʻng yuqori burchakda, yuqori panel ostida chiqadi.

- **Tonlar:** success (`circle-check`), error (`circle-x`, `danger`), warning (`triangle-alert`), info (`info`). Ikonka 20px tonning rangida; sarlavha `text-primary` `600`, matn `text-secondary` 13/18.
- `surface`, 1px `border`, `radius-card`, `shadow-overlay`, eni 380px. Rangli chap chiziq ishlatilmaydi — ton ikonka va soʻz bilan beriladi.
- Success, info, warning **5 soniyada** yoʻqoladi (sichqoncha ustida turganda toʻxtaydi). **Xatolar oʻzi yoʻqolmaydi** — faqat x yoki «Qayta urinish» bilan.
- Bir vaqtda koʻpi bilan 3 ta; yangisi tepada.
- Sarlavha — nima boʻldi («Kirim tasdiqlandi»); matn — tafsilot yoki nima qilish kerak. Undov belgisi yoʻq.
- `role="status"` (xato uchun `role="alert"`) — ekran oʻquvchi oʻqiydi; fokusni oʻgʻirlamaydi.

**Isteʼmolchi beradi:** `toast({ tone, title, description?, action?: {label, onClick}, duration? })`.
