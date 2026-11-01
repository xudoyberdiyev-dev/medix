Qadamlar koʻrsatkichi sozlash ustasida (5 qadam) foydalanuvchi qayerda ekanini va nechta qadam qolganini koʻrsatadi.

- Gorizontal; har bir qadam: 28px doira + nom (13/18) + ixtiyoriy izoh (`caption`).
- **Bajarilgan:** `primary-button` doira, oq `check`; nom `text-primary`; oldidagi chiziq `primary`.
- **Joriy:** oq doira, 2px `primary-button` chegara va raqam; nom `600`; `aria-current="step"`.
- **Kelgusi:** `border` chegara, `text-secondary` raqam va nom.
- Holat rang bilan birga belgi (check / raqam) va soʻz bilan ham beriladi.
- Bajarilgan qadamga bosib qaytish mumkin; kelgusi qadamlar bosilmaydi.
- Uzun nomlar (ruscha, kirill) qisqartirilmaydi — ikki qatorga oʻtadi.

**Isteʼmolchi beradi:** `steps` (`{key, label, description?}`), `current`, `onStepClick?`.
