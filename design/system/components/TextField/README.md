Matn maydoni bitta qiymatni kiritish uchun; nomi tepada, izoh yoki xato pastda.

**Tuzilishi:** nom (`body-medium`, `text-secondary`) → maydon (36px, 1px `border`, `radius-control`) → izoh (`caption`, `text-secondary`) yoki xato (`caption`, `danger`, `circle-alert` ikonkasi bilan). Majburiy maydon nomidan keyin `danger` rangidagi `*`.

**Variantlar**
- Oddiy matn.
- Qidiruv — chapda `search` ikonkasi; qiymat boʻlsa oʻngda «Tozalash» (x).
- Parol — oʻngda «Parolni koʻrsatish» / «Parolni yashirish» ikonka tugmasi.
- Raqam/summa — qiymat oʻngga tekislangan, `tabular-nums`, oʻngda qoʻshimcha («soʻm», «dona»). Summa doim `1.250.000,50` koʻrinishida; fokusdan chiqqanda formatlanadi.

**Holatlar:** oddiy, hover (`text-disabled` chegara), fokus (`primary` chegara + 2px halqa), xato (`danger` chegara + matn), oʻchirilgan (`background` fon, `text-disabled` matn).

**Oʻlchamlar:** 32px (jadval, filtr paneli), 36px (standart forma), 44px (login, sozlash ustasi).

**Matn qoidalari**
- Xato = nima boʻldi + nima qilish kerak: «Summa mijoz qarzidan oshmasligi kerak: 3.480.200,00 soʻm». «Notoʻgʻri qiymat» emas.
- Placeholder namunani koʻrsatadi, nom oʻrnini bosmaydi.
- Xato maydondan chiqqanda (blur) yoki saqlashda koʻrsatiladi, har bir harf terilganda emas.

**Diqqat:** `border` (#E2E8F0) oq fonda 1.2:1 — WCAG 1.4.11 talab qiladigan 3:1 dan past. Maydon nom va fon farqi bilan taniladi; kerak boʻlsa maydon chegarasi uchun `text-disabled` ishlatishni koʻrib chiqing.

**Isteʼmolchi beradi:** `label`, `value`, `onChange`, `placeholder`, `hint`, `error`, `required`, `disabled`, `size`, `variant` (`text` | `search` | `password` | `amount`), `suffix`.
