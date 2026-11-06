Karta bitta mavzudagi maʼlumotni `surface` fonda, 1px `border` va `radius-card` bilan guruhlaydi. **Kartalarda soya yoʻq.**

- **Oddiy karta** — sarlavha qatori (`subtitle` 15/22, ixtiyoriy uchinchi darajali tugma oʻngda) va tana (`space-20` ichki chet). Maʼlumot roʻyxati: nom `text-secondary`, qiymat `text-primary`.
- **Koʻrsatkich kartasi** — nom (`body`, `text-secondary`, 16px `primary` ikonka), katta raqam (`kpi` 28/36, `tabular-nums`) va birlik («dona», «ta» — 14px `text-secondary`; pul uchun «soʻm» nomga qoʻshiladi: «Bugungi savdo, soʻm», shunda tiyinli summa ham sigʻadi). Karta kengligi kamida 260px (`repeat(auto-fit, minmax(260px, 1fr))`), kichik izoh (`caption`): maʼlumot qayerdan va qachon olingani. Diqqat talab qiladigan izoh — `warning`.
- Koʻrsatkich kartalarida toʻqilgan «oʻsish» foizlari, strelkalar va bezak grafiklari yoʻq: faqat real hisoblangan raqam va uning manbasi.
- Kartalar orasi `space-16`. Katta bezakli kartalar, rangli chap chiziqlar, gradientlar ishlatilmaydi.

**Isteʼmolchi beradi:** `title`, `actions`, `children`; koʻrsatkich uchun `label`, `icon`, `value` (formatlangan), `unit`, `note`, `tone`.
