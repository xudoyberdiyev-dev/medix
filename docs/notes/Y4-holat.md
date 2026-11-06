# Y4 — Kassir paneli

## A. Asos va seed
- Terminal: har filialda `T-{filial}` (kind `term`, «Terminal (karta)»). Online MT → Terminal. Terminal → bank: IO turi `t2b` (MoneyOpDoc, faqat buxgalter/rahbar; kassirga faqat k2b).
- Bank sahifasida Terminal kartasi ko'rinadi; bhMoney: Terminal «bank» guruhida (boshqa rollar raqamlari o'zgarmagan), alohida `term` maydoni ham bor.
- Online MT ko'chirildi: MT-TSH-2/9/13, MT-SMQ-3, MT-FRG-3.
- TSH IO: IO-TSH-000001 (13.09, T-TSH → Kapitalbank 2 400 000), IO-TSH-000004 (04.10 09:10, 1 500 000). Avvalgi IO-1/2 → IO-2/3 (ularga havola yo'q edi).
- Bank qoldiqlari: B-TSH-2 55 700 000 → 54 700 000 (−4 900 000 online Terminal'ga, +3 900 000 IO; bugungi 1 000 000 Terminal'da). B-SMQ-1 47 470 000 → 46 670 000 (800 000 T-SMQ da). B-FRG-1 32 200 000 → 31 600 000 (600 000 T-FRG da). Filial jami o'zgarmagan.
- K-TSH-2 ochilish: −155 000 → 350 000 (aniq qiymat).
- K-TSH-2 03.10: ataylab ochiq qoldirildi — Kassa «yesterday» demosi shu holatga tayanadi.
- Bugun (04.10): MT-TSH-14 naqd 2 300 000 (K-TSH), KO-TSH-6 yoqilg'i 150 000 (K-TSH), MT-TSH-16 haydovchidan 1 124 000 (RS-TSH-000047 / BY-TSH-000349, cashAccept), KO-TSH-5 xo'jalik 85 000 (K-TSH-2), MT-TSH-15 naqd 1 100 000 (K-TSH-2). RS-TSH-000048 dagi 1 266 160 haydovchida qoldi (kutilayotgan).
- CASH_TSH olib tashlandi: K-TSH ochilish 4 480 000 (literal), qoldiq hisobdan: 6 694 000. Kassa demolari closeOk/closeShort sanoqlari yangi qoldiqqa moslandi.
- bhCalendar 06.10 = 154 811 000 — to'g'ri: 11 ta boshlang'ich qoldiq hujjati (SV-TSH-000163, 165–173, 175), seed generatori 30 kunlik muddatdagi «55%» bo'lagini T0+2 ga qo'yadi.
- #payments?new=mt&acct= — usul hisob turidan olinadi (cash/term/bank), Direktorda ham shu hisob ochiladi.

## B. Panel
- CashierPanel.dc.html (rlHome = cashier). Manba: `cashDash(br, {from,to,acct,pt})`.
- Kassir: `bank.view` berildi (faqat ko'rish). `tillAccts` — kassir faqat biriktirilgan kassada KO/MT/IO/kunni yopish.
- Sahifalar URL filtrlari: Kassa `?acct&from&to&dir&kind`, To'lovlar `?from&to&acct&method`, Mijozlar qarzi `?dueFrom&dueTo`.
