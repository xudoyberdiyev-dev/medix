Tizim holatlari — har bir jadval va kartada bir xil koʻrinadigan yuklanish, boʻsh, xato va ruxsat holatlari.

| Holat | Koʻrinishi | Matn |
|---|---|---|
| Yuklanish | Jadvalda kulrang skelet qatorlar (haqiqiy sarlavha bilan), kartada skelet chiziqlar; tugmada spinner. Butun ekranni yopadigan aylanuvchi belgi **yoʻq**. | — |
| Boʻsh (maʼlumot yoʻq) | Markazda 48px doirada chiziqli ikonka, sarlavha (`subtitle`), bir qator izoh, bitta asosiy tugma | «Hali ombor qoʻshilmagan» / «Mahsulotlarni saqlash uchun birinchi omborni yarating.» / [Ombor qoʻshish] |
| Boʻsh (shart bajarilmagan) | Xuddi shunday, tugma oldingi qadamga olib boradi | «Avval filial yarating» / «Ombor filialga tegishli boʻladi.» / [Filial qoʻshish] |
| Qidiruv natija bermadi | `search-x` ikonka, izoh, ikkinchi darajali «Filtrlarni tozalash»; faol filtrlar chiplari koʻrinib turadi | «Hech narsa topilmadi. Qidiruv soʻzini yoki filtrlarni oʻzgartiring.» |
| Xato | Ogohlantirish bloki (danger) yoki toast + «Qayta urinish» | «Maʼlumot yuklanmadi. Internet aloqasini tekshirib, qayta urinib koʻring.» |
| Ruxsat yoʻq | `lock` ikonka, izoh, tugmasiz | «Bu boʻlimni koʻrish uchun ruxsatingiz yoʻq. Administratorga murojaat qiling.» |
| Muvaffaqiyat | Toast, 5 soniya | «Kirim tasdiqlandi» |
| Saqlanmagan oʻzgarishlar | Sahifadan chiqishda tasdiqlash oynasi: [Sahifada qolish] [Saqlamasdan chiqish] | «Oʻzgarishlar saqlanmagan. Chiqib ketsangiz, ular yoʻqoladi.» |

- Skelet: `border` rangida, `radius-sm`, sekin pulsatsiya (harakatni kamaytirish sozlamasida toʻxtaydi). 300ms dan tez yuklansa skelet koʻrsatilmaydi.
- Xato matnida texnik kod yoʻq; texnik tafsilot faqat jurnalga yoziladi.
- Boʻsh holatdagi tugma — sahifaning yagona asosiy harakati.
