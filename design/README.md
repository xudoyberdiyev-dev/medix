# Dizayn manbalari

| Manba | Qayerda |
|---|---|
| Dizayn tizimi (tokenlar, qoidalar, komponentlar API) | `design/system/` (Claude Design «Medix» dan nusxa) |
| Ekran demolari (HTML) | `design/screens/*.html` — har bir ekranning Claude Design'dagi manba kodi |
| To'liq prototip (T1–T12) | Claude Design — egasining akkauntida. `notes/T12-topshirish.md`, `notes/T12-audit.md` hali repoga olinmagan (PLAN.md → «Kutilayotgan») |

## Claude Design artifactlari (slug'lar)

| Ekran | Slug |
|---|---|
| Bosh sahifa demo | `6d164d43-3ff5-4b74-a330-65da024c5059` |
| Mahsulotlar demo | `b06fea4b-ac00-43b9-aea6-a76f3f41c06a` |
| Yetkazib beruvchilar demo | `8dc582a4-80f6-4b98-b06b-79f8a15def2b` |
| Narxlar demo | `7fff47bd-e879-4392-9024-b0b184fe45f9` |
| Kirim va chiqim demo | `3743cb3a-ff4f-4801-8d12-5f10158ded60` |
| Buyurtmalar holat kartalari demo | `0e09ce68-b259-4ef5-92f9-97d4ad6afade` |
| Dizayn tizimi «Medix» | `0d2b9f01-6b42-4ace-b640-776421274a90` |
| O'zgarishlar TZ (Docs) | `92dabe16-fd54-408e-b432-947d1e6d86fa` |

Har ekran demosining manbasi artifactdagi `project/Main.dc.html` faylida. Sessiyada artifact vositalari bo'lsa, ekranni qurishdan oldin shu faylni o'qib `design/screens/` ga saqlang.

## Qoida
Ekranni qurayotganda: avval `design/screens/<ekran>.html` (bo'lsa), keyin `design/system/README.md`. Ziddiyat bo'lsa — `docs/SPEC.md` va eng keyingi qaror ustun.
