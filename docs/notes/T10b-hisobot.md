# T10b — Operatorlar va Ta'minotchi bloklari, 3 hisobot, rollar bosh sahifalari

## O'zgargan fayllar
- medix-data.js — `opSales`, `supGoods` (yagona manba: bosh sahifa bloklari = hisobotlar); seed: «Kim nomiga», IN-TSH-000001 qoralamasi.
- Home.dc.html — «Eng ko'p sotilgan mahsulotlar» o'rniga Operatorlar / Ta'minotchi xodim / Ta'minotchi korxona; Xarid «O'z nomimdagi tovar»; Operator va Filial rahbari holat yorliqlari.
- Reports.dc.html — `op`, `sg`, `sc` hisobotlari, katalogda «Xodimlar va ta'minot» guruhi, ?r=&from=&to=&who=, .xlsx eksport.
- Medix ERP.dc.html — `tb_*` matnlari, Ctrl+K da 3 hisobot.

## Hisob qoidalari
- Operator: Savdo hisoboti manbasi (rptFacts) — QQSsiz, qaytarishlar ayirilgan, `op` bo'yicha; buyurtmalar = SV soni. Aktiv — oxirgi 30 kunda savdo bor.
- Ta'minotchi: partiya darajasida. Olib keldi = o'tkazilgan kirim qatorlari (bonus — 0). Sotildi = sotuv harakatlari − qaytib kelgan (Karantin). Qoldi = barcha zonalardagi joriy qoldiq (Karantin, Jo'natish ham). Boshqa = hisobdan chiqarish / YB ga qaytarish / inventarizatsiya.
- Hisobot sg/sc: davr kirim sanasiga qo'llanadi (standart — «Yil boshidan», bosh sahifa bilan bir xil).
- Tannarx ruxsati yo'q (Xarid): sg/sc hisobotlarida va «O'z nomimdagi tovar»da faqat dona.

## Seed
- KR-TSH-000122 → Laziza Rahmonova; KR-TSH-000120 → Malika Yusupova (Passiv). KR-118 (Laziza), KR-124 (Jahongir) — avvaldan.
- Kartalar, qarzlar, holatlar, kassa o'zgarmagan. Ta'sir: yangi «Kim nomiga» egalariga YB to'lov/bonus eslatmalari shu kirimlar bo'yicha chiqishi mumkin.

## Topilma
- Seed sotuvlari 2408A partiyasidan 910 dona sotadi, kirim 600 dona. Ta'minotchi hisobi partiya harakatlaridan (cheklangan) olinadi, shuning uchun «Yalpi foyda» tannarxi bilan bir xil emas. Seed tuzatilmadi.
