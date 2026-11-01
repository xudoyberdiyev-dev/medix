Holat belgisi hujjat, partiya yoki toʻlov holatini koʻrsatadi — doim ikonka + soʻz + rang birga, hech qachon faqat rang.

| Holat | Ton | Ikonka (Lucide) |
|---|---|---|
| Qoralama | `neutral` (`background` / `text-secondary`) | `file-pen-line` |
| Tasdiqlashda | `warning` | `hourglass` |
| Tasdiqlangan, Toʻlangan | `success` | `circle-check` |
| Bekor qilingan | `danger` | `circle-x` |
| Yaroqli | `success` | `shield-check` |
| Muddati yaqin | `warning` | `calendar-clock` |
| Muddati oʻtgan | `danger` | `calendar-x` |
| Yoʻlda | `info` | `truck` |
| Band qilingan | `primary` (`primary-soft` / `primary-button`) | `bookmark` |

- 24px (jadvalda 22px) balandlik, `caption-medium`, `radius-control`, ikonka 16px.
- Fon `*-bg`, matn va ikonka shu tonning toʻq varianti (`success`, `warning`…), qora emas.
- Soʻz 1–2 ta, bosh harf faqat birinchisida. Holat nomlari hamma joyda bir xil.
- Badge bosilmaydi; filtr uchun `Chip` ishlatiladi.

**Isteʼmolchi beradi:** `tone` (`success` | `warning` | `danger` | `info` | `neutral` | `primary`), `icon`, `children` (soʻz). Tayyor holatlar uchun `status` kaliti (`draft`, `pending`, `approved`, `cancelled`, `valid`, `expiring`, `expired`, `in_transit`).
