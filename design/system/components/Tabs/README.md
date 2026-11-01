Chiziqli tablar bitta yozuvning boʻlimlari orasida almashadi (masalan, mahsulot kartasi: Umumiy maʼlumot, Partiyalar, Harakatlar tarixi).

- Tab 40px, `body-medium`, `text-secondary`. Faol tab: `text-primary` matn va 2px `primary` pastki chiziq. Hover: `text-primary` + `border` rangidagi chiziq.
- Ixtiyoriy son (`Partiyalar 12`) — kichik `count` belgisi.
- Oʻchirilgan tab `text-disabled`; nega oʻchirilgani tooltipda.
- Tablar sahifa navigatsiyasi uchun emas (uning uchun sidebar). 6 tadan oshmasin; sigʻmasa gorizontal aylanadi, matn qisqartirilmaydi.
- Klaviatura: ←→ tablar orasida, Home/End, Enter/Space tanlaydi (`role="tablist"`).

**Isteʼmolchi beradi:** `items` (`{key, label, count?, disabled?}`), `value`, `onChange`.
