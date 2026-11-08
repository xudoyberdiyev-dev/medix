// MEDIX: umumiy mock ma'lumotlar (mahsulotlar, yetkazib beruvchilar, omborlar, kirim hujjatlari)
(function () {
var RAW = "Demidrol 1% 1ml|Nobel|Antigistaminlar|ampoule|10 mg/ml|10|Difengidramin|R06AA02|8699540090123|nm|18500|1240|dona\nParacetamol 500mg|Jurabek Laboratories|Analgetiklar|tablet|500 mg|20|Paratsetamol|N02BE01|4780012340018||6200|12400|qadoq\nCeftriaxon 1g|KRKA|Antibiotiklar|vial|1 g|1|Seftriakson|J01DD04|3838989612345|m|14800|360|dona\nInsulin Actrapid HM|Novo Nordisk|Insulinlar|vial|100 ME/ml|1|Inson insulini|A10AB01|5701234567893|cm|128000|840|dona\nAmoksitsillin 500mg|Gedeon Richter|Antibiotiklar|capsule|500 mg|16|Amoksitsillin|J01CA04|5997001310124||21400|1200|qadoq\nAnalgin 50% 2ml|Jurabek Laboratories|Analgetiklar|ampoule|500 mg/ml|10|Metamizol natriy|N02BB02|4780012340209||9800|6000|dona\nIbuprofen 400mg|Berlin-Chemie|Analgetiklar|tablet|400 mg|20|Ibuprofen|M01AE01|4013054012345||24600|3240|qadoq\nOmeprazol 20mg|KRKA|Gastroenterologiya|capsule|20 mg|28|Omeprazol|A02BC01|3838989600120|m|32500|2150|qadoq\nDiklofenak 75mg 3ml|Nobel|Analgetiklar|ampoule|25 mg/ml|5|Diklofenak|M01AB05|8699540091458||11200|540|dona\nMetformin 850mg|Berlin-Chemie|Endokrinologiya|tablet|850 mg|30|Metformin|A10BA02|4013054098761||27900|5600|qadoq\nLorotadin 10mg|Gedeon Richter|Antigistaminlar|tablet|10 mg|10|Loratadin|R06AX13|5997001350090||15300|1980|qadoq\nNo-shpa 40mg|Gedeon Richter|Spazmolitiklar|tablet|40 mg|24|Drotaverin|A03AD02|5997001302457||29800|2400|qadoq\nKetorolak 30mg 1ml|Nobel|Analgetiklar|ampoule|30 mg/ml|10|Ketorolak|M01AB15|8699540092011||16700|3100|dona\nDeksametazon 4mg 1ml|KRKA|Gormonlar|ampoule|4 mg/ml|25|Deksametazon|H02AB02|3838989604418||8900|2760|dona\nEnalapril 10mg|KRKA|Yurak-qon tomir|tablet|10 mg|20|Enalapril|C09AA02|3838989607723||13600|1840|qadoq\nAmlodipin 5mg|KRKA|Yurak-qon tomir|tablet|5 mg|30|Amlodipin|C08CA01|3838989608126||18900|2300|qadoq\nLizinopril 10mg|Gedeon Richter|Yurak-qon tomir|tablet|10 mg|28|Lizinopril|C09AA03|5997001311237||22100|1120|qadoq\nAtorvastatin 20mg|KRKA|Yurak-qon tomir|tablet|20 mg|30|Atorvastatin|C10AA05|3838989609024||46800|960|qadoq\nCiprofloksatsin 500mg|Nobel|Antibiotiklar|tablet|500 mg|10|Siprofloksatsin|J01MA02|8699540093117||17400|1450|qadoq\nAzitromitsin 500mg|KRKA|Antibiotiklar|tablet|500 mg|3|Azitromitsin|J01FA10|3838989610219|m|38600|1780|qadoq\nLevofloksatsin 500mg|Nobel|Antibiotiklar|tablet|500 mg|7|Levofloksatsin|J01MA12|8699540094015||41200|640|qadoq\nAmbroksol 30mg|Berlin-Chemie|Respirator|tablet|30 mg|20|Ambroksol|R05CB06|4013054015216||12800|2200|qadoq\nPantoprazol 40mg|KRKA|Gastroenterologiya|tablet|40 mg|28|Pantoprazol|A02BC02|3838989611315||44900|1360|qadoq\nDrotaverin 2% 2ml|Jurabek Laboratories|Spazmolitiklar|ampoule|20 mg/ml|10|Drotaverin|A03AD02|4780012340315||10400|4100|dona\nFurosemid 40mg|Jurabek Laboratories|Yurak-qon tomir|tablet|40 mg|50|Furosemid|C03CA01|4780012340421||7600|1900|qadoq\nGlibenklamid 5mg|Berlin-Chemie|Endokrinologiya|tablet|5 mg|120|Glibenklamid|A10BB01|4013054016114|x|19800|0|qadoq\nInsulin Protafan HM|Novo Nordisk|Insulinlar|vial|100 ME/ml|1|Inson insulini (izofan)|A10AC01|5701234568012|c|126000|610|dona\nNovoRapid FlexPen|Novo Nordisk|Insulinlar|pen|100 ME/ml|5|Insulin aspart|A10AB05|5701234568425|cm|412000|380|dona\nLevemir FlexPen|Novo Nordisk|Insulinlar|pen|100 ME/ml|5|Insulin detemir|A10AE05|5701234568739|c|468000|290|dona\nKavinton 5mg|Gedeon Richter|Nevrologiya|tablet|5 mg|50|Vinpotsetin|N06BX18|5997001312517||36400|1040|qadoq\nMezim forte|Berlin-Chemie|Gastroenterologiya|tablet|3500 ED|20|Pankreatin|A09AA02|4013054017319||21900|3600|qadoq\nKaptopril 25mg|Jurabek Laboratories|Yurak-qon tomir|tablet|25 mg|40|Kaptopril|C09AA01|4780012340537|x|5400|0|qadoq\nNatriy xlorid 0,9% 200ml|Jurabek Laboratories|Infuzion eritmalar|vial|9 mg/ml|1|Natriy xlorid|B05XA03|4780012340643||6900|7800|dona\nDiazepam 10mg 2ml|Gedeon Richter|Nevrologiya|ampoule|5 mg/ml|5|Diazepam|N05BA01|5997001313415|nm|26500|1150|dona\nSeftazidim 1g|Nobel|Antibiotiklar|vial|1 g|1|Seftazidim|J01DD02|8699540095111|x|23800|0|dona\nMetronidazol 500mg 100ml|Nobel|Antibiotiklar|vial|5 mg/ml|1|Metronidazol|J01XD01|8699540096019||12300|1650|dona\nBisoprolol 5mg|Berlin-Chemie|Yurak-qon tomir|tablet|5 mg|30|Bisoprolol|C07AB07|4013054018415||25700|1280|qadoq\nKlopidogrel 75mg|KRKA|Yurak-qon tomir|tablet|75 mg|28|Klopidogrel|B01AC04|3838989612119||52300|900|qadoq\nTramadol 50mg/ml 2ml|KRKA|Analgetiklar|ampoule|50 mg/ml|5|Tramadol|N02AX02|3838989613215|nm|31900|980|dona\nGepatrombin G|Gedeon Richter|Flebologiya|ointment|40 g|1|Geparin + prednizolon|C05BA53|5997001314610||48700|430|dona";
// 2-qadam: mahsulot — yagona manba (store.products === PRODUCTS). Sovuq zanjir mahsulot belgisi emas: COLD_SEED faqat mock partiyalarni Sovuq omborga joylash uchun
var BASE0 = {}, COLD_SEED = {}, PROD_KEY = 'medix-products-v2';
var MAKER_COUNTRY = { Nobel: "O'zbekiston", 'Jurabek Laboratories': "O'zbekiston", KRKA: 'Sloveniya', 'Berlin-Chemie': 'Germaniya', 'Gedeon Richter': 'Vengriya', 'Novo Nordisk': 'Daniya' };
var RU_FORM = { tablet: 'таблетки', capsule: 'капсулы', ampoule: 'раствор для инъекций', vial: 'во флаконе', syrup: 'сироп', ointment: 'мазь', pen: 'раствор в шприц-ручке', powder: 'порошок', gel: 'гель' };
var RU_TL = [['ts', 'ц'], ['sh', 'ш'], ['ch', 'ч'], ['ya', 'я'], ['yu', 'ю'], ['yo', 'ё'], ["o'", 'о'], ["g'", 'г'], ['a', 'а'], ['b', 'б'], ['d', 'д'], ['e', 'е'], ['f', 'ф'], ['g', 'г'], ['h', 'х'], ['i', 'и'], ['j', 'ж'], ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'], ['o', 'о'], ['p', 'п'], ['q', 'к'], ['r', 'р'], ['s', 'с'], ['t', 'т'], ['u', 'у'], ['v', 'в'], ['x', 'кс'], ['y', 'й'], ['z', 'з'], ['c', 'ц'], ['w', 'в']];
function ruTl(s) { var out = '', i = 0, src = String(s || '').toLowerCase(); while (i < src.length) { var m = null; for (var j = 0; j < RU_TL.length; j++) if (src.substr(i, RU_TL[j][0].length) === RU_TL[j][0]) { m = RU_TL[j]; break; } if (m) { out += m[1]; i += m[0].length; } else { out += src[i]; i++; } } return out.charAt(0).toUpperCase() + out.slice(1); }
function ruDose(s) { return String(s || '').replace(/(\d),?(\d*)\s*mg/g, '$1$2 мг').replace(/\bml\b/g, 'мл').replace(/(\d)\s*g\b/g, '$1 г').replace(/\bME\b/g, 'МЕ').replace(/  +/g, ' '); }
function eanFix(s) { s = String(s || ''); if (!/^\d{8}$|^\d{13}$/.test(s)) return s; var b = s.slice(0, -1), sum = 0; for (var i = b.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += +b[i] * w; return b + ((10 - sum % 10) % 10); }
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function genCode(taken, rnd) { var c, n = 0; do { c = String(10000000 + Math.floor((rnd || Math.random)() * 90000000)); n++; } while (taken[c] && n < 1000); return c; }
var SUPPLY0 = { 1: 'Bekzod Tursunov', 3: 'Farrux Ismoilov', 4: 'Farrux Ismoilov', 7: 'Bekzod Tursunov', 8: 'Farrux Ismoilov', 10: 'Rustam Qodirov', 14: 'Farrux Ismoilov', 15: 'Bekzod Tursunov', 16: 'Bekzod Tursunov', 18: 'Farrux Ismoilov', 22: 'Rustam Qodirov', 27: 'Bekzod Tursunov' };
var NOTE0 = { 4: "Faqat sovutgichli mashinada yetkaziladi (ombor mudiri kirimda Sovuq zonani tanlaydi)", 8: 'Tender buyurtmalari uchun asosiy pozitsiya', 12: "Shartnomadagi nomi 2026-yil 1-sentabrdan o'zgargan", 25: "Ishlab chiqaruvchi qadoqni o'zgartirgan — eski shtrix-kod ham saqlanadi" };
var _rnd = mulberry(20261004), _codes = {};
var PRODUCTS = RAW.split('\n').map(function (l, i) {
  var f = l.split('|'), id = i + 1, code = genCode(_codes, _rnd); _codes[code] = 1; if (f[9].indexOf('c') >= 0) COLD_SEED[id] = 1;
  var P = { id: id, code: code, name: f[0], contractName: ruTl(f[6]) + ' ' + (RU_FORM[f[3]] || '') + ' ' + ruDose(f[4]) + ' №' + f[5], classifier: f[6], maker: f[1], country: MAKER_COUNTRY[f[1]] || '', cat: f[2], form: f[3], dose: f[4], pack: f[5], perPack: f[5], unit: f[12],
    barcodes: [eanFix(f[8])], ikpu: String(3004001001000000 + id * 1013).padStart(17, '0'), farmId: 'FRM-' + String(1234 + id * 137).padStart(7, '0'), supplyBy: SUPPLY0[id] || '',
    ctrl: f[9].indexOf('n') >= 0, mark: f[9].indexOf('m') >= 0, rx: f[9].indexOf('n') >= 0 || /Antibiotik|Insulin/.test(f[2]), vat: 12, note: NOTE0[id] || '', createdAt: '01.10.2026 09:30', createdBy: 'Akmal Karimov', active: f[9].indexOf('x') < 0, stock: +f[11] }; BASE0[id] = +f[10]; return P;
});
var PROD_SAVED_AUDIT = prodLoad();
var FORMS = { tablet: 'Tabletka', capsule: 'Kapsula', ampoule: 'Ampula', vial: 'Flakon', syrup: 'Sirop', ointment: 'Malham', pen: 'Shprits-ruchka', powder: 'Kukun', gel: 'Gel' };
// Boshlang'ich (SMARTUP) qarz — faqat arxiv hujjatlari (arOpen) orqali ledger'ga kiradi; obyektda maydon yo'q
var AP_DUE_FIX = { 'KR-TSH-000103': '04.10.2026', 'KR-TSH-000104': '14.10.2026', 'KR-TSH-000105': '14.10.2026', 'KR-TSH-000100': '16.10.2026' }; // T7b seed: 2 kechikkan, 1 bugun, 2 «3 kun ichida»
var AP_OPEN0 = { 'Nobel Pharmsanoat': 45200000, 'Jurabek Laboratories': 18750000, 'KRKA Farma': 62400000, 'Gedeon Richter Uzbekistan': 27300000, 'Novo Nordisk vakolatxonasi': 96100000, 'Pharm Luxe Trade': 8900000 };
// Muddati o'tgan arxiv hujjatlari: [kechikish kunlari, qoldiqdagi ulushi] — summa emas, hujjat sanasi
var AP_LATE0 = { 'Nobel Pharmsanoat': [20, 0.18], 'KRKA Farma': [12, 0.25] };
var SUPPLIERS = [
  { name: 'Nobel Pharmsanoat', stir: '301 552 418', terms: 30 , bank0: ['Kapitalbank', '20208000400117325001'], pre: 'NB-' },
  { name: 'Jurabek Laboratories', stir: '302 874 105', terms: 21 , bank0: ['Hamkorbank', '20208000600228417002'], pre: 'JL-' },
  { name: 'KRKA Farma', stir: '303 116 924', terms: 45 , bank0: ['Asaka bank', '20208000200339508001'], pre: 'KR-' },
  { name: 'Gedeon Richter Uzbekistan', stir: '304 905 337', terms: 30 , bank0: ['Ipoteka-bank', '20208000800441699003'], pre: 'GR-' },
  { name: 'Novo Nordisk vakolatxonasi', stir: '305 228 761', terms: 60 , bank0: ['Kapitalbank', '20208000300552780001'], pre: 'NN-' },
  { name: 'Pharm Luxe Trade', stir: '306 447 590', terms: 14 , bank0: ['Xalq banki', '20208000900663871001'], pre: 'PLT-' }
];
var BRANCHES = [
  { code: 'TSH', name: 'Toshkent filiali', wh: ['Asosiy ombor', 'Sovuq ombor', 'Chilonzor ombori'] },
  { code: 'SMQ', name: 'Samarqand filiali', wh: ['Asosiy ombor', 'Sovuq ombor'] },
  { code: 'BXR', name: 'Buxoro filiali', wh: ['Asosiy ombor', "G'ijduvon ombori"] },
  { code: 'FRG', name: "Farg'ona filiali", wh: ['Asosiy ombor', "Qo'qon ombori", "Marg'ilon ombori"] }
];

// 1a: rol ro'yxatlari — matritsadan (store.rl) o'qiladigan ko'rinish. Kalit → whoCan(kalit); funksiya → hisoblanadigan ro'yxat
var PK = {}; // ro'yxat nomi → { kalit: ruxsat }
function permView(map, name) { if (name) PK[name] = map; var o = {}; Object.keys(map).forEach(function (k) { var v = map[k]; Object.defineProperty(o, k, { enumerable: true, get: typeof v === 'function' ? v : function () { return whoCan(v); } }); }); return o; }
// canR(rol, 'PAY_ROLES', 'create') — eski nom/kalit orqali D.can; hisoblanadigan ro'yxat (cashOnly, readOnly) uchun — o'sha funksiya
function canR(role, name, k) { var v = (PK[name] || {})[k]; if (v == null) return false; return typeof v === 'function' ? v().indexOf(role) >= 0 : can(role, v); }
// ---- 23: Xodimlar — yagona manba (EMPLOYEES). STAFF, MANAGERS, KT_OPS, KT_BUY, PICK, kassirlar shundan hosil qilinadi ----
var EMP0 = [['Karimov', 'Akmal', 'Rustamovich', 'director', null, '+998 90 120 45 67', 'active'], ['Rahimova', 'Dilnoza', '', 'admin', null, '+998 90 334 18 52', 'new'], ['Tursunov', 'Bekzod', '', 'branch', 'TSH', '+998 93 507 21 46', 'new'], ['Qodirov', 'Rustam', '', 'branch', 'SMQ', '+998 91 548 30 17', 'new'],
  ['Yusupova', 'Malika', '', 'operator', 'TSH', '+998 90 612 74 08', 'new'], ['Rasulov', 'Dilshod', '', 'operator', 'SMQ', '+998 91 230 66 41', 'new'], ['Nazarova', 'Shahlo', '', 'operator', 'BXR', '+998 91 446 12 93', 'new'], ['Qosimov', 'Bobur', '', 'operator', 'FRG', '+998 91 682 05 34', 'new'],
  ['Usmonov', 'Jahongir', '', 'purchase', 'TSH', '+998 97 715 40 26', 'blocked', 'Lavozim qisqartirildi, xaridni filial rahbari bajaradi'], ['Karimov', 'Aziz', '', 'purchase', 'SMQ', '+998 97 308 52 19', 'blocked', 'Lavozim qisqartirildi, xaridni filial rahbari bajaradi'], ['Aliyev', 'Sardor', '', 'keeper', 'TSH', '+998 93 241 87 60', 'new'], ['Tosheva', 'Nilufar', '', 'keeper', 'SMQ', '+998 93 905 31 74', 'new'],
  ['Xasanova', 'Nigora', '', 'cashier', 'TSH', '+998 99 417 25 83', 'new'], ['Saidova', 'Gulnora', '', 'cashier', 'TSH', '+998 99 528 64 10', 'new'], ['Qodirova', 'Shahnoza', '', 'cashier', 'SMQ', '+998 99 639 07 52', 'new'], ['Aminova', 'Feruza', '', 'cashier', 'BXR', '+998 99 740 38 26', 'new'],
  ["Yo'ldosheva", 'Madina', '', 'cashier', 'FRG', '+998 99 851 92 47', 'new'], ['Ergashev', 'Jasur', '', 'accountant', 'TSH', '+998 90 963 15 38', 'new'],
  ["Jo'rayev", 'Otabek', '', 'branch', 'BXR', '+998 93 314 62 08', 'new'], ['Hamroyev', 'Sherzod', '', 'keeper', 'BXR', '+998 93 425 18 73', 'new'], ['Mirzayev', "Ulug'bek", '', 'branch', 'FRG', '+998 93 536 40 91', 'new'], ['Sobirova', 'Kamola', '', 'keeper', 'FRG', '+998 93 647 29 15', 'new'],
  ['Xolmatova', 'Nodira', '', 'marker', 'TSH', '+998 90 748 31 62', 'active'], ['Ismoilov', 'Farrux', '', 'keeper', 'TSH', '+998 97 259 84 07', 'active'],
  // T5: yig'uvchilar, faol xarid xodimi, haydovchilar (lk.drivers shu yozuvlarga bog'lanadi — bitta shaxs, bitta yozuv)
  ['Raximov', "Ulug'bek", '', 'picker', 'TSH', '+998 93 702 15 48', 'active'], ['Tojiyev', 'Sherzod', '', 'picker', 'TSH', '+998 93 813 26 59', 'active'], ['Rahmonova', 'Laziza', '', 'purchase', 'TSH', '+998 97 624 39 05', 'active'],
  ['Nazarov', 'Otabek', '', 'driver', 'TSH', '+998 90 318 44 21', 'active'], ['Valiyev', 'Jamshid', '', 'driver', 'TSH', '+998 93 571 20 08', 'active'], ['Rahimov', 'Dilshod', '', 'driver', 'TSH', '+998 97 402 66 15', 'active'],
  ['Mirzayev', 'Sherzod', '', 'driver', 'TSH', '+998 90 955 13 47', 'active'], ['Sobirov', "Ulug'bek", '', 'driver', 'TSH', '+998 99 260 81 30', 'active']];
function empIdByName(nm) { for (var i = 0; i < EMP0.length; i++) if (EMP0[i][1] + ' ' + EMP0[i][0] === nm) return 'e' + (i + 1); return null; }
// EMPLOYEES — store.emps dan hosil bo'ladigan ko'rinish (seedRl gacha EMP0 dan boshlang'ich nusxa)
var EMPLOYEES = EMP0.map(function (x, i) { return { id: 'e' + (i + 1), last: x[0], first: x[1], mid: x[2], name: x[1] + ' ' + x[0], role: x[3], branch: x[4], phone: x[5], status: x[6], blockReason: x[7] || '' }; });
function empApply() { if (!store.emps) return; EMPLOYEES.length = 0; store.emps.forEach(function (e) { EMPLOYEES.push({ id: e.id, last: e.last, first: e.first, mid: e.mid, name: e.first + ' ' + e.last, role: e.role, branch: e.branch, phone: e.phone, status: e.status, blockReason: e.blockReason || '' }); }); }
function empActive(e) { return !!e && e.status !== 'blocked'; }
function empNames(roles, br, withAll) { var R = [].concat(roles); return EMPLOYEES.filter(function (e) { return R.indexOf(e.role) >= 0 && empActive(e) && (br == null || e.branch === br || (withAll && e.branch == null)); }).sort(function (a, b) { return R.indexOf(a.role) - R.indexOf(b.role); }).map(function (e) { return e.name; }); }
function empByBranch(roles) { var o = {}; BRANCHES.forEach(function (b) { var n = empNames(roles, b.code)[0]; if (n) o[b.code] = n; }); return o; }
function empByName(n) { var L = (typeof store !== 'undefined' && store && store.emps) || [], e = L.filter(function (x) { return x.first + ' ' + x.last === n; })[0]; if (e) return { id: e.id, name: n, role: e.role, branch: e.branch, status: e.status }; return EMPLOYEES.filter(function (x) { return x.name === n; })[0] || null; }
// ---- 23: Sozlamalar — yagona manba (CONFIG). Qiymatlar store.cfg da, standart — CFG0 ----
var CFG0 = { orderLateDays: 2, expiryWarnDays: 90, invRemindDays: 90, limitBranchPct: 20, overdueDirDays: 30, priceWarnPct: 20, cashBranchApprove: 2000000, hcDirApprove: 5000000, ivDirApprove: 5000000, vat: 12, pwMin: 8, sessionMin: 30, pinTries: 5, pinLockMin: 15 };
var CONFIG = {}; Object.keys(CFG0).forEach(function (k) { Object.defineProperty(CONFIG, k, { enumerable: true, get: function () { return typeof store !== 'undefined' && store && store.cfg && store.cfg[k] != null ? store.cfg[k] : CFG0[k]; } }); });
var BR_INFO = [
  { id: 'b1', name: 'Toshkent filiali', code: 'TSH', legal: '"Medix Toshkent" MChJ', stir: '305482117', vat: true, vatNo: '326030012345', region: 'Toshkent shahri', address: "Chilonzor tumani, Bunyodkor ko'chasi, 12-uy", same: true, actual: '', phone: '712005040', banks: [{ bank: 'Kapitalbank', acc: '20208000400123456001', main: true }, { bank: 'Hamkorbank', acc: '20208000900765432002', main: false }], director: 'Karimov Akmal Rustamovich', accountant: 'Yo\'ldosheva Gulnora Botirovna' },
  { id: 'b2', name: 'Samarqand filiali', code: 'SMQ', legal: '"Medix Samarqand" MChJ', stir: '306117248', vat: true, vatNo: '326030022871', region: 'Samarqand viloyati', address: "Samarqand sh., Amir Temur ko'chasi, 45-uy", same: true, actual: '', phone: '662331820', banks: [{ bank: 'Ipoteka bank', acc: '20208000300456789011', main: true }], director: 'Usmonov Farrux Ilhomovich', accountant: 'Rahimova Malika Sobirovna' },
  { id: 'b3', name: 'Buxoro filiali', code: 'BXR', legal: '"Medix Buxoro" MChJ', stir: '307905361', vat: false, vatNo: '', region: 'Buxoro viloyati', address: "Buxoro sh., Piridastgir ko'chasi, 7-uy", same: true, actual: '', phone: '652214455', banks: [{ bank: 'Asakabank', acc: '20208000200987654021', main: true }], director: 'Jo\'rayev Sanjar Akramovich', accountant: 'Qodirova Dildora Anvarovna' },
  { id: 'b4', name: "Farg'ona filiali", code: 'FRG', legal: '"Medix Farg\'ona" MChJ', stir: '308224590', vat: true, vatNo: '326030034409', region: "Farg'ona viloyati", address: "Farg'ona sh., Al-Farg'oniy ko'chasi, 21-uy", same: true, actual: '', phone: '732447090', banks: [{ bank: 'Agrobank', acc: '20208000600112233031', main: true }, { bank: "O'zmilliybank", acc: '20208000700445566032', main: false }], director: 'Nazarov Otabek Yusufovich', accountant: 'Mirzayeva Feruza Toxirovna' }
];
var WH_SRC = [['w1', 1, 'Asosiy ombor', "Toshkent, Sergeli tumani, Yangi Sergeli ko'chasi, 7"], ['w2', 1, 'Sovuq ombor', "Toshkent, Sergeli tumani, Yangi Sergeli ko'chasi, 7A"], ['w3', 1, 'Chilonzor ombori', "Toshkent, Chilonzor tumani, Qatortol ko'chasi, 28"], ['w4', 2, 'Asosiy ombor', "Samarqand, Spitamen shoh ko'chasi, 112"], ['w5', 2, 'Sovuq ombor', "Samarqand, Spitamen shoh ko'chasi, 112B"], ['w6', 3, 'Asosiy ombor', "Buxoro, Qayum Murtazoyev ko'chasi, 15"], ['w7', 3, "G'ijduvon ombori", "G'ijduvon, Navoiy ko'chasi, 4"], ['w8', 4, 'Asosiy ombor', "Farg'ona, Marg'ilon ko'chasi, 61"], ['w9', 4, "Qo'qon ombori", "Qo'qon, Turkiston ko'chasi, 9"], ['w10', 4, "Marg'ilon ombori", "Marg'ilon, Burhoniddin Marg'inoniy ko'chasi, 33"]];
function zonesFor(branch, wh) {
  var z = [{ key: 'qabul', label: 'Qabul', type: 'recv' }, { key: 'asosiy', label: 'Asosiy saqlash', type: 'store' }];
  if (/Sovuq/.test(wh)) z.push({ key: 'sovuq', label: 'Sovuq saqlash', type: 'cold' });
  if (branch === 'TSH' && wh === 'Asosiy ombor') z.push({ key: 'seyf', label: 'Seyf', type: 'ctrl' });
  if (branch === 'TSH' && wh === 'Asosiy ombor') z.push({ key: 'sovuq', label: 'Sovuq saqlash', type: 'cold' });
  z.push({ key: 'karantin', label: 'Karantin', type: 'quar' });
  return z;
}
function ctrlAllowed(branch, wh) { return branch === 'TSH' && wh === 'Asosiy ombor'; }
function byName(n) { for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].name === n) return PRODUCTS[i]; return null; }
function L(name, batch, mfg, exp, zone, qty, price) { var p = byName(name); return { pid: p.id, batch: batch, mfg: mfg, exp: exp, zone: zone, qty: qty, price: price, bonusQty: 0 }; }
function H(kind, who, action, time, changes) { return { kind: kind, who: who, action: action, time: time, changes: changes || [] }; }
var RECEIPTS = [
  { no: 'KR-TSH-000126', branch: 'TSH', wh: 'Chilonzor ombori', date: '04.10.2026', supplier: 'Pharm Luxe Trade', invNo: 'PLT-0932', invDate: '03.10.2026', sfNo: '', note: '', status: 'draft', createdBy: 'Jahongir Usmonov',
    lines: [L('Ceftriaxon 1g', 'CF-240930', '30.09.2024', '30.09.2026', 'asosiy', 50, 11400, 0), L('Insulin Actrapid HM', 'IA-2506', '12.06.2025', '12.06.2027', 'asosiy', 40, 98500, 0), L('Tramadol 50mg/ml 2ml', 'TR-2503', '18.03.2025', '18.03.2028', 'asosiy', 30, 24500, 0), L('Paracetamol 500mg', '2409B', '01.09.2025', '31.08.2028', 'asosiy', 200, 4800), L('Paracetamol 500mg', '2409B', '01.09.2025', '31.08.2028', 'asosiy', 100, 4800), L('Analgin 50% 2ml', 'AN-2507', '20.07.2025', '20.07.2028', 'asosiy', 0, 7500)],
    history: [H('create', 'Jahongir Usmonov', 'hujjatni yaratdi', '04.10.2026, 11:02'), H('change', 'Jahongir Usmonov', "6 ta qator qo'shdi", '04.10.2026, 11:18')] },
  { no: 'KR-TSH-000125', branch: 'TSH', wh: 'Asosiy ombor', date: '04.10.2026', supplier: 'Nobel Pharmsanoat', invNo: 'NB-24871', invDate: '04.10.2026', sfNo: 'SF-24871', note: "Oylik shartnoma bo'yicha yetkazib berish", status: 'draft', createdBy: 'Sardor Aliyev',
    lines: [L('Demidrol 1% 1ml', '240915', '15.09.2025', '15.09.2028', 'seyf', 120, 14200), L('Klopidogrel 75mg', 'KL25081', '10.08.2025', '10.08.2028', 'asosiy', 300, 40200), L('Atorvastatin 20mg', 'AT25072', '22.07.2025', '22.07.2028', 'asosiy', 250, 36000), L('Pantoprazol 40mg', 'PT25064', '14.06.2025', '14.06.2028', 'asosiy', 200, 34500), L('Azitromitsin 500mg', 'AZ2412', '15.12.2024', '15.12.2026', 'asosiy', 179, 29700.53), L('Levofloksatsin 500mg', 'LV25090', '05.09.2025', '05.09.2028', 'asosiy', 201, 26749.99)],
    history: [H('create', 'Sardor Aliyev', 'hujjatni yaratdi', '04.10.2026, 09:48'), H('change', 'Sardor Aliyev', "6 ta qator qo'shdi", '04.10.2026, 10:06'), H('change', 'Sardor Aliyev', 'markirovka kodlarini skanerladi', '04.10.2026, 10:31', [{ field: 'Skanerlangan', from: '0', to: '299' }])] },
  { no: 'KR-TSH-000124', branch: 'TSH', wh: 'Asosiy ombor', date: '03.10.2026', supplier: 'Jurabek Laboratories', invNo: 'JL-11804', invDate: '03.10.2026', sfNo: 'SF-11804', note: '', status: 'posted', createdBy: 'Sardor Aliyev', postedAt: '03.10.2026, 15:10', postedBy: 'Sardor Aliyev', soldLine: 2, soldQty: 120,
    lines: [L('Analgin 50% 2ml', 'AN-2508', '05.08.2025', '05.08.2028', 'asosiy', 500, 7500), L('Paracetamol 500mg', '2408A', '01.08.2025', '31.07.2028', 'asosiy', 1400, 4800), L('Drotaverin 2% 2ml', 'DR-2506', '11.06.2025', '11.06.2028', 'asosiy', 200, 8000), L('Furosemid 40mg', 'FU-2505', '02.05.2025', '02.05.2028', 'asosiy', 150, 5800), L('Natriy xlorid 0,9% 200ml', 'NX-2509', '01.09.2025', '01.09.2027', 'asosiy', 400, 5300)],
    history: [H('create', 'Sardor Aliyev', 'hujjatni yaratdi', '03.10.2026, 13:40'), H('change', 'Sardor Aliyev', "5 ta qator qo'shdi", '03.10.2026, 14:22'), H('post', 'Sardor Aliyev', 'hujjatni tasdiqladi', '03.10.2026, 15:10', [{ field: 'Holat', from: 'Qoralama', to: 'Tasdiqlangan' }])] },
  { no: 'KR-TSH-000123', branch: 'TSH', wh: 'Sovuq ombor', date: '02.10.2026', supplier: 'Novo Nordisk vakolatxonasi', invNo: 'NN-5521', invDate: '02.10.2026', sfNo: 'SF-5521', status: 'posted', createdBy: 'Sardor Aliyev', postedAt: '02.10.2026, 16:05', postedBy: 'Sardor Aliyev',
    lines: [L('Insulin Actrapid HM', 'IA-2507', '20.07.2025', '20.07.2027', 'sovuq', 200, 98500), L('Insulin Protafan HM', 'IP-2507', '18.07.2025', '18.07.2027', 'sovuq', 150, 97000), L('NovoRapid FlexPen', 'NR-2506', '30.06.2025', '30.06.2027', 'sovuq', 60, 318000)] },
  { no: 'KR-TSH-000122', branch: 'TSH', wh: 'Asosiy ombor', date: '01.10.2026', supplier: 'KRKA Farma', invNo: 'KR-77310', invDate: '30.09.2026', sfNo: 'SF-77310', status: 'posted', createdBy: 'Jahongir Usmonov', postedAt: '01.10.2026, 12:30', postedBy: 'Sardor Aliyev',
    lines: [L('Enalapril 10mg', 'EN-2508', '01.08.2025', '01.08.2028', 'asosiy', 400, 10400), L('Amlodipin 5mg', 'AM-2507', '01.07.2025', '01.07.2028', 'asosiy', 300, 14500), L('Omeprazol 20mg', 'OM2507', '30.07.2025', '30.07.2027', 'asosiy', 600, 25000), L('Deksametazon 4mg 1ml', 'DK-2505', '15.05.2025', '15.05.2027', 'asosiy', 500, 6800)] },
  { no: 'KR-TSH-000121', branch: 'TSH', wh: 'Asosiy ombor', date: '30.09.2026', supplier: 'KRKA Farma', invNo: 'KR-77102', invDate: '29.09.2026', sfNo: '', status: 'cancelled', createdBy: 'Jahongir Usmonov', postedAt: '30.09.2026, 10:20', postedBy: 'Sardor Aliyev', cancelAt: '04.10.2026, 16:40', cancelBy: 'Dilnoza Rahimova', reason: "Yetkazib beruvchi noto'g'ri tanlangan",
    lines: [L('Ketorolak 30mg 1ml', 'KT-2506', '10.06.2025', '10.06.2028', 'asosiy', 300, 12800), L('Ciprofloksatsin 500mg', 'CP-2507', '01.07.2025', '01.07.2028', 'asosiy', 200, 13400)],
    history: [H('create', 'Jahongir Usmonov', 'hujjatni yaratdi', '30.09.2026, 09:12'), H('post', 'Sardor Aliyev', 'hujjatni tasdiqladi', '30.09.2026, 10:20', [{ field: 'Holat', from: 'Qoralama', to: 'Tasdiqlangan' }]), H('cancel', 'Dilnoza Rahimova', 'hujjatni bekor qildi', '04.10.2026, 16:40', [{ field: 'Holat', from: 'Tasdiqlangan', to: 'Bekor qilingan' }, { field: 'Sabab', from: '', to: "Yetkazib beruvchi noto'g'ri tanlangan" }])] },
  { no: 'KR-TSH-000120', branch: 'TSH', wh: 'Chilonzor ombori', date: '28.09.2026', supplier: 'Gedeon Richter Uzbekistan', invNo: 'GR-30418', invDate: '27.09.2026', sfNo: 'SF-30418', status: 'posted', createdBy: 'Jahongir Usmonov', postedAt: '28.09.2026, 14:00', postedBy: 'Sardor Aliyev',
    lines: [L('No-shpa 40mg', 'NS2508', '01.08.2025', '01.08.2029', 'asosiy', 300, 22900), L('Lorotadin 10mg', 'LR-2507', '15.07.2025', '15.07.2028', 'asosiy', 250, 11800), L('Kavinton 5mg', 'KV-2506', '01.06.2025', '01.06.2028', 'asosiy', 120, 28000)] },
  { no: 'KR-TSH-000119', branch: 'TSH', wh: 'Sovuq ombor', date: '25.09.2026', supplier: 'Novo Nordisk vakolatxonasi', invNo: 'NN-5433', invDate: '25.09.2026', sfNo: 'SF-5433', status: 'posted', createdBy: 'Sardor Aliyev', postedAt: '25.09.2026, 17:15', postedBy: 'Sardor Aliyev',
    lines: [L('Levemir FlexPen', 'LM-2506', '10.06.2025', '10.06.2027', 'sovuq', 80, 360000), L('Insulin Actrapid HM', 'IA-2506', '12.06.2025', '12.06.2027', 'sovuq', 120, 98500)] },
  { no: 'KR-TSH-000118', branch: 'TSH', wh: 'Asosiy ombor', date: '22.09.2026', supplier: 'Nobel Pharmsanoat', invNo: 'NB-24502', invDate: '22.09.2026', sfNo: 'SF-24502', status: 'posted', createdBy: 'Sardor Aliyev', postedAt: '22.09.2026, 11:40', postedBy: 'Sardor Aliyev',
    lines: [L('Diklofenak 75mg 3ml', 'DF-2507', '01.07.2025', '01.07.2028', 'asosiy', 400, 8600), L('Ketorolak 30mg 1ml', 'KT-2507', '15.07.2025', '15.07.2028', 'asosiy', 500, 12800), L('Metronidazol 500mg 100ml', 'MT-2508', '01.08.2025', '01.08.2027', 'asosiy', 250, 9500), L('Demidrol 1% 1ml', '240802', '02.08.2025', '02.08.2028', 'seyf', 200, 14200)] },
  { no: 'KR-SMQ-000042', branch: 'SMQ', wh: 'Asosiy ombor', date: '04.10.2026', supplier: 'Jurabek Laboratories', invNo: 'JL-11821', invDate: '04.10.2026', sfNo: '', status: 'draft', createdBy: 'Rustam Qodirov',
    lines: [L('Paracetamol 500mg', '2409C', '05.09.2025', '05.09.2028', 'asosiy', 500, 4800), L('Furosemid 40mg', 'FU-2506', '10.06.2025', '10.06.2028', 'asosiy', 200, 5800)] },
  { no: 'KR-SMQ-000041', branch: 'SMQ', wh: 'Sovuq ombor', date: '29.09.2026', supplier: 'Novo Nordisk vakolatxonasi', invNo: 'NN-5470', invDate: '29.09.2026', sfNo: 'SF-5470', status: 'posted', createdBy: 'Rustam Qodirov', postedAt: '29.09.2026, 15:30', postedBy: 'Rustam Qodirov',
    lines: [L('Insulin Protafan HM', 'IP-2506', '01.06.2025', '01.06.2027', 'sovuq', 100, 97000)] },
  { no: 'KR-BXR-000028', branch: 'BXR', wh: 'Asosiy ombor', date: '27.09.2026', supplier: 'Pharm Luxe Trade', invNo: 'PLT-0901', invDate: '26.09.2026', sfNo: '', status: 'cancelled', createdBy: 'Akmal Karimov', postedAt: '27.09.2026, 10:00', postedBy: 'Akmal Karimov', cancelAt: '28.09.2026, 09:15', cancelBy: 'Akmal Karimov', reason: 'Nakladnoy raqami xato kiritilgan',
    lines: [L('Ambroksol 30mg', 'AB-2505', '01.05.2025', '01.05.2028', 'asosiy', 300, 9800)] },
  { no: 'KR-BXR-000027', branch: 'BXR', wh: "G'ijduvon ombori", date: '24.09.2026', supplier: 'Gedeon Richter Uzbekistan', invNo: 'GR-30377', invDate: '23.09.2026', sfNo: 'SF-30377', status: 'posted', createdBy: 'Akmal Karimov', postedAt: '24.09.2026, 16:45', postedBy: 'Akmal Karimov',
    lines: [L('Lizinopril 10mg', 'LZ-2506', '01.06.2025', '01.06.2028', 'asosiy', 200, 17000), L('Gepatrombin G', 'GP-2507', '01.07.2025', '01.07.2028', 'asosiy', 80, 37500)] },
  { no: 'KR-FRG-000064', branch: 'FRG', wh: "Qo'qon ombori", date: '03.10.2026', supplier: 'KRKA Farma', invNo: 'KR-77355', invDate: '02.10.2026', sfNo: 'SF-77355', status: 'posted', createdBy: 'Akmal Karimov', postedAt: '03.10.2026, 11:20', postedBy: 'Akmal Karimov',
    lines: [L('Bisoprolol 5mg', 'BS-2507', '01.07.2025', '01.07.2028', 'asosiy', 250, 19800), L('Amlodipin 5mg', 'AM-2508', '01.08.2025', '01.08.2028', 'asosiy', 300, 14500)] },
  { no: 'KR-FRG-000063', branch: 'FRG', wh: 'Asosiy ombor', date: '26.09.2026', supplier: 'Pharm Luxe Trade', invNo: 'PLT-0884', invDate: '25.09.2026', sfNo: 'SF-0884', status: 'posted', createdBy: 'Akmal Karimov', postedAt: '26.09.2026, 13:05', postedBy: 'Akmal Karimov',
    lines: [L('Mezim forte', 'MZ-2506', '01.06.2025', '01.06.2027', 'asosiy', 400, 16800), L('Metformin 850mg', 'MF-2507', '01.07.2025', '01.07.2028', 'asosiy', 300, 21500), L('Ibuprofen 400mg', 'IB25061', '30.06.2025', '30.06.2028', 'asosiy', 200, 18900)] },
  { no: 'KR-TSH-000127', branch: 'TSH', wh: 'Asosiy ombor', date: '04.10.2026', supplier: 'Jurabek Laboratories', invNo: 'JL-11830', invDate: '04.10.2026', sfNo: 'SF-11830', note: "Qabul zonasiga tushdi — saqlashga ko'chirilishi kerak", status: 'posted', createdBy: 'Sardor Aliyev', postedAt: '04.10.2026, 13:20', postedBy: 'Sardor Aliyev',
    lines: [L('Ibuprofen 400mg', 'IB-2509', '10.09.2025', '10.09.2028', 'qabul', 200, 3900), L('Amlodipin 5mg', 'AM-2508', '20.08.2025', '20.08.2028', 'qabul', 150, 5200)],
    history: [H('create', 'Sardor Aliyev', 'hujjatni yaratdi', '04.10.2026, 12:58'), H('post', 'Sardor Aliyev', 'tasdiqladi', '04.10.2026, 13:20')] },
  { no: 'KR-TSH-000128', branch: 'TSH', wh: 'Asosiy ombor', date: '04.10.2026', supplier: 'KRKA Farma', invNo: 'KR-77420', invDate: '04.10.2026', sfNo: 'SF-77420', status: 'accepted', createdBy: 'Jahongir Usmonov', sent: true, acceptedAt: '04.10.2026, 14:05', acceptedBy: 'Sardor Aliyev',
    lines: [L('Enalapril 10mg', 'EN-2509', '01.09.2025', '01.09.2028', 'asosiy', 200, 10400), L('Omeprazol 20mg', 'OM2509', '05.09.2025', '05.09.2027', 'asosiy', 150, 25000)],
    history: [H('create', 'Jahongir Usmonov', 'hujjatni yaratdi', '04.10.2026, 11:40'), H('send', 'Jahongir Usmonov', 'qabulga yubordi', '04.10.2026, 11:52'), H('accept', 'Sardor Aliyev', 'qabul qildi', '04.10.2026, 14:05', [{ field: 'Holat', from: 'Qoralama', to: 'Qabul qilindi' }])] },
  { no: 'KR-TSH-000129', branch: 'TSH', wh: 'Asosiy ombor', date: '04.10.2026', supplier: 'Nobel Pharmsanoat', invNo: 'NB-24910', invDate: '04.10.2026', sfNo: '', status: 'accepted', createdBy: 'Sardor Aliyev', sent: true, acceptedAt: '04.10.2026, 15:20', acceptedBy: 'Sardor Aliyev',
    lines: [L('Diklofenak 75mg 3ml', 'DF-2509', '01.09.2025', '01.09.2028', 'asosiy', 300, 8600), L('Ketorolak 30mg 1ml', 'KT-2509', '10.09.2025', '10.09.2028', 'asosiy', 200, 12800)],
    history: [H('create', 'Sardor Aliyev', 'hujjatni yaratdi', '04.10.2026, 14:30'), H('send', 'Sardor Aliyev', 'qabulga yubordi', '04.10.2026, 14:41'), H('accept', 'Sardor Aliyev', 'qabul qildi', '04.10.2026, 15:20', [{ field: 'Holat', from: 'Qoralama', to: 'Qabul qilindi' }, { field: '1-qator · Keldi', from: '300', to: '288' }])] }
];
RECEIPTS.forEach(function (r) { if (r.no === 'KR-TSH-000126') { r.sent = true; r.history.push(H('send', r.createdBy, 'qabulga yubordi', '04.10.2026, 14:50')); } }); // T9-4a2: «Kirim qabuli» yorlig'i uchun
RECEIPTS[RECEIPTS.length - 1].lines[0].fact = 288; RECEIPTS[RECEIPTS.length - 1].lines[0].diff = 'dmg';
RECEIPTS[4].bonus = { on: true, mode: 'pct', pct: 3, sum: 0, date: '10.10.2026', state: 'wait' };
(function () { var f = function (no) { return RECEIPTS.filter(function (r) { return r.no === no; })[0]; };
  f('KR-TSH-000124').bonus = { on: true, mode: 'pct', pct: 2, sum: 0, date: '05.10.2026', state: 'wait' }; f('KR-TSH-000124').owner = 'Jahongir Usmonov';
  f('KR-TSH-000119').bonus = { on: true, mode: 'pct', pct: 1.5, sum: 0, date: '02.10.2026', state: 'wait' };
  f('KR-TSH-000120').bonus = { on: true, mode: 'pct', pct: 2, sum: 0, date: '30.09.2026', state: 'ok', bnsNo: 'BNS-TSH-000001', by: 'Jasur Ergashev', at: '30.09.2026 11:20' };
  f('KR-TSH-000118').owner = 'Laziza Rahmonova'; f('KR-TSH-000122').owner = 'Laziza Rahmonova'; f('KR-TSH-000120').owner = 'Malika Yusupova'; /* T10b: «Kim nomiga» seed (Malika — Passiv) */ f('KR-TSH-000118').due = '06.10.2026'; f('KR-TSH-000118').dueManual = true; })();
var SUP_PAY0 = { 'Gedeon Richter Uzbekistan': 'cash', 'Pharm Luxe Trade': 'online' };
RECEIPTS.forEach(function (d, i) { d.id = i + 1; if (d.note == null) d.note = ''; if (!d.payType) d.payType = SUP_PAY0[d.supplier] || 'bank'; if (d.status === 'posted' && !d.due) d.due = ''; if (d.owner == null) d.owner = ''; d.lines.forEach(function (l) { delete l.scanned; if (l.bonusQty == null) l.bonusQty = 0; }); if (d.bonus && !d.bonus.sum) d.bonus.sum = Math.round(rcGross(d) * d.bonus.pct) / 100; if (!d.history) d.history = [H('create', d.createdBy, 'hujjatni yaratdi', d.date + ', 09:30'), H('post', d.postedBy || d.createdBy, 'hujjatni tasdiqladi', d.postedAt || d.date + ', 12:00', [{ field: 'Holat', from: 'Qoralama', to: 'Tasdiqlangan' }])]; d.lines.forEach(function (l, j) { l.id = d.id * 100 + j; }); });

// ---- Boshlang'ich qoldiq (SMARTUP dan ko'chirilgan) ----
var DAY = 86400000, T0 = Date.UTC(2026, 9, 4);
function fD(t) { var d = new Date(t); return ('0' + d.getUTCDate()).slice(-2) + '.' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '.' + d.getUTCFullYear(); }
function pD(s) { var a = String(s || '').split('.'); return a.length === 3 ? Date.UTC(+a[2], +a[1] - 1, +a[0]) : null; }
var NEAR = { 'Paracetamol 500mg': [1, 12], 'Ibuprofen 400mg': [0, 18], 'Amoksitsillin 500mg': [1, 25], 'Omeprazol 20mg': [0, 41], 'Metformin 850mg': [1, 52], 'Lorotadin 10mg': [0, 60], 'Enalapril 10mg': [1, 64], 'Ambroksol 30mg': [0, 70], 'Furosemid 40mg': [1, 75], 'Mezim forte': [0, 81], 'Insulin Actrapid HM': [1, 84] };
var EXPD = { 'Ceftriaxon 1g': [0, -4, 'CF-240930'], 'Analgin 50% 2ml': [1, -14, 'AN-2409'], 'Ketorolak 30mg 1ml': [0, -3, 'KT-2408'] };
var QUAR = { 'Amlodipin 5mg': 0, 'Atorvastatin 20mg': 1, 'Bisoprolol 5mg': 0, 'Kavinton 5mg': 0, 'Lizinopril 10mg': 1 };
var RECV = { 'Pantoprazol 40mg': 1, 'Klopidogrel 75mg': 0 };
var RES = {}; // band endi buyurtmalardan hisoblanadi (pastda: reserveOrders)
var OPEN = [], BN = 0;
function ob(p, br, wh, zone, batch, days, qty, res) {
  var exp = T0 + days * DAY;
  OPEN.push({ id: 'O' + (++BN), pid: p.id, branch: br, wh: wh, zone: zone, batch: batch, exp: fD(exp), mfg: fD(exp - 3 * 365 * DAY), cost: openCost(p.id), qty: qty, reserved: res || 0, doc: null, docDate: '01.09.2026', supplier: '' });
}
// SMARTUP boshlang'ich qoldiq partiyalari tannarxi (p.price o'rniga — BASE0 importdagi narx)
function openCost(pid) { return Math.round((BASE0[pid] || 0) * 0.77 / 10) * 10; }
PRODUCTS.forEach(function (p, i) {
  if (!p.active || !p.stock) return;
  if (p.name === 'Demidrol 1% 1ml') { ob(p, 'TSH', 'Asosiy ombor', 'seyf', 'DM-240512', 69, 620); ob(p, 'TSH', 'Asosiy ombor', 'seyf', 'DM-250203', 122, 120, 40); return; }
  var pre = p.name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase(), n = i % 3 === 0 ? 3 : 2, parts = n === 3 ? [0.5, 0.3, 0.2] : [0.6, 0.4];
  for (var k = 0; k < n; k++) {
    var br, wh, zone = 'asosiy';
    if (COLD_SEED[p.id]) { br = k % 2 ? 'SMQ' : 'TSH'; wh = 'Sovuq ombor'; zone = 'sovuq'; }
    else if (p.ctrl) { br = 'TSH'; wh = 'Asosiy ombor'; zone = 'seyf'; }
    else { var b = BRANCHES[(i + k) % 4], ws = b.wh.filter(function (w) { return !/Sovuq/.test(w); }); br = b.code; wh = ws[(i + k) % ws.length]; }
    var days = 200 + ((i * 53 + k * 211) % 700), batch = pre + '-25' + ('0' + ((i * 7 + k * 3) % 12 + 1)).slice(-2) + (10 + k * 7), res = 0;
    if (NEAR[p.name] && NEAR[p.name][0] === k) days = NEAR[p.name][1];
    if (EXPD[p.name] && EXPD[p.name][0] === k) { days = EXPD[p.name][1]; batch = EXPD[p.name][2]; }
    if (QUAR[p.name] === k) zone = 'karantin';
    if (RECV[p.name] === k) zone = 'qabul';
    if (RES[p.name] && RES[p.name][0] === k) res = RES[p.name][1];
    var qty = Math.max(10, Math.round(p.stock * parts[k] / 10) * 10);
    ob(p, br, wh, zone, batch, days, qty, Math.min(res, qty));
  }
});
// 25a (0-b): BY-SMQ-000117 (01.10, Omeprazol 40) jo'natilgan — boshlang'ich qoldiqda shu partiya bo'lishi kerak edi; SV uni FEFO bo'yicha to'liq sarflaydi
ob(PRODUCTS.filter(function (p) { return p.name === 'Omeprazol 20mg'; })[0], 'SMQ', 'Asosiy ombor', 'asosiy', 'OM-250905', 420, 40);
// 11: terish demo uchun Toshkent · Asosiy ombordagi qo'shimcha partiyalar
(function () { var f = function (n) { return PRODUCTS.filter(function (p) { return p.name === n; })[0]; };
  ob(f('Ceftriaxon 1g'), 'TSH', 'Asosiy ombor', 'asosiy', '240915', 250, 400); ob(f('Ceftriaxon 1g'), 'TSH', 'Asosiy ombor', 'asosiy', '241102', 330, 140);
  ob(f('Levemir FlexPen'), 'TSH', 'Asosiy ombor', 'sovuq', 'LE-250611', 260, 60); ob(f('NovoRapid FlexPen'), 'TSH', 'Asosiy ombor', 'sovuq', 'NO-250702', 290, 80);
  OPEN.forEach(function (b) { if (b.branch === 'TSH' && b.batch === 'IB-250124') b.qty = 1100; }); })(); // T11a: seed — hech bir partiyadan qoldiqdan ko'p sotilmasin (avval 160 / 50 / 650)
// ---- Mijozlar (filial bo'yicha shartlar) ----
var AR_OPEN0 = {}, AR_LATE0 = { 3: [12, 0.12], 6: [94, 1], 9: [18, 0.05], 14: [41, 0.12] };
function C(id, name, branch, region, address, phone, stir, limit, terms, disc, debt, x) { AR_OPEN0[id] = debt; var bt = {}; bt[branch] = { active: true, limit: limit, days: terms, disc: disc, price: (x && x.priceType) || 'base', minMonths: x && x.minDays ? Math.round(x.minDays / 30) : 0 }; return Object.assign({ id: id, name: name, bt: bt, region: region, address: address, phone: phone, stir: stir, limit: limit, terms: terms, disc: disc, minDays: null, license: null, blocked: null }, x || {}); }
var CUSTOMERS = [
  C(1, 'Dori-Darmon №12', 'TSH', 'Toshkent, Chilonzor', "Chilonzor tumani, Bunyodkor ko'chasi, 12", '+998 71 276 41 12', '301 224 518', 50000000, 30, 3, 46300000),
  C(2, 'Shifo Farm', 'TSH', 'Toshkent, Yunusobod', 'Yunusobod tumani, 4-mavze, 17-uy', '+998 71 224 18 47', '302 118 447', 120000000, 30, 5, 38400000, { minDays: 180, license: { no: 'LZ-0347-2024', until: '31.12.2027' } }),
  C(3, 'Med Servis Plus', 'TSH', "Toshkent, Mirzo Ulug'bek", "Mirzo Ulug'bek tumani, Buyuk Ipak yo'li, 98", '+998 71 268 90 11', '303 905 112', 40000000, 21, 2, 34676160),
  C(4, 'Oxy Med', 'SMQ', 'Samarqand', "Samarqand sh., Registon ko'chasi, 41", '+998 66 233 71 30', '304 671 230', 30000000, 30, 3, 12300000),
  C(5, 'Grand Pharm', 'TSH', 'Toshkent, Sergeli', "Sergeli tumani, Yangi Sergeli ko'chasi, 7", '+998 71 255 33 09', '305 330 961', 60000000, 30, 4, 21750000),
  C(6, 'Arzon Apteka №7', 'TSH', 'Toshkent, Olmazor', "Olmazor tumani, Qora-qamish 2/1, 15", '+998 71 244 28 05', '306 442 805', 25000000, 14, 0, 12800000, { blocked: "Muddati o'tgan qarz 94 kun — buxgalteriya tomonidan bloklangan" }),
  C(7, 'Dorixona 777', 'BXR', 'Buxoro', "Buxoro sh., Mustaqillik ko'chasi, 30", '+998 65 221 18 09', '307 118 090', 20000000, 21, 2, 6400000),
  C(8, "Navro'z Farm", 'FRG', "Farg'ona", "Farg'ona sh., Al-Farg'oniy ko'chasi, 55", '+998 73 244 59 27', '308 559 271', 35000000, 30, 3, 14100000),
  C(9, '1-son shahar klinik shifoxonasi', 'TSH', 'Toshkent', "Shayxontohur tumani, Farobiy ko'chasi, 2", '+998 71 244 16 62', '200 941 662', 200000000, 45, 0, 64200000, { license: { no: 'LZ-0112-2023', until: '30.06.2027' } }),
  C(10, 'Akfa Medline', 'TSH', 'Toshkent, Yashnobod', "Yashnobod tumani, Mahtumquli ko'chasi, 4", '+998 71 207 72 44', '301 772 449', 80000000, 30, 3, 27900000),
  C(11, 'Shox Med Center', 'SMQ', 'Samarqand', "Samarqand sh., Ibn Sino ko'chasi, 18", '+998 66 230 61 38', '302 610 384', 40000000, 30, 2, 9800000),
  C(12, "Sog'lom Avlod", 'FRG', "Qo'qon", "Qo'qon sh., Turkiston ko'chasi, 9", '+998 73 542 28 75', '303 287 516', 20000000, 21, 2, 5200000),
  C(13, 'Farm Lux', 'TSH', 'Toshkent, Shayxontohur', "Shayxontohur tumani, Navoiy ko'chasi, 36", '+998 71 241 80 33', '304 803 327', 45000000, 14, 2, 9600000),
  C(14, 'Doctor D', 'TSH', 'Toshkent, Yakkasaroy', "Yakkasaroy tumani, Shota Rustaveli ko'chasi, 21", '+998 71 256 91 67', '305 916 740', 35000000, 21, 3, 15400000),
  C(15, 'Zilol Farm', 'FRG', "Marg'ilon", "Marg'ilon sh., Burhoniddin Marg'inoniy ko'chasi, 3", '+998 73 233 20 58', '306 205 893', 15000000, 14, 0, 3900000),
  C(16, 'Asia Pharm', 'BXR', "Buxoro, G'ijduvon", "G'ijduvon tumani, Abduxoliq G'ijduvoniy ko'chasi, 11", '+998 65 572 43 81', '307 438 152', 25000000, 21, 2, 8700000),
  C(17, 'Hayat Medical Center', 'TSH', 'Toshkent, Mirobod', "Mirobod tumani, Taras Shevchenko ko'chasi, 26", '+998 71 252 76 04', '308 127 604', 90000000, 30, 3, 31500000, { license: { no: 'LZ-0289-2025', until: '14.03.2028' } }),
  C(18, 'Medion Clinic', 'TSH', 'Toshkent, Yunusobod', "Yunusobod tumani, Amir Temur shoh ko'chasi, 107", '+998 71 205 54 01', '309 554 018', 70000000, 30, 3, 22600000),
  C(19, 'Baxt Farm', 'SMQ', 'Samarqand', "Samarqand sh., Gagarin ko'chasi, 64", '+998 66 234 69 27', '301 690 275', 18000000, 14, 0, 4100000),
  C(20, 'Pediatriya markazi', 'TSH', 'Toshkent', "Olmazor tumani, Talabalar shaharchasi, 5", '+998 71 246 37 75', '200 377 509', 20000000, 30, 0, 18900000, { license: { no: 'LZ-0098-2022', until: '15.09.2026' } })
];
var ORDER_STATUS = {
  draft: { icon: 'file-pen', fg: '#5B6B6A', bg: '#F8FAFA' }, pending: { icon: 'clock', fg: '#B45309', bg: '#FFFBEB' }, queued: { icon: 'list-ordered', fg: '#1D4ED8', bg: '#EFF6FF' },
  picking: { icon: 'scan-line', fg: '#1D4ED8', bg: '#EFF6FF' }, marking: { icon: 'scan-barcode', fg: '#1D4ED8', bg: '#EFF6FF' }, ready: { icon: 'package-check', fg: '#0F766E', bg: '#DDF5EE' }, checking: { icon: 'clipboard-check', fg: '#1D4ED8', bg: '#EFF6FF' }, docs: { icon: 'file-text', fg: '#1D4ED8', bg: '#EFF6FF' }, loading: { icon: 'truck', fg: '#0F766E', bg: '#DDF5EE' }, shipped: { icon: 'truck', fg: '#1D4ED8', bg: '#EFF6FF' },
  delivered: { icon: 'check-check', fg: '#15803D', bg: '#F0FDF4' }, undelivered: { icon: 'package-x', fg: '#B91C1C', bg: '#FEF2F2' }, rejected: { icon: 'octagon-x', fg: '#B91C1C', bg: '#FEF2F2' }, cancelled: { icon: 'circle-x', fg: '#5B6B6A', bg: '#EEF2F4' }
};
var RESERVING = ['queued', 'picking', 'marking', 'checking', 'docs', 'loading', 'ready']; var POSTPICK = ['marking', 'checking', 'docs', 'loading', 'ready', 'shipped', 'delivered']; // T9-4a: «ready» — eski holat, «loading» bilan bir xil ishlaydi // T9-1: «Tasdiqlangan» o'rniga «Navbatda»
function OL(name, qty) { return { pid: byName(name).id, qty: qty, price: null }; }
function O(num, cust, status, date, time, op, delivery, lines, x) { var a = num.split('-'); return Object.assign({ no: num, branch: a[1], wh: 'Asosiy ombor', date: date, time: time, cust: cust, status: status, op: op, delivery: delivery, delivDate: x && x.delivDate || '05.10.2026', note: '', lines: lines.map(function (l) { return OL(l[0], l[1]); }) }, x || {}); }
var MAL = empNames('operator', 'TSH')[0], BEK = empNames('branch', 'TSH')[0], WHM = empNames('keeper', 'TSH').filter(function (n) { return n === 'Farrux Ismoilov'; })[0] || empNames('keeper', 'TSH')[0], MARKER = empNames('marker', 'TSH')[0];
var ORDERS = [
  O('BY-TSH-000343', 9, 'pending', '04.10.2026', '11:40', MAL, 'deliver', [['Demidrol 1% 1ml', 80], ['Natriy xlorid 0,9% 200ml', 300], ['Metronidazol 500mg 100ml', 60]], { mgrNote: "Shifoxona to'lovni g'aznachilik orqali 10-oktabrda o'tkazadi" }),
  O('BY-TSH-000342', 14, 'pending', '04.10.2026', '12:40', BEK, 'deliver', [['Ketorolak 30mg 1ml', 60], ['Deksametazon 4mg 1ml', 100], ['Ciprofloksatsin 500mg', 40]]),
  O('BY-TSH-000341', 13, 'draft', '04.10.2026', '11:05', MAL, 'deliver', [['Lorotadin 10mg', 40], ['Paracetamol 500mg', 60]]),
  O('BY-TSH-000340', 3, 'pending', '04.10.2026', '10:48', MAL, 'deliver', [['Azitromitsin 500mg', 120], ['Levofloksatsin 500mg', 80], ['Omeprazol 20mg', 60]], { mgrNote: "Mijoz to'lovni 7-oktabrgacha va'da qildi" }),
  O('BY-TSH-000339', 1, 'pending', '04.10.2026', '10:12', MAL, 'deliver', [['Omeprazol 20mg', 120], ['Ibuprofen 400mg', 120], ['Amlodipin 5mg', 180], ['Diklofenak 75mg 3ml', 140], ['Drotaverin 2% 2ml', 200], ['Furosemid 40mg', 100], ['Natriy xlorid 0,9% 200ml', 180], ['Paracetamol 500mg', 200]], { mgrNote: "Doimiy mijoz, oy oxirida yopadi. Hajmni kamaytirishni xohlamadi" }),
  O('BY-TSH-000338', 17, 'queued', '04.10.2026', '09:41', MAL, 'deliver', [['Demidrol 1% 1ml', 40], ['Diklofenak 75mg 3ml', 100], ['Ketorolak 30mg 1ml', 60]], { viaAppr: true, appr: { by: 'Bekzod Tursunov', at: '04.10.2026 11:05' } }),
  O('BY-TSH-000337', 2, 'queued', '04.10.2026', '09:15', BEK, 'deliver', [['Paracetamol 500mg', 300], ['Omeprazol 20mg', 120], ['No-shpa 40mg', 200], ['Ibuprofen 400mg', 300], ['Ceftriaxon 1g', 200], ['Demidrol 1% 1ml', 60], ['Levemir FlexPen', 30], ['NovoRapid FlexPen', 30]], { delivDate: '04.10.2026', delivTime: '16:30' }),
  O('BY-TSH-000336', 10, 'pending', '03.10.2026', '17:32', MAL, 'pickup', [['Ibuprofen 400mg', 150], ['Amoksitsillin 500mg', 80]], { delivDate: '04.10.2026' }),
  O('BY-TSH-000335', 9, 'picking', '03.10.2026', '16:05', MAL, 'deliver', [['Demidrol 1% 1ml', 60], ['Natriy xlorid 0,9% 200ml', 400], ['Metronidazol 500mg 100ml', 120]], { delivDate: '04.10.2026', delivTime: '14:00', pickedLines: 2, pickStart: '04.10.2026 14:50', picker: 'Sardor Aliyev' }),
  O('BY-TSH-000334', 14, 'queued', '03.10.2026', '15:20', BEK, 'deliver', [['Drotaverin 2% 2ml', 300], ['Analgin 50% 2ml', 100]], { delivDate: '04.10.2026', delivTime: '15:00' }), // T9-3: Ombor mudiri (Sardor A.) bandligi olib tashlandi — vaqt berilgan, navbatda
  O('BY-TSH-000333', 18, 'loading', '03.10.2026', '12:44', MAL, 'deliver', [['Deksametazon 4mg 1ml', 150], ['Furosemid 40mg', 100]], { delivDate: '04.10.2026', pickStart: '04.10.2026 11:40', pickEnd: '04.10.2026 12:10', fefoDev: { name: 'Furosemid 40mg', reason: "Birinchi partiya qutisi shikastlangan — keyingi partiyadan olindi" } }),
  O('BY-TSH-000332', 13, 'ready', '03.10.2026', '11:10', MAL, 'pickup', [['Enalapril 10mg', 120], ['Amlodipin 5mg', 90]], { delivDate: '04.10.2026', pickStart: '04.10.2026 12:20', pickEnd: '04.10.2026 12:55' }),
  O('BY-TSH-000331', 5, 'shipped', '02.10.2026', '16:30', MAL, 'deliver', [['Ciprofloksatsin 500mg', 80], ['Mezim forte', 60], ['Gepatrombin G', 20]], { delivDate: '03.10.2026', short: { 'Gepatrombin G': 8 }, ship: { driver: 'Jamshid Valiyev', car: '01 B 218 MA', at: '03.10.2026 09:20' } }),
  O('BY-TSH-000330', 1, 'shipped', '02.10.2026', '14:02', BEK, 'deliver', [['Paracetamol 500mg', 300], ['Analgin 50% 2ml', 200]], { delivDate: '03.10.2026', ship: { driver: 'Jamshid Valiyev', car: '01 B 218 MA', at: '03.10.2026 10:05' } }),
  O('BY-TSH-000329', 2, 'delivered', '01.10.2026', '15:47', MAL, 'deliver', [['Omeprazol 20mg', 80], ['Lizinopril 10mg', 60], ['Amlodipin 5mg', 100]], { delivDate: '02.10.2026', short: { 'Amlodipin 5mg': 20 }, ship: { driver: 'Otabek Nazarov', car: '01 A 734 KA', at: '02.10.2026 09:10', deliveredAt: '02.10.2026 11:45', receiver: 'Nodira Saidova, farmatsevt' }, pays: [['02.10.2026', 4000000, "Bank o'tkazmasi"]] }),
  O('BY-TSH-000328', 17, 'delivered', '01.10.2026', '10:21', MAL, 'deliver', [['Ketorolak 30mg 1ml', 120], ['Deksametazon 4mg 1ml', 200]], { delivDate: '02.10.2026', ship: { driver: 'Otabek Nazarov', car: '01 A 734 KA', at: '02.10.2026 09:10', deliveredAt: '02.10.2026 13:10', receiver: 'Laziz Hamidov, ombor mudiri' } }),
  O('BY-TSH-000327', 10, 'delivered', '30.09.2026', '17:05', BEK, 'pickup', [['No-shpa 40mg', 90], ['Ibuprofen 400mg', 70]], { delivDate: '30.09.2026', ship: { driver: '—', car: '—', at: '30.09.2026 17:40', deliveredAt: '30.09.2026 17:40', receiver: "Sherzod Qo'chqorov (o'zi oldi)" }, pays: [['30.09.2026', 2500000, 'Naqd']] }),
  O('BY-TSH-000326', 6, 'rejected', '30.09.2026', '12:30', MAL, 'deliver', [['Paracetamol 500mg', 400]], { delivDate: '01.10.2026', reason: "Muddati o'tgan qarz to'lanmagan", rej: { by: 'Akmal Karimov', at: '30.09.2026 16:10' } }),
  O('BY-TSH-000325', 14, 'cancelled', '29.09.2026', '16:40', MAL, 'deliver', [['Furosemid 40mg', 80]], { delivDate: '30.09.2026', reason: 'Mijoz buyurtmani bekor qildi', canc: { by: 'Malika Yusupova', at: '30.09.2026 09:15', from: 'queued' } }),
  O('BY-TSH-000324', 20, 'rejected', '29.09.2026', '11:18', BEK, 'deliver', [['Natriy xlorid 0,9% 200ml', 200], ['Metronidazol 500mg 100ml', 40]], { delivDate: '30.09.2026', reason: "Litsenziya muddati o'tgan — yangilangach qayta kiritilsin", rej: { by: 'Bekzod Tursunov', at: '04.10.2026 10:30' }, viaAppr: true }),
  O('BY-TSH-000323', 13, 'queued', '29.09.2026', '10:02', MAL, 'deliver', [['Azitromitsin 500mg', 60], ['Levofloksatsin 500mg', 40]], { delivDate: '05.10.2026' }),
  O('BY-TSH-000322', 18, 'delivered', '28.09.2026', '14:36', MAL, 'deliver', [['Drotaverin 2% 2ml', 200], ['Mezim forte', 40]], { delivDate: '29.09.2026', ship: { driver: 'Otabek Nazarov', car: '01 A 734 KA', at: '29.09.2026 09:00', deliveredAt: '29.09.2026 11:20', receiver: 'Gulnora Tojiyeva, mudira' }, pays: [['01.10.2026', 3000000, "Bank o'tkazmasi"], ['03.10.2026', 1500000, 'Plastik karta']] }),
  O('BY-TSH-000321', 10, 'queued', '04.10.2026', '13:05', MAL, 'pickup', [['Ibuprofen 400mg', 60], ['Amoksitsillin 500mg', 40]], { delivDate: '04.10.2026' }),
  O('BY-TSH-000320', 18, 'queued', '04.10.2026', '12:20', BEK, 'deliver', [['No-shpa 40mg', 80], ['Analgin 50% 2ml', 60], ['Diklofenak 75mg 3ml', 40]], { delivDate: '04.10.2026', delivTime: '14:00' }),
  O('BY-TSH-000319', 12, 'queued', '04.10.2026', '11:55', MAL, 'deliver', [['Paracetamol 500mg', 100], ['Omeprazol 20mg', 40]], { delivDate: '04.10.2026', delivTime: '17:00' }),
  O('BY-TSH-000318', 7, 'queued', '04.10.2026', '14:10', MAL, 'pickup', [['Amlodipin 5mg', 60], ['Enalapril 10mg', 40], ['Lorotadin 10mg', 30]], { delivDate: '04.10.2026' }),
  O('BY-SMQ-000118', 4, 'shipped', '03.10.2026', '13:22', 'Rustam Qodirov', 'deliver', [['Paracetamol 500mg', 150], ['Furosemid 40mg', 60]], { wh: 'Asosiy ombor', delivDate: '04.10.2026' }),
  O('BY-SMQ-000117', 11, 'delivered', '01.10.2026', '11:40', 'Rustam Qodirov', 'deliver', [['Omeprazol 20mg', 40]], { delivDate: '02.10.2026' }),
  O('BY-BXR-000064', 7, 'delivered', '30.09.2026', '15:10', 'Shahlo Nazarova', 'pickup', [['Analgin 50% 2ml', 120]], { delivDate: '30.09.2026' }),
  O('BY-FRG-000092', 8, 'shipped', '02.10.2026', '10:55', 'Bobur Qosimov', 'deliver', [['Mezim forte', 50], ['Ibuprofen 400mg', 40]], { delivDate: '03.10.2026' }),
  O('BY-FRG-000091', 12, 'draft', '02.10.2026', '09:30', 'Bobur Qosimov', 'deliver', [['Ambroksol 30mg', 60]], { delivDate: '03.10.2026' }),
  // 12: jo'natishga tayyor va yo'ldagi buyurtmalar
  O('BY-TSH-000317', 2, 'checking', '03.10.2026', '16:20', BEK, 'pickup', [['Demidrol 1% 1ml', 200], ['Levemir FlexPen', 20], ['Paracetamol 500mg', 200], ['Omeprazol 20mg', 100], ['Ibuprofen 400mg', 160], ['No-shpa 40mg', 120], ['Ketorolak 30mg 1ml', 200], ['Mezim forte', 160]], { delivDate: '04.10.2026', pickStart: '04.10.2026 14:10', pickEnd: '04.10.2026 14:50', seedShort: { 'Demidrol 1% 1ml': 80 } }),
  O('BY-TSH-000316', 1, 'docs', '04.10.2026', '10:30', MAL, 'pickup', [['Paracetamol 500mg', 150], ['Ibuprofen 400mg', 100], ['Drotaverin 2% 2ml', 120], ['Furosemid 40mg', 60]], { delivDate: '04.10.2026', pickStart: '04.10.2026 12:40', pickEnd: '04.10.2026 13:15' }),
  O('BY-TSH-000315', 14, 'docs', '04.10.2026', '09:05', MAL, 'deliver', [['Ketorolak 30mg 1ml', 100], ['Deksametazon 4mg 1ml', 120], ['Analgin 50% 2ml', 150]], { delivDate: '04.10.2026', delivTime: '17:00', pickStart: '04.10.2026 12:05', pickEnd: '04.10.2026 12:40' }),
  O('BY-TSH-000314', 5, 'checking', '02.10.2026', '15:10', BEK, 'deliver', [['Amoksitsillin 500mg', 80], ['Azitromitsin 500mg', 60], ['Ciprofloksatsin 500mg', 60], ['Diklofenak 75mg 3ml', 100]], { delivDate: '03.10.2026', pickStart: '03.10.2026 16:50', pickEnd: '03.10.2026 17:20' }),
  O('BY-TSH-000313', 9, 'docs', '03.10.2026', '14:00', MAL, 'deliver', [['NovoRapid FlexPen', 20], ['Natriy xlorid 0,9% 200ml', 200], ['Metronidazol 500mg 100ml', 80], ['Drotaverin 2% 2ml', 100]], { delivDate: '04.10.2026', pickStart: '04.10.2026 11:00', pickEnd: '04.10.2026 11:30' }),
  O('BY-TSH-000312', 3, 'loading', '03.10.2026', '11:30', MAL, 'deliver', [['Omeprazol 20mg', 60], ['Ibuprofen 400mg', 40], ['No-shpa 40mg', 50]], { delivDate: '05.10.2026', pickStart: '04.10.2026 09:50', pickEnd: '04.10.2026 10:20' }),
  O('BY-TSH-000311', 17, 'shipped', '03.10.2026', '15:40', BEK, 'deliver', [['Ceftriaxon 1g', 60], ['Seftazidim 1g', 40], ['Natriy xlorid 0,9% 200ml', 120], ['NovoRapid FlexPen', 10]], { short: { 'Seftazidim 1g': 40 } /* T11a: TSH da Seftazidim qoldig'i yo'q */, delivDate: '04.10.2026', ship: { driver: 'Sherzod Mirzayev', car: '01 D 577 TA', at: '04.10.2026 09:30' } }),
  O('BY-TSH-000310', 10, 'shipped', '03.10.2026', '12:15', MAL, 'deliver', [['Ibuprofen 400mg', 200], ['Omeprazol 20mg', 100], ['Paracetamol 500mg', 150]], { delivDate: '04.10.2026', ship: { driver: 'Sherzod Mirzayev', car: '01 D 577 TA', at: '04.10.2026 09:30' } })
];
// T9-3: «Markirovkada» navbati — bugun Yig'uvchilar yig'gan 3 ta buyurtma (aralash / faqat markirovkali / markirovkasiz); id barqaror bo'lishi uchun oxiriga
ORDERS.push(
  O('BY-TSH-000344', 12, 'marking', '04.10.2026', '12:05', MAL, 'deliver', [['Ceftriaxon 1g', 30], ['Omeprazol 20mg', 12], ['Paracetamol 500mg', 100], ['Ibuprofen 400mg', 50]], { delivDate: '04.10.2026', delivTime: '17:30', pickStart: '04.10.2026 13:20', pickEnd: '04.10.2026 13:48' }),
  O('BY-TSH-000345', 3, 'marking', '04.10.2026', '12:30', BEK, 'deliver', [['Demidrol 1% 1ml', 20], ['Azitromitsin 500mg', 10]], { delivDate: '04.10.2026', delivTime: '16:00', pickStart: '04.10.2026 13:20', pickEnd: '04.10.2026 13:42' }),
  O('BY-TSH-000346', 13, 'marking', '04.10.2026', '13:10', MAL, 'pickup', [['Analgin 50% 2ml', 40], ['No-shpa 40mg', 30]], { delivDate: '05.10.2026', pickStart: '04.10.2026 14:00', pickEnd: '04.10.2026 14:14' }));
// T9-4b: Dilshod Rahimov reyslari — RS-TSH-000047 («Yo'lda»: 347, 348, 349 naqd), RS-TSH-000048 («Qaytish kutilmoqda»: 350 yetkazilmadi, 351 naqd)
(function () { var SH = function (car, at) { return { ship: { driver: 'Dilshod Rahimov', car: car, at: at } }; }, X = function (a, b) { return Object.assign({ delivDate: '04.10.2026', pickStart: '04.10.2026 07:30', pickEnd: '04.10.2026 07:55' }, a, b || {}); };
  ORDERS.push(
    O('BY-TSH-000347', 14, 'shipped', '03.10.2026', '15:20', MAL, 'deliver', [['Paracetamol 500mg', 100], ['Ibuprofen 400mg', 60]], X(SH('01 A 734 KA', '04.10.2026 09:50'))),
    O('BY-TSH-000348', 2, 'shipped', '03.10.2026', '15:45', BEK, 'deliver', [['Omeprazol 20mg', 40], ['No-shpa 40mg', 50]], X(SH('01 A 734 KA', '04.10.2026 09:50'))),
    O('BY-TSH-000349', 9, 'shipped', '03.10.2026', '16:05', MAL, 'deliver', [['Analgin 50% 2ml', 60], ['Drotaverin 2% 2ml', 40]], X(SH('01 A 734 KA', '04.10.2026 09:50'), { payType: 'cash', note: "Naqd to'lov — kassir chek beradi" })),
    O('BY-TSH-000350', 1, 'shipped', '03.10.2026', '13:30', MAL, 'deliver', [['Ketorolak 30mg 1ml', 60], ['Diklofenak 75mg 3ml', 50]], X(SH('01 B 456 CD', '04.10.2026 08:10'), { pickStart: '03.10.2026 16:30', pickEnd: '03.10.2026 16:55' })),
    O('BY-TSH-000351', 12, 'shipped', '03.10.2026', '14:10', BEK, 'deliver', [['Ceftriaxon 1g', 20], ['Amoksitsillin 500mg', 40]], X(SH('01 B 456 CD', '04.10.2026 08:10'), { payType: 'cash', pickStart: '03.10.2026 17:00', pickEnd: '03.10.2026 17:20' })));
})();
var T94B_ORD = ['BY-TSH-000347', 'BY-TSH-000348', 'BY-TSH-000349', 'BY-TSH-000350', 'BY-TSH-000351'];
// T9-2: seed — bugungi yig'ishlar (Ulug'bek Raximov, Sherzod Tojiyev) va Sherzodda faol yig'ish
(function () { var U = "Ulug'bek Raximov", S = 'Sherzod Tojiyev', T = function (p, at, m) { return { pickMin: p, markMin: m || 15, by: WHM, at: at, hist: [] }; }, P = {
    'BY-TSH-000344': [U, T(30, '04.10.2026 13:12', 20)], 'BY-TSH-000345': [S, T(25, '04.10.2026 13:15', 15)], 'BY-TSH-000346': [U, T(15, '04.10.2026 13:55', 10)],
    'BY-TSH-000312': [U, T(30, '04.10.2026 09:40')], 'BY-TSH-000332': [U, T(30, '04.10.2026 12:10')], 'BY-TSH-000313': [S, T(40, '04.10.2026 10:50')],
    'BY-TSH-000315': [S, T(40, '04.10.2026 11:55')], 'BY-TSH-000316': [S, T(45, '04.10.2026 12:30')], 'BY-TSH-000317': [S, T(30, '04.10.2026 14:00')], 'BY-TSH-000314': [U, T(30, '03.10.2026 16:40')] };
  ORDERS.forEach(function (o) { var x = P[o.no]; if (x) { o.picker = x[0]; o.tm = x[1]; }
    if (o.no === 'BY-TSH-000317') o.issues = [{ reason: 'short', note: 'Demidrol 1% 1ml — 80 dona yetmadi', by: S, at: '04.10.2026 14:32' }];
    if (o.no === 'BY-TSH-000314') o.issues = [{ reason: 'damaged', note: "Ciprofloksatsin 500mg — 1 qadoq ezilgan, qutida qoldirildi", by: U, at: '03.10.2026 17:05' }];
    if (o.no === 'BY-TSH-000335') { o.picker = S; o.pickStart = '04.10.2026 15:05'; delete o.pickedLines; o.tm = T(45, '04.10.2026 14:58'); } }); })();
// T9-1: seed — «Navbatda»: BY-TSH-000319 va BY-TSH-000320 ga vaqt berilgan, qolganlari vaqt kutmoqda
ORDERS.forEach(function (o) { if (o.no === 'BY-TSH-000319' || o.no === 'BY-TSH-000320') o.tm = { pickMin: o.no === 'BY-TSH-000319' ? 30 : 20, markMin: 15, by: WHM, at: '04.10.2026 14:40', hist: [] }; });
// T9-4c: TSH qoralamalari — 341 (mavjud) va 352; mahsulot min./maks. buyurtma miqdori (maks. dan oshsa — rahbar tasdig'i)
ORDERS.push(O('BY-TSH-000352', 5, 'draft', '04.10.2026', '14:35', MAL, 'deliver', [['Ceftriaxon 1g', 40], ['Amoksitsillin 500mg', 60], ['Ibuprofen 400mg', 80]], { payType: 'bank', note: 'Mijoz bilan yetkazish vaqti kelishilmoqda' }));
// T9-4c2: takrorlash sinovi — «Dorixona 777» (7) TSH da 3 ta oldingi buyurtma: 318 (navbatda) + 353, 354 (yetkazilgan, to'langan)
ORDERS.push(O('BY-TSH-000353', 7, 'delivered', '27.09.2026', '10:20', MAL, 'pickup', [['Paracetamol 500mg', 120], ['Omeprazol 20mg', 60], ['Seftazidim 1g', 20], ['Pantoprazol 40mg', 30], ['Drotaverin 2% 2ml', 50]], { delivDate: '27.09.2026', payType: 'online', ship: { driver: '—', car: '—', at: '27.09.2026 11:00', deliveredAt: '27.09.2026 11:00', receiver: "Dilnoza Karimova (o'zi oldi)" } }),
  O('BY-TSH-000354', 7, 'delivered', '30.09.2026', '15:40', MAL, 'pickup', [['Amlodipin 5mg', 60], ['Enalapril 10mg', 40], ['Lizinopril 10mg', 30]], { delivDate: '30.09.2026', payType: 'cash', ship: { driver: '—', car: '—', at: '30.09.2026 16:10', deliveredAt: '30.09.2026 16:10', receiver: "Dilnoza Karimova (o'zi oldi)" } }));
// T10a2 (4): Online to'lov turidagi 2 sotuv — 355 (to'lanmagan), 356 (qisman: MT-TSH-000013 karta)
ORDERS.push(O('BY-TSH-000355', 3, 'delivered', '03.10.2026', '10:40', MAL, 'pickup', [['Paracetamol 500mg', 60], ['Omeprazol 20mg', 30]], { delivDate: '03.10.2026', payType: 'online', ship: { driver: '—', car: '—', at: '03.10.2026 11:30', deliveredAt: '03.10.2026 11:30', receiver: "Mijoz vakili (o'zi oldi)" } }),
  O('BY-TSH-000356', 6, 'delivered', '04.10.2026', '09:15', BEK, 'pickup', [['Ibuprofen 400mg', 50], ['No-shpa 40mg', 40]], { delivDate: '04.10.2026', payType: 'online', ship: { driver: '—', car: '—', at: '04.10.2026 10:05', deliveredAt: '04.10.2026 10:05', receiver: "Mijoz vakili (o'zi oldi)" } }));
// T9-4c2: min./maks. ixtiyoriy (bo'sh — cheklov yo'q); qiymat faqat shu 7 mahsulotda
var MM_OVR = { 'Paracetamol 500mg': [10, 400], 'Demidrol 1% 1ml': [10, 300], 'Azitromitsin 500mg': [5, 150], 'Omeprazol 20mg': [10, 300], 'Ceftriaxon 1g': [10, 200], 'Insulin Actrapid HM': [1, 30], 'Ibuprofen 400mg': [10, 400] };
function mmFill() { PRODUCTS.forEach(function (p) { if (p.mmUser) return; var o = MM_OVR[p.name]; p.minQty = o ? o[0] : null; p.maxQty = o ? o[1] : null; }); }
mmFill();
ORDERS.forEach(function (o, i) { o.id = 5000 + i; o.lines.forEach(function (l, j) { l.id = o.id * 100 + j; }); });
var IDS = new WeakMap(), IDN = 0, MEMO = { key: null, map: {} }, MEMO_OFF = 0;
function idOf(a) { if (!a || typeof a !== 'object') return 0; var x = IDS.get(a); if (!x) { x = ++IDN; IDS.set(a, x); } return x; }
function depKey() { var d = store.docs || {}; return [store.v, idOf(store.orders), idOf(store.receipts), idOf(store.pays), idOf(store.mops), idOf(store.sales), (store.sales || []).length, idOf(d.qm), (d.qm || []).length, idOf(d.hc), idOf(d.qy), idOf(store.arOpen), (store.arOpen || []).length, idOf(store.closes), idOf(store.advs), idOf(store.recons), idOf(store.transfers), idOf(store.invs), idOf(store.markAdj)].join('|'); }
// Og'ir hisoblar (partiyalar, qarz, kassa) bir xil ma'lumot uchun qayta hisoblanmaydi
function memo(k, fn) { if (MEMO_OFF) return fn(); var key = depKey(); if (MEMO.key !== key) { MEMO.key = key; MEMO.map = {}; } if (!(k in MEMO.map)) MEMO.map[k] = fn(); return MEMO.map[k]; }
function bulk(fn) { MEMO_OFF++; try { return fn(); } finally { MEMO_OFF--; store.v++; } }
var BNS0 = RECEIPTS.filter(function (r) { return r.bonus && r.bonus.state === 'ok'; }).map(function (r) { return { no: r.bonus.bnsNo, branch: r.branch, supplier: r.supplier, rcNo: r.no, sum: r.bonus.sum, date: r.bonus.at.slice(0, 10), status: 'posted', by: r.bonus.by, at: r.bonus.at }; });
// Y1: seed — to'lov turi bo'sh buyurtmalarga (yetkazilgan/jo'natilganlarga naqd berilmaydi — haydovchi kassasi seed'i o'zgarmasin)
ORDERS.forEach(function (o) { if (o.payType) return; var ex = ORDERS.filter(function (x) { return x.cust === o.cust && x.branch === o.branch && x.payType; })[0], late = ['checking', 'docs', 'loading', 'ready', 'shipped', 'delivered', 'undelivered'].indexOf(o.status) >= 0, k = ex ? ex.payType : ['cash', 'online', 'bank', 'bank'][o.cust % 4]; if (late && k === 'cash') k = 'bank'; o.payType = k; });
var store = { bns: JSON.parse(JSON.stringify(BNS0)), receipts: JSON.parse(JSON.stringify(RECEIPTS)), orders: JSON.parse(JSON.stringify(ORDERS)), v: 0, notifs: [], nseq: 0, openReq: null, products: PRODUCTS };
// Filial sharti — yagona funksiya: chegirma, limit, muddat, narx turi, min. qolgan muddat faqat buyurtma filiali shartidan
// Qarz va muddati o'tgan qarz — faqat ledger'dan, shu filial bo'yicha (kechiktirilgan hisob: ledger ichidan chaqirilganda aylanma bo'lmaydi)
function custBrs(c) { return c && c.bt ? Object.keys(c.bt) : []; }
function custAt(id, br) { var c = custById(id); if (!c) return null; var b = br && c.bt && c.bt[br] ? br : null, t = b ? c.bt[b] : null;
  var o = {}; Object.keys(c).forEach(function (k) { if (k !== 'debt' && k !== 'overdue' && k !== 'overdueDays') o[k] = c[k]; }); Object.assign(o, { at: b, limit: t ? t.limit || 0 : 0, terms: t ? t.days || 0 : 0, disc: t ? t.disc || 0 : 0, minDays: t && t.minMonths ? t.minMonths * 30 : null, priceType: t ? t.price : null, brOff: !!t && t.active === false, noTerms: !t }); var Lz = null;
  var LL = function () { return Lz || (Lz = b ? debtOf('mt', id, b) : { debt: 0, overdue: 0, overdueDays: 0 }); };
  ['debt', 'overdue', 'overdueDays'].forEach(function (k) { Object.defineProperty(o, k, { get: function () { return LL()[k] || 0; }, enumerable: true, configurable: true }); });
  return o; }
function custsIn(br) { return CUSTOMERS.filter(function (c) { return !br || !!(c.bt && c.bt[br]); }); }
function custById(id) { for (var i = 0; i < CUSTOMERS.length; i++) if (CUSTOMERS[i].id === id) return CUSTOMERS[i]; return null; }
function licValid(c) { return !!(c && c.license && pD(c.license.until) >= T0); }
function zoneType(br, wh, key) { var z = zonesFor(br, wh).filter(function (x) { return x.key === key; })[0]; return z ? z : { key: key, label: key === 'jonatish' ? "Jo'natish" : key === 'sovuq' ? 'Sovuq saqlash' : key, type: key === 'jonatish' ? 'ship' : 'store' }; }
function prodById(id) { for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].id === id) return PRODUCTS[i]; return null; }
function baseBatches() {
  var all = OPEN.filter(function (o) { return !bqSeedOff('goods', o.branch, o.wh); }).concat(bqBatches());
  store.receipts.forEach(function (d) {
    if (d.status !== 'posted' && d.status !== 'accepted') return; var acc = d.status === 'accepted', fb = !!d.fromBonus;
    d.lines.forEach(function (l) { if (!l.pid) return; var q = rcGood(l), dm = rcDmg(l), bq = l.bonusQty > 0 ? l.bonusQty : 0, base = { pid: l.pid, branch: d.branch, wh: d.wh, exp: l.exp, mfg: l.mfg, reserved: 0, doc: d.no, docDate: d.date, supplier: d.supplier };
      if (q > 0) all.push(Object.assign({ id: 'R' + l.id, zone: acc ? 'qabul' : l.zone, batch: l.batch, cost: fb ? 0 : l.price, qty: q, bonus: fb }, base));
      if (dm > 0) all.push(Object.assign({ id: 'R' + l.id + 'D', zone: acc ? 'qabul' : 'karantin', batch: l.batch, cost: fb ? 0 : l.price, qty: dm, bonus: fb, damaged: true }, base));
      if (bq > 0) all.push(Object.assign({ id: 'R' + l.id + 'B', zone: acc ? 'qabul' : l.zone, batch: l.batch + '-B', cost: 0, qty: bq, bonus: true }, base)); });
  });
  return all.map(function (b) {
    var p = prodById(b.pid), z = zoneType(b.branch, b.wh, b.zone), e = pD(b.exp), days = e == null ? null : Math.round((e - T0) / DAY);
    var expired = days != null && days < 0, closedZone = z.type === 'recv' || z.type === 'quar' || z.type === 'ship';
    var closed = expired || closedZone ? b.qty : 0, reserved = 0; // band faqat buyurtmalardan
    var status = expired ? 'expired' : z.type === 'quar' ? 'quar' : z.type === 'recv' ? 'recv' : z.type === 'ship' ? 'ship' : 'open';
    return Object.assign({}, b, { p: p, zoneLabel: z.label, zoneType: z.type, days: days, closed: closed, reservedQty: reserved, avail: Math.max(0, b.qty - closed - reserved), value: b.qty * (b.cost || 0), status: status, scanned: b.scanned != null ? b.scanned : (p && p.mark ? b.qty : 0), resDocs: [] });
  });
}
function fefoPick(list, pid, br, wh, minDays) { return list.filter(function (b) { return b.pid === pid && b.branch === br && b.wh === wh && b.status === 'open' && b.days != null && b.days >= (minDays || 0) && b.avail > 0; }).sort(function (a, b) { return pD(a.exp) - pD(b.exp); }); }
function findB(list, pid, o, batch) { for (var i = 0; i < list.length; i++) { var b = list[i]; if (b.pid === pid && b.branch === o.branch && b.wh === o.wh && b.batch === batch && b.zoneType !== 'ship') return b; } return null; }
function batches() { return memo('batches', batchesRaw); }
function batchesRaw() {
  var list = baseBatches(), base0 = null;
  store.orders.forEach(function (o) {
    var part = !!(o.pk && !o.pk.end && o.pk.rw && RESERVING.indexOf(o.status) >= 0); // T9-4a: qayta yig'ish — qulflangan qatorlar Jo'natish zonasida qoladi
    if (!o.pk && o.sale) { if (pD(o.sale.at.slice(0, 10)) <= pD(BQ_CUT)) return; picksOf(o, base0 || (base0 = baseBatches())).forEach(function (x) { var b = findB(list, x.pid, o, x.batch); if (!b || !(x.qty > 0)) return; var q = Math.min(x.qty, b.qty); b.qty -= q; b.avail = Math.max(0, b.avail - q); b.value = b.qty * (b.cost || 0); if (b.closed) b.closed = Math.min(b.closed, b.qty); b.moves = (b.moves || []).concat([{ date: o.sale.at.slice(0, 10), kind: 'sale', label: 'Sotuv', no: o.sale.no, delta: -q }]); }); return; } // T11a: terish yozuvisiz seed sotuvlari ham qoldiqdan chiqadi
    if (!o.pk || (!o.pk.end && !part) || (o.pk.end && POSTPICK.indexOf(o.status) < 0 && !o.sale)) return;
    var sold = !!o.sale, pend = o.pk.end || (o.rw && o.rw.at) || o.date;
    o.pk.lines.forEach(function (pl) { if (part && !pl.locked) return; pl.picks.forEach(function (x) {
      var b = findB(list, pl.pid, o, x.batch); if (!b || !(x.qty > 0)) return; var q = Math.min(x.qty, b.qty);
      b.qty -= q; b.avail = Math.max(0, b.avail - q); b.value = b.qty * (b.cost || 0); if (b.closed) b.closed = Math.min(b.closed, b.qty);
      if (sold) { b.moves = (b.moves || []).concat([{ date: o.sale.at.slice(0, 10), kind: 'sale', label: 'Sotuv', no: o.sale.no, delta: -q }]); return; }
      b.moves = (b.moves || []).concat([{ date: pend.slice(0, 10), kind: 'pick', no: o.no, delta: -q }]);
      list.push(Object.assign({}, b, { id: b.id + '-J-' + o.no, zone: 'jonatish', zoneLabel: "Jo'natish", zoneType: 'ship', status: 'ship', qty: q, closed: q, reservedQty: 0, avail: 0, value: q * (b.cost || 0), resDocs: [], scanned: b.p && b.p.mark ? q : 0, moves: [{ date: pend.slice(0, 10), kind: 'pickIn', no: o.no, delta: q }] }));
    }); });
  });
  store.orders.forEach(function (o) {
    if (RESERVING.indexOf(o.status) < 0) return;
    if (o.pk && o.pk.end) return;
    if (o.pk) {
      o.pk.lines.forEach(function (pl) {
        if (pl.locked) return;
        if (pl.state === 'todo') { var left = pl.qty; fefoPick(list, pl.pid, o.branch, o.wh, (custAt(o.cust, o.branch) || {}).minDays).forEach(function (b) { if (left <= 0) return; var q = Math.min(left, b.avail); b.reservedQty += q; b.avail -= q; left -= q; b.resDocs.push({ no: o.no, qty: q, date: o.date }); }); return; }
        pl.picks.forEach(function (x) { var b = findB(list, pl.pid, o, x.batch); if (!b) return; var q = Math.min(x.qty, b.avail); b.reservedQty += q; b.avail -= q; b.resDocs.push({ no: o.no, qty: q, date: o.date }); });
      });
      return;
    }
    var c = custAt(o.cust, o.branch), md = c && c.minDays;
    o.lines.forEach(function (l) {
      var left = l.qty || 0;
      fefoPick(list, l.pid, o.branch, o.wh, md).forEach(function (b) { if (left <= 0) return; var q = Math.min(left, b.avail); b.reservedQty += q; b.avail -= q; left -= q; b.resDocs.push({ no: o.no, qty: q, date: o.date }); });
    });
  });
  // 12: yetkazilmagan / qaytgan tovar — Karantin zonasiga
  store.orders.forEach(function (o) {
    if (!o.ret || !o.ret.acc) return; // T9-4b: «Qaytmoqda» — Ombor mudiri qabul qilguncha zonada emas
    o.ret.lines.forEach(function (r0, k) { var f = o.ret.acc.facts && o.ret.acc.facts[k] != null ? +o.ret.acc.facts[k] : r0.qty; if (!(f > 0)) return; var r = Object.assign({}, r0, { qty: f }); pushQuar(list, o.branch, o.wh, r, 'Q-' + o.no + '-' + k, { date: o.ret.at.slice(0, 10), kind: 'ret', label: 'Qaytdi (yetkazilmadi) · Karantin', no: o.ret.trip || (o.sale && o.sale.no) || o.no, delta: r.qty }); });
  });
  // 13: mijozdan qaytarish → Karantin; hisobdan chiqarish va yetkazib beruvchiga qaytarish → qoldiqdan chiqadi
  (store.docs ? store.docs.qm : []).forEach(function (d) {
    if (d.status !== 'posted') return;
    d.lines.forEach(function (l, k) { if (l.qty > 0) pushQuar(list, d.branch, d.wh, l, d.no + '-' + k, { date: d.postedAt.slice(0, 10), kind: 'ret', label: 'Qaytarish · Karantin', no: d.no, delta: l.qty }); });
  });
  ['hc', 'qy'].forEach(function (kind) {
    (store.docs ? store.docs[kind] : []).forEach(function (d) {
      if (d.status !== 'posted') return;
      d.lines.forEach(function (l) {
        if (!(l.qty > 0) || !l.bid) return; var b = null; for (var i = 0; i < list.length; i++) if (list[i].id === l.bid) { b = list[i]; break; } if (!b) return;
        var q = Math.min(l.qty, b.qty); b.qty -= q; b.avail = Math.max(0, b.avail - q); b.closed = Math.min(b.closed, b.qty); b.value = b.qty * (b.cost || 0);
        b.moves = (b.moves || []).concat([{ date: d.postedAt.slice(0, 10), kind: 'out', label: kind === 'hc' ? 'Hisobdan chiqarish' : 'Yetkazib beruvchiga qaytarish', no: d.no, delta: -q }]);
      });
    });
  });
  // 18: ko'chirish — ZK zona ichida, OK/FS jo'natilganda chiqadi (yo'lda), qabul qilinganda kiradi
  (store.transfers || []).forEach(function (tr) { applyTr(list, tr); });
  // 19: inventarizatsiya — tasdiqlanganda farq qoldiqqa yoziladi
  (store.invs || []).forEach(function (x) { applyInv(list, x); });
  return list;
}
function trFind(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
function trOut(b, q, mv) { b.qty -= q; if (b.status === 'open') b.avail = Math.max(0, b.avail - q); b.closed = Math.min(b.closed, b.qty); b.avail = Math.min(b.avail, Math.max(0, b.qty - b.closed - b.reservedQty)); b.value = b.qty * (b.cost || 0); b.moves = (b.moves || []).concat([mv]); }
function trIn(list, src, br, wh, zone, q, id, mv) {
  var z = zoneType(br, wh, zone), expired = src.days != null && src.days < 0, cz = expired || z.type === 'recv' || z.type === 'quar' || z.type === 'ship';
  list.push(Object.assign({}, src, { id: id, branch: br, wh: wh, zone: zone, zoneLabel: z.label, zoneType: z.type, qty: q, closed: cz ? q : 0, reservedQty: 0, avail: cz ? 0 : q, value: q * (src.cost || 0), resDocs: [], scanned: src.p && src.p.mark ? q : 0, moves: [mv],
    status: expired ? 'expired' : z.type === 'quar' ? 'quar' : z.type === 'recv' ? 'recv' : 'open', doc: src.doc }));
}
function applyTr(list, tr) {
  var zk = tr.kind === 'zk', eff = zk ? tr.status === 'posted' : ['transit', 'received', 'diff'].indexOf(tr.status) >= 0; if (!eff) return;
  var day = String((zk ? tr.postedAt : tr.sentAt) || tr.date).slice(0, 10), rday = String(tr.receivedAt || '').slice(0, 10), lab = TR_LABEL[tr.kind];
  tr.lines.forEach(function (l, k) {
    if (!(l.qty > 0)) return; var b = trFind(list, l.bid); if (!b) return; var q = Math.min(l.qty, b.qty); if (!(q > 0)) return;
    trOut(b, q, { date: day, kind: 'tout', label: lab + (zk ? '' : " · yo'lda"), no: tr.no, delta: -q });
    if (zk) return trIn(list, b, tr.from.branch, tr.from.wh, l.toZone, q, 'T-' + tr.no + '-' + k, { date: day, kind: 'tin', label: lab, no: tr.no, delta: q });
    if (tr.status === 'transit') return;
    var recv = Math.min(q, l.recv || 0), diff = q - recv;
    if (recv > 0) trIn(list, b, tr.to.branch, tr.to.wh, l.toZone, recv, 'T-' + tr.no + '-' + k, { date: rday, kind: 'tin', label: lab + ' · qabul', no: tr.no, delta: recv });
    if (diff > 0 && l.reason === 'Shikastlangan') trIn(list, b, tr.to.branch, tr.to.wh, 'karantin', diff, 'TQ-' + tr.no + '-' + k, { date: rday, kind: 'tin', label: lab + ' · shikastlangan · Karantin', no: tr.no, delta: diff });
    if (l.back > 0) trIn(list, b, tr.from.branch, tr.from.wh, b.zone, l.back, 'TB-' + tr.no + '-' + k, { date: String(l.backAt || rday).slice(0, 10), kind: 'tin', label: 'Qoldiqqa qaytarildi (farq)', no: tr.no, delta: l.back });
  });
}
function pushQuar(list, br, wh, r, id, move) {
  var src = null, p = prodById(r.pid) || {}; for (var i = 0; i < list.length; i++) { var b = list[i]; if (b.pid === r.pid && b.batch === r.batch && b.branch === br && b.wh === wh && b.zoneType !== 'quar') { src = b; break; } }
  var e = pD(r.exp), days = src ? src.days : (e == null ? null : Math.round((e - T0) / DAY)), sib = src ? null : list.filter(function (b) { return b.pid === r.pid && b.cost > 0; })[0], cost = src ? src.cost : sib ? sib.cost : openCost(r.pid);
  list.push(Object.assign({ mfg: '', doc: null }, src || {}, { id: id, pid: r.pid, p: p, branch: br, wh: wh, batch: r.batch, exp: r.exp || (src && src.exp), days: days, cost: cost, zone: 'karantin', zoneLabel: 'Karantin', zoneType: 'quar', status: days != null && days < 0 ? 'expired' : 'quar', qty: r.qty, closed: r.qty, reservedQty: 0, avail: 0, value: r.qty * (cost || 0), resDocs: [], scanned: p.mark ? r.qty : 0, moves: [move] }));
}
function availFor(pid, br, wh, minDays) {
  var bs = batches().filter(function (b) { return b.pid === pid && b.branch === br && b.wh === wh && b.status === 'open' && b.days != null && b.days >= 0; });
  var all = 0, ok = 0; bs.forEach(function (b) { all += b.avail; if (!minDays || b.days >= minDays) ok += b.avail; });
  return { all: all, ok: ok };
}
function fefoPlan(pid, br, wh, qty, minDays) {
  var left = qty || 0, out = [];
  fefoPick(batches(), pid, br, wh, minDays).forEach(function (b) { if (left <= 0) return; var q = Math.min(left, b.avail); out.push({ batch: b.batch, exp: b.exp, qty: q }); left -= q; });
  return out;
}
function linePrice(l, o) { var p = prodById(l.pid); if (l.fz) return l.fz.price; if (l.price != null) return l.price; if (l.pb && o) { var sp = snapSplit(o, l); if (sp) return sp.price; } if (l.p0 != null) return l.p0; if (o && store.prices) { var x = priceFor(o, l.pid); if (x != null) return x; } return p ? basePrice(l.pid, o && o.branch) || 0 : 0; }
function orderTotals(o) {
  var c = custAt(o.cust, o.branch), d = c ? c.disc : 0, t = { lines: o.lines.length, qty: 0, gross: 0, disc: 0, vat: 0, total: 0 };
  o.lines.forEach(function (l) { var p = prodById(l.pid); if (!p) return; var F = l.fz, g = (l.qty || 0) * linePrice(l, o), ds = g * (F ? F.disc : d) / 100, n = g - ds, vr = F ? F.vat : (p.vat || 0), v = n * vr / (100 + vr); t.qty += l.qty || 0; t.gross += g; t.disc += ds; t.vat += v; t.total += n; });
  t.net = t.total - t.vat;
  ['gross', 'disc', 'vat', 'total', 'net'].forEach(function (k) { t[k] = Math.round(t[k] * 100) / 100; });
  return t;
}
// ---- 10: tasdiqlash qoidasi (sozlama) va buyurtma hayot sikli ----
var APPROVAL = { get branchMaxPct() { return CONFIG.limitBranchPct; }, get directorOverdueDays() { return CONFIG.overdueDirDays; }, get branchRoles() { return whoCan('approvals.branch'); }, get directorRoles() { return whoCan('approvals.director'); } };
var NOW = T0 + (15 * 60 + 30) * 60000, KEEPER = empNames('keeper', 'TSH')[0], DIRECTOR = empNames('director')[0];
var MANAGERS = empByBranch('branch'); // har filial rahbari — alohida xodim; rahbari yo'q filialda tasdiq Direktorga o'tadi
function pDT(s) { var a = String(s || '').split(' '), d = pD(a[0]); if (d == null) return null; var h = String(a[1] || '00:00').split(':'); return d + ((+h[0] || 0) * 60 + (+h[1] || 0)) * 60000; }
function fDT(t) { var d = new Date(t); return fD(t) + ' ' + ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); }
function addMin(s, m) { return fDT(pDT(s) + m * 60000); }
function nowStr() { return fDT(typeof store !== 'undefined' && store ? nowMs() : NOW); }
function creditCheck(o) {
  var c = custAt(o.cust, o.branch); if (!c) return { level: null, issues: [] };
  var Dq = debtOf('mt', o.cust, c.at || o.branch), t = orderTotals(o), over = Dq.debt + t.total - c.limit, pct = c.limit ? over / c.limit * 100 : 0, iss = [];
  if (c.blocked) iss.push({ k: 'blocked', text: c.blocked });
  if (over > 0) iss.push({ k: 'limit', over: over, pct: pct, danger: pct > APPROVAL.branchMaxPct });
  if (Dq.overdue > 0) iss.push({ k: 'overdue', sum: Dq.overdue, days: Dq.overdueDays, danger: Dq.overdueDays > APPROVAL.directorOverdueDays });
  var mx = maxQtyOver(o); if (mx.length) iss.push({ k: 'maxQty', items: mx, danger: false });
  var dir = (over > 0 && pct > APPROVAL.branchMaxPct) || (Dq.overdue > 0 && Dq.overdueDays > APPROVAL.directorOverdueDays) || !!c.blocked;
  return { c: c, t: t, debt: Dq.debt, overdue: Dq.overdue, days: Dq.overdueDays, over: over, pct: pct, issues: iss, level: iss.length ? (dir ? 'director' : 'branch') : null, debtAfter: Dq.debt + t.total };
}
function maxQtyOver(o) { return (o.lines || []).map(function (l) { var p = prodById(l.pid); return p && p.maxQty > 0 && l.qty > p.maxQty ? { pid: p.id, name: p.name, qty: l.qty, max: p.maxQty, unit: p.unit } : null; }).filter(Boolean); }
// T9-4c: to'lov turi — mijozning oxirgi buyurtmasidan (yo'q bo'lsa «bank»); oxirgi 5 buyurtma — tez takrorlash uchun
function ordT(o) { return pDT(o.date + ' ' + (o.time || '00:00')) || 0; }
function custRecent(cid, br, n, exceptId) { return (store.orders || []).filter(function (o) { return o.cust === cid && o.branch === br && o.id !== exceptId && o.no && ['draft', 'cancelled', 'rejected'].indexOf(o.status) < 0; }).sort(function (a, b) { return ordT(b) - ordT(a); }).slice(0, n || 5); }
function custPayDefault(cid, br) { var c = custById(cid); if (c && c.payType) return c.payType; var a = custRecent(cid, br, 20).filter(function (o) { return !!o.payType; })[0]; return a ? a.payType : 'bank'; }
var PAY_TYPES = [['cash', 'Naqd'], ['bank', 'Perechisleniye'], ['online', 'Online']];
// Y1: ochiq hujjat — tahrirlanayotgan buyurtma/kirim (sarlavha + qatorlar + holat); katalogga yoki boshqa sahifaga o'tib qaytganda shu hujjat ochiladi. Faqat xotirada
function openDocGet(kind) { var x = store.openDocs && store.openDocs[kind]; return x ? JSON.parse(JSON.stringify(x)) : null; }
function openDocSet(kind, doc, extra) { store.openDocs = store.openDocs || {}; if (!doc) { delete store.openDocs[kind]; return; } var old = store.openDocs[kind], keep = old && old.doc && old.doc.id === doc.id ? old : {}; store.openDocs[kind] = Object.assign({}, keep, extra || {}, { doc: JSON.parse(JSON.stringify(doc)), at: Date.now() }); }
// Y1: qoldiq xaritasi (buyurtma uchun) — ochiq zonadagi, muddati o'tmagan partiyalar; minDays bo'lsa ok — shu muddatdan uzoq yaroqli qism
function availMap(br, wh, md) { var m = {}; batches().forEach(function (b) { if (b.branch !== br || b.wh !== wh || b.status !== 'open' || b.days == null || b.days < 0) return; var x = m[b.pid] || (m[b.pid] = { all: 0, ok: 0, exp: '', expT: 0 }); x.all += b.avail; if (!md || b.days >= md) { x.ok += b.avail; var t = pD(b.exp); if (b.avail > 0 && t && (!x.expT || t < x.expT)) { x.expT = t; x.exp = b.exp; } } }); return m; }
// Y1: katalog qatorlari — OrderEntry/Receipts mahsulot ro'yxati va ProductPicker uchun YAGONA manba. Narx — buyurtma qatoridagi narx (QQS ichida)
function catalogRows(mode, d) { d = d || {}; var br = d.branch || 'TSH', wh = d.wh, out = [];
  if (mode === 'receipt') { var st = {}, sc = {}; batches().forEach(function (b) { if (b.branch !== br || (wh && b.wh !== wh)) return; st[b.pid] = (st[b.pid] || 0) + (b.qty || 0); if (d.supplier && b.supplier === d.supplier && b.cost > 0) { var t = pD(b.docDate) || 0, c = sc[b.pid]; if (!c || t > c.t) sc[b.pid] = { t: t, cost: b.cost, doc: b.doc }; } });
    PRODUCTS.forEach(function (p) { if (!p.active) return; var s = sc[p.id], lc = s ? null : (lastCost(p.id, br) || lastCost(p.id)); out.push({ p: p, id: p.id, stock: st[p.id] || 0, cost: s ? s.cost : lc ? lc.cost : 0, costSrc: s ? 'sup' : lc ? 'last' : null, costDoc: s ? s.doc : lc ? lc.doc : null, vat: vatOf(p.id) }); }); return out; }
  var c = d.cust ? custAt(d.cust, br) : null, md = (c && c.minDays) || 0, AV = availMap(br, wh, md);
  PRODUCTS.forEach(function (p) { if (!p.active) return; var a = AV[p.id] || { all: 0, ok: 0, exp: '' }, pi = priceInfo(d, p.id), pr = pi ? pi.price : basePrice(p.id, br);
    out.push({ p: p, id: p.id, avail: md ? a.ok : a.all, availAll: a.all, exp: a.exp, price: pr, hasPrice: !!pi, ptype: pi ? pi.type : null, fallback: pi ? pi.fallback || null : null, minQty: p.minQty || 0, maxQty: p.maxQty || 0, minDays: md }); }); return out; }
function payTypeName(k) { var x = PAY_TYPES.filter(function (p) { return p[0] === k; })[0]; return x ? x[1] : 'Perechisleniye'; }
function mlnS(n) { return (Math.round(n / 1e5) / 10).toFixed(1).replace('.', ',') + ' mln'; }
function lvlName(l) { return l === 'director' ? 'Direktor' : 'Filial rahbari'; }
function apprReasonsOf(cr) { if (!cr || !cr.issues) return []; var out = []; cr.issues.forEach(function (i) {
    if (i.k === 'limit') out.push('Limitdan ' + mlnS(i.over) + ' oshadi');
    else if (i.k === 'overdue') out.push("Muddati o'tgan qarz " + mlnS(i.sum) + ' (' + i.days + ' kun)');
    else if (i.k === 'maxQty') i.items.forEach(function (m) { out.push(m.name + ': ' + m.qty + ' ' + (m.unit || 'dona') + ' — maks. ' + m.max); });
    else if (i.k === 'blocked') out.push('Mijoz bloklangan: ' + i.text); });
  return out; }
// Yagona tekshiruv (UI va ma'lumot qatlami): xatolar — yuborib bo'lmaydi; cr.level — tasdiq kerak
function orderCheck(o) { var err = [], c = o && o.cust ? custAt(o.cust, o.branch) : null, kb = c ? ktOrderBlock(c, o.branch) : null;
  if (!c) err.push({ k: 'cust', text: 'Mijoz tanlanmagan' }); else if (kb) err.push({ k: 'custBlock', text: kb.k === 'blocked' ? 'Mijoz bloklangan: ' + kb.text : 'Mijozga buyurtma kiritib bo\'lmaydi (' + kb.k + ')' });
  if (!o || !o.lines || !o.lines.length) err.push({ k: 'noLines', text: "Qator yo'q" });
  var seen = {}; (o && o.lines || []).forEach(function (l) { var p = prodById(l.pid); if (!p) { err.push({ k: 'noProd', lid: l.id, text: 'Mahsulot tanlanmagan' }); return; }
    var q = seen[p.id] = (seen[p.id] || 0) + (l.qty || 0), av = availFor(p.id, o.branch, o.wh, c && c.minDays), lim = c && c.minDays ? av.ok : av.all;
    if (!(l.qty > 0)) err.push({ k: 'qty', lid: l.id, pid: p.id, text: p.name + ': miqdor kiritilmagan' });
    else if (q > lim) err.push({ k: 'stock', lid: l.id, pid: p.id, avail: lim, text: p.name + ': ' + q + ' > mavjud ' + lim });
    else if (p.minQty > 0 && l.qty < p.minQty) err.push({ k: 'min', lid: l.id, pid: p.id, text: p.name + ': ' + l.qty + ' < min. ' + p.minQty });
    if (l.p0 == null && l.price == null && priceFor(o, p.id) == null) err.push({ k: 'price', lid: l.id, pid: p.id, text: p.name + ': narx yo\'q' });
    if (p.ctrl && c && !licValid(c)) err.push({ k: 'ctrl', lid: l.id, pid: p.id, text: p.name + ': litsenziya talab qilinadi' }); });
  var cr = c && !err.some(function (e) { return e.k === 'cust' || e.k === 'custBlock'; }) ? creditCheck(o) : { level: null, issues: [] };
  return { errors: err, cr: cr, level: cr.level, reasons: apprReasonsOf(cr) }; }
// Yuborish: xato bo'lsa — rad (qoralama o'zgarmaydi); tasdiq kerak — «Tasdiqlashda», aks holda «Navbatda» (zahira + bildirishnoma)
function submitOrder(x, who, note) { var chk = orderCheck(x); if (chk.errors.length) return { err: chk.errors };
  var n = JSON.parse(JSON.stringify(x)), prev = orderById(n.id), at = nowStr(); delete n.demo; if (!n.no) n.no = (prev && prev.no) || nextOrderNo(n.branch); // Y3: bir xil id — raqam qayta berilmaydi (bo'shliq bo'lmasin) if (!n.payType) n.payType = custPayDefault(n.cust, n.branch);
  var log = (prev ? orderLog(prev) : [{ kind: 'create', who: n.op, at: n.date + ' ' + (n.time || at.slice(11)) }]).slice();
  if (chk.level) { n.status = 'pending'; n.mgrNote = String(note || '').trim(); n.apprReasons = chk.reasons; log.push({ kind: 'send', who: who, at: at, level: chk.level, note: n.mgrNote, reasons: chk.reasons }); }
  else { n.status = 'queued'; log.push({ kind: 'confirm', who: who, at: at }); }
  n.log = log; setOrders(store.orders.filter(function (o) { return o.id !== n.id; }).concat([n])); var saved = orderById(n.id);
  if (n.status === 'queued') queueNotify(saved);
  return { ok: true, o: saved, status: n.status, level: chk.level, reasons: chk.reasons, approver: chk.level ? approverName(n, chk.level) : null }; }
var DRAFT_CANCEL = ['Mijoz fikridan qaytdi', 'Takroriy qoralama', 'Narx kelishilmadi', "Mahsulot yo'q", 'Boshqa'];
function cancelDraft(id, who, reason) { var o = orderById(id); if (!o || o.status !== 'draft') return null; var at = nowStr(); updOrders([id], function (n) { n.status = 'cancelled'; n.reason = reason; n.canc = { by: who, at: at, from: 'draft' }; n.log.push({ kind: 'cancel', who: who, at: at, reason: reason, fromDraft: true }); }); store.v++; return orderById(id); }
function canApprove(level, role) { return can(role, level === 'director' ? 'approvals.director' : 'approvals.branch'); }
function branchLead(br) { var e = (store.emps || []).filter(function (x) { return can(x.role, 'approvals.branch') && x.branch === br && x.status !== 'blocked'; })[0]; return e ? e.first + ' ' + e.last : (MANAGERS[br] || null); } // 1a: filial rahbari — xodimlar ro'yxatidan
function approverName(o, level) { return level === 'director' ? DIRECTOR : (branchLead(o.branch) || DIRECTOR); }
// T11b: «Hozir kimda» — band bo'lsa aniq xodim, bo'lmasa rol (role kaliti); yakuniy holatlarda — null
function holderOf(o) { if (!o) return null; var st = o.status, R = function (who, role) { return { who: who || '', role: role }; };
  if (st === 'draft') return R(o.op, 'operator');
  if (st === 'pending') { var sl = orderLog(o).filter(function (e) { return e.kind === 'send'; }).pop(), lv = (sl && sl.level) || (creditCheck(o) || {}).level || 'branch'; return R(approverName(o, lv), lv === 'director' ? 'director' : 'branch'); }
  if (st === 'queued') return R('', 'keeper');
  if (st === 'checking' || st === 'docs') return R((st === 'checking' && checkerOf(o)) || empNames('keeper', o.branch)[0] || '', 'keeper');
  if (st === 'picking') return R(pickerOf(o), 'picker');
  if (st === 'marking') return R(markerOf(o), 'marker');
  if (st === 'loading' || st === 'shipped') { var t = tripOfAny(o.id), dr = t ? driverById(t.driver) : null; return R((dr && dr.name) || (st === 'shipped' && o.ship && o.ship.driver !== '—' ? o.ship.driver : ''), 'driver'); }
  return null; }
function genLog(o) {
  var at = o.date + ' ' + (o.time || '09:00'), L = [{ kind: 'create', who: o.op, at: at }], st = o.status, cr = (st === 'pending' || o.viaAppr || o.rej) ? creditCheck(o) : null;
  if (st === 'draft') return L;
  var sendAt = addMin(at, 2), lvl = cr && cr.level || 'branch';
  if (st === 'pending' || o.viaAppr || o.rej) L.push({ kind: 'send', who: o.op, at: sendAt, level: lvl, note: o.mgrNote || '' });
  if (st === 'pending') return L;
  if (st === 'rejected') { L.push({ kind: 'reject', who: (o.rej && o.rej.by) || approverName(o, lvl), at: (o.rej && o.rej.at) || addMin(sendAt, 90), reason: o.reason || '' }); return L; }
  var conf = o.appr ? o.appr.at : o.viaAppr ? addMin(sendAt, 60) : addMin(at, 3);
  L.push({ kind: o.viaAppr ? 'approve' : 'confirm', who: o.appr ? o.appr.by : o.viaAppr ? approverName(o, lvl) : o.op, at: conf });
  if (st === 'cancelled') { L.push({ kind: 'cancel', who: (o.canc && o.canc.by) || o.op, at: (o.canc && o.canc.at) || addMin(conf, 60), reason: o.reason || '', released: true }); return L; }
  if (o.tm) L.push({ kind: 'time', who: o.tm.by, at: o.tm.at, pickMin: o.tm.pickMin, markMin: o.tm.markMin });
  if (st === 'queued') return L;
  var ps = o.pickStart || addMin(conf, 45), pkr = o.picker || KEEPER; L.push({ kind: 'pickStart', who: pkr, at: ps });
  (o.issues || []).forEach(function (x) { L.push({ kind: 'issue', who: x.by, at: x.at, reason: x.reason, note: x.note || '' }); });
  if (st === 'picking') return L;
  var pe = o.pickEnd || addMin(ps, 30), spm = Math.round((pDT(pe) - pDT(ps)) / 60000); L.push({ kind: 'picked', who: pkr, at: pe, spent: o.tm ? spm : null, diff: o.tm ? o.tm.pickMin - spm : null });
  if (st === 'marking') return L;
  if (o.mk && o.mk.start && !o.mk.none) L.push({ kind: 'markStart', who: o.mk.by, at: o.mk.start });
  L.push({ kind: 'marked', who: (o.mk && o.mk.by) || MARKER || KEEPER, at: (o.mk && o.mk.end) || addMin(pe, 10), spent: o.mk ? o.mk.spent : null, diff: o.mk ? o.mk.diff : null });
  if (o.chk && o.chk.start) L.push({ kind: 'checkStart', who: o.chk.by, at: o.chk.start });
  if (st === 'checking') return L;
  if (o.chk && o.chk.end) L.push({ kind: 'checked', who: o.chk.by, at: o.chk.end, places: o.chk.places });
  if (o.dc && o.dc.at) L.push({ kind: 'docTrip', who: o.dc.by, at: o.dc.at, note: (o.dc.trip ? o.dc.trip + ' · ' : '') + (o.dc.nak || '') });
  if (st === 'docs') return L;
  if (o.dc && o.dc.done) L.push({ kind: 'documented', who: o.dc.by, at: o.dc.done });
  if (st === 'ready' || st === 'loading') return L;
  var sh = o.ship || {}; L.push({ kind: 'shipped', who: sh.driver && sh.driver !== '—' ? sh.driver : KEEPER, at: sh.at || addMin(ps, 120) });
  if (st === 'delivered') L.push({ kind: 'delivered', who: sh.receiver || o.op, at: sh.deliveredAt || addMin(sh.at || ps, 150) });
  return L;
}
function orderLog(o) { return o.log || genLog(o); }
function waitMin(o) { var s = orderLog(o).filter(function (e) { return e.kind === 'send'; }).pop(); var t = s ? pDT(s.at) : pDT(o.date + ' ' + o.time); return Math.max(0, Math.round((NOW - t) / 60000)); }
function shortOf(o, l) { if (o.pk) { var pl = o.pk.lines.filter(function (x) { return x.pid === l.pid; })[0]; return pl && pl.state === 'short' ? Math.max(0, pl.qty - pl.found) : 0; } var p = prodById(l.pid); return (o.short && p && o.short[p.name]) || 0; }
function picksOf(o, base0) {
  if (o.pk) { var out2 = []; o.pk.lines.forEach(function (pl, li) { var p = prodById(pl.pid); pl.picks.forEach(function (x, k) { if (!(x.qty > 0)) return; var src = pl.plan.filter(function (y) { return y.batch === x.batch; })[0] || pl.plan[0] || {}; out2.push({ pid: pl.pid, p: p, batch: x.batch, exp: x.exp || src.exp, zone: o.pk.end || pl.locked ? "Jo'natish" : zoneType(o.branch, o.wh, pl.zone).label, qty: x.qty, mark: p && p.mark ? mkGotB(o, li, x.batch) + '/' + x.qty : null, dev: k === 0 && pl.dev ? pl.dev.reason + ' · ' + pl.dev.by : null }); }); }); return out2; }
  var st = o.status, idx = ['picking', 'marking', 'checking', 'docs', 'loading', 'ready', 'shipped', 'delivered'].indexOf(st); if (idx < 0) return [];
  var base = base0 || baseBatches(), out = [], n = st === 'picking' ? (o.pickedLines != null ? o.pickedLines : Math.ceil(o.lines.length / 2)) : o.lines.length, c = custAt(o.cust, o.branch);
  o.lines.slice(0, n).forEach(function (l) {
    var p = prodById(l.pid), left = (l.qty || 0) - shortOf(o, l), list = fefoPick(base, l.pid, o.branch, o.wh, c && c.minDays), dev = o.fefoDev && p && o.fefoDev.name === p.name;
    if (dev && list.length > 1) list = list.slice(1);
    list.forEach(function (b, i) { if (left <= 0) return; var q = Math.min(left, b.qty); out.push({ pid: l.pid, p: p, batch: b.batch, exp: b.exp, zone: idx >= 6 ? '—' : "Jo'natish", qty: q, mark: p && p.mark ? q + '/' + q : null, dev: dev && i === 0 ? o.fefoDev.reason : null }); left -= q; });
  });
  return out;
}
// Mijoz moliyasi — faqat ledger va to'lovlardan: kechikish taqsimoti, oylik o'rtacha kechikish, oxirgi to'lovlar
function custFin(c) { var br = c.at || custBrs(c)[0], Dq = debtOf('mt', c.id, br), a = Dq.aging, B = [r2(a[0] + a[1]), a[2], a[3], a[4]];
  var L = ledger('mt', c.id, br), M = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'], t0 = new Date(T0), months = [];
  for (var i = 6; i >= 1; i--) { var d = new Date(Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth() - i, 1)); months.push({ y: d.getUTCFullYear(), m: d.getUTCMonth(), s: 0, n: 0 }); }
  L.invoices.forEach(function (x) { var due = pD(x.due); (x.pays || []).forEach(function (p) { var pd = pD(p.date), dt = new Date(pd), mo = months.filter(function (q) { return q.y === dt.getUTCFullYear() && q.m === dt.getUTCMonth(); })[0]; if (!mo) return; mo.s += Math.max(0, Math.round((pd - due) / DAY)); mo.n++; }); });
  var delays = months.map(function (q) { return { m: M[q.m], d: q.n ? Math.round(q.s / q.n) : 0 }; }), withN = months.filter(function (q) { return q.n; });
  var avg = withN.length ? Math.round(withN.reduce(function (s, q) { return s + q.s / q.n; }, 0) / withN.length) : 0, ML = { cash: 'Naqd', bank: 'Perechisleniye', online: 'Online', card: 'Online', click: 'Click', payme: 'Payme' };
  var pays = (store.pays || []).filter(function (p) { return p.kind === 'mt' && p.party === c.id && p.branch === br && p.status === 'posted'; }).sort(function (x, y) { return pD(y.date) - pD(x.date) || (x.no < y.no ? 1 : -1); }).slice(0, 5).map(function (p) { return { date: p.date, sum: p.sum, method: ML[p.method] || p.method }; });
  return { aging: B, delays: delays, avgDelay: avg, pays: pays, debt: Dq.debt, overdue: Dq.overdue, overdueDays: Dq.overdueDays }; }
function notify(to, kind, icon, text, orderId, href) { store.notifs.unshift({ id: 'n' + (++store.nseq), to: to, kind: kind, icon: icon, text: text, time: nowStr().slice(11), orderId: orderId, href: href || null }); }
function orderAct(id, act, who, x) {
  x = x || {};
  // T12a: qoralamaga qaytarish — faqat «Tasdiqlashda» holatidan, tasdiqlovchi tomonidan, sabab majburiy. Navbatda va keyingi holatlarda — faqat bekor qilish yoki «Yig'ishga qaytarish» (checkReturn)
  if (act === 'return') { var o0 = orderById(id), e0 = empByName(who), lv0 = o0 ? ((creditCheck(o0) || {}).level || 'branch') : 'branch';
    if (!o0 || o0.status !== 'pending' || !String(x.note || '').trim() || (e0 && !canApprove(lv0, e0.role) && !can(e0.role, 'approvals.branch'))) return null; }
  var a = store.orders.map(function (o) { if (o.id !== id) return o; var n = JSON.parse(JSON.stringify(o)); n.log = orderLog(o).slice(); var at = nowStr();
    if (act === 'approve') { n.status = 'queued'; n.viaAppr = true; n.appr = { by: who, at: at }; n.log.push({ kind: 'approve', who: who, at: at, note: x.note || '' }); n.decidedAt = at; }
    if (act === 'reject') { n.status = 'rejected'; n.reason = x.reason; n.rej = { by: who, at: at }; n.log.push({ kind: 'reject', who: who, at: at, reason: x.reason }); n.decidedAt = at; }
    if (act === 'return') { var was = n.status; n.status = 'draft'; n.returned = { by: who, at: at, note: x.note || '' }; n.log.push({ kind: 'return', who: who, at: at, note: x.note || '', released: was !== 'pending' }); n.decidedAt = was === 'pending' ? at : n.decidedAt; n.decidedAs = was === 'pending' ? 'return' : n.decidedAs; }
    if (act === 'cancel') { var w2 = n.status; n.status = 'cancelled'; n.reason = x.reason; n.canc = { by: who, at: at, from: w2 }; n.log.push({ kind: 'cancel', who: who, at: at, reason: x.reason, released: RESERVING.indexOf(w2) >= 0 });
      if (n.mk && n.mk.codes) n.mk.codes.forEach(function (c) { if (!c.rm) c.rm = { at: at, by: who, reason: 'Buyurtma bekor qilindi', rel: true }; }); } // T9-4a: kodlar bo'shaydi (tarixda qoladi), tovar saqlash zonasiga qaytadi
    return n; });
  store.orders = a; store.v++;
  var res = a.filter(function (o) { return o.id === id; })[0];
  if (act === 'approve' && res) queueNotify(res);
  if (act === 'cancel' && res) tripDrop(id, who);
  return res;
}
// ---- 11 / T9-1: yig'ish — buyurtma kartochkasida (terish sahifalari olib tashlandi) ----
var PICK = { zoneOrder: { asosiy: 0, seyf: 1, sovuq: 2 } };
function zoneRank(z) { return PICK.zoneOrder[z] != null ? PICK.zoneOrder[z] : 0; }
function pickPlan(o) {
  var list = batches(), c = custAt(o.cust, o.branch) || {};
  return o.lines.map(function (l, i) {
    var plan = list.filter(function (b) { return b.pid === l.pid && b.resDocs.some(function (r) { return r.no === o.no; }); }).sort(function (a, b) { return pD(a.exp) - pD(b.exp); })
      .map(function (b) { return { batch: b.batch, exp: b.exp, days: b.days, zone: b.zone, qty: b.resDocs.filter(function (r) { return r.no === o.no; }).reduce(function (s, r) { return s + r.qty; }, 0) }; });
    if (!plan.length) plan = fefoPick(list, l.pid, o.branch, o.wh, c.minDays).slice(0, 1).map(function (b) { return { batch: b.batch, exp: b.exp, days: b.days, zone: b.zone, qty: l.qty }; });
    var z = plan[0] ? plan[0].zone : 'asosiy';
    return { i: i, pid: l.pid, qty: l.qty || 0, zone: z, plan: plan, state: 'todo', found: 0, picks: [], reason: '', dev: null, codes: [], manual: false };
  }).sort(function (a, b) { return zoneRank(a.zone) - zoneRank(b.zone) || a.i - b.i; });
}
function pkFull(pl) { return pl.plan.map(function (x) { return { batch: x.batch, qty: x.qty }; }); }
function ensurePk(o) {
  if (o.pk) return o.pk;
  var lines = pickPlan(o), n = o.pickedLines || 0;
  lines.forEach(function (pl, k) { if (k < n) { pl.state = 'done'; pl.found = pl.qty; pl.picks = pkFull(pl); var p = prodById(pl.pid); if (p && p.mark) pl.codes = new Array(pl.qty).fill(0).map(function (_, j) { return 'C' + o.no.slice(-3) + pl.i + '-' + j; }); } });
  return { by: o.picker || KEEPER, start: o.pickStart || nowStr(), paused: !!o.paused, lines: lines };
}
function pickUpdate(id, fn) { var res = null; store.orders = store.orders.map(function (o) { if (o.id !== id) return o; var n = JSON.parse(JSON.stringify(o)); n.log = orderLog(o).slice(); fn(n); res = n; return n; }); store.v++; return res; }
function nowMs() { return NOW + (store.clk || 0) * 60000 + Math.max(0, Date.now() - (store.t0 || Date.now())); } // T9-2: demo soat + real o'tgan vaqt (taymer soniyalari)
function clkAdd(m) { store.clk = (store.clk || 0) + m; store.v++; return store.clk; } // demo soat: vaqtni oldinga surish
function resOf(b, no) { return b.resDocs.filter(function (r) { return r.no === no; }).reduce(function (s, r) { return s + r.qty; }, 0); }
// FEFO taklifi = zahira (batchesRaw: muddati eng yaqin, sotuvga ochiq zona, mijozning min. muddati)
function queueRes(o) { var bs = batches();
  return o.lines.map(function (l, li) { var lk = o.pk && o.pk.rw ? o.pk.lines.filter(function (x) { return x.i === li && x.locked; })[0] : null;
    if (lk) { var q0 = lk.picks.reduce(function (s, x) { return s + (x.qty || 0); }, 0); return { pid: l.pid, qty: q0, ordered: l.qty || 0, plan: lk.picks.map(function (x) { return { batch: x.batch, exp: x.exp, zone: 'jonatish', zoneLabel: "Jo'natish", qty: x.qty }; }), reserved: q0, short: 0, locked: true }; } var plan = bs.filter(function (b) { return b.pid === l.pid && b.branch === o.branch && b.wh === o.wh && resOf(b, o.no) > 0; }).sort(function (a, b) { return pD(a.exp) - pD(b.exp); })
      .map(function (b) { return { batch: b.batch, exp: b.exp, days: b.days, zone: b.zone, zoneLabel: b.zoneLabel, qty: resOf(b, o.no) }; }), got = plan.reduce(function (s, x) { return s + x.qty; }, 0);
    return { pid: l.pid, qty: l.qty || 0, plan: plan, reserved: got, short: Math.max(0, (l.qty || 0) - got) }; }); }
function pickAlts(o, pid) { var c = custAt(o.cust, o.branch) || {};
  return batches().filter(function (b) { return b.pid === pid && b.branch === o.branch && b.wh === o.wh && b.status === 'open' && b.days != null && b.days >= (c.minDays || 0); })
    .map(function (b) { return { batch: b.batch, exp: b.exp, days: b.days, zone: b.zone, zoneLabel: b.zoneLabel, free: b.avail + resOf(b, o.no) }; }).sort(function (a, b) { return pD(a.exp) - pD(b.exp); }); }
function queueNotify(o) { if (!o || o.status !== 'queued') return; var c = custById(o.cust) || {}, seen = {};
  (store.emps || []).forEach(function (e) { var nm = e.first + ' ' + e.last; if (seen[nm] || e.status === 'blocked' || (e.branch && e.branch !== o.branch) || !can(e.role, 'orders.queue')) return; seen[nm] = 1; notify(nm, 'warning', 'timer', o.no + ' · ' + (c.name || '') + (o.rw && !o.rw.done ? " — qayta yig'ish, yangi vaqt berilishi kutilmoqda" : " — vaqt berilishi kutilmoqda"), o.id, rlHome(e.role) === 'whmanager' ? '#home?tab=time' : null); }); }
// Vaqt berish (orders.queue): ikkala qiymat majburiy, daqiqada; yig'ish boshlanguncha o'zgartiriladi — tarixga yoziladi
function setQueueTime(id, pm, mm, who) { var o = store.orders.filter(function (x) { return x.id === id; })[0]; if (!o || o.status !== 'queued' || !(pm > 0) || !(mm > 0)) return null;
  return pickUpdate(id, function (n) { var at = nowStr(), pv = n.tm; n.tm = { pickMin: pm, markMin: mm, by: who, at: at, hist: ((pv && pv.hist) || []).concat(pv ? [{ pickMin: pv.pickMin, markMin: pv.markMin, by: pv.by, at: pv.at }] : []) };
    n.log.push({ kind: pv ? 'timeEdit' : 'time', who: who, at: at, pickMin: pm, markMin: mm, from: pv ? pv.pickMin + ' / ' + pv.markMin : '' }); }); }
function pickerOf(o) { return o ? (o.pk && o.pk.by) || o.picker || '' : ''; }
function activePickOf(who, br) { return store.orders.filter(function (o) { return o.status === 'picking' && (!br || o.branch === br) && pickerOf(o) === who; })[0] || null; }
function startPick(id, who) { var o = store.orders.filter(function (x) { return x.id === id; })[0]; if (!o || o.status !== 'queued' || !o.tm || activePickOf(who, o.branch)) return null;
  return pickUpdate(id, function (n) { n.status = 'picking';
    if (n.pk && n.pk.rw) { var fr = pickPlan(n); n.pk.lines.forEach(function (pl) { if (pl.locked) return; var f = fr.filter(function (x) { return x.i === pl.i; })[0]; if (f) { pl.plan = f.plan; pl.zone = f.zone; } }); n.pk.by = who; n.pk.start = nowStr(); n.pk.paused = false; }
    else n.pk = { by: who, start: nowStr(), paused: false, lines: pickPlan(n) };
    n.log.push({ kind: 'pickStart', who: who, at: n.pk.start, rw: n.rw && !n.rw.done ? n.rw.n : null }); }); }
// «Yig'ildi»: ch[i] = { batch, reason } — boshqa partiyadan olingan qator; qolganlari taklif qilingan partiyadan
function finishPick(id, who, ch) { ch = ch || {};
  return pickUpdate(id, function (n) { n.pk = ensurePk(n); var at = nowStr(), devs = [];
    n.pk.lines.forEach(function (pl, k) { if (pl.locked) return; var x = ch[k], p = prodById(pl.pid) || {};
      if (x && x.batch) { var a = pickAlts(n, pl.pid).filter(function (b) { return b.batch === x.batch; })[0] || {}, f = pl.plan[0] || {}, q = Math.min(pl.qty, a.free != null ? a.free : pl.qty);
        pl.picks = [{ batch: x.batch, exp: a.exp, qty: q }]; pl.zone = a.zone || pl.zone; pl.dev = { reason: x.reason || '', by: who, at: at, from: f.batch || '', to: x.batch, later: !!(f.exp && pD(a.exp) > pD(f.exp)) };
        devs.push(pl); n.log.push({ kind: 'pickDev', who: who, at: at, product: p.name, from: f.batch || '—', to: x.batch, reason: x.reason || '' }); }
      else if (pl.state === 'todo' || !pl.picks.length) pl.picks = pkFull(pl);
      var got = pl.picks.reduce(function (s, y) { return s + (y.qty || 0); }, 0); pl.found = got; pl.state = got < pl.qty ? 'short' : 'done'; if (got < pl.qty && !pl.reason) pl.reason = 'Qoldiq yetmadi'; });
    n.pk.end = at; n.status = 'marking'; var sp = Math.max(0, Math.round((pDT(at) - pDT(n.pk.start)) / 60000)); n.pk.spent = sp; n.pk.diff = n.tm && n.tm.pickMin != null ? n.tm.pickMin - sp : null;
    if (devs.length) { var p0 = prodById(devs[0].pid); n.fefoDev = { name: p0 ? p0.name : '', reason: devs[0].dev.reason || 'Boshqa partiya' }; }
    n.log.push({ kind: 'picked', who: who, at: at, spent: sp, diff: n.pk.diff }); }); }
// T9-2: «Muammo bor» — taymer to'xtamaydi; orders.queue egalariga xabar
var PICK_ISSUES = ['short', 'nobatch', 'damaged', 'other'];
function notifyPerm(perm, br, kind, icon, text, oid, tab) { var seen = {}; (store.emps || []).forEach(function (e) { var nm = e.first + ' ' + e.last; if (seen[nm] || e.status === 'blocked' || (e.branch && e.branch !== br) || !can(e.role, perm)) return; seen[nm] = 1; notify(nm, kind, icon, text, oid, tab && rlHome(e.role) === 'keeper' ? '#home?tab=' + tab : null); }); } // T9-4a: Ombor mudiri — xabar panel yorlig'iga olib boradi
function pickIssue(id, who, reason, note, label) { var o = store.orders.filter(function (x) { return x.id === id; })[0]; if (!o || o.status !== 'picking') return null;
  var n = pickUpdate(id, function (n) { var at = nowStr(), x = { reason: reason, note: note || '', by: who, at: at }; n.issues = (n.issues || []).concat([x]); n.log.push({ kind: 'issue', who: who, at: at, reason: reason, note: note || '' }); });
  var c = custById(o.cust) || {}; notifyPerm('orders.queue', o.branch, 'danger', 'triangle-alert', o.no + ' · ' + (c.name || '') + ' — ' + (label || reason) + (note ? ': ' + note : '') + ' (' + who + ')', o.id, 'issues'); return n; }
// Yakunlangan yig'ishlar (vaqt berilgan, T9 oqimi): sana bo'yicha
function pickDone(br, day, who) { var out = []; store.orders.forEach(function (o) { if (br && br !== 'ALL' && o.branch !== br) return; var nAtt = (o.att || []).length;
    (o.att || []).forEach(function (a) { var pk = a.pk; if (!a.tm || !pk || !pk.end || pk.end.slice(0, 10) !== day || (who && pk.by !== who)) return; out.push({ o: o, by: pk.by, start: pk.start, end: pk.end, spent: pk.spent, diff: pk.diff, late: pk.diff < 0, issues: 0, given: a.tm.pickMin, att: a.k, rwN: a.k > 1 ? (o.att[a.k - 2] || {}).chk && o.att[a.k - 2].chk.lines.length : 0 }); });
    var pk = o.pk; if (!o.tm || !pk || !pk.end || !pk.start || pk.end.slice(0, 10) !== day || (who && pk.by !== who)) return; var t = pickTimer(o);
    out.push({ o: o, by: pk.by, start: pk.start, end: pk.end, spent: t.spent, diff: t.diff, late: t.diff < 0, issues: nAtt ? 0 : (o.issues || []).length, given: o.tm.pickMin, att: nAtt + 1, rwN: nAtt ? o.att[nAtt - 1].chk.lines.length : 0 }); });
  return out.sort(function (a, b) { return pDT(b.end) - pDT(a.end); }); }
function pickStats(br, from, to) { var a = pD(from), b = pD(to), days = []; for (var t = a; t <= b; t += DAY) days.push(fD(t)); var rows = [].concat.apply([], days.map(function (dd) { return pickDone(br, dd); })), by = {};
  rows.forEach(function (r) { var g = by[r.by] || (by[r.by] = { name: r.by, n: 0, onTime: 0, late: 0, lateMin: 0, spentSum: 0, issues: 0, rows: [] }); g.n++; if (r.late) { g.late++; g.lateMin += -r.diff; } else g.onTime++; g.spentSum += r.spent; g.rows.push(r); });
  store.orders.forEach(function (o) { (o.issues || []).forEach(function (x) { if (x.stage === 'mark' || (br && br !== 'ALL' && o.branch !== br) || days.indexOf(x.at.slice(0, 10)) < 0) return; var g = by[x.by] || (by[x.by] = { name: x.by, n: 0, onTime: 0, late: 0, lateMin: 0, spentSum: 0, issues: 0, rows: [] }); g.issues++; }); });
  return Object.keys(by).map(function (k) { var g = by[k]; g.avg = g.n ? Math.round(g.spentSum / g.n) : null; return g; }).sort(function (x, y) { return y.n - x.n || x.name.localeCompare(y.name); }); }
// ---- T9-3: markirovka (Markirovkachi paneli) ----
// Mock 2D kod (GS1 DataMatrix ma'nosida): (01) GTIN 14 · (21) seriya 8 · <GS> (17) yaroqlilik YYMMDD · (10) partiya · <GS> (91) tur: Q — quti, D — dona
var MK_ISSUES = ['unread', 'damaged', 'short', 'other'];
function mkKind(p) { return p && p.unit === 'qadoq' ? 'box' : 'unit'; }
function mkParse(raw) { var s = String(raw || '').replace(/<GS>|\u001d|[\s()]/gi, '').toUpperCase(), m = /^01(\d{14})21([0-9A-Z]{8})17(\d{6})10(.+)91([QD])$/.exec(s); return m ? { flat: s, gtin: m[1], serial: m[2], exp6: m[3], batch: m[4], kind: m[5] === 'Q' ? 'box' : 'unit' } : null; }
function mkFlat(c) { return String(c || '').replace(/\u001d/g, ''); }
function mkPretty(c) { var x = mkParse(c); return x ? '(01)' + x.gtin + '(21)' + x.serial + '(17)' + x.exp6 + '(10)' + x.batch + '(91)' + (x.kind === 'box' ? 'Q' : 'D') : String(c || ''); }
function orderById(id) { return store.orders.filter(function (x) { return x.id === id; })[0] || null; }
function mkLines(o) { if (!o || !o.pk) return []; var used = {}; ((o.mk && o.mk.codes) || []).forEach(function (c) { if (!c.rm) { used[c.li] = (used[c.li] || 0) + 1; used[c.li + '|' + c.batch] = (used[c.li + '|' + c.batch] || 0) + 1; } });
  return o.pk.lines.map(function (pl, k) { var p = prodById(pl.pid) || {}, picks = (pl.picks || []).filter(function (x) { return x.qty > 0; }), q = picks.reduce(function (a, x) { return a + x.qty; }, 0);
    return { li: k, pid: pl.pid, p: p, mark: !!p.mark, kind: mkKind(p), qty: q, need: p.mark ? q : 0, got: used[k] || 0, picks: picks.map(function (x) { return { batch: x.batch, exp: x.exp, qty: x.qty, got: used[k + '|' + x.batch] || 0 }; }), batches: picks.map(function (x) { return x.batch; }), dev: pl.dev || null, locked: !!pl.locked }; })
    .filter(function (l) { return l.qty > 0; }); }
function mkSum(o) { var ls = mkLines(o), r = { lines: ls.length, markLines: 0, plain: 0, box: 0, unit: 0, gBox: 0, gUnit: 0, need: 0, got: 0 }; ls.forEach(function (l) { if (!l.mark) { r.plain++; return; } r.markLines++; r.need += l.need; r.got += Math.min(l.got, l.need); if (l.kind === 'box') { r.box += l.need; r.gBox += l.got; } else { r.unit += l.need; r.gUnit += l.got; } }); return r; }
function mkUsed(skip) { var m = {}; store.orders.forEach(function (o) { ((o.mk && o.mk.codes) || []).forEach(function (c) { if (!c.rm) m[c.c] = o.no; }); }); return m; }
function markerOf(o) { return (o && o.mk && o.mk.by) || ''; }
function activeMarkOf(who, br) { return store.orders.filter(function (o) { return o.status === 'marking' && o.mk && !o.mk.end && o.mk.by === who && (!br || o.branch === br); })[0] || null; }
function mkReg(o, pid) { var tag = '-J-' + o.no; return marks().filter(function (m) { return m.pid === pid && m.bid && m.bid.slice(-tag.length) === tag; }); }
function startMark(id, who) { var o = orderById(id); if (!o || o.status !== 'marking' || !o.pk || (o.mk && o.mk.by) || activeMarkOf(who, o.branch) || !mkSum(o).markLines) return null;
  return pickUpdate(id, function (n) { var at = nowStr(), rw = n.mk && n.mk.rw ? n.mk : null; n.mk = { by: who, start: at, codes: rw ? rw.codes : [], errs: rw ? rw.errs || [] : [] }; if (rw) n.mk.rw = true; n.log.push({ kind: 'markStart', who: who, at: at }); }); }
// T9-4a (0-a): tartib — format → takror (urilgan / sotilgan) → mahsulot → partiya → tur → reestrda bor → qator to'lgan. «Shu buyurtmaga terilganmi» tekshiruvi olib tashlandi
function markScan(id, who, raw) { var o = orderById(id); if (!o || o.status !== 'marking' || !o.mk || o.mk.by !== who || o.mk.end) return { err: 'state' };
  var c = mkParse(raw), ls = mkLines(o).filter(function (l) { return l.mark; }), r, cand = [];
  var u0 = c ? mkUsed()[c.flat] : null, reg = c ? markByCode(c.flat) : null;
  if (reg && mkFlat(reg.code) !== c.flat) reg = null;
  var relC = c && !u0 ? relCode(c.flat) : null; if (relC) reg = { status: 'stock', code: c.flat, rel: true }; // T9-4a: bo'shagan (bekor qilingan / qaytarilgan) kod — omborda, qayta qabul qilinadi
  if (!c) r = { err: 'fmt' };
  else if (u0) r = { err: 'dup', no: u0 };
  else if (reg && (reg.status === 'sold' || reg.status === 'writeoff')) r = { err: 'sold', name: reg.p ? reg.p.name : '' };
  else { var p = PRODUCTS.filter(function (x) { return gtinOf(x) === c.gtin; })[0]; cand = p ? ls.filter(function (l) { return l.pid === p.id; }) : [];
    if (!cand.length) r = { err: 'prod', name: p ? p.name : c.gtin };
    else { var l = cand.filter(function (x) { return x.batches.indexOf(c.batch) >= 0; })[0];
      if (!l) r = { err: 'batch', name: p.name, need: cand[0].batches.join(', '), got: c.batch };
      else if (l.kind !== c.kind) r = { err: 'kind', name: p.name, need: l.kind, got: c.kind };
      else if (!reg) r = { err: 'notReg', name: p.name };
      else { var pb = l.picks.filter(function (x) { return x.batch === c.batch; })[0];
        if (l.got >= l.need || (pb && pb.got >= pb.qty)) r = { err: 'full', name: p.name, got: l.got, need: l.need, kind: l.kind };
        else r = { ok: true, li: l.li, name: p.name, kind: l.kind, batch: c.batch, got: l.got + 1, need: l.need }; } } }
  var at = nowStr();
  r.o = pickUpdate(id, function (n) { if (r.ok) n.mk.codes.push({ c: c.flat, li: r.li, pid: cand[0].pid, batch: c.batch, kind: c.kind, at: at, by: who }); else n.mk.errs.push(Object.assign({ at: at, by: who, code: c ? c.flat : String(raw || '').slice(0, 80) }, r, { o: undefined })); });
  return r; }
function markRemove(id, who, code, reason) { var o = orderById(id); if (!o || o.status !== 'marking' || !o.mk || o.mk.end || !reason) return null;
  return pickUpdate(id, function (n) { var x = n.mk.codes.filter(function (k) { return k.c === code && !k.rm; })[0]; if (!x) return; var at = nowStr(); x.rm = { at: at, by: who, reason: reason }; n.log.push({ kind: 'mkRemove', who: who, at: at, reason: reason, note: mkPretty(code) }); }); }
function mkLeft(o) { return mkLines(o).filter(function (l) { return l.mark && l.got < l.need; }).map(function (l) { return { name: l.p.name, n: l.need - l.got, kind: l.kind }; }); }
function finishMark(id, who) { var r0 = finishMark0(id, who); if (r0 && !r0.err) chkNotify(r0); return r0; }
function finishMark0(id, who) { var o = orderById(id); if (!o || o.status !== 'marking' || !o.mk || o.mk.by !== who || o.mk.end) return null; var left = mkLeft(o); if (left.length) return { err: 'left', left: left };
  return pickUpdate(id, function (n) { var at = nowStr(), sp = Math.max(0, Math.round((pDT(at) - pDT(n.mk.start)) / 60000)); n.mk.end = at; n.mk.spent = sp; n.mk.diff = n.tm && n.tm.markMin != null ? n.tm.markMin - sp : null; n.status = 'checking'; n.markEnd = at; n.log.push({ kind: 'marked', who: who, at: at, spent: sp, diff: n.mk.diff }); }); }
// Markirovkali dorisi yo'q buyurtma — «Markirovkasiz — tasdiqlash»
function markNone(id, who) { var r0 = markNone0(id, who); if (r0) chkNotify(r0); return r0; }
function markNone0(id, who) { var o = orderById(id); if (!o || o.status !== 'marking' || !o.pk || (o.mk && o.mk.by) || mkSum(o).markLines) return null;
  return pickUpdate(id, function (n) { var at = nowStr(); n.mk = { by: who, start: at, end: at, spent: 0, diff: n.tm ? n.tm.markMin : null, codes: [], errs: [], none: true }; n.status = 'checking'; n.markEnd = at; n.log.push({ kind: 'marked', who: who, at: at, none: true }); }); }
function markIssue(id, who, reason, note, label) { var o = orderById(id); if (!o || o.status !== 'marking' || !o.mk || o.mk.end) return null;
  var n = pickUpdate(id, function (n) { var at = nowStr(), x = { reason: reason, note: note || '', by: who, at: at, stage: 'mark' }; n.issues = (n.issues || []).concat([x]); n.log.push({ kind: 'issue', who: who, at: at, reason: reason, note: note || '' }); });
  var c = custById(o.cust) || {}; notifyPerm('orders.queue', o.branch, 'danger', 'triangle-alert', o.no + ' · ' + (c.name || '') + ' — ' + (label || reason) + (note ? ': ' + note : '') + ' (' + who + ')', o.id, 'issues'); return n; }
function markTimer(o) { var tm = o && o.tm, mk = o && o.mk; if (!tm || !mk || !mk.start) return null; var st = pDT(mk.start);
  if (!mk.end) { var el = Math.max(0, Math.floor((nowMs() - st) / 60000)); return { run: true, el: el, left: tm.markMin - el }; }
  var sp = mk.spent != null ? mk.spent : Math.max(0, Math.round((pDT(mk.end) - st) / 60000)); return { run: false, spent: sp, diff: tm.markMin - sp }; }
function mkCnt(o, from) { var r = { box: 0, unit: 0 }, f = from || (o.mk && o.mk.rw ? o.mk.start : null), ft = f ? pDT(f) : null; ((o.mk && o.mk.codes) || []).forEach(function (c) { if (!c.rm && (ft == null || pDT(c.at) >= ft)) r[c.kind === 'box' ? 'box' : 'unit']++; }); return r; } // qayta markirovka — faqat shu urinishda urilganlar
function mkGotB(o, li, batch) { var n = 0; ((o.mk && o.mk.codes) || []).forEach(function (c) { if (!c.rm && c.li === li && c.batch === batch) n++; }); return n; }
function markDone(br, day, who) { var out = []; store.orders.forEach(function (o) { if (br && br !== 'ALL' && o.branch !== br) return; var nAtt = (o.att || []).length;
    (o.att || []).forEach(function (a) { var m = a.mk; if (!m || !m.end || m.end.slice(0, 10) !== day || (who && m.by !== who)) return; out.push({ o: o, by: m.by, start: m.start, end: m.end, spent: m.spent || 0, diff: m.diff == null ? 0 : m.diff, late: m.diff < 0, codes: m.cnt || { box: 0, unit: 0 }, errs: m.errs || 0, issues: 0, none: !!m.none, given: a.tm ? a.tm.markMin : null, att: a.k }); });
    var mk = o.mk; if (!mk || !mk.end || mk.end.slice(0, 10) !== day || (who && mk.by !== who)) return; var t = markTimer(o) || { spent: mk.spent || 0, diff: 0 }, e0 = (o.att || []).reduce(function (s, a) { return s + (a.mk ? a.mk.errs || 0 : 0); }, 0);
    out.push({ o: o, by: mk.by, start: mk.start, end: mk.end, spent: t.spent, diff: t.diff, late: t.diff < 0, codes: mkCnt(o), errs: Math.max(0, (mk.errs || []).length - e0), issues: (o.issues || []).filter(function (x) { return x.stage === 'mark'; }).length, none: !!mk.none, given: o.tm ? o.tm.markMin : null, att: nAtt + 1 }); });
  return out.sort(function (a, b) { return pDT(b.end) - pDT(a.end); }); }
function markStats(br, from, to) { var a = pD(from), b = pD(to), days = []; for (var t = a; t <= b; t += DAY) days.push(fD(t)); var rows = [].concat.apply([], days.map(function (dd) { return markDone(br, dd); })), by = {};
  var G = function (nm) { return by[nm] || (by[nm] = { name: nm, n: 0, box: 0, unit: 0, onTime: 0, late: 0, lateMin: 0, spentSum: 0, errs: 0, issues: 0, rows: [], nT: 0 }); };
  rows.forEach(function (r) { var g = G(r.by); g.n++; g.box += r.codes.box; g.unit += r.codes.unit; if (r.late) { g.late++; g.lateMin += -r.diff; } else g.onTime++; if (!r.none) { g.spentSum += r.spent; g.nT++; } g.rows.push(r); });
  store.orders.forEach(function (o) { if (br && br !== 'ALL' && o.branch !== br) return; ((o.mk && o.mk.errs) || []).forEach(function (x) { if (days.indexOf(x.at.slice(0, 10)) >= 0) G(x.by).errs++; }); (o.issues || []).forEach(function (x) { if (x.stage === 'mark' && days.indexOf(x.at.slice(0, 10)) >= 0) G(x.by).issues++; }); });
  return Object.keys(by).map(function (k) { var g = by[k]; g.avg = g.nT ? Math.round(g.spentSum / g.nT) : null; return g; }).sort(function (x, y) { return y.n - x.n || x.name.localeCompare(y.name); }); }
// Kodlar jurnali: har bir urish (olib tashlanganlari sabab bilan)
function markJournal(br) { var out = []; store.orders.forEach(function (o) { if (br && br !== 'ALL' && o.branch !== br) return; ((o.mk && o.mk.codes) || []).forEach(function (c) { var p = prodById(c.pid) || {}; out.push({ c: c.c, kind: c.kind, pid: c.pid, name: p.name || '', batch: c.batch, no: o.no, oid: o.id, by: c.by, at: c.at, rm: c.rm || null }); }); });
  return out.sort(function (a, b) { return pDT((b.rm && b.rm.at) || b.at) - pDT((a.rm && a.rm.at) || a.at); }); }
// Demo skaner: ok / prod / batch / dup / kind
function relCode(flat) { var hit = null; store.orders.forEach(function (o) { if (hit) return; ((o.mk && o.mk.codes) || []).forEach(function (x) { if (!hit && x.c === flat && x.rm && x.rm.rel) hit = x; }); }); return hit; }
function mkDemo(id, k) { var o = orderById(id); if (!o) return ''; var ls = mkLines(o).filter(function (l) { return l.mark; }), used = mkUsed(), reg = marks(), open = ls.filter(function (l) { return l.got < l.need; })[0] || ls[0]; if (!open) return '';
  var free = function (l) { return mkReg(o, l.pid).filter(function (m) { return !used[mkFlat(m.code)]; }); };
  if (k === 'ok') { var rl = ((o.mk && o.mk.codes) || []).filter(function (x) { return x.rm && x.rm.rel && x.li === open.li && open.batches.indexOf(x.batch) >= 0 && !used[x.c]; })[0]; if (rl) return mkPretty(rl.c); var m = free(open)[0]; return m ? mkPretty(m.code) : ''; }
  if (k === 'prod') { var inO = {}; o.lines.forEach(function (l) { inO[l.pid] = 1; }); var m2 = reg.filter(function (x) { return !inO[x.pid] && x.status === 'stock' && x.branch === o.branch; })[0]; return m2 ? mkPretty(m2.code) : ''; }
  if (k === 'batch') { var m3 = reg.filter(function (x) { return x.pid === open.pid && open.batches.indexOf(x.batch) < 0; })[0]; if (m3) return mkPretty(m3.code); var pk = open.picks[0]; return mkPretty(codeStr(open.p, pk.batch.replace(/\d+$/, function (d) { return String(+d - 1); }), pk.exp, serialOf(open.pid, 'X', 1))); }
  if (k === 'dup') { var other = null; store.orders.forEach(function (x) { if (!other && x.id !== o.id && x.mk) other = (x.mk.codes || []).filter(function (c) { return !c.rm && c.pid === open.pid; })[0] || (x.mk.codes || []).filter(function (c) { return !c.rm; })[0] || null; });
    var mine = ((o.mk && o.mk.codes) || []).filter(function (c) { return !c.rm; }).pop(); var d = other || mine; return d ? mkPretty(d.c) : ''; }
  if (k === 'full') { var fl = ls.filter(function (l) { return l.need > 0 && l.got >= l.need; })[0]; if (!fl) return ''; var m5 = reg.filter(function (x) { return x.pid === fl.pid && fl.batches.indexOf(x.batch) >= 0 && !used[mkFlat(x.code)] && x.status !== 'sold' && x.status !== 'writeoff'; })[0]; return m5 ? mkPretty(m5.code) : ''; }
  if (k === 'kind') { var m4 = free(open)[0]; if (!m4) return ''; var x4 = mkParse(m4.code); return mkPretty(x4.flat.slice(0, -1) + (x4.kind === 'box' ? 'D' : 'Q')); }
  return ''; }
// Seed: Nodira Xolmatova — bugun 5 ta yakunlangan markirovka (1 kechikkan, 2 markirovkasiz), 3 xato urish, 1 olib tashlangan kod
function seedMark() { var N = MARKER, D0 = '04.10.2026 ', S = { 'BY-TSH-000312': ['10:25', '10:38'], 'BY-TSH-000313': ['11:36', '11:49'], 'BY-TSH-000315': ['12:46', '12:46'], 'BY-TSH-000316': ['13:20', '13:20'], 'BY-TSH-000317': ['14:55', '15:20'], 'BY-TSH-000314': ['03.10.2026 17:24', '03.10.2026 17:37'] };
  var used = {}; store.orders.forEach(function (o) { var x = S[o.no]; if (!x || !o.pk) return; var s0 = x[0].length > 5 ? x[0] : D0 + x[0], s1 = x[1].length > 5 ? x[1] : D0 + x[1], a = pDT(s0), b = pDT(s1), ls = mkLines(o).filter(function (l) { return l.mark; });
    var mk = { by: N, start: s0, end: s1, spent: Math.round((b - a) / 60000), codes: [], errs: [], none: !ls.length }; mk.diff = o.tm ? o.tm.markMin - mk.spent : null;
    var all = []; ls.forEach(function (l) { var reg = mkReg(o, l.pid); l.picks.forEach(function (pb) { reg.filter(function (m) { return m.batch === pb.batch; }).slice(0, pb.qty).forEach(function (m) { all.push({ c: mkFlat(m.code), li: l.li, pid: l.pid, batch: m.batch, kind: l.kind }); }); }); });
    all.forEach(function (c, i) { c.at = fDT(a + Math.round((b - a) * (i + 1) / (all.length + 1) / 60000) * 60000); c.by = N; used[c.c] = o.no; mk.codes.push(c); });
    if (o.no === 'BY-TSH-000312' && all[0]) { var bt = all[0].batch; mk.errs.push({ at: D0 + '10:29', by: N, code: '', err: 'batch', name: 'Omeprazol 20mg', need: bt, got: bt.replace(/\d$/, function (d) { return String((+d + 3) % 10); }) }); }
    if (o.no === 'BY-TSH-000317') { var dm = all.filter(function (c) { return c.kind === 'unit'; })[0], om = all.filter(function (c) { return c.kind === 'box'; })[0];
      if (om) mk.errs.push({ at: D0 + '14:58', by: N, code: om.c.slice(0, -1) + 'D', err: 'kind', name: 'Omeprazol 20mg', need: 'box', got: 'unit' });
      var d312 = store.orders.filter(function (y) { return y.no === 'BY-TSH-000312'; })[0]; mk.errs.push({ at: D0 + '15:06', by: N, code: '', err: 'dup', no: 'BY-TSH-000312' });
      if (dm) mk.codes.splice(mk.codes.indexOf(dm), 0, { c: dm.c, li: dm.li, pid: dm.pid, batch: dm.batch, kind: dm.kind, at: D0 + '14:57', by: N, rm: { at: D0 + '14:58', by: N, reason: "Skaner kodni ikki marta yubordi — qayta tekshirib urildi" } }); }
    o.mk = mk; o.markEnd = mk.end; });
  var e = store.orders.filter(function (y) { return y.no === 'BY-TSH-000312'; })[0]; if (e && e.mk && e.mk.codes[0]) { var c317 = store.orders.filter(function (y) { return y.no === 'BY-TSH-000317'; })[0]; if (c317 && c317.mk) c317.mk.errs.forEach(function (x) { if (x.err === 'dup') x.code = e.mk.codes[0].c; }); } }
function pickTimer(o) { var tm = o && o.tm, pk = o && (o.pk || (o.pickStart ? { by: o.picker, start: o.pickStart, end: o.pickEnd } : null)); if (!tm || !pk || !pk.start) return null; var st = pDT(pk.start);
  if (!pk.end) { var el = Math.max(0, Math.floor((nowMs() - st) / 60000)); return { run: true, el: el, left: tm.pickMin - el }; }
  var sp = pk.spent != null ? pk.spent : Math.max(0, Math.round((pDT(pk.end) - st) / 60000)); return { run: false, spent: sp, diff: tm.pickMin - sp }; }
// Bekor qilish: operator — o'z buyurtmasi, «Qoralama»/«Tasdiqlashda»; «Navbatda» … «Jo'natishga tayyor» — orders.cancelPick
function canCancelOrder(role, user, o) { if (!o) return false; var st = o.status;
  if (st === 'draft' || st === 'pending') return (can(role, 'orders.cancel') && o.op === user) || can(role, 'orders.manage');
  if (RESERVING.indexOf(st) >= 0) return can(role, 'orders.cancelPick'); return false; }

// ---- T9-4a: Ombor mudiri — hisobdan o'tkazish, qayta yig'ish, hujjatlashtirish, muammolar, monitor ----
var CHK_REASONS = ['short', 'extra', 'wrongProd', 'wrongBatch', 'damaged', 'other'];
var STAGES = ['qWait', 'qTime', 'picking', 'marking', 'checking', 'docs', 'loading', 'transit', 'retwait']; // T9-4b: + Yo'lda, Qaytish kutilmoqda
var STAGE_NORM = { qWait: 15, qTime: 20, mkWait: 15, checking: 20, docs: 30, loading: 60, transit: 300, retwait: 60 }; // daqiqa: me'yori berilmagan bosqichlar uchun
var WHM_ALL = function () { return WHM; };
function chkNotify(o) { if (!o) return; var c = custById(o.cust) || {}; notifyPerm('orders.check', o.branch, 'info', 'clipboard-check', o.no + ' · ' + (c.name || '') + " — hisobdan o'tkazishga tayyor", o.id, 'check'); }
function checkerOf(o) { return (o && o.chk && o.chk.by) || ''; }
function activeCheckOf(who, br) { return store.orders.filter(function (o) { return o.status === 'checking' && o.chk && o.chk.by === who && !o.chk.end && (!br || o.branch === br); })[0] || null; }
function startCheck(id, who) { var o = orderById(id); if (!o || o.status !== 'checking' || (o.chk && o.chk.by) || activeCheckOf(who, o.branch)) return null;
  return pickUpdate(id, function (n) { var at = nowStr(); n.chk = { by: who, start: at, ok: {}, places: null }; n.log.push({ kind: 'checkStart', who: who, at: at }); }); }
function checkSet(id, who, patch) { var o = orderById(id); if (!o || o.status !== 'checking' || !o.chk || o.chk.by !== who || o.chk.end) return null;
  return pickUpdate(id, function (n) { if (patch.li != null) { n.chk.ok = Object.assign({}, n.chk.ok); if (patch.on) n.chk.ok[patch.li] = true; else delete n.chk.ok[patch.li]; } if ('places' in patch) n.chk.places = patch.places; }); }
function chkLines(o) { var mk = mkLines(o), ok = (o.chk && o.chk.ok) || {};
  return mk.map(function (l) { var pl = o.pk.lines[l.li] || {}, ol = o.lines[pl.i] || {}, p = l.p; return { li: l.li, pid: l.pid, p: p, ordered: ol.qty || 0, qty: l.qty, short: Math.max(0, (ol.qty || 0) - l.qty), picks: l.picks, dev: l.dev, zone: "Jo'natish", mark: l.mark, kind: l.kind, got: l.got, need: l.need, ok: !!ok[l.li] }; }); }
function finishCheck(id, who, places) { var o = orderById(id); if (!o || o.status !== 'checking' || !o.chk || o.chk.by !== who || o.chk.end) return { err: 'state' };
  var ls = chkLines(o), left = ls.filter(function (l) { return !l.ok; }).length, pl = parseInt(places != null ? places : o.chk.places, 10);
  if (left) return { err: 'left', n: left }; if (!(pl > 0)) return { err: 'places' };
  var n = pickUpdate(id, function (n) { var at = nowStr(); n.chk.end = at; n.chk.places = pl; n.status = 'docs'; if (n.rw && !n.rw.done) n.rw.done = at; n.log.push({ kind: 'checked', who: who, at: at, places: pl }); });
  return { ok: true, o: n }; }
// «Yig'ishga qaytarish»: tanlangan qatorlar qayta yig'iladi; qolganlari «tayyor» — qulflangan. Oldingi urinish att[] da (hisobotlar uchun)
function checkReturn(id, who, lis, reason, note) { var o = orderById(id); if (!o || o.status !== 'checking' || !o.chk || o.chk.by !== who || o.chk.end || !lis || !lis.length || !reason) return null;
  var n = pickUpdate(id, function (n) { var at = nowStr(), pk = n.pk, mk = n.mk, set = {}, k = (n.att || []).length + 1; lis.forEach(function (i) { set[i] = 1; });
    var cnt = mk && mk.by ? mkCnt(n) : null, e0 = (n.att || []).reduce(function (s, a) { return s + (a.mk ? a.mk.errs || 0 : 0); }, 0);
    n.att = (n.att || []).concat([{ k: k, tm: n.tm ? { pickMin: n.tm.pickMin, markMin: n.tm.markMin, by: n.tm.by, at: n.tm.at } : null,
      pk: { by: pk.by, start: pk.start, end: pk.end, spent: pk.spent, diff: pk.diff }, mk: mk && mk.by ? { by: mk.by, start: mk.start, end: mk.end, spent: mk.spent, diff: mk.diff, none: !!mk.none, cnt: cnt, errs: Math.max(0, (mk.errs || []).length - e0) } : null,
      chk: { by: who, start: n.chk.start, at: at, lines: lis.slice(), reason: reason, note: note || '' } }]);
    pk.lines.forEach(function (pl, li) { if (set[li]) { pl.state = 'todo'; pl.found = 0; pl.picks = []; pl.dev = null; pl.reason = ''; pl.codes = []; pl.locked = false; } else pl.locked = true; });
    pk.rw = true; delete pk.end; delete pk.spent; delete pk.diff; pk.by = null; pk.start = null;
    if (mk) { (mk.codes || []).forEach(function (c) { if (set[c.li] && !c.rm) c.rm = { at: at, by: who, reason: "Yig'ishga qaytarildi", rel: true }; }); n.mk = { codes: mk.codes || [], errs: mk.errs || [], rw: true }; }
    delete n.tm; delete n.markEnd; delete n.fefoDev; n.chk = null; n.status = 'queued';
    n.rw = { k: k, n: lis.length, lines: lis.slice(), names: lis.map(function (i) { var p = prodById((pk.lines[i] || {}).pid) || {}; return p.name || ''; }), reason: reason, note: note || '', by: who, at: at };
    n.log.push({ kind: 'rework', who: who, at: at, reason: reason, note: (note || '') + (note ? ' · ' : '') + n.rw.names.join(', '), n: lis.length }); });
  queueNotify(n); return n; }
function rwOpen(o) { return !!(o && o.rw && !o.rw.done); }
// Hujjatlashtirish: reys (shipments modeli) — mashina lk.fleet dan, haydovchi — Haydovchi rolidagi faol xodim
function nextNak(br) { store.nakSeq = Object.assign({}, store.nakSeq || {}); var n = (store.nakSeq[br] || 0) + 1; store.nakSeq[br] = n; return 'NK-' + br + '-' + pad6(n); }
function fleetCars(br) { return ((store.lk && store.lk.cars) || []).filter(function (c) { return c.active !== false && (!br || !c.branch || c.branch === br); }).map(function (c) { var v = carByNo(c.no) || {}; return { no: c.no, model: c.model || (v.type || '').split(' · ')[0], fridge: !!c.fridge, boxes: c.boxCap || Math.round((c.cap || 1000) / 25) }; }); }
function tripDrivers(br) { var out = []; (store.emps || []).forEach(function (e) { if (e.role !== 'driver' || e.status === 'blocked' || (br && e.branch && e.branch !== br)) return; var nm = e.first + ' ' + e.last, d = DRIVERS.filter(function (x) { return x.name === nm; })[0]; if (d && !out.some(function (x) { return x.id === d.id; })) out.push({ id: d.id, name: nm, phone: d.phone }); }); return out; }
function dcTripOf(oid) { return (store.trips || []).filter(function (t) { return ['draft', 'planned', 'transit'].indexOf(t.status) >= 0 && t.stops.some(function (s) { return s.oid === oid; }); })[0] || null; }
function placesOf(o) { return (o && o.chk && o.chk.places) || 0; }
function docsTrip(ids, x, who) { var os = ids.map(orderById).filter(function (o) { return o && o.status === 'docs' && o.delivery !== 'pickup' && !dcTripOf(o.id); }); if (!os.length || !x || !x.car || !x.driver || !x.date) return null;
  var br = os[0].branch, at = nowStr(), t = saveTrip({ branch: br, date: x.date, driver: x.driver, car: x.car, exp: '', status: 'draft', stops: os.map(function (o) { return { oid: o.id, res: null, signed: false, loaded: false }; }), draftAt: at, draftBy: who, src: 'docs' });
  var nk = {}; os.forEach(function (o) { nk[o.id] = (o.dc && o.dc.nak) || nextNak(br); });
  updOrders(os.map(function (o) { return o.id; }), function (n) { n.dc = { trip: t.no, nak: nk[n.id], by: who, at: at }; n.log.push({ kind: 'docTrip', who: who, at: at, note: t.no + ' · ' + nk[n.id] }); }); return t; }
function docsPickup(id, who) { var o = orderById(id); if (!o || o.status !== 'docs' || o.delivery !== 'pickup') return null; var at = nowStr(), nk = (o.dc && o.dc.nak) || nextNak(o.branch);
  return pickUpdate(id, function (n) { n.dc = { trip: null, nak: nk, by: who, at: at, pickup: true }; n.log.push({ kind: 'docTrip', who: who, at: at, note: nk }); }); }
function docsDone(ref, who) { var at = nowStr(), ids = [], t = /^RS-/.test(String(ref)) ? tripByNo(ref) : null;
  if (t) { if (t.status !== 'draft') return null; ids = t.stops.map(function (s) { return s.oid; }); var c = tripCopy(t); c.status = 'planned'; c.plannedAt = at; c.plannedBy = who; saveTrip(c); }
  else { var o = orderById(ref); if (!o || o.status !== 'docs' || !o.dc || !o.dc.pickup) return null; ids = [o.id]; }
  updOrders(ids, function (n) { if (n.status !== 'docs') return; n.status = 'loading'; n.dc = Object.assign({}, n.dc, { done: at }); n.log.push({ kind: 'documented', who: who, at: at }); });
  if (t) { var d = driverById(t.driver) || {}; notify(d.name, 'info', 'truck', t.no + ' — ' + ids.length + " ta buyurtma, yuklash kutilmoqda", null); }
  return t ? tripByNo(t.no) : orderById(ids[0]); }
function docsUndo(tripNo, who) { var t = tripByNo(tripNo); if (!t || t.status !== 'draft') return null; var ids = t.stops.map(function (s) { return s.oid; }); cancelTrip(tripNo, who);
  updOrders(ids, function (n) { if (n.dc) n.dc = Object.assign({}, n.dc, { trip: null }); }); return true; }
// Bekor qilingan buyurtma reysdan chiqariladi (bo'sh qolgan reys bekor)
function tripDrop(oid, who) { (store.trips || []).forEach(function (t) { if (['draft', 'planned'].indexOf(t.status) < 0 || !t.stops.some(function (s) { return s.oid === oid; })) return; var c = tripCopy(t); c.stops = c.stops.filter(function (s) { return s.oid !== oid; }); if (!c.stops.length) { c.status = 'cancelled'; c.cancelledAt = nowStr(); c.cancelledBy = who; } saveTrip(c); }); }
function dcCodes(o) { return ((o.mk && o.mk.codes) || []).filter(function (c) { return !c.rm; }).map(function (c) { var p = prodById(c.pid) || {}; return { code: mkPretty(c.c), name: p.name || '', batch: c.batch, kind: c.kind, at: c.at, by: c.by }; }); }
// Muammolar (o.issues): ochiq — hal qilinmagan; «Hal qilindi» izoh bilan, tarixda qoladi
function openIssues(br) { var out = []; store.orders.forEach(function (o) { if (br && br !== 'ALL' && o.branch !== br) return; (o.issues || []).forEach(function (x, i) { if (!x.res) out.push({ o: o, i: i, x: x, stage: x.stage || 'pick' }); }); }); return out.sort(function (a, b) { return pDT(b.x.at) - pDT(a.x.at); }); }
function issueResolve(oid, i, who, note) { var o = orderById(oid); if (!o || !o.issues || !o.issues[i] || o.issues[i].res || !String(note || '').trim()) return null;
  return pickUpdate(oid, function (n) { var at = nowStr(), x = n.issues[i]; x.res = { by: who, at: at, note: String(note).trim() }; n.log.push({ kind: 'issueRes', who: who, at: at, reason: x.reason, note: String(note).trim() }); }); }
// Monitor: bosqich, kim ishlayapti, taymer (me'yorga nisbatan)
function stageOf(o) { var s = o && o.status; if (s === 'queued') return o.tm ? 'qTime' : 'qWait'; if (s === 'ready') return 'loading'; if (s === 'shipped') { var t0 = tripOfAny(o.id); return t0 && t0.status === 'transit' ? 'transit' : null; } if (s === 'delivered' || s === 'undelivered') { var t1 = tripOfAny(o.id); return t1 && t1.status === 'retwait' && stopPending(t1, o.id) ? 'retwait' : null; } return STAGES.indexOf(s) >= 0 ? s : null; }
function lastEv(o, kinds) { var e = orderLog(o).filter(function (x) { return kinds.indexOf(x.kind) >= 0; }).pop(); return e ? e.at : null; }
function stageInfo(o) { var st = stageOf(o); if (!st) return null; var now = nowMs(), mins = function (s) { return s ? Math.floor((now - pDT(s)) / 60000) : 0; }, r = { stage: st, who: '', since: null, norm: 0, left: 0, run: true };
  if (st === 'picking') { var pt = pickTimer(o); r.who = pickerOf(o); r.since = o.pk && o.pk.start; if (pt) { r.norm = o.tm.pickMin; r.left = pt.left; } else { r.norm = 30; r.left = 30 - mins(r.since); } return r; }
  if (st === 'marking' && o.mk && o.mk.start && !o.mk.end) { var mt = markTimer(o); r.who = o.mk.by; r.since = o.mk.start; r.norm = o.tm ? o.tm.markMin : STAGE_NORM.mkWait; r.left = mt ? mt.left : r.norm - mins(r.since); return r; }
  if (st === 'transit' || st === 'retwait') { var tt = tripOfAny(o.id); r.who = tt ? (driverById(tt.driver) || {}).name || '' : ''; r.trip = tt ? tt.no : null; r.since = (tt && (st === 'transit' ? tt.shippedAt : tt.finAt)) || nowStr(); r.norm = STAGE_NORM[st]; r.left = r.norm - mins(r.since); return r; }
  var since = st === 'qWait' ? ((o.rw && !o.rw.done && o.rw.at) || lastEv(o, ['approve', 'confirm'])) : st === 'qTime' ? o.tm.at : st === 'marking' ? (o.pk && o.pk.end) || lastEv(o, ['picked']) : st === 'checking' ? (o.chk && o.chk.start) || o.markEnd || (o.mk && o.mk.end) || lastEv(o, ['marked']) : st === 'docs' ? (o.chk && o.chk.end) || lastEv(o, ['checked']) : (o.dc && (o.dc.done || o.dc.at)) || lastEv(o, ['documented', 'marked']);
  r.since = since || (o.date + ' ' + (o.time || '09:00')); r.norm = STAGE_NORM[st === 'marking' ? 'mkWait' : st]; r.left = r.norm - mins(r.since);
  if (st === 'qTime') r.who = o.tm.by; if (st === 'checking') r.who = checkerOf(o); if (st === 'docs') r.who = (o.dc && o.dc.by) || ''; if (st === 'loading') { var tr = dcTripOf(o.id); r.who = tr ? (driverById(tr.driver) || {}).name || '' : o.delivery === 'pickup' ? 'pickup' : ''; r.trip = tr ? tr.no : null; }
  return r; }
function monitorData(br) { var cols = {}; STAGES.forEach(function (k) { cols[k] = []; }); var iss = {}; openIssues(br).forEach(function (x) { iss[x.o.id] = (iss[x.o.id] || 0) + 1; });
  store.orders.forEach(function (o) { if (br && br !== 'ALL' && o.branch !== br) return; var si = stageInfo(o); if (!si) return; cols[si.stage].push({ o: o, si: si, late: si.left < 0, issues: iss[o.id] || 0 }); });
  STAGES.forEach(function (k) { cols[k].sort(function (a, b) { return a.si.left - b.si.left; }); }); return cols; }
// Seed (TSH): «Hisobdan o'tkazilmoqda» — 317 (Demidrol kam terilgan), 314; «Hujjatlashtirilmoqda» — 313, 315, 316 (o'zi olib ketadi); «Yuklanmoqda» — RS-TSH-000045 (333, 312)
function seedCtrl() { var F = WHM, D0 = '04.10.2026 ', C = { 'BY-TSH-000313': ['14:30', '14:42', 9], 'BY-TSH-000315': ['14:55', '15:08', 6], 'BY-TSH-000316': ['15:05', '15:16', 5], 'BY-TSH-000312': ['10:50', '11:02', 4], 'BY-TSH-000333': ['12:40', '12:52', 8] };
  store.nakSeq = { TSH: 0, SMQ: 0, BXR: 0, FRG: 0 };
  store.orders.forEach(function (o) { var x = C[o.no]; if (!x) return; var ok = {}; mkLines(o).forEach(function (l) { ok[l.li] = true; }); o.chk = { by: F, start: D0 + x[0], end: D0 + x[1], ok: ok, places: x[2] }; });
  ['BY-TSH-000312', 'BY-TSH-000333'].forEach(function (no) { var o = orderByNo(no); if (o) o.dc = { trip: 'RS-TSH-000045', nak: nextNak('TSH'), by: F, at: D0 + '13:35', done: D0 + '13:40' }; }); }
// ---- T9-4b: Haydovchi paneli — yuklash, reys, manzil natijasi, haydovchidagi pul, qaytgan tovar (ikki bosqich) ----
var FAIL_REASONS = ['refused', 'closed', 'noMoney', 'damaged', 'other'];
var FAIL_LABEL = { refused: 'Mijoz qabul qilmadi', closed: "Do'kon yopiq", noMoney: 'Pul tayyor emas', damaged: 'Tovar shikastlangan', other: 'Boshqa' };
var PART_REASONS = ['refused', 'damaged', 'wrong', 'other'];
var PART_LABEL = { refused: 'Mijoz rad etdi', damaged: 'Shikastlangan', wrong: "Noto'g'ri yuborilgan", other: 'Boshqa' };
var RET_DIFF = ['short', 'damaged', 'other'];
function payTypeOf(o) { return (o && o.payType) || 'bank'; }
function drvByName(name) { return DRIVERS.filter(function (d) { return d.name === name; })[0] || null; }
function tripsOfDriver(name) { var d = drvByName(name); if (!d) return []; return (store.trips || []).filter(function (t) { return t.driver === d.id && ['planned', 'transit', 'retwait', 'done'].indexOf(t.status) >= 0; }); }
function stopOf(t, oid) { return t ? t.stops.filter(function (x) { return x.oid === oid; })[0] || null : null; }
function tripOfAny(oid) { var a = (store.trips || []).filter(function (t) { return ['planned', 'transit', 'retwait', 'done'].indexOf(t.status) >= 0 && t.stops.some(function (x) { return x.oid === oid; }); }); return a[a.length - 1] || null; }
function stopPending(t, oid) { var o = orderById(oid), x = stopOf(t, oid); if (!o || !x) return false; return !!(o.ret && !o.ret.acc) || !!(x.cash && x.cash.sum > 0 && !x.cash.acc); }
function cashExpect(o, x) { if (payTypeOf(o) !== 'cash' || !o.sale) return 0; var R = x && x.res ? stopReturns(o, x) : { sum: 0 }; return x && x.res === 'fail' ? 0 : r2(o.sale.sum - R.sum); }
function issueAdd(oid, who, stage, reason, note, text) { var o = orderById(oid); if (!o) return; var at = nowStr();
  pickUpdate(oid, function (n) { var x = { reason: reason, note: note || '', by: who, at: at, stage: stage }; n.issues = (n.issues || []).concat([x]); n.log.push({ kind: 'issue', who: who, at: at, reason: reason, note: note || '' }); });
  notifyPerm('orders.queue', o.branch, 'danger', 'triangle-alert', o.no + ' — ' + text + ' (' + who + ')', oid, 'issues'); }
// Yuklash: har buyurtmaga «Qabul qildim» — joylar soni sanaladi; farq — Ombor mudiriga muammo (stage 'load')
function tripLoad(no, oid, who, cnt, note) { var t = tripCopy(tripByNo(no)); if (!t || t.status !== 'planned') return { err: 'state' }; var x = stopOf(t, oid), o = orderById(oid); if (!x || !o) return { err: 'state' };
  var exp = placesOf(o), c = parseInt(cnt, 10), nt = String(note || '').trim(); if (!(c >= 0)) return { err: 'cnt' }; if (c !== exp && !nt) return { err: 'note' };
  var at = nowStr(); x.loaded = true; x.load = { exp: exp, cnt: c, note: nt, by: who, at: at }; saveTrip(t);
  if (c !== exp) issueAdd(oid, who, 'load', 'loadDiff', nt + ' · ' + c + ' / ' + exp, "yuklashda farq: " + c + ' / ' + exp + ' joy');
  return { ok: true }; }
function tripUnload(no, oid) { var t = tripCopy(tripByNo(no)); if (!t || t.status !== 'planned') return null; var x = stopOf(t, oid); if (!x) return null; x.loaded = false; delete x.load; return saveTrip(t); }
// «Yuklab bo'lindi — reysni boshlash»: hamma buyurtma qabul qilingan bo'lsa; sotuv, hisob-faktura — shipTrip (doShip)
function tripStart(no, who) { var t = tripByNo(no); if (!t || t.status !== 'planned' || t.stops.some(function (x) { return !x.loaded; })) return null; return shipTrip(no, who); }
// Manzil natijasi: ok — kamida 1 rasm; fail — sabab; part — qator bo'yicha qaytgan soni va sabab; naqd — olingan summa (farqda izoh)
function stopSet(no, oid, who, x) { var t = tripCopy(tripByNo(no)); if (!t || t.status !== 'transit') return { err: 'state' }; var st = stopOf(t, oid), o = orderById(oid); if (!st || !o) return { err: 'state' };
  if (st.res && (st.edits || 0) >= 1) return { err: 'locked' }; var res = x.res; if (['ok', 'part', 'fail'].indexOf(res) < 0) return { err: 'res' };
  if (res !== 'fail' && !(x.photos && x.photos.length)) return { err: 'photo' };
  if (res === 'fail' && (FAIL_REASONS.indexOf(x.reason) < 0 || (x.reason === 'other' && !String(x.note || '').trim()))) return { err: 'reason' };
  var qty = null, lr = null;
  if (res === 'part') { qty = {}; lr = {}; var any = false, bad = false; o.lines.forEach(function (l) { var q = shippedQty(o, l), rq = Math.max(0, Math.min(q, parseInt((x.ret || {})[l.id], 10) || 0)); qty[l.id] = q - rq; if (rq > 0) { any = true; var rs = (x.lr || {})[l.id]; if (!rs) bad = true; lr[l.id] = rs || ''; } }); if (!any) return { err: 'partNone' }; if (bad) return { err: 'partReason' }; }
  var sim = { res: res, qty: qty }, exp = cashExpect(o, sim), cash = null;
  if (payTypeOf(o) === 'cash' && res !== 'fail') { var g = parseFloat(String(x.cash == null ? '' : x.cash).replace(/\s/g, '').replace(',', '.')); if (!(g >= 0)) return { err: 'cash' }; var cn = String(x.cashNote || '').trim(); if (Math.abs(g - exp) > 0.009 && !cn) return { err: 'cashNote' }; cash = { exp: exp, sum: r2(g), note: cn }; }
  var at = nowStr(); if (st.res) { st.edits = (st.edits || 0) + 1; st.hist = (st.hist || []).concat([{ res: st.res, reason: st.reason, at: st.at, by: st.by, cash: st.cash ? st.cash.sum : null }]); }
  Object.assign(st, { res: res, reason: res === 'fail' ? x.reason : '', note: String(x.note || '').trim(), qty: qty, lr: lr, photos: (x.photos || []).slice(0, 4), photo: ((x.photos || [])[0] || {}).name || null, sign: x.sign || null, signed: !!x.sign, cash: cash, at: at, by: who });
  saveTrip(t); applyStop(t.no, st, who); return { ok: true }; }
function applyStop(no, st, who) { updOrders([st.oid], function (n) { var R = stopReturns(n, st), at = st.at, lab = st.res === 'fail' ? FAIL_LABEL[st.reason] + (st.note ? ': ' + st.note : '') : '';
    n.ship = Object.assign({}, n.ship || {}, { photos: st.photos || [], photo: st.photo, sign: st.sign || null, signed: !!st.sign, res: st.res, resAt: at, resBy: who, note: st.note || '', cash: st.cash || null });
    var lineOf = {}; n.lines.forEach(function (l) { lineOf[l.pid] = l.id; });
    if (R.qty > 0) n.ret = { at: at, trip: no, reason: st.res === 'fail' ? lab : 'Qisman yetkazildi', lines: R.lines.map(function (r) { var lid = lineOf[r.pid]; return Object.assign({}, r, { reason: st.res === 'fail' ? lab : PART_LABEL[(st.lr || {})[lid]] || '' }); }), qty: R.qty, sum: R.sum, full: st.res === 'fail', acc: null };
    else delete n.ret;
    n.log = n.log.filter(function (e) { return !(e.trip === no && ['delivered', 'undelivered', 'partDelivered'].indexOf(e.kind) >= 0); });
    if (st.res === 'fail') { n.status = 'undelivered'; n.reason = 'Yetkazilmadi: ' + lab; delete n.ship.deliveredAt; n.log.push({ kind: 'undelivered', who: who, at: at, reason: lab, trip: no }); }
    else { var c = custById(n.cust); n.status = 'delivered'; delete n.reason; n.ship.deliveredAt = at; n.ship.receiver = c ? c.name : ''; n.log.push({ kind: st.res === 'part' ? 'partDelivered' : 'delivered', who: who, at: at, trip: no, note: st.res === 'part' ? fN0(R.qty) + ' dona qaytdi · ' + fMk(R.sum) : '' }); } }); }
function fN0(n) { return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function tripNeedsWait(t) { return t.stops.some(function (x) { return stopPending(t, x.oid); }); }
// «Reysni yakunlash»: hamma manzil natijasi bor — qaytgan tovar / naqd bo'lsa «Qaytish kutilmoqda», bo'lmasa «Yakunlangan»
function tripFinish(no, who) { var t = tripCopy(tripByNo(no)); if (!t || t.status !== 'transit' || t.stops.some(function (x) { return !x.res; })) return null; var at = nowStr(); t.finAt = at; t.finBy = who;
  if (tripNeedsWait(t)) t.status = 'retwait'; else { t.status = 'done'; t.doneAt = at; t.doneBy = who; }
  var r = saveTrip(t), cs = t.stops.reduce(function (a, x) { return a + (x.cash && !x.cash.acc ? x.cash.sum : 0); }, 0), rq = t.stops.filter(function (x) { var o = orderById(x.oid); return o && o.ret && !o.ret.acc; }).length;
  if (cs > 0) { var seen = {}; (store.emps || []).forEach(function (e) { var nm = e.first + ' ' + e.last; if (seen[nm] || e.status === 'blocked' || (e.branch && e.branch !== t.branch) || !(can(e.role, 'cash.create') || can(e.role, 'cash.approve'))) return; seen[nm] = 1; notify(nm, 'warning', 'wallet', "Haydovchida pul: " + fMk(cs) + " so'm — " + who + ' · ' + t.no, null, '#cash'); }); }
  if (rq) notifyPerm('orders.queue', t.branch, 'warning', 'undo-2', t.no + ' — qaytgan tovar qabul kutmoqda (' + rq + ' ta buyurtma)', null, 'ret');
  return r; }
function tripSettle(no) { var t = tripByNo(no); if (!t || t.status !== 'retwait' || tripNeedsWait(t)) return t; var c = tripCopy(t), at = nowStr(); c.status = 'done'; c.doneAt = at; c.doneBy = 'Tizim'; return saveTrip(c); }
// Qaytgan tovar: Ombor mudiri sanaydi — Karantinga o'tadi; farqda sabab va muammo (stage 'ret'). Kodlar bo'shatilmaydi
function retList(br) { return store.orders.filter(function (o) { return o.ret && (!br || br === 'ALL' || o.branch === br); }).sort(function (a, b) { return (a.ret.acc ? 1 : 0) - (b.ret.acc ? 1 : 0) || pDT(b.ret.at) - pDT(a.ret.at); }); }
function retAccept(oid, who, facts, reason, note) { var o = orderById(oid); if (!o || !o.ret || o.ret.acc) return { err: 'state' }; var F = {}, diff = false;
  o.ret.lines.forEach(function (r, k) { var v = facts && facts[k] != null && facts[k] !== '' ? parseInt(facts[k], 10) : r.qty; if (!(v >= 0)) v = r.qty; F[k] = Math.min(v, r.qty * 10); if (F[k] !== r.qty) diff = true; });
  if (diff && (RET_DIFF.indexOf(reason) < 0 || (reason === 'other' && !String(note || '').trim()))) return { err: 'reason' };
  var at = nowStr(); pickUpdate(oid, function (n) { n.ret.acc = { by: who, at: at, facts: F, reason: diff ? reason : '', note: String(note || '').trim() }; n.log.push({ kind: 'retAccepted', who: who, at: at, note: o.ret.trip || '' }); });
  if (diff) { var exp = o.ret.qty, got = Object.keys(F).reduce(function (a, k) { return a + F[k]; }, 0); issueAdd(oid, who, 'ret', 'retDiff', ({ short: 'Kam keldi', damaged: 'Shikastlangan', other: 'Boshqa' }[reason] || '') + (note ? ': ' + note : '') + ' · ' + got + ' / ' + exp, 'qaytgan tovarda farq: ' + got + ' / ' + exp); }
  if (o.ret.trip) tripSettle(o.ret.trip); return { ok: true }; }
// Haydovchidagi pul: kassir qabul qiladi — har buyurtma bo'yicha MT (naqd, kassa), farq alohida
function drvCash(br) { var out = []; (store.trips || []).forEach(function (t) { if ((br && br !== 'ALL' && t.branch !== br) || ['transit', 'retwait', 'done'].indexOf(t.status) < 0) return; var d = driverById(t.driver) || {};
  t.stops.forEach(function (x) { if (!x.cash || !(x.cash.sum > 0) || x.cash.acc) return; var o = orderById(x.oid) || {}; out.push({ trip: t.no, tripSt: t.status, driver: d.name || '', phone: d.phone || '', oid: x.oid, ono: o.no, cust: o.cust, sum: x.cash.sum, exp: x.cash.exp, note: x.cash.note, at: x.at }); }); }); return out; }
function cashAccept(no, who, got, note) { var t = tripCopy(tripByNo(no)); if (!t) return { err: 'state' }; var list = t.stops.filter(function (x) { return x.cash && x.cash.sum > 0 && !x.cash.acc; }); if (!list.length) return { err: 'state' };
  var tot = r2(list.reduce(function (a, x) { return a + x.cash.sum; }, 0)), g = parseFloat(String(got == null ? '' : got).replace(/\s/g, '').replace(',', '.')); if (!(g >= 0)) return { err: 'sum' };
  g = r2(g); var nt = String(note || '').trim(); if (Math.abs(g - tot) > 0.009 && !nt) return { err: 'note' };
  var at = nowStr(), left = g, d = driverById(t.driver) || {}, acct = 'K-' + t.branch, mts = [];
  list.forEach(function (x, i) { var o = orderById(x.oid); var share = i === list.length - 1 ? left : Math.min(left, x.cash.sum); share = r2(Math.max(0, share)); left = r2(left - share); var mt = null;
    if (share > 0 && o && o.sale) { var inv = ledger('mt', o.cust, o.branch).invoices.filter(function (y) { return y.no === o.sale.no; })[0], a = r2(Math.min(share, inv ? Math.max(0, inv.left) : share));
      mt = savePay({ kind: 'mt', branch: t.branch, date: at.slice(0, 10), party: o.cust, method: 'cash', acct: acct, sum: share, alloc: a > 0 ? [{ no: o.sale.no, sum: a }] : [], auto: false, status: 'posted', payNo: '', bankDate: '', checkNo: '', note: 'Haydovchidan: ' + (d.name || '') + ' · ' + t.no + ' · ' + o.no, src: 'driver', trip: t.no, createdBy: who, createdAt: at, postedBy: who, postedAt: at, log: [{ kind: 'create', who: who, at: at }, { kind: 'post', who: who, at: at }] }); mts.push(mt.no); }
    x.cash.acc = { by: who, at: at, got: share, mt: mt ? mt.no : null }; });
  t.cashAcc = (t.cashAcc || []).concat([{ by: who, at: at, exp: tot, got: g, diff: r2(g - tot), note: nt, mts: mts }]); saveTrip(t); tripSettle(no); return { ok: true, mts: mts, diff: r2(g - tot) }; }
// Seed: RS-TSH-000047 (Yo'lda) — 347 yetkazildi (rasm bilan), 348 va 349 (naqd) natijasiz; RS-TSH-000048 (Qaytish kutilmoqda) — 350 yetkazilmadi, 351 naqd yetkazildi
var SAMPLE_PHOTO = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240"><rect width="320" height="240" fill="#E2E8F0"/><rect x="16" y="16" width="288" height="208" rx="10" fill="none" stroke="#647574" stroke-dasharray="6 6"/><text x="160" y="126" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#5B6B6A">Namuna rasm</text></svg>');
function seedDrv() { var DR = 'Dilshod Rahimov', D0 = '04.10.2026 ', P = { 'BY-TSH-000347': 6, 'BY-TSH-000348': 4, 'BY-TSH-000349': 5, 'BY-TSH-000350': 5, 'BY-TSH-000351': 3, 'BY-TSH-000333': 8, 'BY-TSH-000312': 4 };
  T94B_ORD.forEach(function (no, i) { var o = orderByNo(no); if (!o) return; var ok = {}; mkLines(o).forEach(function (l) { ok[l.li] = true; }); if (!o.chk) o.chk = { by: WHM, start: (o.pk && o.pk.end) || D0 + '08:00', end: (o.pk && o.pk.end) || D0 + '08:00', ok: ok, places: P[no] }; if (!o.dc) o.dc = { trip: i < 3 ? 'RS-TSH-000047' : 'RS-TSH-000048', nak: nextNak('TSH'), by: WHM, at: D0 + '08:30', done: D0 + '08:35' }; });
  (store.trips || []).forEach(function (t) { if (t.status === 'transit' || t.status === 'done') t.stops.forEach(function (x) { var o = orderById(x.oid); if (o && !x.load) x.load = { exp: placesOf(o), cnt: placesOf(o), note: '', by: (driverById(t.driver) || {}).name || '', at: t.shippedAt || '' }; }); });
  var set = function (tno, ono, at, x) { var t = tripByNo(tno), o = orderByNo(ono); if (!t || !o) return; var st = stopOf(t, o.id), sim = Object.assign({ res: 'ok' }, x); Object.assign(st, { res: sim.res, reason: sim.reason || '', note: sim.note || '', qty: null, lr: null, photos: sim.res === 'fail' ? [] : [{ name: 'namuna.jpg', url: SAMPLE_PHOTO }], photo: sim.res === 'fail' ? null : 'namuna.jpg', sign: null, signed: false, at: D0 + at, by: DR, cash: null });
    if (payTypeOf(o) === 'cash' && sim.res !== 'fail') { var e = cashExpect(o, st); st.cash = { exp: e, sum: e, note: '' }; } applyStop(tno, st, DR); };
  set('RS-TSH-000047', 'BY-TSH-000347', '11:20'); set('RS-TSH-000047', 'BY-TSH-000349', '12:05'); // Y4: 349 naqd yetkazildi — pul kassaga qabul qilingan (drvSeedAccept)
  set('RS-TSH-000048', 'BY-TSH-000350', '09:05', { res: 'fail', reason: 'closed', note: '' }); set('RS-TSH-000048', 'BY-TSH-000351', '09:40');
  var t8 = tripByNo('RS-TSH-000048'); if (t8) { t8.status = 'retwait'; t8.finAt = D0 + '10:30'; t8.finBy = DR; } }
// ---- 12: jo'natish va yetkazib berish ----
var DRIVERS = [
  { id: 1, name: 'Otabek Nazarov', phone: '+998 90 318 44 21' }, { id: 2, name: 'Jamshid Valiyev', phone: '+998 93 571 20 08' }, { id: 3, name: 'Dilshod Rahimov', phone: '+998 97 402 66 15' },
  { id: 4, name: 'Sherzod Mirzayev', phone: '+998 90 955 13 47' }, { id: 5, name: "Ulug'bek Sobirov", phone: '+998 99 260 81 30' }];
var VEHICLES = [
  { no: '01 A 734 KA', type: 'Isuzu NPR · furgon', fridge: false }, { no: '01 B 218 MA', type: 'Labo · furgon', fridge: false }, { no: '01 B 456 CD', type: 'Isuzu NQR · refrijerator', fridge: true },
  { no: '01 A 123 BC', type: 'Damas · furgon', fridge: false }, { no: '01 C 902 RA', type: 'Hyundai Porter · refrijerator', fridge: true }, { no: '01 D 577 TA', type: 'GAZel Next · furgon', fridge: false }];
var AREA = { 'Toshkent, Yunusobod': "Shimoliy yo'nalish", "Toshkent, Mirzo Ulug'bek": "Shimoliy yo'nalish", 'Toshkent, Yashnobod': "Shimoliy yo'nalish", 'Toshkent': "Markaziy yo'nalish", 'Toshkent, Shayxontohur': "Markaziy yo'nalish", 'Toshkent, Yakkasaroy': "Markaziy yo'nalish", 'Toshkent, Mirobod': "Markaziy yo'nalish", 'Toshkent, Sergeli': "Janubiy yo'nalish", 'Toshkent, Chilonzor': "Janubiy yo'nalish", 'Toshkent, Olmazor': "Janubiy yo'nalish" };
var AREA_ORDER = ["Shimoliy yo'nalish", "Markaziy yo'nalish", "Janubiy yo'nalish"];
var RET_REASONS = ['Mijoz rad etdi', 'Shikastlangan', "Manzilda yo'q", 'Boshqa'];
var SHIP = permView({ planRoles: 'shipments.trip', shipRoles: 'shipments.ship' }, 'SHIP');
var DEBT0 = CUSTOMERS.map(function (c) { return AR_OPEN0[c.id] || 0; });
var TRIPS0 = [
  { no: 'RS-TSH-000042', date: '02.10.2026', driver: 1, car: '01 A 734 KA', exp: '', status: 'done', orders: ['BY-TSH-000329', 'BY-TSH-000328'], plannedAt: '01.10.2026 17:20', plannedBy: MAL, shippedAt: '02.10.2026 09:10', shippedBy: KEEPER, doneAt: '02.10.2026 16:40', doneBy: MAL },
  { no: 'RS-TSH-000043', date: '03.10.2026', driver: 2, car: '01 B 218 MA', exp: '', status: 'transit', orders: ['BY-TSH-000331', 'BY-TSH-000330'], plannedAt: '02.10.2026 17:05', plannedBy: MAL, shippedAt: '03.10.2026 09:20', shippedBy: KEEPER },
  { no: 'RS-TSH-000044', date: '04.10.2026', driver: 4, car: '01 D 577 TA', exp: 'Aziz Karimov', status: 'transit', orders: ['BY-TSH-000310', 'BY-TSH-000311'], plannedAt: '03.10.2026 18:10', plannedBy: BEK, shippedAt: '04.10.2026 09:30', shippedBy: KEEPER },
  { no: 'RS-TSH-000045', date: '04.10.2026', driver: 3, car: '01 B 456 CD', exp: '', status: 'planned', orders: ['BY-TSH-000333', 'BY-TSH-000312'], plannedAt: '04.10.2026 13:40', plannedBy: WHM },
  { no: 'RS-TSH-000047', date: '04.10.2026', driver: 3, car: '01 A 734 KA', exp: '', status: 'transit', orders: ['BY-TSH-000347', 'BY-TSH-000348', 'BY-TSH-000349'], plannedAt: '04.10.2026 08:40', plannedBy: WHM, shippedAt: '04.10.2026 09:50', shippedBy: 'Dilshod Rahimov' },
  { no: 'RS-TSH-000048', date: '04.10.2026', driver: 3, car: '01 B 456 CD', exp: '', status: 'transit', orders: ['BY-TSH-000350', 'BY-TSH-000351'], plannedAt: '03.10.2026 17:30', plannedBy: WHM, shippedAt: '04.10.2026 08:10', shippedBy: 'Dilshod Rahimov' }
];
function areaOf(c) { return (c && AREA[c.region]) || (c ? c.region : ''); }
function driverById(id) { return DRIVERS.filter(function (d) { return d.id === id; })[0] || null; }
function carByNo(no) { return VEHICLES.filter(function (v) { return v.no === no; })[0] || null; }
function orderByNo(no) { return store.orders.filter(function (o) { return o.no === no; })[0] || null; }
function pad6(n) { return ('00000' + n).slice(-6); }
function r2(x) { return Math.round(x * 100) / 100; }
function demoUi() { return store.demoUi !== false; } // T11a: demo tugmalari (Demo soat, Demo skaner, Namuna rasm, namunaviy fayl, PIN maslahati, Demo holatlar menyusi)
function shippedQty(o, l) { return Math.max(0, (l.qty || 0) - shortOf(o, l)); }
function saleTotals(o) { return orderTotals(Object.assign({}, o, { lines: o.lines.map(function (l) { return Object.assign({}, l, { qty: shippedQty(o, l) }); }) })); }
function lineSum(o, pid, qty) { var c = custAt(o.cust, o.branch) || {}, p = prodById(pid) || {}, l = o.lines.filter(function (x) { return x.pid === pid; })[0], pr = l ? linePrice(l, o) : (basePrice(pid, o.branch) || 0); return r2(qty * pr * (1 - (c.disc || 0) / 100)); }
function dueDate(o, at) { var c = custAt(o.cust, o.branch) || {}; return fD(pD(String(at).slice(0, 10)) + (c.terms || 0) * DAY); }
function buildPk(o, endAt) {
  var sh = o.seedShort || {}, lines = pickPlan(o);
  lines.forEach(function (pl) {
    var p = prodById(pl.pid) || {}, miss = Math.min(pl.qty, sh[p.name] || 0), left = pl.qty - miss;
    pl.found = left; pl.state = miss ? 'short' : 'done'; pl.reason = miss ? 'Qoldiq yetmadi' : '';
    pl.picks = pl.plan.map(function (x) { var q = Math.min(left, x.qty); left -= q; return { batch: x.batch, exp: x.exp, qty: q }; }).filter(function (x) { return x.qty > 0; });
    if (!pl.plan.length && pl.found > 0) { var fb = baseBatches().filter(function (b) { return b.pid === pl.pid && b.branch === o.branch && b.wh === o.wh && b.status === 'open' && b.qty > 0; }).sort(function (x, y) { return pD(x.exp) - pD(y.exp); })[0]; if (fb) { pl.zone = fb.zone; pl.plan = [{ batch: fb.batch, exp: fb.exp, days: fb.days, zone: fb.zone, qty: pl.found }]; pl.picks = [{ batch: fb.batch, exp: fb.exp, qty: pl.found }]; } }
    var got = pl.picks.reduce(function (a, x) { return a + x.qty; }, 0);
    if (pl.plan.length && got < pl.found) { pl.found = got; pl.state = 'short'; pl.reason = 'Qoldiq yetmadi'; }
    if (p.mark) pl.codes = new Array(pl.found).fill(0).map(function (_, j) { return 'C' + o.no.slice(-3) + pl.i + '-' + j; });
  });
  var end = endAt || o.pickEnd || nowStr();
  return { by: o.picker || KEEPER, start: o.pickStart || addMin(end, -35), end: end, paused: false, lines: lines };
}
function mkSale(o, at, method, by, trip) {
  var br = o.branch, n = store.saleSeq[br] || 1, t = saleTotals(o); store.saleSeq[br] = n + 1;
  var nk0 = (o.dc && o.dc.nak) || null, sale = { no: 'SV-' + br + '-' + pad6(n), inv: 'HF-' + br + '-' + pad6(n), nak: nk0, at: at, by: by, method: method, trip: trip || null, sum: t.total, qty: t.qty, due: dueDate(o, at) };
  store.sales.unshift({ no: sale.no, inv: sale.inv, nak: nk0, oid: o.id, ono: o.no, cust: o.cust, branch: br, method: method, trip: sale.trip, at: at, sum: sale.sum, qty: t.qty, by: by });
  return sale;
}
function doShip(n, x) {
  var at = x.at || nowStr(), c = custById(n.cust);
  n.sale = mkSale(n, at, x.method, x.who, x.trip);
  if (x.seed) return;
  autoAdv('mt', n.cust, br0(n), n.sale.no, x.who);
  if (x.method === 'pickup') { n.status = 'delivered'; n.ship = { driver: '—', car: '—', at: at, deliveredAt: at, receiver: x.rep }; n.log.push({ kind: 'shipped', who: x.who, at: at }); n.log.push({ kind: 'delivered', who: x.rep, at: at }); }
  else { n.status = 'shipped'; n.ship = { driver: x.driver, car: x.car, at: at, trip: x.trip }; n.log.push({ kind: 'shipped', who: x.who, at: at }); }
}
function updOrders(ids, fn) { store.orders = store.orders.map(function (o) { if (ids.indexOf(o.id) < 0) return o; var n = JSON.parse(JSON.stringify(o)); n.log = orderLog(o).slice(); fn(n); return n; }); store.v++; }
function handOff(id, who, rep) { updOrders([id], function (n) { doShip(n, { method: 'pickup', who: who, rep: rep }); }); return store.orders.filter(function (o) { return o.id === id; })[0]; }
function tripCopy(t) { return t ? JSON.parse(JSON.stringify(t)) : null; }
function tripByNo(no) { return store.trips.filter(function (t) { return t.no === no; })[0] || null; }
function nextTripNo(br) { var m = 0; store.trips.forEach(function (t) { if (t.no && t.branch === br) m = Math.max(m, +t.no.split('-')[2]); }); return 'RS-' + br + '-' + pad6(m + 1); }
function saveTrip(t) { var c = tripCopy(t); if (!c.no) c.no = nextTripNo(c.branch); var i = store.trips.map(function (x) { return x.no; }).indexOf(c.no); store.trips = store.trips.slice(); if (i >= 0) store.trips[i] = c; else store.trips.push(c); store.v++; return tripCopy(c); }
function tripOfOrder(oid, except) { return store.trips.filter(function (t) { return t.no !== except && ['planned', 'transit'].indexOf(t.status) >= 0 && t.stops.some(function (s) { return s.oid === oid; }); })[0] || null; }
function planTrip(t, who) { var c = tripCopy(t); c.status = 'planned'; c.plannedAt = nowStr(); c.plannedBy = who; return saveTrip(c); }
function cancelTrip(no, who) { var t = tripCopy(tripByNo(no)); t.status = 'cancelled'; t.cancelledAt = nowStr(); t.cancelledBy = who; return saveTrip(t); }
function shipTrip(no, who) {
  var t = tripCopy(tripByNo(no)), d = driverById(t.driver) || {}, at = nowStr();
  updOrders(t.stops.map(function (s) { return s.oid; }), function (n) { doShip(n, { method: 'trip', who: who, trip: t.no, driver: d.name, car: t.car, at: at }); });
  t.status = 'transit'; t.shippedAt = at; t.shippedBy = who; t.stops.forEach(function (s) { s.res = null; }); return saveTrip(t);
}
function retPlan(n, pid, qty) {
  var ps = picksOf(n).filter(function (x) { return x.pid === pid; }).reverse(), left = qty, out = [];
  ps.forEach(function (x) { if (left <= 0) return; var q = Math.min(left, x.qty); out.push({ pid: pid, batch: x.batch, exp: x.exp, qty: q }); left -= q; });
  if (left > 0) out.push({ pid: pid, batch: ps[0] ? ps[0].batch : '—', exp: ps[0] ? ps[0].exp : '', qty: left });
  return out;
}
function stopReturns(n, s) {
  var ret = [];
  n.lines.forEach(function (l) { var q = shippedQty(n, l), dq = s.res === 'fail' ? 0 : s.res === 'part' && s.qty && s.qty[l.id] != null ? s.qty[l.id] : q; if (dq < q) ret = ret.concat(retPlan(n, l.pid, q - dq)); });
  var qty = 0, sum = 0; n.lines.forEach(function (l) { var rq = ret.filter(function (r) { return r.pid === l.pid; }).reduce(function (a, r) { return a + r.qty; }, 0); if (rq) { qty += rq; sum += lineSum(n, l.pid, rq); } });
  return { lines: ret, qty: qty, sum: r2(sum) };
}
function finishTrip(no, stops, who) {
  var t = tripCopy(tripByNo(no)), d = driverById(t.driver) || {}, at = nowStr(), by = {}; t.stops = JSON.parse(JSON.stringify(stops));
  t.stops.forEach(function (s) { by[s.oid] = s; });
  updOrders(t.stops.map(function (s) { return s.oid; }), function (n) {
    var s = by[n.id], c = custById(n.cust), R = stopReturns(n, s);
    n.ship = Object.assign({}, n.ship || {}, { signed: !!s.signed, photo: s.photo || null });
    if (R.qty > 0) { n.ret = { at: at, trip: t.no, reason: s.reason || '', lines: R.lines, qty: R.qty, sum: R.sum, full: s.res === 'fail' }; }
    if (s.res === 'fail') { n.status = 'cancelled'; n.reason = "Yetkazilmadi: " + (s.reason || ''); n.canc = { by: who, at: at, from: 'shipped' }; n.log.push({ kind: 'cancel', who: who, at: at, reason: n.reason }); }
    else { n.status = 'delivered'; n.ship.deliveredAt = at; n.ship.receiver = n.ship.receiver || (c ? c.name : ''); n.log.push({ kind: 'delivered', who: d.name || who, at: at }); }
  });
  t.status = 'done'; t.doneAt = at; t.doneBy = who; return saveTrip(t);
}
function shipReady(br) { return store.orders.filter(function (o) { return (o.status === 'loading' || o.status === 'ready') && (!br || br === 'ALL' || o.branch === br); }); } // T9-4a: Jo'natish — «Yuklanmoqda»
function shipInfo(o) {
  var t = saleTotals(o), c = custAt(o.cust, o.branch) || {}, ps = o.lines.map(function (l) { return prodById(l.pid) || {}; }), short = 0, tr = tripOfOrder(o.id), at = o.pk && o.pk.end ? o.pk.end : (o.pickEnd || null);
  o.lines.forEach(function (l) { short += shortOf(o, l); });
  return { o: o, c: c, area: areaOf(c), lines: o.lines.length, qty: t.qty, sum: t.total, short: short, ctrl: ps.some(function (p) { return p.ctrl; }), trip: tr ? tr.no : null, pickedAt: at, waitMin: at ? Math.max(0, Math.round((NOW - pDT(at)) / 60000)) : 0 };
}
function seedShip() { return bulk(seedShipRaw); }
function seedShipRaw() {
  store.orders.forEach(function (o) { if ((['marking', 'checking', 'docs', 'loading', 'ready'].indexOf(o.status) >= 0 || T94B_ORD.indexOf(o.no) >= 0) && !o.pk && o.branch === 'TSH') o.pk = buildPk(o); });
  seedMark();
  store.trips = TRIPS0.map(function (t) { var c = tripCopy(t); c.branch = 'TSH'; c.stops = c.orders.map(function (no) { var o = orderByNo(no); return o ? { oid: o.id, res: c.status === 'done' ? 'ok' : null, signed: c.status === 'done', loaded: c.status !== 'planned' } : null; }).filter(Boolean); delete c.orders; return c; });
  store.sales = []; store.saleSeq = { TSH: 202, SMQ: 120, BXR: 66, FRG: 94 };
  ['322', '327', '329', '328', '331', '330', '310', '311', '347', '348', '349', '350', '351'].forEach(function (k) { var o = orderByNo('BY-TSH-000' + k); if (!o) return; var sh = o.ship || {}, tr = store.trips.filter(function (t) { return t.stops.some(function (s) { return s.oid === o.id; }); })[0]; doShip(o, { seed: true, at: sh.at || (o.delivDate + ' 17:00'), method: o.delivery === 'pickup' ? 'pickup' : 'trip', who: KEEPER, trip: tr ? tr.no : null }); });
  // 25a (0-b): 30.09 dan keyin jo'natilgan SMQ/FRG buyurtmalari — 12-qadamdagi doShip bilan SV, FEFO terish
  var bx = orderByNo('BY-BXR-000064'); if (bx) { bx.arch = 'BQ'; bx.note = (bx.note ? bx.note + ' · ' : '') + "Kesish sanasi (30.09.2026) kunidagi jo'natish — qarz va qoldiq ta'siri BQ da"; } // partiya 20.09 da muddati o'tgan, tizimda jo'natib bo'lmaydi
  ['BY-BXR-000064', 'BY-SMQ-000117', 'BY-SMQ-000118', 'BY-FRG-000092'].forEach(function (no) { var o = orderByNo(no); if (!o || store.sales.some(function (s) { return s.oid === o.id; })) return; var sh = orderLog(o).filter(function (e) { return e.kind === 'shipped'; })[0], k = empNames('keeper', o.branch)[0] || KEEPER; if (!o.pk) o.pk = buildPk(o, sh ? addMin(sh.at, -90) : null); doShip(o, { seed: true, at: sh ? sh.at : o.date + ' 17:00', method: o.delivery === 'pickup' ? 'pickup' : 'trip', who: k, trip: null }); });
  ['BY-TSH-000355', 'BY-TSH-000356'].forEach(function (no) { var o = orderByNo(no); if (!o || store.sales.some(function (s) { return s.oid === o.id; })) return; if (!o.pk) o.pk = buildPk(o, addMin(o.ship.at, -40)); doShip(o, { seed: true, at: o.ship.at, method: 'pickup', who: KEEPER, trip: null }); }); // T10a2
  store.sales.forEach(function (s) { s.seed = true; });
  seedCtrl(); seedDrv();
}
function shipReset() {
  store.demoDirty = true; store.era = false; if (store.docs) store.docs.qm = store.docs.qm.filter(function (d) { return d.no !== 'QM-TSH-000012'; });
  var keep = {}; ORDERS.forEach(function (o) { if (o.branch === 'TSH' && (['checking', 'docs', 'loading', 'ready', 'shipped', 'delivered'].indexOf(o.status) >= 0 || o.no === 'BY-TSH-000337')) keep[o.id] = o; });
  store.orders = store.orders.map(function (o) { if (!keep[o.id]) return o; var n = JSON.parse(JSON.stringify(keep[o.id])); if (n.no === 'BY-TSH-000337') { n.status = 'loading'; n.pickStart = '04.10.2026 14:15'; n.pickEnd = '04.10.2026 14:50'; } return n; });
  seedShip(); store.v++;
}
// ---- 13: qaytarishlar va hisobdan chiqarish ----
var QM_REASONS = ['Muddati yaqin', 'Shikastlangan', "Noto'g'ri yuborilgan", 'Mijoz rad etdi', 'Boshqa'];
var HC_REASONS = ["Muddati o'tgan", 'Shikastlangan', 'Sifatsiz — Karantin natijasi', "Yo'qolgan", "Ko'chirishda yo'qolgan", 'Boshqa'];
var QY_REASONS = ["Muddati o'tgan", 'Sifatsiz', "Noto'g'ri yetkazilgan", "Kelishuv bo'yicha"];
var HC_RULE = { get branchRoles() { return whoCan('hc.approve'); }, get directorOver() { return CONFIG.hcDirApprove; }, get directorRoles() { return whoCan('hc.director'); } }; // tannarxda
var DOC_ROLES = { qm: permView({ create: 'qm.create', post: 'qm.approve' }, 'DOC_qm'), hc: permView({ create: 'hc.create', post: 'hc.approve' }, 'DOC_hc'), qy: permView({ create: 'qy.create', post: 'qy.approve' }, 'DOC_qy') };
var STAFF = empNames(['keeper', 'purchase', 'branch', 'operator', 'accountant', 'admin'], 'TSH', true);
var DOC_PREFIX = { qm: 'QM', hc: 'HC', qy: 'QY' };
var SUPDEBT0 = SUPPLIERS.map(function (x) { return AP_OPEN0[x.name] || 0; });
function supByName(n) { return SUPPLIERS.filter(function (x) { return x.name === n; })[0] || null; }
function saleByNo(no) { return store.sales.filter(function (x) { return x.no === no; })[0] || null; }
function orderOfSale(no) { var s = saleByNo(no); return s ? store.orders.filter(function (o) { return o.id === s.oid; })[0] || null : null; }
function qmReturned(saleNo, pid, batch, exceptId) {
  var n = 0, o = orderOfSale(saleNo);
  if (o && o.ret) o.ret.lines.forEach(function (r) { if (r.pid === pid && r.batch === batch) n += r.qty; });
  store.docs.qm.forEach(function (d) { if (d.status !== 'posted' || d.saleNo !== saleNo || d.id === exceptId) return; d.lines.forEach(function (l) { if (l.pid === pid && l.batch === batch) n += l.qty || 0; }); });
  return n;
}
function saleLines(saleNo, exceptId) {
  var o = orderOfSale(saleNo); if (!o) return [];
  var m = {}; picksOf(o).forEach(function (x) { var k = x.pid + '|' + x.batch; if (!m[k]) m[k] = { pid: x.pid, batch: x.batch, exp: x.exp, sold: 0 }; m[k].sold += x.qty; });
  return Object.keys(m).map(function (k) { var x = m[k]; x.prior = qmReturned(saleNo, x.pid, x.batch, exceptId); x.left = Math.max(0, x.sold - x.prior); var c = custAt(o.cust, o.branch) || {}, l = o.lines.filter(function (y) { return y.pid === x.pid; })[0]; x.price = r2((l ? pickPrice(o, l, x.batch) : 0) * (1 - (c.disc || 0) / 100)); return x; });
}
function custSales(cust) { return store.sales.filter(function (x) { return x.cust === cust; }).map(function (x) { var ls = saleLines(x.no); return Object.assign({}, x, { returnable: ls.filter(function (l) { return l.left > 0; }).length }); }); }
function lineDocSum(d, l) {
  if (d.kind === 'qm') { if (l.price != null) return r2((l.qty || 0) * l.price); var o = orderOfSale(d.saleNo); return o ? lineSum(o, l.pid, l.qty || 0) : 0; }
  if (d.kind === 'hc') return r2((l.qty || 0) * (l.cost || 0));
  var p = prodById(l.pid) || {}; return r2((l.qty || 0) * (l.price || 0) * (1 + (p.vat || 0) / 100));
}
function docSum(d) { return r2(d.lines.reduce(function (a, l) { return a + lineDocSum(d, l); }, 0)); }
function docQty(d) { return d.lines.reduce(function (a, l) { return a + (l.qty > 0 ? l.qty : 0); }, 0); }
function nextDocNo(kind, br) { var m = 0; store.docs[kind].forEach(function (d) { if (d.no && d.branch === br) m = Math.max(m, +d.no.split('-')[2]); }); return DOC_PREFIX[kind] + '-' + br + '-' + pad6(m + 1); }
function docCopy(d) { return d ? JSON.parse(JSON.stringify(d)) : null; }
function docById(kind, id) { return store.docs[kind].filter(function (d) { return d.id === id; })[0] || null; }
function docByNo(kind, no) { return store.docs[kind].filter(function (d) { return d.no === no; })[0] || null; }
function saveDoc(d) { var c = docCopy(d); if (!c.no) c.no = nextDocNo(c.kind, c.branch); if (!c.id) c.id = c.kind + '-' + c.no; var a = store.docs[c.kind].slice(), i = a.map(function (x) { return x.id; }).indexOf(c.id); if (i >= 0) a[i] = c; else a.unshift(c); store.docs[c.kind] = a; store.v++; return docCopy(c); }
function deleteDoc(kind, id) { store.docs[kind] = store.docs[kind].filter(function (d) { return d.id !== id; }); store.v++; }
function hcNeedsDirector(d) { return docSum(d) > HC_RULE.directorOver; }
function docEffect(d, sign) {
  var sum = docSum(d);
  return sum;
}
function postDoc(d, who) { var c = docCopy(d), at = nowStr(); c.lines = c.lines.filter(function (l) { return l.qty > 0; }); c.status = 'posted'; c.postedBy = who; c.postedAt = at; c.log = (c.log || []).concat([{ kind: 'post', who: who, at: at }]); c.eff = docEffect(c, 1); return saveDoc(c); }
function sendDoc(d, who) { var c = docCopy(d), at = nowStr(); c.status = 'pending'; c.sentBy = who; c.sentAt = at; c.log = (c.log || []).concat([{ kind: 'send', who: who, at: at }]); return saveDoc(c); }
function cancelDoc(kind, id, who, reason) { var c = docCopy(docById(kind, id)), at = nowStr(); if (c.status === 'posted') docEffect(c, -1); c.eff = null; c.status = 'cancelled'; c.cancelledBy = who; c.cancelledAt = at; c.cancelReason = reason || ''; c.log = (c.log || []).concat([{ kind: 'cancel', who: who, at: at, reason: reason || '' }]); return saveDoc(c); }
function qmBlock(d) { // Karantinga tushgan partiya keyingi hujjat bilan chiqarilgan bo'lsa — bekor qilib bo'lmaydi
  var out = [], pre = d.no + '-';
  ['hc', 'qy'].forEach(function (kind) { store.docs[kind].forEach(function (x) { if (x.status !== 'posted') return; x.lines.forEach(function (l) { if (l.bid && l.bid.indexOf(pre) === 0) { var src = d.lines[+l.bid.slice(pre.length)] || {}; out.push({ doc: x.no, qty: l.qty, pid: l.pid, batch: l.batch, ret: src.qty || 0 }); } }); }); });
  return out;
}
function whBatches(br, wh) { return batches().filter(function (b) { return b.branch === br && b.wh === wh && b.zoneType !== 'ship' && b.qty > 0; }); }
function qmLinesFor(saleNo, exceptId) { return saleLines(saleNo, exceptId).map(function (x, i) { var o = orderOfSale(saleNo) || {}, vz = priceAt(x.pid, 'vozvrat', o.branch || 'TSH'); return { id: 'l' + i + '-' + x.pid, pid: x.pid, batch: x.batch, exp: x.exp, qty: 0, reason: '', price: vz ? vz.price : x.price, priceSrc: vz ? 'vozvrat' : 'sale', salePrice: x.price }; }); }
function qyLinesFor(rcNo) {
  var rc = store.receipts.filter(function (r) { return r.no === rcNo; })[0]; if (!rc) return [];
  var bs = batches();
  return rc.lines.filter(function (l) { return l.pid && l.qty > 0; }).map(function (l, i) { var b = bs.filter(function (x) { return x.id === 'R' + l.id; })[0] || bs.filter(function (x) { return x.pid === l.pid && x.batch === l.batch && x.branch === rc.branch && x.wh === rc.wh && x.zoneType !== 'ship'; })[0]; return { id: 'l' + i + '-' + l.pid, pid: l.pid, batch: l.batch, exp: l.exp, inQty: l.qty, price: l.price, bid: b ? b.id : null, qty: 0 }; });
}
function mkDoc(kind, no, status, date, time, who, x) {
  var d = Object.assign({ kind: kind, no: no, id: kind + '-' + no, branch: 'TSH', wh: 'Asosiy ombor', date: date, status: status, note: '', createdBy: who, createdAt: date + ' ' + time, lines: [] }, x || {});
  var at = date + ' ' + time; d.log = [{ kind: 'create', who: who, at: at }];
  if (status === 'posted' || status === 'cancelled') { d.postedBy = x.postedBy || BEK; d.postedAt = x.postedAt || at; d.log.push({ kind: 'post', who: d.postedBy, at: d.postedAt }); }
  if (status === 'cancelled') { d.cancelledBy = x.cancelledBy || BEK; d.cancelledAt = x.cancelledAt || at; d.log.push({ kind: 'cancel', who: d.cancelledBy, at: d.cancelledAt, reason: d.cancelReason || '' }); }
  return d;
}
function seedDocs() { return bulk(seedDocsRaw); }
function seedDocsRaw() {
  store.docs = { qm: [], hc: [], qy: [] };
  var qm = function (n, st, date, time, who, saleNo, specs, x) { var sl = saleByNo(saleNo); if (!sl) return; var ls = qmLinesFor(saleNo).map(function (l) { var p = prodById(l.pid) || {}, sp = specs.filter(function (z) { return z[0] === p.name; })[0]; if (sp) { l.qty = sp[1]; l.reason = sp[2]; } return l; }); store.docs.qm.push(mkDoc('qm', 'QM-TSH-' + pad6(n), st, date, time, who, Object.assign({ cust: sl.cust, saleNo: saleNo, lines: st === 'draft' ? ls : ls.filter(function (l) { return l.qty > 0; }) }, x || {}))); };
  qm(11, 'draft', '04.10.2026', '13:20', MAL, 'SV-TSH-000206', [['Ciprofloksatsin 500mg', 100, 'Shikastlangan']]);
  qm(10, 'draft', '04.10.2026', '11:45', MAL, 'SV-TSH-000207', [['Analgin 50% 2ml', 20, 'Mijoz rad etdi']]);
  qm(9, 'posted', '03.10.2026', '11:10', MAL, 'SV-TSH-000204', [['Lizinopril 10mg', 10, 'Muddati yaqin']], { postedBy: KEEPER, postedAt: '03.10.2026 11:40' });
  qm(8, 'cancelled', '03.10.2026', '09:30', BEK, 'SV-TSH-000205', [['Ketorolak 30mg 1ml', 10, 'Mijoz rad etdi']], { postedBy: KEEPER, postedAt: '03.10.2026 10:05', cancelledBy: BEK, cancelledAt: '03.10.2026 12:20', cancelReason: 'Mijoz tovarni qaytarib oldi' });
  qm(7, 'posted', '02.10.2026', '14:40', MAL, 'SV-TSH-000202', [['Drotaverin 2% 2ml', 20, "Noto'g'ri yuborilgan"]], { postedBy: KEEPER, postedAt: '02.10.2026 15:10' });
  qm(6, 'posted', '30.09.2026', '15:55', BEK, 'SV-TSH-000203', [['Ibuprofen 400mg', 10, 'Shikastlangan']], { postedBy: KEEPER, postedAt: '30.09.2026 16:20' });
  var bs = batches(), bf = function (name, batch) { return bs.filter(function (b) { return b.p && b.p.name === name && b.branch === 'TSH' && b.wh === 'Asosiy ombor' && (!batch || b.batch === batch) && b.zoneType !== 'ship'; })[0]; };
  var hl = function (b, q) { return b ? { id: 'h' + b.id, bid: b.id, pid: b.pid, batch: b.batch, zone: b.zoneLabel, exp: b.exp, cost: b.cost, qty: q } : null; };
  var hc = function (n, st, date, time, who, reason, lines, x) { store.docs.hc.push(mkDoc('hc', 'HC-TSH-' + pad6(n), st, date, time, who, Object.assign({ reason: reason, commission: [KEEPER, 'Jahongir Usmonov'], actNo: 'DL-' + date.slice(0, 2) + date.slice(3, 5) + '-' + n, file: null, lines: lines.filter(Boolean) }, x || {}))); };
  var q7 = docByNo('qm', 'QM-TSH-000007'), dro = q7 ? { id: 'hQM7', bid: 'QM-TSH-000007-0', pid: q7.lines[0].pid, batch: q7.lines[0].batch, zone: 'Karantin', exp: q7.lines[0].exp, cost: (bf('Drotaverin 2% 2ml') || {}).cost || 6200, qty: 20 } : null;
  hc(7, 'draft', '04.10.2026', '10:15', KEEPER, "Muddati o'tgan", [hl(bf('Ketorolak 30mg 1ml', 'KT-2408'), 40)], { commission: [KEEPER] });
  hc(6, 'posted', '03.10.2026', '15:30', KEEPER, 'Sifatsiz — Karantin natijasi', [dro], { postedBy: BEK, postedAt: '03.10.2026 16:00', file: { name: 'dalolatnoma_HC6.pdf', size: 412000 } });
  hc(5, 'posted', '01.10.2026', '17:10', KEEPER, "Yo'qolgan", [hl(bf('Ibuprofen 400mg'), 2)], { postedBy: BEK, postedAt: '01.10.2026 17:40', file: { name: 'dalolatnoma_HC5.pdf', size: 268000 } });
  hc(4, 'cancelled', '28.09.2026', '12:00', KEEPER, "Yo'qolgan", [hl(bf('Ibuprofen 400mg'), 3)], { postedBy: BEK, postedAt: '28.09.2026 12:30', cancelledBy: BEK, cancelledAt: '28.09.2026 16:10', cancelReason: 'Inventarizatsiyada topildi' });
  hc(3, 'posted', '25.09.2026', '11:20', KEEPER, 'Shikastlangan', [hl(bf('Paracetamol 500mg', '2408A'), 5)], { postedBy: BEK, postedAt: '25.09.2026 11:50', file: { name: 'dalolatnoma_HC3.jpg', size: 1240000 } });
  var qy = function (n, st, date, time, who, rcNo, reason, specs, x) { var rc = store.receipts.filter(function (r) { return r.no === rcNo; })[0]; var ls = qyLinesFor(rcNo).map(function (l) { var p = prodById(l.pid) || {}, sp = specs.filter(function (z) { return z[0] === p.name; })[0]; if (sp) l.qty = sp[1]; return l; }); store.docs.qy.push(mkDoc('qy', 'QY-TSH-' + pad6(n), st, date, time, who, Object.assign({ supplier: rc.supplier, receiptNo: rcNo, wh: rc.wh, reason: reason, lines: st === 'draft' ? ls : ls.filter(function (l) { return l.qty > 0; }) }, x || {}))); };
  qy(4, 'draft', '04.10.2026', '12:30', 'Jahongir Usmonov', 'KR-TSH-000118', "Kelishuv bo'yicha", [['Diklofenak 75mg 3ml', 30], ['Metronidazol 500mg 100ml', 50]]);
  qy(3, 'cancelled', '02.10.2026', '10:00', 'Jahongir Usmonov', 'KR-TSH-000124', 'Sifatsiz', [['Analgin 50% 2ml', 10]], { postedBy: KEEPER, postedAt: '02.10.2026 10:30', cancelledBy: BEK, cancelledAt: '02.10.2026 14:00', cancelReason: 'Yetkazib beruvchi almashtirib berdi' });
  qy(2, 'posted', '30.09.2026', '16:00', 'Jahongir Usmonov', 'KR-TSH-000122', "Noto'g'ri yetkazilgan", [['Deksametazon 4mg 1ml', 20]], { postedBy: KEEPER, postedAt: '30.09.2026 16:30' });
  qy(1, 'posted', '26.09.2026', '11:00', 'Jahongir Usmonov', 'KR-TSH-000118', 'Sifatsiz', [['Ketorolak 30mg 1ml', 10]], { postedBy: KEEPER, postedAt: '26.09.2026 11:30' });
  if (store.era) addQm12();
}
function docsReset() { ['qm', 'hc', 'qy'].forEach(function (k) { (store.docs ? store.docs[k] : []).forEach(function (d) { if (d.eff != null && d.status === 'posted') docEffect(d, -1); }); }); seedDocs(); store.v++; }

// ---- 14: Pul — to'lovlar, kassa va bank, kontragent qarzi (yagona hisob funksiyasi: ledger) ----
var ACCOUNTS = [
  { id: 'K-TSH', kind: 'cash', branch: 'TSH', name: 'Toshkent · Asosiy kassa', open: 4480000 }, // Y4: CASH_TSH olib tashlandi — qoldiq hisobdan (ochilish + harakatlar)
  { id: 'B-TSH-1', kind: 'bank', branch: 'TSH', bank: 'Hamkorbank', acc: '20208000900412873001', name: 'Toshkent · Hamkorbank', open: 184500000 },
  { id: 'B-TSH-2', kind: 'bank', branch: 'TSH', bank: 'Kapitalbank', acc: '20208000500318826002', name: 'Toshkent · Kapitalbank', open: 62300000 },
  { id: 'T-TSH', kind: 'term', branch: 'TSH', bank: 'Terminal (karta)', acc: 'Uzcard / Humo', name: 'Toshkent · Terminal (karta)', open: 0 }, // Y4: Online (karta) MT shu hisobga tushadi; bankka — IO (t2b)
  { id: 'K-SMQ', kind: 'cash', branch: 'SMQ', name: 'Samarqand · Asosiy kassa', open: 2150000 },
  { id: 'B-SMQ-1', kind: 'bank', branch: 'SMQ', bank: 'Ipoteka-bank', acc: '20208000300527194001', name: 'Samarqand · Ipoteka-bank', open: 48700000 },
  { id: 'T-SMQ', kind: 'term', branch: 'SMQ', bank: 'Terminal (karta)', acc: 'Uzcard / Humo', name: 'Samarqand · Terminal (karta)', open: 0 },
  { id: 'K-BXR', kind: 'cash', branch: 'BXR', name: 'Buxoro · Asosiy kassa', open: 1380000 },
  { id: 'B-BXR-1', kind: 'bank', branch: 'BXR', bank: 'Xalq banki', acc: '20208000700219356001', name: 'Buxoro · Xalq banki', open: 31200000 },
  { id: 'T-BXR', kind: 'term', branch: 'BXR', bank: 'Terminal (karta)', acc: 'Uzcard / Humo', name: 'Buxoro · Terminal (karta)', open: 0 },
  { id: 'K-FRG', kind: 'cash', branch: 'FRG', name: "Farg'ona · Asosiy kassa", open: 1940000 },
  { id: 'B-FRG-1', kind: 'bank', branch: 'FRG', bank: 'Asaka bank', acc: '20208000100645731001', name: "Farg'ona · Asaka bank", open: 39600000 },
  { id: 'T-FRG', kind: 'term', branch: 'FRG', bank: 'Terminal (karta)', acc: 'Uzcard / Humo', name: "Farg'ona · Terminal (karta)", open: 0 }
];
var PAY_ROLES = permView({ create: 'payments.create', cashOnly: function () { return rlRoles().filter(function (r) { return r.active !== false && can(r.id, 'payments.create') && !can(r.id, 'payments.noncash'); }).map(function (r) { return r.id; }); }, postMt: 'payments.mt', sendYt: 'payments.yt', postYt: 'payments.ytApprove', direct: 'payments.ytDirect', cancel: 'payments.cancel', view: 'payments.view' }, 'PAY_ROLES');
var PAY_PREFIX = { mt: 'MT', yt: 'YT' };
var ACC = empNames('accountant')[0], CASHIER = empNames('cashier', 'TSH')[0];
function accById(id) { return ACCOUNTS.filter(function (a) { return a.id === id; })[0] || null; }
function accountsOf(br, kind) { return ACCOUNTS.filter(function (a) { return a.branch === br && (!kind || a.kind === kind); }); }
function accBalance(id, exceptId, upTo) { var a = accById(id); if (!a) return 0; var t = upTo ? pD(upTo) : null, b = accOpen(a); accMoves(id).forEach(function (m) { if (m.status !== 'posted' || m.id === exceptId || (t != null && pD(m.date) > t)) return; b += m.dir === 'in' ? m.sum : -m.sum; }); return r2(b); }
// Kirim qatori: fact — ombor mudiri sanagan soni (null = hujjat bo'yicha); diff: short|over|dmg; decision: fact|doc (o'tkazishda)
function rcHasFact(l) { return l.fact != null && l.fact !== '' && +l.fact !== (l.qty || 0); }
function rcGood(l) { return rcHasFact(l) ? Math.max(0, +l.fact) : (l.qty || 0); }
function rcDmg(l) { return rcHasFact(l) && l.diff === 'dmg' && +l.fact < (l.qty || 0) ? (l.qty || 0) - +l.fact : 0; }
function rcPayQty(r, l) { return r.decision === 'fact' && rcHasFact(l) ? Math.max(0, +l.fact) : (l.qty || 0); }
function rcTerms(sup, br) { var s = supByName(sup); return s ? ((s.bt && s.bt[br] && s.bt[br].days) || s.terms || 0) : 0; }
function rcAutoDue(r) { var t = pD(r.date); return t == null ? '' : fD(t + rcTerms(r.supplier, r.branch) * DAY); }
function rcDue(r) { return r.due || rcAutoDue(r); }
function rcBonusGoods(r) { var n = 0, s = 0; r.lines.forEach(function (l) { if (!(l.bonusQty > 0)) return; n += l.bonusQty; s += l.bonusQty * (basePrice(l.pid, r.branch) || 0); }); return { qty: n, sum: r2(s) }; }
// Bonus balans — yetkazib beruvchi + filial: tasdiqlangan BNS − bonus hisobidan kirimlar (o'tkazilgan). Qarzga aralashmaydi
function nextBnsNo(br) { var m = 0; (store.bns || []).forEach(function (x) { if (x.branch === br) m = Math.max(m, +x.no.split('-')[2]); }); return 'BNS-' + br + '-' + pad6(m + 1); }
function bonusOf(sup, br, exceptNo) { var o = { balance: 0, expected: [], history: [], expSum: 0 };
  (store.bns || []).forEach(function (x) { if (x.supplier !== sup || x.branch !== br || x.status !== 'posted') return; o.balance = r2(o.balance + x.sum); o.history.push({ no: x.no, date: x.date, sum: x.sum, rcNo: x.rcNo, kind: 'bns' }); });
  store.receipts.forEach(function (r) { if (r.supplier !== sup || r.branch !== br) return;
    if (r.fromBonus && r.status === 'posted' && r.no !== exceptNo) { var g = rcGross(r); o.balance = r2(o.balance - g); o.history.push({ no: r.no, date: r.date, sum: -g, kind: 'rc' }); }
    if (r.status === 'posted' && r.bonus && r.bonus.on && r.bonus.state === 'wait') { o.expected.push({ no: r.no, date: r.bonus.date, sum: r.bonus.sum }); o.expSum = r2(o.expSum + r.bonus.sum); } });
  o.history.sort(function (a, b) { return pD(b.date) - pD(a.date); }); return o; }
function bonusDecide(rcNo, ok, who, reason) { var at = nowStr(), out = null;
  store.receipts = store.receipts.map(function (r) { if (r.no !== rcNo || !r.bonus || r.bonus.state !== 'wait') return r; var c = JSON.parse(JSON.stringify(r)); c.bonus.state = ok ? 'ok' : 'no'; c.bonus.by = who; c.bonus.at = at;
    if (ok) { var no = nextBnsNo(c.branch); c.bonus.bnsNo = no; store.bns = (store.bns || []).concat([{ no: no, branch: c.branch, supplier: c.supplier, rcNo: c.no, sum: c.bonus.sum, date: at.slice(0, 10), status: 'posted', by: who, at: at }]); }
    else c.bonus.reason = reason || '';
    c.history.push({ kind: 'status', who: who, action: ok ? 'bonusni tasdiqladi' : 'bonus berilmadi deb belgiladi', time: at.replace(' ', ', '), changes: [{ field: 'Bonus', from: 'Kutilmoqda', to: ok ? c.bonus.bnsNo : 'Berilmadi' + (reason ? ' — ' + reason : '') }] });
    auditAdd && auditAdd({ who: who, action: ok ? 'supplierBonus.confirm' : 'supplierBonus.reject', obj: rcNo, text: ok ? c.bonus.bnsNo + ' · ' + c.bonus.sum : reason });
    out = c; return c; }); store.v++; return out; }
function rcGross(r) { var net = 0, vat = 0; r.lines.forEach(function (l) { var p = prodById(l.pid), n = rcPayQty(r, l) * (l.price || 0); net += n; vat += n * ((p ? p.vat : CONFIG.vat) / 100); }); return r2(r2(net) + r2(vat)); }
function partyBranch(kind, party, br) { if (kind === 'mt') { var c = custById(party); if (!c) return br; return br && c.bt && c.bt[br] ? br : custBrs(c)[0]; } return br || 'TSH'; }
function invoicesOf(kind, party, br) {
  var out = [];
  (store.arOpen || []).forEach(function (x) { if (x.kind === kind && x.party === party && x.branch === br && !bqSeedOff(kind, br)) out.push({ no: x.no, date: x.date, due: x.due, sum: x.sum, ret: 0, open: true, extNo: x.extNo || '' }); });
  bqDebtLines(kind, party, br).forEach(function (x) { out.push(x); });
  if (kind === 'mt') {
    var c = custById(party) || {};
    (store.sales || []).forEach(function (s) { if (s.cust !== party || s.branch !== br) return; var o = store.orders.filter(function (x) { return x.id === s.oid; })[0], ret = o && o.ret ? o.ret.sum : 0;
      (store.docs ? store.docs.qm : []).forEach(function (d) { if (d.status === 'posted' && d.saleNo === s.no) ret += docSum(d); });
      out.push({ no: s.no, date: s.at.slice(0, 10), due: o && o.sale && o.sale.due ? o.sale.due : fD(pD(s.at.slice(0, 10)) + ((custAt(c.id, br) || c).terms || 0) * DAY), sum: s.sum, ret: r2(ret), oid: s.oid, ono: s.ono }); });
  } else {
    var sp = supByName(party) || {};
    store.receipts.forEach(function (r) { if (r.status !== 'posted' || r.supplier !== party || r.branch !== br || r.fromBonus) return; var ret = 0;
      (store.docs ? store.docs.qy : []).forEach(function (d) { if (d.status === 'posted' && d.receiptNo === r.no) ret += docSum(d); });
      out.push({ no: r.no, date: r.date, due: rcDue(r), sum: rcGross(r), ret: r2(ret), extNo: r.invNo || '', rc: true, prepaid: !!r.prepaid }); });
  }
  return out;
}
// Yagona hisob: qarz, muddati o'tgan, avans, oxirgi to'lov — barcha ekranlar shu funksiyadan oladi
function ledger(kind, party, br, exceptId) { return memo('l|' + kind + '|' + party + '|' + (br || '') + '|' + (exceptId || ''), function () { return ledgerRaw(kind, party, br, exceptId); }); }
function ledgerRaw(kind, party, br, exceptId) {
  br = partyBranch(kind, party, br);
  var inv = invoicesOf(kind, party, br), idx = {}, adv = 0, last = null, n = 0;
  inv.forEach(function (x) { x.paid = 0; x.pays = []; idx[x.no] = x; });
  (store.pays || []).forEach(function (p) {
    if (p.kind !== kind || p.party !== party || p.branch !== br || p.status !== 'posted' || p.id === exceptId) return; n++; var a = 0;
    (p.alloc || []).forEach(function (x) { var t = idx[x.no]; if (!t || !(x.sum > 0)) return; t.paid = r2(t.paid + x.sum); t.pays.push({ no: p.no, id: p.id, date: p.date, sum: x.sum, method: p.method }); a += x.sum; });
    adv = r2(adv + p.sum - a);
    if (!last || pD(p.date) > pD(last.date) || (p.date === last.date && p.no > last.no)) last = { date: p.date, sum: p.sum, no: p.no, method: p.method };
  });
  (store.advs || []).forEach(function (h) { if (h.kind !== kind || h.party !== party || h.branch !== br || h.status !== 'posted' || h.id === exceptId) return;
    (h.alloc || []).forEach(function (x) { var t = idx[x.no]; if (!t || !(x.sum > 0)) return; t.paid = r2(t.paid + x.sum); (t.ahs = t.ahs || []).push({ no: h.no, sum: x.sum, auto: !!h.auto }); adv = r2(adv - x.sum); }); });
  var debt = 0, od = 0, odDays = 0, gross = 0;
  inv.forEach(function (x) { var l = r2(x.sum - x.ret - x.paid); if (l < 0) { adv = r2(adv - l); l = 0; } x.left = l; var due = pD(x.due); x.late = l > 0 && due < T0 ? Math.round((T0 - due) / DAY) : 0; debt = r2(debt + l); if (x.late > 0) { od = r2(od + l); odDays = Math.max(odDays, x.late); } });
  inv.sort(function (a, b) { return (pD(a.due) - pD(b.due)) || (pD(a.date) - pD(b.date)) || (a.no < b.no ? -1 : 1); });
  return { kind: kind, party: party, branch: br, invoices: inv, debt: debt, overdue: od, overdueDays: odDays, advance: r2(adv), last: last, count: n };
}
function custLedger(id, exceptId) { return ledger('mt', id, null, exceptId); }
function supLedger(name, br, exceptId) { return ledger('yt', name, br || 'TSH', exceptId); }
function supDebt(name, br) { return debtOf('yt', name, br || 'TSH').debt; }
function saleLedger(no) { var s = saleByNo(no); if (!s) return null; var L = custLedger(s.cust); return L.invoices.filter(function (x) { return x.no === no; })[0] || null; }
function rcLedger(no) { var r = store.receipts.filter(function (x) { return x.no === no; })[0]; if (!r) return null; var L = supLedger(r.supplier, r.branch); return L.invoices.filter(function (x) { return x.no === no; })[0] || null; }
function autoAlloc(invoices, sum, first) {
  var left = r2(sum || 0), out = {}, list = invoices.slice();
  if (first) list.sort(function (a, b) { return (b.no === first) - (a.no === first); });
  list.forEach(function (x) { var q = Math.min(left, x.left); if (q > 0) { out[x.no] = r2(q); left = r2(left - q); } });
  return out;
}
function payCopy(p) { return p ? JSON.parse(JSON.stringify(p)) : null; }
function payById(id) { return (store.pays || []).filter(function (p) { return p.id === id; })[0] || null; }
function payByNo(no) { return (store.pays || []).filter(function (p) { return p.no === no; })[0] || null; }
function nextPayNo(kind, br) { var m = 0; store.pays.forEach(function (p) { if (p.no && p.kind === kind && p.branch === br) m = Math.max(m, +p.no.split('-')[2]); }); return PAY_PREFIX[kind] + '-' + br + '-' + pad6(m + 1); }
function savePay(p) { var c = payCopy(p); if (!c.no) c.no = nextPayNo(c.kind, c.branch); if (!c.id) c.id = c.no; c.alloc = (c.alloc || []).filter(function (x) { return x.sum > 0; }); var a = store.pays.slice(), i = a.map(function (x) { return x.id; }).indexOf(c.id); if (i >= 0) a[i] = c; else a.unshift(c); store.pays = a; store.v++; return payCopy(c); }
function deletePay(id) { store.pays = store.pays.filter(function (p) { return p.id !== id; }); store.v++; }
function payStep(p, st, who, ex) { var c = payCopy(p), at = nowStr(); c.status = st; var kind = { posted: 'post', pending: 'send', draft: 'return', cancelled: 'cancel' }[st];
  if (st === 'posted') { c.postedBy = who; c.postedAt = at; } if (st === 'pending') { c.sentBy = who; c.sentAt = at; } if (st === 'draft') { c.returned = { by: who, at: at, note: ex || '' }; } if (st === 'cancelled') { c.cancelledBy = who; c.cancelledAt = at; c.cancelReason = ex || ''; }
  c.log = (c.log || []).concat([{ kind: kind, who: who, at: at, reason: ex || '' }]); return savePay(c); }
function postPay(p, who) { return payStep(p, 'posted', who); }
function sendPay(p, who) { return payStep(p, 'pending', who); }
function returnPay(p, who, note) { return payStep(p, 'draft', who, note); }
function cancelPay(id, who, reason) { return payStep(payById(id), 'cancelled', who, reason); }
function custPending(id) { return store.orders.filter(function (o) { return o.cust === id && o.status === 'pending'; }); }
var PAYSPEC = [ // [tur, filial, raqam, sana, vaqt, kontragent, usul, hisob, summa, taqsimot ('OPEN' yoki hujjat №), holat, yaratgan, qo'shimcha]
  ['mt', 'TSH', 1, '08.09.2026', '10:20', 1, 'bank', 'B-TSH-1', 6000000, 'OPEN', 'posted', ACC, { payNo: '1184', bankDate: '08.09.2026' }],
  ['mt', 'TSH', 2, '12.09.2026', '15:05', 17, 'online', 'T-TSH', 2400000, 'OPEN', 'posted', CASHIER, { checkNo: '004418' }],
  ['mt', 'TSH', 3, '16.09.2026', '11:40', 3, 'bank', 'B-TSH-1', 6250000, 'OPEN', 'posted', ACC, { payNo: '2271', bankDate: '16.09.2026' }],
  ['yt', 'TSH', 1, '10.09.2026', '12:00', 'KRKA Farma', 'bank', 'B-TSH-1', 15000000, 'OPEN', 'posted', ACC, { payNo: '0412', bankDate: '10.09.2026' }],
  ['yt', 'TSH', 2, '18.09.2026', '10:30', 'Novo Nordisk vakolatxonasi', 'bank', 'B-TSH-1', 30000000, 'KR-TSH-000119', 'posted', ACC, { payNo: '0437', bankDate: '18.09.2026' }],
  ['mt', 'TSH', 4, '21.09.2026', '16:10', 5, 'cash', 'K-TSH', 1800000, 'OPEN', 'posted', CASHIER, {}],
  ['mt', 'TSH', 5, '25.09.2026', '09:50', 20, 'bank', 'B-TSH-1', 3500000, 'OPEN', 'posted', ACC, { payNo: '0318', bankDate: '25.09.2026' }],
  ['yt', 'TSH', 3, '26.09.2026', '14:20', 'Gedeon Richter Uzbekistan', 'cash', 'K-TSH', 2000000, 'OPEN', 'posted', CASHIER, {}],
  ['mt', 'TSH', 6, '30.09.2026', '17:55', 10, 'cash', 'K-TSH', 2500000, 'SV-TSH-000203', 'posted', CASHIER, {}],
  ['mt', 'TSH', 7, '01.10.2026', '11:15', 18, 'bank', 'B-TSH-1', 2000000, 'SV-TSH-000202', 'posted', ACC, { payNo: '0927', bankDate: '01.10.2026' }],
  ['mt', 'TSH', 8, '02.10.2026', '10:05', 2, 'bank', 'B-TSH-1', 4000000, 'SV-TSH-000204', 'posted', ACC, { payNo: '0544', bankDate: '02.10.2026' }],
  ['yt', 'TSH', 4, '02.10.2026', '15:40', 'Nobel Pharmsanoat', 'bank', 'B-TSH-2', 10000000, 'OPEN', 'posted', ACC, { payNo: '0451', bankDate: '02.10.2026' }],
  ['mt', 'TSH', 9, '03.10.2026', '12:30', 18, 'online', 'T-TSH', 1500000, 'OPEN', 'posted', CASHIER, { checkNo: '004702' }],
  ['yt', 'TSH', 6, '03.10.2026', '16:00', 'Pharm Luxe Trade', 'cash', 'K-TSH', 900000, 'OPEN', 'cancelled', CASHIER, { cancelReason: "Yetkazib beruvchi naqd pulni qabul qilmadi — bank orqali to'lanadi", cancelledBy: BEK, cancelledAt: '03.10.2026 17:20' }],
  ['mt', 'TSH', 10, '04.10.2026', '08:15', 2, 'bank', 'B-TSH-1', 18400000, 'OPEN', 'posted', ACC, { payNo: '0611', bankDate: '04.10.2026' }],
  ['yt', 'TSH', 5, '04.10.2026', '11:20', 'Jurabek Laboratories', 'bank', 'B-TSH-1', 5000000, 'KR-TSH-000124', 'pending', ACC, { payNo: '0463', bankDate: '04.10.2026' }],
  ['mt', 'TSH', 11, '04.10.2026', '13:40', 18, 'cash', 'K-TSH', 1200000, 'AUTO', 'draft', CASHIER, {}],
  ['mt', 'TSH', 12, '04.10.2026', '14:25', 14, 'bank', 'B-TSH-1', 1850000, 'AUTO', 'draft', ACC, { note: 'Bank ko\u2019chirmasi kutilmoqda' }],
  ['mt', 'TSH', 13, '04.10.2026', '10:10', 6, 'online', 'T-TSH', 1000000, 'SV-TSH-000216', 'posted', CASHIER, { checkNo: '004731' }], // T10a2: Online sotuvga qisman to'lov
  ['mt', 'TSH', 14, '04.10.2026', '09:20', 10, 'cash', 'K-TSH', 2300000, 'OPEN', 'posted', CASHIER, {}], // Y4: bugungi kassa harakatlari
  ['mt', 'TSH', 15, '04.10.2026', '11:40', 5, 'cash', 'K-TSH-2', 1100000, 'OPEN', 'posted', 'Gulnora Saidova', {}],
  ['mt', 'SMQ', 1, '20.09.2026', '11:00', 4, 'bank', 'B-SMQ-1', 3000000, 'OPEN', 'posted', ACC, { payNo: '0102', bankDate: '20.09.2026' }],
  ['mt', 'SMQ', 2, '29.09.2026', '16:30', 11, 'cash', 'K-SMQ', 1200000, 'OPEN', 'posted', CASHIER, {}],
  ['yt', 'SMQ', 1, '01.10.2026', '10:10', 'Novo Nordisk vakolatxonasi', 'bank', 'B-SMQ-1', 5000000, 'KR-SMQ-000041', 'posted', ACC, { payNo: '0077', bankDate: '01.10.2026' }],
  ['mt', 'SMQ', 3, '03.10.2026', '12:45', 19, 'online', 'T-SMQ', 800000, 'OPEN', 'posted', CASHIER, { checkNo: '001296' }],
  ['mt', 'BXR', 1, '15.09.2026', '10:40', 7, 'cash', 'K-BXR', 1500000, 'OPEN', 'posted', CASHIER, {}],
  ['mt', 'BXR', 2, '27.09.2026', '15:15', 16, 'bank', 'B-BXR-1', 2000000, 'OPEN', 'posted', ACC, { payNo: '0058', bankDate: '27.09.2026' }],
  ['yt', 'BXR', 1, '30.09.2026', '11:30', 'Gedeon Richter Uzbekistan', 'bank', 'B-BXR-1', 3000000, 'KR-BXR-000027', 'posted', ACC, { payNo: '0061', bankDate: '30.09.2026' }],
  ['mt', 'FRG', 1, '18.09.2026', '09:30', 8, 'bank', 'B-FRG-1', 4000000, 'OPEN', 'posted', ACC, { payNo: '0140', bankDate: '18.09.2026' }],
  ['yt', 'FRG', 1, '28.09.2026', '14:00', 'Pharm Luxe Trade', 'bank', 'B-FRG-1', 12000000, 'KR-FRG-000063', 'posted', ACC, { payNo: '0146', bankDate: '28.09.2026' }],
  ['mt', 'FRG', 2, '01.10.2026', '17:10', 12, 'cash', 'K-FRG', 900000, 'OPEN', 'posted', CASHIER, {}],
  ['mt', 'FRG', 3, '03.10.2026', '11:50', 15, 'online', 'T-FRG', 600000, 'OPEN', 'posted', CASHIER, { checkNo: '002210' }]
];
var PAYS0 = null;
function mkPay(s) {
  var at = s[3] + ' ' + s[4], no = PAY_PREFIX[s[0]] + '-' + s[1] + '-' + pad6(s[2]), x = s[12] || {}, mgr = MANAGERS[s[1]] || DIRECTOR;
  var p = { kind: s[0], no: no, id: no, branch: s[1], date: s[3], party: s[5], method: s[6], acct: s[7], sum: s[8], alloc: s[9] === 'AUTO' ? [] : [{ no: s[9], sum: s[8] }], auto: s[9] === 'AUTO', status: s[10], payNo: x.payNo || '', bankDate: x.bankDate || '', checkNo: x.checkNo || '', note: x.note || '', createdBy: s[11], createdAt: at, log: [{ kind: 'create', who: s[11], at: at }] };
  if (s[0] === 'yt' && s[10] !== 'draft') { p.sentBy = s[11]; p.sentAt = addMin(at, 5); p.log.push({ kind: 'send', who: s[11], at: p.sentAt }); }
  if (s[10] === 'posted' || s[10] === 'cancelled') { p.postedBy = s[0] === 'yt' ? mgr : s[11]; p.postedAt = addMin(at, s[0] === 'yt' ? 40 : 3); p.log.push({ kind: 'post', who: p.postedBy, at: p.postedAt }); }
  if (s[10] === 'cancelled') { p.cancelledBy = x.cancelledBy; p.cancelledAt = x.cancelledAt; p.cancelReason = x.cancelReason; p.log.push({ kind: 'cancel', who: x.cancelledBy, at: x.cancelledAt, reason: x.cancelReason }); }
  return p;
}
function openPieces(left, odAmt, odDays, terms, spread) { // T11a: spread — mijoz ochilish qoldig'i muddati 2–28 kunga taqsimlanadi (avval hammasi T0+2)
  var out = [], rest = r2(left - odAmt);
  if (odAmt > 0) out.push({ left: odAmt, date: T0 - (terms + odDays) * DAY });
  if (rest > 5000000) { var a = Math.round(rest * 0.55 / 1000) * 1000; out.push({ left: a, date: T0 - Math.max(3, terms - 2) * DAY, dueD: spread != null && terms >= 5 ? T0 + (2 + spread % 27) * DAY : null }); out.push({ left: r2(rest - a), date: T0 - Math.max(2, Math.round(terms / 3)) * DAY, dueD: spread != null && terms === 30 ? T0 + (8 + (spread * 7 + 5) % 26) * DAY : null }); } // T11b: 24.10 (T0+20) dagi ikkinchi bo'laklar — 8–33 kunga
  else if (rest > 0) out.push({ left: rest, date: T0 - Math.max(2, Math.round(terms / 2)) * DAY });
  if (spread != null) out.forEach(function (x, k) { if (x.dueD == null && x.date + terms * DAY === T0 + 14 * DAY) { var off = 9 + (spread * 3 + k * 7) % 20; x.dueD = T0 + (off === 14 ? 16 : off) * DAY; } }); // T11b: 18.10 (T0+14) to'plami — 9–28 kunga
  return out;
}
function initPay() { return bulk(initPayRaw); }
function initPayRaw() {
  CUSTOMERS.forEach(function (c) { debtProps('mt', c); }); SUPPLIERS.forEach(function (sp) { debtProps('yt', sp); });
  store.arOpen = []; store.pays = PAYSPEC.map(mkPay);
  var pieces = [], openPaid = {};
  store.pays.forEach(function (p) { if (p.status === 'posted' && p.alloc[0] && p.alloc[0].no === 'OPEN') { var k = p.kind + '|' + p.party + '|' + p.branch; (openPaid[k] = openPaid[k] || []).push(p); } });
  var add = function (kind, party, br, left, od, odDays, terms) {
    var k = kind + '|' + party + '|' + br, ps = openPieces(left, od, odDays, terms, kind === 'mt' ? (+party * 8 + br.charCodeAt(0)) : null), paid = openPaid[k] || [];
    if (!ps.length && paid.length) ps.push({ left: 0, date: pD(paid[0].date) - 10 * DAY });
    ps.sort(function (a, b) { return a.date - b.date; });
    ps.forEach(function (x, i) { x.kind = kind; x.party = party; x.branch = br; x.terms = terms; x.sum = x.left; x.pays = []; });
    paid.forEach(function (p) { var t = ps[0]; t.sum = r2(t.sum + p.sum); t.pays.push(p); });
    pieces = pieces.concat(ps);
  };
  store.pays.forEach(function (p) { if (p.alloc[0] && p.alloc[0].no === 'OPEN') p.alloc = []; });
  CUSTOMERS.forEach(function (c, i) { var b0 = custBrs(c)[0], L0 = ledger('mt', c.id, b0), left = Math.max(0, r2((AR_OPEN0[c.id] || 0) - L0.debt)), lt = AR_LATE0[c.id], od = lt ? Math.min(left, Math.round(left * lt[1] / 1000) * 1000) : 0; add('mt', c.id, b0, left, od, lt ? lt[0] : 0, c.terms); });
  SUPPLIERS.forEach(function (sp, i) { var seedLeft = BRANCHES.reduce(function (a, b) { return a + ledger('yt', sp.name, b.code).debt; }, 0), left = Math.max(0, r2((AP_OPEN0[sp.name] || 0) - seedLeft)), lt = AP_LATE0[sp.name], od = lt ? Math.min(left, Math.round(left * lt[1] / 1000) * 1000) : 0; add('yt', sp.name, 'TSH', left, od, lt ? lt[0] : 0, sp.terms); });
  var BASE = { mt: { TSH: 160, SMQ: 80, BXR: 30, FRG: 50 }, yt: { TSH: 100, SMQ: 20, BXR: 10, FRG: 30 } }, seq = {};
  pieces.sort(function (a, b) { return a.date - b.date; }).forEach(function (x, j) {
    var k = x.kind + x.branch; seq[k] = (seq[k] == null ? BASE[x.kind][x.branch] : seq[k] + 1);
    x.no = (x.kind === 'mt' ? 'SV-' : 'KR-') + x.branch + '-' + pad6(seq[k]); x.date = fD(x.date); x.due = x.dueD != null ? fD(x.dueD) : fD(pD(x.date) + x.terms * DAY);
    if (x.kind === 'yt') { var sp = supByName(x.party) || {}; x.extNo = (sp.docPre || '') + (23800 + j * 37); }
    x.pays.forEach(function (p) { p.alloc = [{ no: x.no, sum: p.sum }]; });
    store.arOpen.push({ kind: x.kind, party: x.party, branch: x.branch, no: x.no, date: x.date, due: AP_DUE_FIX[x.no] || x.due, sum: x.sum, extNo: x.extNo || '' });
  });
  PAYS0 = payCopy(store.pays);
}
function addQm12() {
  if (!saleByNo('SV-TSH-000210') || docByNo('qm', 'QM-TSH-000012')) return;
  var spec = { 'Demidrol 1% 1ml': [20, 'Shikastlangan'], 'Ceftriaxon 1g': [25, "Noto'g'ri yuborilgan"], 'Omeprazol 20mg': [10, 'Muddati yaqin'] }, sl = saleLines('SV-TSH-000210'), done = {};
  var ls = qmLinesFor('SV-TSH-000210').map(function (l) { var p = prodById(l.pid) || {}, sp = spec[p.name], x = sl.filter(function (y) { return y.pid === l.pid && y.batch === l.batch; })[0]; if (sp && !done[p.name] && x && x.sold >= sp[0]) { l.qty = sp[0]; l.reason = sp[1]; done[p.name] = 1; } return l; }).filter(function (l) { return l.qty > 0; });
  store.docs.qm.unshift(mkDoc('qm', 'QM-TSH-000012', 'posted', '04.10.2026', '15:26', MAL, { cust: 2, saleNo: 'SV-TSH-000210', lines: ls, postedBy: KEEPER, postedAt: '04.10.2026 15:29' }));
}
function payEra() {
  shipReset();
  var o = orderByNo('BY-TSH-000337'), f = orderByNo('BY-TSH-000332'), dr = driverById(5);
  store.trips.push({ no: 'RS-TSH-000046', branch: 'TSH', date: '04.10.2026', driver: 5, car: '01 C 902 RA', exp: '', status: 'done', stops: [{ oid: o.id, res: 'ok', signed: true, loaded: true }], plannedAt: '04.10.2026 14:52', plannedBy: MAL, shippedAt: '04.10.2026 15:00', shippedBy: KEEPER, doneAt: '04.10.2026 15:25', doneBy: MAL });
  updOrders([o.id], function (n) { doShip(n, { method: 'trip', who: KEEPER, trip: 'RS-TSH-000046', driver: dr.name, car: '01 C 902 RA', at: '04.10.2026 15:00' }); n.status = 'delivered'; n.ship.deliveredAt = '04.10.2026 15:25'; n.ship.receiver = 'Shifo Farm'; n.ship.signed = true; n.log.push({ kind: 'delivered', who: dr.name, at: '04.10.2026 15:25' }); });
  updOrders([f.id], function (n) { doShip(n, { method: 'pickup', who: KEEPER, rep: 'Farm Lux vakili', at: '04.10.2026 15:28' }); });
  addQm12(); store.era = true; store.v++;
}
function payReset() { restoreBase(); store.demoDirty = true; }

// ---- 15: Kassa va bank — qo'lda operatsiyalar, ichki o'tkazma, kunni yopish, ko'chirma solishtirish ----
ACCOUNTS.splice(1, 0, { id: 'K-TSH-2', kind: 'cash', branch: 'TSH', name: 'Toshkent · Chilonzor kassasi', open: 350000 }); // Y4: ochilish qoldig'i aniq (avval −155 000 chiqardi)
var CASH_RESP = (function () { var o = {}; BRANCHES.forEach(function (b) { empNames('cashier', b.code).forEach(function (n, i) { o['K-' + b.code + (i ? '-' + (i + 1) : '')] = n; }); }); return o; })();
ACCOUNTS.forEach(function (a) { a.resp = CASH_RESP[a.id] || ''; });
var BANK_TSH1 = 179650000;
var MOP_PREFIX = { ko: 'KO', bo: 'BO', io: 'IO' };
var MOP_ITEMS = { out: ["Transport va yoqilg'i", "Xo'jalik xarajatlari", 'Bank komissiyasi', 'Soliqlar', 'Ish haqi', 'Ijara', 'Kommunal', 'Boshqa'], in: ['Boshqa kirim', 'Bank foizi', "Qaytarilgan mablag'"] };
var MOP_RULE = { get approveOver() { return CONFIG.cashBranchApprove; } };
var MOP_ROLES = permView({ ko: 'cash.create', bo: 'bank.create', io: 'cash.io', approve: 'cash.approve', cancel: 'cash.cancel', close: 'cash.close', recon: 'bank.recon', cashView: 'cash.view', bankView: 'bank.view' }, 'MOP_ROLES');
function mopCopy(m) { return m ? JSON.parse(JSON.stringify(m)) : null; }
function mopById(id) { return (store.mops || []).filter(function (m) { return m.id === id; })[0] || null; }
function mopByNo(no) { return (store.mops || []).filter(function (m) { return m.no === no; })[0] || null; }
function nextMopNo(kind, br) { var m = 0; store.mops.forEach(function (x) { if (x.no && x.kind === kind && x.branch === br) m = Math.max(m, +x.no.split('-')[2]); }); return MOP_PREFIX[kind] + '-' + br + '-' + pad6(m + 1); }
function saveMop(m) { var c = mopCopy(m); if (!c.no) c.no = nextMopNo(c.kind, c.branch); if (!c.id) c.id = c.no; var a = store.mops.slice(), i = a.map(function (x) { return x.id; }).indexOf(c.id); if (i >= 0) a[i] = c; else a.unshift(c); store.mops = a; store.v++; return mopCopy(c); }
function deleteMop(id) { store.mops = store.mops.filter(function (m) { return m.id !== id; }); store.v++; }
function mopNeedsApproval(m) { return m.kind === 'ko' && m.dir === 'out' && (m.sum || 0) > MOP_RULE.approveOver; }
function mopEffects(m) { if (m.kind === 'io') return [{ acct: m.from, delta: -m.sum }, { acct: m.to, delta: m.sum }]; return [{ acct: m.acct, delta: m.dir === 'in' ? m.sum : -m.sum }]; }
function mopStep(m, st, who, ex) { var c = mopCopy(m), at = nowStr(), kind = { posted: 'post', pending: 'send', draft: 'return', cancelled: 'cancel' }[st]; c.status = st;
  if (st === 'posted') { c.postedBy = who; c.postedAt = at; } if (st === 'pending') { c.sentBy = who; c.sentAt = at; } if (st === 'draft') c.returned = { by: who, at: at, note: ex || '' }; if (st === 'cancelled') { c.cancelledBy = who; c.cancelledAt = at; c.cancelReason = ex || ''; }
  c.log = (c.log || []).concat([{ kind: kind, who: who, at: at, reason: ex || '' }]); return saveMop(c); }
function postMop(m, who) { return mopStep(m, 'posted', who); }
function sendMop(m, who) { return mopStep(m, 'pending', who); }
function returnMop(m, who, note) { return mopStep(m, 'draft', who, note); }
function cancelMop(id, who, reason) { return mopStep(mopById(id), 'cancelled', who, reason); }
// Kassa/bank harakatlari — MT, YT, KO, BO, IO (tasdiqlangan va bekor qilingan)
function accMoves(id) { return memo('mv|' + id, function () {
  var out = [], t = function (s) { return String(s || '').slice(11) || '00:00'; };
  (store.pays || []).forEach(function (p) { if (p.acct !== id || !p.postedAt || (p.status !== 'posted' && p.status !== 'cancelled')) return;
    out.push({ id: p.id, no: p.no, kind: p.kind, date: p.date, time: t(p.postedAt), dir: p.kind === 'mt' ? 'in' : 'out', sum: p.sum, status: p.status, party: p.kind === 'mt' ? ((custById(p.party) || {}).name || '') : p.party, item: '', note: p.note || '', payNo: p.payNo || p.checkNo || '', bankDate: p.bankDate || '', by: p.postedBy, cancelledAt: p.cancelledAt || '' }); });
  (store.mops || []).forEach(function (m) { if (!m.postedAt || (m.status !== 'posted' && m.status !== 'cancelled')) return;
    mopEffects(m).forEach(function (e) { if (e.acct !== id) return; var other = m.kind === 'io' ? accById(e.delta < 0 ? m.to : m.from) : null;
      out.push({ id: m.id, no: m.no, kind: m.kind, date: m.date, time: m.time || t(m.postedAt), dir: e.delta > 0 ? 'in' : 'out', sum: m.sum, status: m.status, party: '', item: m.kind === 'io' ? (other ? other.name : '') : m.item, other: other ? other.id : null, note: m.note || '', payNo: m.baseNo || '', bankDate: m.kind === 'bo' ? m.date : '', by: m.postedBy, cancelledAt: m.cancelledAt || '' }); }); });
  return out.sort(function (a, b) { return (pD(a.date) - pD(b.date)) || (a.time < b.time ? -1 : a.time > b.time ? 1 : 0) || (a.no < b.no ? -1 : 1); }); }); }
function lastClosed(acct) { var d = null; (store.closes || []).forEach(function (c) { if (c.acct === acct && (!d || pD(c.date) > pD(d.date))) d = c; }); return d; }
function dayClosed(acct, date) { var a = accById(acct), c = lastClosed(acct); return !!(a && a.kind === 'cash' && c && pD(date) != null && pD(date) <= pD(c.date)); }
function closeDay(rec) { var c = JSON.parse(JSON.stringify(rec)); c.at = c.at || nowStr(); store.closes = (store.closes || []).concat([c]); store.v++; return c; }
function reconcile(acct, date, bal, who) { var sys = accBalance(acct, null, date), ok = Math.abs(sys - bal) < 0.005; if (ok) { store.recon = Object.assign({}, store.recon || {}); store.recon[acct] = { date: date, by: who, at: nowStr() }; store.v++; } return { ok: ok, sys: sys, diff: r2(bal - sys) }; }
function totalMoney(br) { return r2(ACCOUNTS.filter(function (a) { return !br || a.branch === br; }).reduce(function (s, a) { return s + accBalance(a.id); }, 0)); }
var MOPSPEC = [ // [tur, filial, №, sana, vaqt, yo'nalish yoki dan, hisob yoki ga, summa, modda, izoh, yaratgan]
  ['bo', 'TSH', 1, '01.10.2026', '09:00', 'out', 'B-TSH-1', 45000, 'Bank komissiyasi', 'Sentabr oyi hisob xizmati', ACC],
  ['ko', 'TSH', 1, '01.10.2026', '10:40', 'out', 'K-TSH', 180000, "Xo'jalik xarajatlari", 'Tozalash vositalari va qog\u2019oz', CASHIER],
  ['io', 'TSH', 1, '13.09.2026', '10:00', 'T-TSH', 'B-TSH-2', 2400000, '', 'Terminal tushumi — 12.09 karta to\u2019lovlari', ACC], // Y4: Terminal → bank
  ['io', 'TSH', 2, '02.10.2026', '10:00', 'B-TSH-2', 'K-TSH-2', 1500000, '', "Chilonzor kassasiga naqd pul olish", ACC],
  ['bo', 'TSH', 2, '02.10.2026', '11:00', 'in', 'B-TSH-1', 120000, 'Bank foizi', "Sentabr qoldig'iga foiz", ACC],
  ['ko', 'TSH', 2, '02.10.2026', '16:20', 'out', 'K-TSH', 240000, "Transport va yoqilg'i", "Yetkazib berish mashinalari uchun yoqilg'i", CASHIER],
  ['ko', 'TSH', 3, '03.10.2026', '12:10', 'in', 'K-TSH', 60000, "Qaytarilgan mablag'", "Hisobdor shaxsdan qaytgan qoldiq", CASHIER],
  ['ko', 'TSH', 4, '03.10.2026', '13:00', 'out', 'K-TSH-2', 95000, "Xo'jalik xarajatlari", "Chilonzor ombori uchun lampalar", 'Gulnora Saidova'],
  ['io', 'TSH', 3, '03.10.2026', '17:30', 'K-TSH', 'B-TSH-1', 3000000, '', 'Inkassatsiya — kun oxiri', CASHIER],
  ['io', 'TSH', 4, '04.10.2026', '09:10', 'T-TSH', 'B-TSH-2', 1500000, '', 'Terminal tushumi — 03.10 karta to\u2019lovlari', ACC],
  ['ko', 'TSH', 5, '04.10.2026', '10:20', 'out', 'K-TSH-2', 85000, "Xo'jalik xarajatlari", 'Chilonzor ombori uchun tozalash vositalari', 'Gulnora Saidova'],
  ['ko', 'TSH', 6, '04.10.2026', '11:05', 'out', 'K-TSH', 150000, "Transport va yoqilg'i", "Yetkazib berish mashinasiga yoqilg'i", CASHIER],
  ['bo', 'SMQ', 1, '01.10.2026', '09:10', 'out', 'B-SMQ-1', 30000, 'Bank komissiyasi', 'Sentabr oyi hisob xizmati', ACC],
  ['ko', 'SMQ', 1, '02.10.2026', '15:00', 'out', 'K-SMQ', 150000, "Transport va yoqilg'i", "Yoqilg'i", 'Shahnoza Qodirova'],
  ['ko', 'BXR', 1, '02.10.2026', '11:30', 'out', 'K-BXR', 90000, "Xo'jalik xarajatlari", 'Kanselyariya', 'Feruza Aminova'],
  ['ko', 'FRG', 1, '03.10.2026', '10:15', 'out', 'K-FRG', 120000, 'Kommunal', "Elektr energiyasi to'lovi", "Madina Yo'ldosheva"]
];
function ioTypeOf(from, to) { var K = { cash: 'k', bank: 'b', term: 't' }, a = accById(from), b = accById(to), k = (K[a && a.kind] || 'b') + '2' + (K[b && b.kind] || 'b'); return { k2b: 1, b2k: 1, k2k: 1, t2b: 1 }[k] ? k : 'k2b'; }
function mkMop(s) {
  var no = MOP_PREFIX[s[0]] + '-' + s[1] + '-' + pad6(s[2]), at = s[3] + ' ' + s[4], m = { kind: s[0], no: no, id: no, branch: s[1], date: s[3], time: s[4], sum: s[7], item: s[8], note: s[9], baseNo: '', file: null, status: 'posted', createdBy: s[10], createdAt: at, postedBy: s[10], postedAt: at, log: [{ kind: 'create', who: s[10], at: at }, { kind: 'post', who: s[10], at: at }] };
  if (s[0] === 'io') { m.from = s[5]; m.to = s[6]; m.ioType = ioTypeOf(s[5], s[6]); } else { m.dir = s[5]; m.acct = s[6]; }
  return m;
}
// Y4: bugun 12:50 — Nigora RS-TSH-000047 dagi BY-TSH-000349 naqd pulini haydovchidan qabul qildi (mavjud oqim: cashAccept)
function drvSeedAccept() { var t = tripByNo('RS-TSH-000047'), st = t && t.stops.filter(function (x) { return x.cash && x.cash.sum > 0 && !x.cash.acc; })[0]; if (!st) return; var at = '04.10.2026 12:50', r = cashAccept(t.no, CASHIER, st.cash.sum, ''); if (!r || !r.ok) return;
  (r.mts || []).forEach(function (no) { var p = payByNo(typeof no === 'string' ? no : no.no); if (!p) return; p.createdAt = p.postedAt = at; p.date = at.slice(0, 10); (p.log || []).forEach(function (l) { l.at = at; }); });
  var t2 = tripByNo(t.no); (t2.stops || []).forEach(function (x) { if (x.cash && x.cash.acc && x.cash.acc.by === CASHIER) x.cash.acc.at = at; }); (t2.cashAcc || []).forEach(function (c) { c.at = at; }); }
function seedMoney() { return bulk(function () {
  store.mops = MOPSPEC.map(mkMop);
  store.closes = [['K-TSH', '03.10.2026', 'Nigora Xasanova'], ['K-TSH-2', '02.10.2026', 'Gulnora Saidova'], ['K-SMQ', '03.10.2026', 'Shahnoza Qodirova'], ['K-BXR', '03.10.2026', 'Feruza Aminova'], ['K-FRG', '03.10.2026', "Madina Yo'ldosheva"]].map(function (x) { return { acct: x[0], date: x[1], by: x[2], at: x[1] + ' 18:30', system: 0, counted: 0, diff: 0, note: '' }; });
  store.recon = { 'B-TSH-1': { date: '03.10.2026', by: ACC, at: '03.10.2026 18:00' }, 'B-SMQ-1': { date: '03.10.2026', by: ACC, at: '03.10.2026 18:10' }, 'B-BXR-1': { date: '02.10.2026', by: ACC, at: '02.10.2026 17:40' } };
  store.recon['T-TSH'] = { date: '03.10.2026', by: ACC, at: '03.10.2026 18:05' }; store.recon['T-SMQ'] = { date: '02.10.2026', by: ACC, at: '02.10.2026 18:00' };
  drvSeedAccept();
  var b = accById('B-TSH-1'); b.open = 0; b.open = r2(BANK_TSH1 - accBalance('B-TSH-1'));
  MEMO_OFF--; try { store.closes.forEach(function (c) { c.system = c.counted = accBalance(c.acct, null, c.date); }); } finally { MEMO_OFF++; }
}); }


// ---- Y4: Kassir paneli — yagona hisob (kartalar, hisoblar jadvali, dinamika, operatsiyalar bir manbadan) ----
var PT_OF = { cash: 'cash', term: 'online', bank: 'bank' };
function tillAccts(role, user) { if (!can(role, 'special.till')) return null; var e = (store.emps || []).filter(function (x) { return empName(x) === user; })[0], ids = e && e.cash && e.cash.length ? e.cash.slice() : Object.keys(CASH_RESP).filter(function (k) { return CASH_RESP[k] === user; }); return ids; }
function cashDash(br, f) { f = f || {}; var B = br, t0 = pD(f.from), t1 = pD(f.to || f.from), today = T0; if (t0 == null) t0 = today; if (t1 == null || t1 < t0) t1 = t0;
  var accs = ACCOUNTS.filter(function (a) { return a.branch === B && (!f.acct || f.acct === 'ALL' || a.id === f.acct) && (!f.pt || f.pt === 'ALL' || PT_OF[a.kind] === f.pt); });
  var add = function (o, k, v) { o[k] = r2((o[k] || 0) + v); }, inc = { total: 0, mt: 0, other: 0, io: 0, items: {} }, out = { total: 0, yt: 0, exp: 0, io: 0 }, exp = { total: 0, items: {} }, ops = [], bal = { total: 0, cash: 0, term: 0, bank: 0 }, rows = [];
  MOP_ITEMS.out.forEach(function (k) { exp.items[k] = 0; });
  accs.forEach(function (a) { var start = accBalance(a.id, null, fD(t0 - DAY)), i = 0, o = 0, cur = accBalance(a.id);
    accMoves(a.id).forEach(function (m) { var t = pD(m.date); if (m.status !== 'posted' || t < t0 || t > t1) return; ops.push(Object.assign({ acct: a.id, acctName: a.name, acctKind: a.kind }, m));
      if (m.dir === 'in') { i += m.sum; add(inc, 'total', m.sum); if (m.kind === 'mt') add(inc, 'mt', m.sum); else if (m.kind === 'io') add(inc, 'io', m.sum); else { add(inc, 'other', m.sum); add(inc.items, m.item || 'Boshqa kirim', m.sum); } }
      else { o += m.sum; add(out, 'total', m.sum); if (m.kind === 'yt') add(out, 'yt', m.sum); else if (m.kind === 'io') add(out, 'io', m.sum); else { add(out, 'exp', m.sum); add(exp, 'total', m.sum); add(exp.items, m.item || 'Boshqa', m.sum); } } });
    var lc = a.kind === 'cash' ? lastClosed(a.id) : null; add(bal, 'total', cur); add(bal, a.kind, cur);
    rows.push({ id: a.id, name: a.name, kind: a.kind, resp: a.resp || '', start: r2(start), inS: r2(i), outS: r2(o), end: r2(start + i - o), cur: r2(cur), lastClose: lc, closed: a.kind === 'cash' ? dayClosed(a.id, fD(Math.min(t1, today))) : null }); });
  var days = []; for (var t = t0; t <= t1 && days.length < 93; t += DAY) { var d = fD(t), di = 0, dO = 0; ops.forEach(function (m) { if (m.date === d) { if (m.dir === 'in') di += m.sum; else dO += m.sum; } }); days.push({ date: d, inS: r2(di), outS: r2(dO), end: r2(accs.reduce(function (s2, a) { return s2 + accBalance(a.id, null, d); }, 0)) }); }
  ops.sort(function (a, b) { return (pD(b.date) - pD(a.date)) || (a.time < b.time ? 1 : a.time > b.time ? -1 : 0) || (a.no < b.no ? 1 : -1); });
  var tot = rows.reduce(function (o2, r) { o2.start += r.start; o2.inS += r.inS; o2.outS += r.outS; o2.end += r.end; o2.cur += r.cur; return o2; }, { start: 0, inS: 0, outS: 0, end: 0, cur: 0 }); Object.keys(tot).forEach(function (k) { tot[k] = r2(tot[k]); });
  // Kutilayotgan pullar
  var ids = accs.map(function (a) { return a.id; }), cashOk = accs.some(function (a) { return a.kind === 'cash'; });
  var drv = cashOk && (!f.acct || f.acct === 'ALL' || f.acct === 'K-' + B) ? drvCash(B) : [];
  var dueT = { n: 0, inv: 0, sum: 0 }, due3 = { n: 0, inv: 0, sum: 0 }; custsIn(B).forEach(function (c) { var a1 = 0, a3 = 0; (ledger('mt', c.id, B).invoices || []).forEach(function (x) { if (!(x.left > 0)) return; var dt = pD(x.due); if (dt === today) { a1 = 1; dueT.inv++; dueT.sum = r2(dueT.sum + x.left); } else if (dt > today && dt <= today + 3 * DAY) { a3 = 1; due3.inv++; due3.sum = r2(due3.sum + x.left); } }); dueT.n += a1; due3.n += a3; });
  var drafts = (store.pays || []).filter(function (p) { return p.kind === 'mt' && p.status === 'draft' && p.branch === B && (!f.pt || f.pt === 'ALL' || p.method === f.pt) && (!f.acct || f.acct === 'ALL' || p.acct === f.acct); });
  return { from: fD(t0), to: fD(t1), accs: rows, tot: tot, bal: bal, inc: inc, out: out, exp: exp, days: days, ops: ops,
    wait: { drv: drv, drvSum: r2(drv.reduce(function (s2, x) { return s2 + x.sum; }, 0)), dueT: dueT, due3: due3, drafts: drafts.length, draftSum: r2(drafts.reduce(function (s2, p) { return s2 + (p.sum || 0); }, 0)) } }; }

// ---- T10b: Operatorlar savdosi va Ta'minotchi (xodim / korxona) — bosh sahifa bloklari va hisobotlar YAGONA manbasi ----
// Operator: rptFacts — QQS bilan (T11a, Savdo kartasi kabi), qaytarishlar (QM o'z sanasida) ayirilgan. Aktiv — oxirgi 30 kunda savdosi bor.
function opSales(from, to, br) { return memo('opS:' + from + to + br, function () { var B = bhB(br), m = {}, a30 = {}, add = function (op) { return m[op] || (m[op] = { who: op, docs: {}, n: 0, net: 0, qty: 0, lines: [] }); };
  rptFacts(from, to, br).forEach(function (x) { if (x.kind === 'fs' || !x.op || x.op === '—') return; var o = add(x.op); if (x.kind === 'sv') o.docs[x.doc] = 1; o.net = r2(o.net + x.sum); o.qty += x.qty; o.lines.push(Object.assign({}, x, { net: x.sum })); }); // T11a: QQS bilan (Savdo kartasi kabi)
  rptFacts(fD(T0 - 29 * DAY), fD(T0), br).forEach(function (x) { if (x.kind === 'sv' && x.qty > 0) a30[x.op] = 1; });
  (store.emps || []).forEach(function (e) { if (e.role === 'operator' && (!B || e.branch === B)) add(empName(e)); });
  return Object.keys(m).map(function (k) { var o = m[k]; o.n = Object.keys(o.docs).length; o.active = !!a30[k]; return o; }).sort(function (a, b) { return b.net - a.net || (a.who < b.who ? -1 : 1); }); }); }
// Ta'minotchi: partiya darajasida. Olib keldi — o'tkazilgan kirim qatorlari (bonus tovar — tannarx 0). Sotildi — sotuv harakatlari − qaytib kelgan (Karantin).
// Qoldi — hozirgi partiyalar (barcha zonalar, Karantin va Jo'natish ham). Boshqa — hisobdan chiqarish, YB ga qaytarish, inventarizatsiya farqi.
function supGoods(br, by, from, to) { return memo('supG:' + br + by + from + to, function () { var B = bhB(br), a = pD(from), b = pD(to), K = {}, m = {}, t30 = T0 - 29 * DAY;
  store.receipts.forEach(function (r) { if (r.status !== 'posted' || (B && r.branch !== B)) return; var t = pD(r.date); if ((a != null && t < a) || (b != null && t > b)) return; var who = by === 'owner' ? (r.owner || '') : r.supplier; if (!who) return;
    var o = m[who] || (m[who] = { who: who, rcs: [], sales: {}, inQ: 0, inS: 0, soldQ: 0, soldS: 0, leftQ: 0, leftS: 0, otherQ: 0, otherS: 0, last: null }), rs = 0;
    r.lines.forEach(function (l) { if (!l.pid) return; var c = r.fromBonus ? 0 : (l.price || 0), q = rcGood(l) + rcDmg(l), bq = l.bonusQty > 0 ? l.bonusQty : 0; o.inQ += q + bq; o.inS = r2(o.inS + q * c); rs += q * c; K[r.branch + '|' + l.pid + '|' + l.batch] = who; if (bq) K[r.branch + '|' + l.pid + '|' + l.batch + '-B'] = who; });
    o.rcs.push({ no: r.no, date: r.date, branch: r.branch, supplier: r.supplier, owner: r.owner || '', sum: r2(rs) }); });
  batches().forEach(function (x) { var w = K[x.branch + '|' + x.pid + '|' + x.batch]; if (!w) return; var o = m[w], c = x.cost || 0; o.leftQ += x.qty; o.leftS = r2(o.leftS + x.qty * c);
    (x.moves || []).forEach(function (mv) { if (mv.kind === 'pick' || mv.kind === 'pickIn') return; var q = -mv.delta;
      if (mv.kind === 'sale' || mv.kind === 'ret') { o.soldQ += q; o.soldS = r2(o.soldS + q * c); var sl = o.sales[mv.no] || (o.sales[mv.no] = { no: mv.no, date: mv.date, kind: mv.kind === 'sale' ? 'sv' : 'qm', qty: 0, sum: 0 }); sl.qty += q; sl.sum = r2(sl.sum + q * c); if (mv.kind === 'sale' && q > 0 && (!o.last || pD(mv.date) > pD(o.last))) o.last = mv.date; }
      else { o.otherQ += q; o.otherS = r2(o.otherS + q * c); } }); });
  // T11a: yetkazilmay qaytayotgan tovar (ombor hali qabul qilmagan) — Yalpi foyda kabi sotuvdan ayiriladi, «Qoldi» ga qo'shiladi
  store.orders.forEach(function (od) { if (!od.ret || od.ret.acc || !od.sale) return; od.ret.lines.forEach(function (rl) { var w = K[od.branch + '|' + rl.pid + '|' + rl.batch]; if (!w || !(rl.qty > 0)) return; var o = m[w], c = batchCost(rl.pid, rl.batch), q = rl.qty; o.soldQ -= q; o.soldS = r2(o.soldS - q * c); o.leftQ += q; o.leftS = r2(o.leftS + q * c); var sl = o.sales[od.sale.no]; if (sl) { sl.qty -= q; sl.sum = r2(sl.sum - q * c); } }); });
  return Object.keys(m).map(function (k) { var o = m[k]; o.active = !!(o.last && pD(o.last) >= t30); o.sales = Object.keys(o.sales).map(function (n) { var x = o.sales[n], sv = x.kind === 'sv' ? saleByNo(n) : null, od = sv ? orderOfSale(n) : null; x.ono = od ? od.no : ''; x.cust = sv ? ((custById(sv.cust) || {}).name || '') : ''; return x; }).filter(function (x) { return x.qty || x.sum; }).sort(function (x, y) { return pD(y.date) - pD(x.date); }); o.chk = r2(o.inS - o.soldS - o.leftS - o.otherS); return o; })
    .sort(function (x, y) { return y.leftS - x.leftS || y.leftQ - x.leftQ || (x.who < y.who ? -1 : 1); }); }); }

// ---- 16: Qarzlar — avansni hisobga olish (AH), akt sverka (AS), muddat taqsimoti ----
var ADV_ROLES = permView({ create: 'adv.create', cancel: 'adv.cancel', cancelAuto: 'adv.cancelAuto', recon: 'recon.create', pay: 'payments.create', viewAr: 'cdebt.view', viewAp: 'sdebt.view' }, 'ADV_ROLES');
function br0(o) { return o.branch; }
function advCopy(a) { return a ? JSON.parse(JSON.stringify(a)) : null; }
function advByNo(no) { return (store.advs || []).filter(function (a) { return a.no === no; })[0] || null; }
function advFor(docNo) { return (store.advs || []).filter(function (a) { return a.auto && a.src === docNo && a.status === 'posted'; })[0] || null; }
function advsOf(kind, party, br) { return (store.advs || []).filter(function (a) { return a.kind === kind && a.party === party && (!br || a.branch === br); }); }
function nextAdvNo(br) { var m = 0; (store.advs || []).forEach(function (a) { if (a.no && a.branch === br) m = Math.max(m, +a.no.split('-')[2]); }); return 'AH-' + br + '-' + pad6(m + 1); }
function saveAdv(a) { store.advs = store.advs || []; var c = advCopy(a); if (!c.no) c.no = nextAdvNo(c.branch); if (!c.id) c.id = c.no; c.alloc = (c.alloc || []).filter(function (x) { return x.sum > 0; }); var arr = store.advs.slice(), i = arr.map(function (x) { return x.id; }).indexOf(c.id); if (i >= 0) arr[i] = c; else arr.unshift(c); store.advs = arr; store.v++; return advCopy(c); }
function advSum(a) { return r2((a.alloc || []).reduce(function (s, x) { return s + (x.sum || 0); }, 0)); }
function postAdv(a, who) { var c = advCopy(a), at = nowStr(); c.status = 'posted'; c.postedBy = who; c.postedAt = at; c.log = (c.log || []).concat([{ kind: 'post', who: who, at: at }]); return saveAdv(c); }
function cancelAdv(no, who, reason) { var c = advCopy(advByNo(no)), at = nowStr(); c.status = 'cancelled'; c.cancelledBy = who; c.cancelledAt = at; c.cancelReason = reason || ''; c.log = (c.log || []).concat([{ kind: 'cancel', who: who, at: at, reason: reason || '' }]); return saveAdv(c); }
function autoAdv(kind, party, br, docNo, who) {
  if (!store.pays) return null; var L = ledger(kind, party, br); if (!(L.advance > 0)) return null;
  var al = autoAlloc(L.invoices.filter(function (x) { return x.left > 0; }), L.advance, docNo), alloc = Object.keys(al).map(function (k) { return { no: k, sum: al[k] }; });
  if (!alloc.length) return null; var at = nowStr();
  return saveAdv({ kind: kind, branch: L.branch, party: party, date: at.slice(0, 10), auto: true, src: docNo, alloc: alloc, status: 'posted', note: '', createdBy: who || 'Tizim', createdAt: at, postedBy: 'Tizim', postedAt: at, log: [{ kind: 'auto', who: 'Tizim', at: at, src: docNo }] });
}
function partyName(kind, party) { return kind === 'mt' ? ((custById(party) || {}).name || '') : party; }
function partyStir(kind, party) { return kind === 'mt' ? ((custById(party) || {}).stir || '') : ((supByName(party) || {}).stir || ''); }
function agingOf(L) { var ag = [0, 0, 0, 0, 0]; L.invoices.forEach(function (x) { if (!(x.left > 0)) return; var i = x.late <= 0 ? 0 : x.late <= 30 ? 1 : x.late <= 60 ? 2 : x.late <= 90 ? 3 : 4; ag[i] = r2(ag[i] + x.left); }); return ag; }
// Yagona holat/limit funksiyasi: Mijozlar qarzi, DebtCard, Buyurtma kiritish mijoz paneli shu yerdan oladi
function debtState(kind, party, br) {
  var L = ledger(kind, party, br), c = kind === 'mt' ? custById(party) : null, sp = kind === 'yt' ? supByName(party) : null, bt = c && c.bt && c.bt[L.branch], lim = bt ? bt.limit : c ? c.limit : 0;
  var pct = lim ? Math.round(L.debt / lim * 1000) / 10 : 0, st = L.overdue > 0 ? 'overdue' : (lim && L.debt > lim) ? 'limit' : L.advance > 0 ? 'adv' : 'ok';
  return { L: L, kind: kind, party: party, branch: L.branch, name: partyName(kind, party), stir: partyStir(kind, party), region: c ? c.region : '', aging: agingOf(L), limit: lim, used: L.debt, pct: pct, over: lim ? r2(Math.max(0, L.debt - lim)) : 0, status: st, terms: bt ? bt.days : c ? c.terms : sp ? sp.terms : 0 };
}
// Yagona qarz funksiyasi (ledger asosida). branch 'ALL' — barcha filiallar yig'indisi (guruh ichidagi qarzsiz). aging: [muddatida, 1–30, 31–60, 61–90, 90+]
function debtOf(kind, id, branch) { var c = kind === 'mt' ? custById(id) : null, all = !branch || branch === 'ALL';
  var brs = all ? (kind === 'mt' ? custBrs(c) : BRANCHES.map(function (b) { return b.code; })) : [kind === 'mt' ? partyBranch('mt', id, branch) : branch];
  var o = { debt: 0, overdue: 0, overdueDays: 0, aging: [0, 0, 0, 0, 0], advance: 0, limit: 0, limitLeft: null, branches: [] };
  brs.forEach(function (b) { if (!b) return; var L = ledger(kind, id, b), ag = agingOf(L); o.debt = r2(o.debt + L.debt); o.overdue = r2(o.overdue + L.overdue); o.overdueDays = Math.max(o.overdueDays, L.overdueDays || 0); o.advance = r2(o.advance + L.advance); ag.forEach(function (v, i) { o.aging[i] = r2(o.aging[i] + v); });
    if (c) { var bt = c.bt && c.bt[b]; o.limit += bt ? bt.limit || 0 : 0; } o.branches.push({ br: b, debt: L.debt, overdue: L.overdue }); });
  if (kind === 'mt') o.limitLeft = r2(o.limit - o.debt); return o; }
// Obyektdagi debt/overdue — faqat o'qish uchun getter (ikkinchi manba yo'q)
function debtProps(kind, x) { ['debt', 'overdue', 'overdueDays'].forEach(function (k) { Object.defineProperty(x, k, { get: function () { return debtOf(kind, kind === 'mt' ? x.id : x.name, 'ALL')[k]; }, enumerable: true, configurable: true }); }); }
// Barcha harakatlar (tasdiqlangan): sotuv/kirim, to'lov, qaytarish, avans hisobga olish. bal: mijozda bizga qarzi, yetkazib beruvchida bizning qarzimiz
function debtMoves(kind, party, br) { return memo('dm|' + kind + '|' + party + '|' + (br || ''), function () {
  br = partyBranch(kind, party, br); var out = [], mt = kind === 'mt', inv = invoicesOf(kind, party, br), seq = 0;
  var add = function (o) { o.seq = seq++; out.push(o); };
  inv.forEach(function (x) {
    add({ date: x.date, no: x.no, t: x.open ? 'arch' : mt ? 'sale' : 'rc', dr: mt ? x.sum : 0, cr: mt ? 0 : x.sum, archive: !!x.open, oid: x.oid, ext: x.extNo || '', ord: 0 });
    if (!(x.ret > 0)) return; var docs = 0;
    (store.docs ? store.docs[mt ? 'qm' : 'qy'] : []).forEach(function (d) { if (d.status !== 'posted' || (mt ? d.saleNo : d.receiptNo) !== x.no) return; var s = docSum(d); docs = r2(docs + s); add({ date: String(d.postedAt || d.date).slice(0, 10), no: d.no, t: mt ? 'qm' : 'qy', dr: mt ? 0 : s, cr: mt ? s : 0, base: x.no, ord: 2 }); });
    var rest = r2(x.ret - docs); if (rest > 0) { var o = store.orders.filter(function (y) { return y.id === x.oid; })[0]; add({ date: o && o.ret && o.ret.at ? o.ret.at.slice(0, 10) : x.date, no: o && o.ret && o.ret.trip ? o.ret.trip : x.no, t: 'tripret', dr: 0, cr: rest, base: x.no, ord: 2 }); }
  });
  (store.pays || []).forEach(function (p) { if (p.kind !== kind || p.party !== party || p.branch !== br || p.status !== 'posted') return; add({ date: p.date, no: p.no, t: kind, dr: mt ? 0 : p.sum, cr: mt ? p.sum : 0, method: p.method, id: p.id, ord: 1 }); });
  (store.advs || []).forEach(function (h) { if (h.kind !== kind || h.party !== party || h.branch !== br || h.status !== 'posted') return; add({ date: h.date, no: h.no, t: 'ah', dr: 0, cr: 0, info: advSum(h), auto: !!h.auto, ord: 3 }); });
  out.sort(function (a, b) { return (pD(a.date) - pD(b.date)) || (a.ord - b.ord) || (a.no < b.no ? -1 : a.no > b.no ? 1 : 0) || (a.seq - b.seq); });
  var bal = 0; out.forEach(function (m) { bal = r2(bal + (mt ? m.dr - m.cr : m.cr - m.dr)); m.bal = bal; });
  return out; }); }
function reconCalc(kind, party, br, from, to, withAh) {
  var all = debtMoves(kind, party, br).filter(function (m) { return withAh || m.t !== 'ah'; }), f = pD(from), t = pD(to), mt = kind === 'mt', open = 0, dr = 0, cr = 0, rows = [];
  all.forEach(function (m) { var d = pD(m.date); if (d < f) { open = r2(open + (mt ? m.dr - m.cr : m.cr - m.dr)); return; } if (d > t) return; rows.push(m); dr = r2(dr + m.dr); cr = r2(cr + m.cr); });
  return { open: open, rows: rows, dr: dr, cr: cr, close: r2(open + (mt ? dr - cr : cr - dr)) };
}
function reconCopy(a) { return a ? JSON.parse(JSON.stringify(a)) : null; }
function reconByNo(no) { return (store.recons || []).filter(function (a) { return a.no === no; })[0] || null; }
function nextReconNo(br) { var m = 0; (store.recons || []).forEach(function (a) { if (a.no && a.branch === br) m = Math.max(m, +a.no.split('-')[2]); }); return 'AS-' + br + '-' + pad6(m + 1); }
function saveRecon(a) { store.recons = store.recons || []; var c = reconCopy(a); if (!c.no) c.no = nextReconNo(c.branch); if (!c.id) c.id = c.no; var arr = store.recons.slice(), i = arr.map(function (x) { return x.id; }).indexOf(c.id); if (i >= 0) arr[i] = c; else arr.unshift(c); store.recons = arr; store.v++; return reconCopy(c); }
function reconStep(no, st, who, x) { var c = reconCopy(reconByNo(no)), at = nowStr(); c.status = st; Object.assign(c, x || {}); c.log = (c.log || []).concat([{ kind: st, who: who, at: at, note: (x && x.diffNote) || '' }]); return saveRecon(c); }
function reconsOf(kind, party, br) { return (store.recons || []).filter(function (a) { return a.kind === kind && a.party === party && (!br || a.branch === br); }); }
// Demo: Farm Lux uchun jo'natilgan sotuv (tovar qatorlarisiz — qoldiqlarga ta'sir qilmaydi)
function demoSale(cust, sum, who, noAuto) {
  var c = custById(cust), br = custBrs(c)[0], n = store.saleSeq[br] || 1, at = nowStr(); store.saleSeq[br] = n + 1;
  var no = 'SV-' + br + '-' + pad6(n); store.sales = [{ no: no, inv: 'HF-' + br + '-' + pad6(n), oid: null, ono: '', cust: cust, branch: br, method: 'pickup', trip: null, at: at, sum: sum, qty: 0, by: who, demo: true }].concat(store.sales); store.v++;
  var ah = noAuto ? null : autoAdv('mt', cust, br, no, who); return { no: no, ah: ah };
}
function openDebt(x) { store.debtOpen = x; store.v++; try { window.dispatchEvent(new CustomEvent('medix-debt', { detail: x })); } catch (e) {} }
function openParty(kind, party, br, tab) { var k = ktKey(kind, party); if (!k) return false; try { window.dispatchEvent(new CustomEvent('medix-party', { detail: { kind: kind, key: k, branch: br || null, tab: tab || null } })); } catch (e) {} return true; }
function seedDebt() { return bulk(function () {
  store.advs = []; store.recons = [];
  var mk = function (n, kind, party, from, to, st, at, who, x) { var a = Object.assign({ no: 'AS-TSH-' + pad6(n), id: 'AS-TSH-' + pad6(n), kind: kind, party: party, branch: 'TSH', from: from, to: to, status: st, createdBy: who, createdAt: at, theirs: null, diffNote: '', log: [{ kind: 'made', who: who, at: at }] }, x || {}); if (st !== 'made') a.log.push({ kind: 'sent', who: who, at: a.sentAt || at }); if (st === 'signed' || st === 'diff') a.log.push({ kind: st, who: who, at: a.doneAt || at, note: a.diffNote || '' }); store.recons.push(a); };
  mk(2, 'yt', 'Nobel Pharmsanoat', '01.07.2026', '30.09.2026', 'sent', '01.10.2026 10:30', ACC, { sentAt: '01.10.2026 11:00' });
  mk(1, 'mt', 1, '01.07.2026', '30.09.2026', 'signed', '30.09.2026 16:00', ACC, { sentAt: '30.09.2026 16:20', doneAt: '02.10.2026 12:10' });
}); }

// ---- 18: Ko'chirish — ZK (zona), OK (ombor), FS (filiallararo savdo, tannarxda + QQS) ----
var TR_LABEL = { zk: "Zona ko'chirish", ok: "Ombor ko'chirish", fs: 'Filiallararo savdo' };
var TR_ACT = ['transfer.zk', 'transfer.ok', 'transfer.fs', 'transfer.send', 'transfer.receive', 'transfer.resolve', 'transfer.quar', 'transfer.cancel'];
var TR_ROLES = permView({ zk: 'transfer.zk', quarOut: 'transfer.quar', okCreate: 'transfer.ok', fsCreate: 'transfer.fs', send: 'transfer.send', receive: 'transfer.receive', resolve: 'transfer.resolve', cancel: 'transfer.cancel', view: 'transfer.view',
  readOnly: function () { return rlRoles().filter(function (r) { return r.active !== false && can(r.id, 'transfer.view') && !TR_ACT.some(function (k) { return can(r.id, k); }); }).map(function (r) { return r.id; }); } }, 'TR_ROLES'); // faqat ko'radi: ko'rish bor, birorta amal yo'q
var TR_REASONS = ['Kam keldi', 'Shikastlangan', 'Boshqa'];
var TR_VAT = CONFIG.vat;
function trCopy(x) { return x ? JSON.parse(JSON.stringify(x)) : null; }
function trByNo(no) { return (store.transfers || []).filter(function (x) { return x.no === no || x.inv === no; })[0] || null; }
function trById(id) { return (store.transfers || []).filter(function (x) { return x.id === id; })[0] || null; }
function nextTrNo(kind, br) { var pre = { zk: 'ZK', ok: 'OK', fs: 'FS' }[kind], m = 0; (store.transfers || []).forEach(function (x) { if (x.no && x.kind === kind && x.from.branch === br) m = Math.max(m, +x.no.split('-')[2]); }); return pre + '-' + br + '-' + pad6(m + 1); }
function nextHfNo(br) { var m = 0; (store.transfers || []).forEach(function (x) { if (x.inv && x.from.branch === br) m = Math.max(m, +x.inv.split('-')[2]); }); return 'HF-' + br + '-' + pad6(m + 1); }
function saveTr(x) { store.transfers = store.transfers || []; var c = trCopy(x); if (!c.no) c.no = nextTrNo(c.kind, c.from.branch); if (c.kind === 'fs' && !c.inv) c.inv = nextHfNo(c.from.branch); if (!c.id) c.id = c.no; var a = store.transfers.slice(), i = a.map(function (y) { return y.id; }).indexOf(c.id); if (i >= 0) a[i] = c; else a.unshift(c); store.transfers = a; store.v++; return trCopy(c); }
function deleteTr(id) { store.transfers = (store.transfers || []).filter(function (x) { return x.id !== id; }); store.v++; }
function trStep(x, st, who, extra, kind) { var c = trCopy(x), at = nowStr(); c.status = st; Object.assign(c, extra || {});
  if (st === 'posted') { c.postedBy = who; c.postedAt = at; } if (st === 'pending') { c.sentBy = who; c.sentAt = at; } if (st === 'transit') { c.sentBy = who; c.sentAt = at; } if (st === 'received' || st === 'diff') { c.receivedBy = who; c.receivedAt = at; }
  if (st === 'rejected') { c.rejectedBy = who; c.rejectedAt = at; } if (st === 'cancelled') { c.cancelledBy = who; c.cancelledAt = at; }
  c.log = (c.log || []).concat([{ kind: kind || st, who: who, at: at, reason: (extra && (extra.rejectReason || extra.cancelReason)) || '' }]); return saveTr(c); }
function defZone(p, br, wh) { var zs = zonesFor(br, wh), has = function (k) { return zs.some(function (z) { return z.key === k; }); }; if (p && p.ctrl) return has('seyf') ? 'seyf' : null; return 'asosiy'; }
function trFree(b, kind) { if (!b) return 0; if ((kind === 'zk' && b.status !== 'open') || (b.days != null && b.days < 0)) return Math.max(0, b.qty - b.reservedQty); return b.avail; }
function trNeedsAppr(x) { if (x.kind !== 'zk') return false; var bs = batches(); return x.lines.some(function (l) { var b = trFind(bs, l.bid), z = zoneType(x.from.branch, x.from.wh, l.toZone); return b && b.zoneType === 'quar' && ['store', 'cold', 'ctrl'].indexOf(z.type) >= 0 && l.qty > 0; }); }
function whName(br, wh) { var B = BRANCHES.filter(function (b) { return b.code === br; })[0]; return (B ? B.name.replace(' filiali', '') : br) + ' · ' + String(wh || '').replace(' ombori', '').replace(' ombor', ''); }
// Tekshiruv: faqat mavjud miqdor; sovuq / nazoratdagi / muddati o'tgan qoidalari
function trCheck(x) {
  var errs = [], bs = batches(), zk = x.kind === 'zk', used = {};
  if (!x.from || !x.from.wh) errs.push({ key: 'from', text: "Qayerdan — ombor tanlanmagan" });
  if (!zk && (!x.to || !x.to.wh)) errs.push({ key: 'to', text: "Qayerga — ombor tanlanmagan" });
  if (x.kind === 'ok' && x.to && x.to.wh && (x.to.branch !== x.from.branch || x.to.wh === x.from.wh)) errs.push({ key: 'to', text: "Ombor ko'chirish — shu filialdagi boshqa ombor bo'lishi kerak" });
  if (x.kind === 'fs' && x.to && x.to.branch === x.from.branch) errs.push({ key: 'to', text: "Filiallararo savdo — boshqa filial tanlang" });
  var live = x.lines.filter(function (l) { return l.bid || l.qty > 0; });
  if (!live.length) errs.push({ key: 'lines', text: "Qatorlar yo'q — kamida bitta partiya qo'shing" });
  var toBr = zk ? x.from.branch : (x.to || {}).branch, toWh = zk ? x.from.wh : (x.to || {}).wh, toName = toWh ? whName(toBr, toWh) : '';
  live.forEach(function (l, i) {
    var b = trFind(bs, l.bid), p = prodById(l.pid) || {}, n = (p.name || '') + (l.batch ? ' · ' + l.batch : ''), le = function (k, t) { errs.push({ line: l.id, key: k, text: t, n: i + 1 }); };
    if (!b) return le('batch', (i + 1) + '-qator: partiya tanlanmagan');
    if (!(l.qty > 0)) return le('qty', (i + 1) + '-qator: miqdor kiritilmagan');
    used[b.id] = (used[b.id] || 0) + l.qty; var free = trFree(b, x.kind);
    if (used[b.id] > free) le('qty', n + ': mavjud ' + fN0(free) + ', so\u2019ralgan ' + fN0(used[b.id]) + ' — ' + fN0(used[b.id] - free) + ' yetishmaydi' + (b.reservedQty ? ' (band ' + fN0(b.reservedQty) + ' ko\u2019chirilmaydi)' : ''));
    if (b.days != null && b.days < 0 && (!zk || l.toZone !== 'karantin')) le('toZone', n + ": muddati o'tgan — faqat shu ombor ichida Karantin zonasiga ko'chiriladi");
    if (!zk && b.status !== 'open' && !(b.days < 0)) le('batch', n + ': ' + b.zoneLabel + " zonasidagi tovar boshqa omborga jo'natilmaydi");
    var lkF = ivLock(x.from.branch, x.from.wh, b.zone); if (lkF) le('batch', n + ': ' + b.zoneLabel + ' zonasi inventarizatsiyada (' + lkF + ") — sanoq tugaguncha bu zonadan harakat to'xtatilgan");
    if (toWh && l.toZone) { var lkT = ivLock(toBr, toWh, l.toZone); if (lkT && lkT !== lkF) le('toZone', n + ': ' + zoneType(toBr, toWh, l.toZone).label + ' zonasi inventarizatsiyada (' + lkT + ") — sanoq tugaguncha bu zonaga harakat to'xtatilgan"); }
    if (!toWh) return;
    var zs = zonesFor(toBr, toWh), z = zs.filter(function (y) { return y.key === l.toZone; })[0];
    if (!l.toZone || !z) return le('toZone', n + ': qayerga zona tanlanmagan');
    if (p.ctrl && !ctrlAllowed(toBr, toWh)) le('toZone', n + ': ' + toName + " — nazoratdagi tovar uchun ruxsat yo'q (Seyf zonasi yo'q)");
    else if (p.ctrl && z.type !== 'ctrl' && z.type !== 'quar') le('toZone', n + ": nazoratdagi tovar faqat Seyf zonasiga");
    if (zk && b.zone === l.toZone) le('toZone', n + ': qayerdan va qayerga zona bir xil');
  });
  var byP = {}; live.forEach(function (l) { var b = trFind(bs, l.bid); if (b && b.status === 'open' && l.qty > 0) byP[l.pid] = (byP[l.pid] || 0) + l.qty; });
  Object.keys(byP).forEach(function (k) { var pid = live.filter(function (l) { return String(l.pid) === k; })[0].pid, free = 0; bs.forEach(function (b) { if (b.pid === pid && b.branch === x.from.branch && b.wh === x.from.wh && b.status === 'open') free += b.avail; });
    if (byP[k] > free) errs.unshift({ key: 'qty', text: (prodById(pid) || {}).name + ' · ' + whName(x.from.branch, x.from.wh) + ': mavjud ' + fN0(free) + ', so\u2019ralgan ' + fN0(byP[k]) + ' — ' + fN0(byP[k] - free) + ' yetishmaydi' }); });
  if (zk && trNeedsAppr(x) && !String(x.note || '').trim()) errs.push({ key: 'note', text: "Karantindan chiqarish — izoh «Sifat tekshiruvi natijasi» majburiy" });
  return { errs: errs };
}
function fN0(n) { return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function trLineSum(x, l, q) { var p = prodById(l.pid) || {}, qq = q == null ? l.qty || 0 : q, net = r2(qq * (l.cost || 0)), vat = x.kind === 'fs' ? r2(net * (x.vat == null ? TR_VAT : x.vat) / 100) : 0; return { net: net, vat: vat, total: r2(net + vat) }; }
function trSum(x, recvOnly) { var n = 0, v = 0, q = 0; x.lines.forEach(function (l) { var qq = recvOnly ? trRecvQty(l) : (l.qty || 0); var s = trLineSum(x, l, qq); n += s.net; v += s.vat; q += qq; }); return { net: r2(n), vat: r2(v), total: r2(n + v), qty: q }; }
function trRecvQty(l) { var d = (l.qty || 0) - (l.recv || 0); return (l.recv || 0) + (l.reason === 'Shikastlangan' ? d : 0); }
function trHcFor(no, k) { return (store.docs ? store.docs.hc : []).filter(function (d) { return d.status === 'posted' && d.lines.some(function (l) { return l.bid === 'TR-' + no + '-' + k; }); })[0] || null; }
// Yetishmagan (yo'lda qolgan) miqdor — hal qilinmaguncha
function trShort(x) { var out = []; if (['received', 'diff'].indexOf(x.status) < 0) return out;
  x.lines.forEach(function (l, k) { var d = (l.qty || 0) - (l.recv || 0); if (!(d > 0) || l.reason === 'Shikastlangan') return; var hc = trHcFor(x.no, k), left = hc ? 0 : d - (l.back || 0); out.push({ k: k, pid: l.pid, batch: l.batch, qty: d, left: Math.max(0, left), reason: l.reason, hc: hc ? hc.no : null, back: l.back || 0, cost: l.cost }); }); return out; }
function transitList(br) { var out = []; (store.transfers || []).forEach(function (x) {
  if (x.kind === 'zk') return;
  if (x.status === 'transit') x.lines.forEach(function (l) { if (l.qty > 0) out.push({ no: x.no, kind: x.kind, from: x.from, to: x.to, pid: l.pid, batch: l.batch, qty: l.qty, cost: l.cost, sentAt: x.sentAt, short: false }); });
  trShort(x).forEach(function (s) { if (s.left > 0) out.push({ no: x.no, kind: x.kind, from: x.from, to: x.to, pid: s.pid, batch: s.batch, qty: s.left, cost: s.cost, sentAt: x.sentAt, short: true }); });
}); return out.filter(function (r) { return !br || r.from.branch === br || r.to.branch === br; }); }
function resolveBack(no, k, who) { var x = trCopy(trByNo(no)), s = trShort(x).filter(function (y) { return y.k === k; })[0]; if (!s || !(s.left > 0)) return x; x.lines[k].back = (x.lines[k].back || 0) + s.left; x.lines[k].backAt = nowStr(); x.log = (x.log || []).concat([{ kind: 'back', who: who, at: nowStr(), reason: '' }]); return saveTr(x); }
function resolveHc(no, k, who) {
  var x = trByNo(no), s = trShort(x).filter(function (y) { return y.k === k; })[0]; if (!s || !(s.left > 0)) return null;
  var l = x.lines[k], at = nowStr(), d = mkDoc('hc', nextDocNo('hc', x.from.branch), 'draft', at.slice(0, 10), at.slice(11), who, { branch: x.from.branch, wh: x.from.wh, reason: "Yo'qolgan", commission: [KEEPER, who], actNo: 'DL-' + x.no, note: x.no + ' bo\u2019yicha yo\u2019lda yetishmagan: ' + (l.reason || ''), lines: [{ id: 'hTR' + k, bid: 'TR-' + no + '-' + k, pid: l.pid, batch: l.batch, zone: "Yo'lda", exp: l.exp, cost: l.cost, qty: s.left, transit: no }] });
  d = saveDoc(d); d = postDoc(d, who); var c = trCopy(x); c.log = (c.log || []).concat([{ kind: 'hc', who: who, at: at, reason: d.no }]); saveTr(c); return d;
}
function trCancelBlock(x) { var bs = batches(), out = []; x.lines.forEach(function (l, k) { var got = trFind(bs, 'T-' + x.no + '-' + k), need = x.kind === 'zk' ? l.qty : l.recv || 0; if (!need) return; var have = got ? got.avail + 0 : 0; if (have < need) out.push({ pid: l.pid, batch: l.batch, need: need, have: have }); }); return out; }
// Guruh ichidagi qarz (FS): qabul qilingan miqdor × tannarx + QQS. kind 'mt' — bizga qarzdor filiallar, 'yt' — biz qarzdor filiallar
function groupDebt(kind, br) { var m = {}; (store.transfers || []).forEach(function (x) { if (x.kind !== 'fs' || ['received', 'diff'].indexOf(x.status) < 0) return; var seller = x.from.branch, buyer = x.to.branch, mine = kind === 'mt' ? seller : buyer, other = kind === 'mt' ? buyer : seller; if (br && mine !== br) return; var s = trSum(x, true), k = mine + '|' + other; if (!m[k]) m[k] = { branch: mine, party: other, debt: 0, docs: [], last: null }; m[k].debt = r2(m[k].debt + s.total); m[k].docs.push(x.no); }); return Object.keys(m).map(function (k) { return m[k]; }); }
function seedTransfers() { return bulk(function () {
  store.transfers = []; var bs = batches(), find = function (br, wh, name, zone) { return bs.filter(function (b) { return b.branch === br && b.wh === wh && b.p && b.p.name === name && (!zone || b.zone === zone) && b.status === 'open' && b.avail > 0; }).sort(function (a, b) { return pD(a.exp) - pD(b.exp); })[0]; };
  var L = function (b, q, toZone) { return { id: 'l' + b.id, bid: b.id, pid: b.pid, batch: b.batch, exp: b.exp, fromZone: b.zone, cost: b.cost, qty: q, toZone: toZone, recv: null, reason: '' }; };
  var mk = function (kind, from, to, st, date, time, who, lines, x) { var at = date + ' ' + time, d = Object.assign({ kind: kind, from: from, to: to, date: date, note: '', status: 'draft', vat: TR_VAT, lines: lines, createdBy: who, createdAt: at, log: [{ kind: 'create', who: who, at: at }] }, x || {}); return d; };
  var b1 = find('SMQ', 'Asosiy ombor', 'Paracetamol 500mg') || bs.filter(function (b) { return b.branch === 'SMQ' && b.wh === 'Asosiy ombor' && b.status === 'open' && b.avail >= 100 && b.p && !b.p.ctrl; })[0];
  if (b1) { var f = saveTr(mk('fs', { branch: 'SMQ', wh: 'Asosiy ombor' }, { branch: 'TSH', wh: 'Asosiy ombor' }, 'draft', '30.09.2026', '10:00', 'Shahnoza Qodirova', [L(b1, 80, 'asosiy')], { note: "Toshkent so'rovi bo'yicha" }));
    f = trStep(f, 'transit', 'Shahnoza Qodirova'); f.sentAt = '30.09.2026 11:00'; f.log[1].at = f.sentAt; f.lines[0].recv = 80; f = trStep(f, 'received', KEEPER); f.receivedAt = '01.10.2026 09:40'; f.log[2].at = f.receivedAt; saveTr(f); }
  var b2 = find('TSH', 'Asosiy ombor', 'Drotaverin 2% 2ml');
  if (b2) { var o = saveTr(mk('ok', { branch: 'TSH', wh: 'Asosiy ombor' }, { branch: 'TSH', wh: 'Chilonzor ombori' }, 'draft', '04.10.2026', '10:05', 'Sardor Aliyev', [L(b2, 100, 'asosiy')])); o = trStep(o, 'transit', KEEPER); o.sentAt = '04.10.2026 10:20'; o.log[1].at = o.sentAt; saveTr(o); }
}); }

// ---- 19: Inventarizatsiya va markirovka jurnali ----
var IV_ROLES = permView({ create: 'inventory.create', count: 'inventory.count', view: 'inventory.view', approve: 'inventory.approve', approveDir: 'inventory.director', openCount: 'inventory.openCount', journal: 'inventory.view' }, 'IV_ROLES');
var IV_RULE = { get directorOver() { return CONFIG.ivDirApprove; } };
var IV_LAST = { 'TSH|Asosiy ombor': '12.06.2026', 'TSH|Sovuq ombor': '20.08.2026', 'TSH|Chilonzor ombori': '02.09.2026', 'SMQ|Asosiy ombor': '15.05.2026', 'SMQ|Sovuq ombor': '28.08.2026', 'BXR|Asosiy ombor': '10.08.2026', "BXR|G'ijduvon ombori": '22.07.2026', 'FRG|Asosiy ombor': '05.09.2026', "FRG|Qo'qon ombori": '18.04.2026', "FRG|Marg'ilon ombori": '30.08.2026' };
function ivCopy(x) { return x ? JSON.parse(JSON.stringify(x)) : null; }
function ivByNo(no) { return (store.invs || []).filter(function (x) { return x.no === no; })[0] || null; }
function nextIvNo(br) { var m = 0; (store.invs || []).forEach(function (x) { if (x.no && x.branch === br) m = Math.max(m, +x.no.split('-')[2]); }); return 'IN-' + br + '-' + pad6(m + 1); }
function saveIv(x) { store.invs = store.invs || []; var c = ivCopy(x); if (!c.no) c.no = nextIvNo(c.branch); if (!c.id) c.id = c.no; var a = store.invs.slice(), i = a.map(function (y) { return y.id; }).indexOf(c.id); if (i >= 0) a[i] = c; else a.unshift(c); store.invs = a; store.v++; return ivCopy(c); }
function deleteIv(id) { store.invs = (store.invs || []).filter(function (x) { return x.id !== id; }); store.v++; }
function ivZones(x) { return x.scope && x.scope.zones && x.scope.zones.length ? x.scope.zones : zonesFor(x.branch, x.wh).map(function (z) { return z.key; }); }
function ivScope(x) { var zs = ivZones(x), ps = (x.scope && x.scope.pids) || []; return batches().filter(function (b) { return b.branch === x.branch && b.wh === x.wh && b.qty > 0 && b.zoneType !== 'ship' && zs.indexOf(b.zone) >= 0 && (!ps.length || ps.indexOf(b.pid) >= 0); }).sort(function (a, b) { return zs.indexOf(a.zone) - zs.indexOf(b.zone) || (a.p.name.localeCompare(b.p.name)) || pD(a.exp) - pD(b.exp); }); }
function ivActive(br, wh) { return (store.invs || []).filter(function (x) { return x.branch === br && x.wh === wh && (x.status === 'count' || x.status === 'check'); }); }
function ivLock(br, wh, zone) { var a = ivActive(br, wh).filter(function (x) { return ivZones(x).indexOf(zone) >= 0; })[0]; return a ? a.no : null; }
function ivWaitOrders(x) { var m = {}; ivScope(x).forEach(function (b) { (b.resDocs || []).forEach(function (r) { m[r.no] = 1; }); }); return Object.keys(m); }
function ivStart(x, who) { var c = ivCopy(x), at = nowStr(), busy = ivZones(c).map(function (z) { return ivLock(c.branch, c.wh, z); }).filter(Boolean);
  if (busy.length) return { err: busy[0] };
  c.lines = ivScope(c).map(function (b) { return { id: 'v' + b.id, bid: b.id, pid: b.pid, batch: b.batch, exp: b.exp, days: b.days, zone: b.zone, zoneLabel: b.zoneLabel, zoneType: b.zoneType, book: b.qty, cost: b.cost, counted: null, codes: [], note: '', newBatch: false, notFound: false }; });
  c.status = 'count'; c.startedAt = at; c.startedBy = who; c.log = (c.log || []).concat([{ kind: 'start', who: who, at: at }]); return saveIv(c); }
function ivStep(x, st, who, extra, kind) { var c = ivCopy(x), at = nowStr(); c.status = st; Object.assign(c, extra || {}); if (st === 'check') { c.countedAt = at; c.countedBy = who; } if (st === 'posted') { c.postedAt = at; c.postedBy = who; } if (st === 'cancelled') { c.cancelledAt = at; c.cancelledBy = who; }
  c.log = (c.log || []).concat([{ kind: kind || st, who: who, at: at, reason: (extra && extra.cancelReason) || '' }]); return saveIv(c); }
function ivDiff(l) { return l.counted == null ? 0 : l.counted - (l.book || 0); }
function ivSum(x) { var s = { shortQ: 0, shortS: 0, overQ: 0, overS: 0, done: 0, n: x.lines.length }; x.lines.forEach(function (l) { var d = ivDiff(l); if (l.counted != null) s.done++; if (d < 0) { s.shortQ -= d; s.shortS += -d * (l.cost || 0); } if (d > 0) { s.overQ += d; s.overS += d * (l.cost || 0); } }); s.shortS = r2(s.shortS); s.overS = r2(s.overS); s.net = r2(s.overS - s.shortS); return s; }
function ivCtrlDiff(x) { return x.lines.some(function (l) { var p = prodById(l.pid) || {}; return p.ctrl && ivDiff(l) !== 0; }); }
function ivNeedsDir(x) { return ivSum(x).shortS > IV_RULE.directorOver || ivCtrlDiff(x); }
function applyInv(list, x) {
  if (x.status !== 'posted') return; var day = String(x.postedAt || x.date).slice(0, 10);
  x.lines.forEach(function (l, k) { var d = ivDiff(l); if (!d) return; var mv = { date: day, kind: 'inv', label: 'Inventarizatsiya', no: x.no, delta: d };
    if (l.newBatch || !l.bid) { var p = prodById(l.pid) || {}, e = pD(l.exp), days = e == null ? null : Math.round((e - T0) / DAY), src = { pid: l.pid, p: p, batch: l.batch, exp: l.exp, mfg: '', days: days, cost: l.cost, doc: x.no }; if (d > 0) trIn(list, src, x.branch, x.wh, l.zone, d, 'I-' + x.no + '-' + k, mv); return; }
    var b = trFind(list, l.bid); if (!b) return; if (d < 0) { var q = Math.min(-d, b.qty); trOut(b, q, Object.assign({}, mv, { delta: -q })); return; }
    b.qty += d; if (b.status === 'open') b.avail += d; else b.closed += d; b.value = b.qty * (b.cost || 0); b.scanned = (b.scanned || 0) + (b.p && b.p.mark ? d : 0); b.moves = (b.moves || []).concat([mv]); });
}
// Markirovka kodlari (GS1): partiya bo'laklari bo'yicha deterministik kodlar
function hsh(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; } return h; }
function gtinOf(p) { return ('00000000000000' + String((p && p.barcodes && p.barcodes[0]) || '')).slice(-14); }
function yymmdd(s) { var a = String(s || '').split('.'); return a.length === 3 ? a[2].slice(2) + a[1] + a[0] : '000000'; }
function serialOf(pid, batch, i) { var x = (hsh(pid + '|' + batch + '|' + i) % 2176782336).toString(36).toUpperCase(); return ('000000' + x).slice(-6) + ('00' + (i % 1296).toString(36).toUpperCase()).slice(-2); }
function codeStr(p, batch, exp, ser, kind) { return '01' + gtinOf(p) + '21' + ser + '\u001d17' + yymmdd(exp) + '10' + batch + '\u001d91' + ((kind || mkKind(p)) === 'box' ? 'Q' : 'D'); } // T9-3: AI 91 — tur (Q quti / D dona)
function marksRaw() {
  var bs = batches(), groups = {}, out = [];
  bs.forEach(function (b) { if (!b.p || !b.p.mark) return; var k = b.pid + '|' + b.batch; (groups[k] = groups[k] || []).push(b); });
  var trl = transitList(); store.markAdj = store.markAdj || {};
  Object.keys(groups).forEach(function (k) {
    var g = groups[k].slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; }), i = 0, p = g[0].p, src = g[0];
    var origin = src.doc ? { kind: 'in', label: 'Kirim', no: src.doc, date: src.docDate || '' } : { kind: 'in', label: "Boshlang'ich qoldiq (SMARTUP)", no: '', date: '01.10.2026' };
    var push = function (b, st, hist) { var ser = serialOf(b.pid, b.batch, i++); out.push({ code: codeStr(p, b.batch, b.exp, ser), gtin: gtinOf(p), serial: ser, pid: b.pid, p: p, batch: b.batch, exp: b.exp, branch: b.branch, wh: b.wh, zone: b.zoneLabel, zoneType: b.zoneType, status: st, bid: b.id, hist: [origin].concat(hist || []) }); };
    g.forEach(function (b) {
      var have = Math.max(0, Math.min(b.qty, (b.scanned != null ? b.scanned : b.qty) + (store.markAdj[b.id] || 0)));
      var st = b.zoneType === 'ship' ? 'picked' : b.zoneType === 'quar' ? (/^QM-/.test(b.id) ? 'returned' : 'quar') : 'stock';
      var hist = (b.moves || []).filter(function (m) { return ['pickIn', 'ret', 'tin', 'inv'].indexOf(m.kind) >= 0; }).map(function (m) { return { kind: m.kind, label: m.kind === 'pickIn' ? 'Terish' : m.label || m.kind, no: m.no, date: m.date }; });
      if (/^QM-/.test(b.id)) { var qd = docByNo('qm', b.id.replace(/-\d+$/, '')); if (qd) hist.unshift({ kind: 'sale', label: 'Sotuv', no: qd.saleNo, date: '' }); }
      for (var n = 0; n < have; n++) push(b, st, hist);
      (b.moves || []).forEach(function (m) { if (m.kind === 'sale') { var o = orderOfSale(m.no); for (var n2 = 0; n2 < -m.delta; n2++) push(b, 'sold', [o ? { kind: 'pick', label: 'Terish', no: o.no, date: m.date } : null, { kind: 'sale', label: 'Sotuv', no: m.no, date: m.date }].filter(Boolean)); }
        if (m.kind === 'out' && /^HC-/.test(m.no)) for (var n3 = 0; n3 < -m.delta; n3++) push(b, 'writeoff', [{ kind: 'out', label: 'Hisobdan chiqarish', no: m.no, date: m.date }]); });
    });
    trl.filter(function (t) { return t.pid + '|' + t.batch === k; }).forEach(function (t) { var b0 = Object.assign({}, src, { branch: t.from.branch, wh: t.from.wh, zoneLabel: "Yo'lda", zoneType: 'transit' }); for (var n4 = 0; n4 < t.qty; n4++) push(b0, 'transit', [{ kind: 'tout', label: TR_LABEL[t.kind], no: t.no, date: String(t.sentAt || '').slice(0, 10) }]); });
  });
  return out;
}
function marks() { return memo('marks', marksRaw); }
function markByCode(c) { var q = String(c || '').replace(/[\s\u001d()]/g, ''); if (q.length < 16) return null; return marks().filter(function (m) { return m.code.replace(/\u001d/g, '') === q || (q.length >= 24 && m.code.replace(/\u001d/g, '').indexOf(q) === 0); })[0] || null; }
function markMismatch(br) { var out = []; batches().forEach(function (b) { if (!b.p || !b.p.mark || !(b.qty > 0) || b.zoneType === 'ship' || (br && b.branch !== br)) return; var have = Math.max(0, Math.min(b.qty, (b.scanned != null ? b.scanned : b.qty) + ((store.markAdj || {})[b.id] || 0))); if (have !== b.qty) out.push({ b: b, qty: b.qty, codes: have, diff: have - b.qty }); }); return out; }
function pickLock(o) { if (!o) return null; var hit = null; batches().forEach(function (b) { if (hit || b.branch !== o.branch || b.wh !== o.wh) return; if ((b.resDocs || []).some(function (r) { return r.no === o.no; })) { var n = ivLock(b.branch, b.wh, b.zone); if (n) hit = { no: n, zone: b.zoneLabel }; } }); return hit; }
function seedInv() { store.invs = []; store.markAdj = {}; // T10b: ?open= sinovi uchun bitta qoralama (zona qulflamaydi — faqat count/check qulflaydi)
  store.invs.push({ no: 'IN-TSH-000001', id: 'IN-TSH-000001', branch: 'TSH', wh: 'Chilonzor ombori', date: '04.10.2026', scope: { mode: 'zones', zones: [], pids: [] }, commission: ['Sardor Aliyev', 'Farrux Ismoilov'], chair: 'Sardor Aliyev', blind: true, status: 'draft', lines: [], note: 'Oylik rejali sanoq', createdBy: 'Sardor Aliyev', createdAt: '04.10.2026 09:05', log: [{ kind: 'create', who: 'Sardor Aliyev', at: '04.10.2026 09:05' }] }); }

// ---- 20: Boshlang'ich qoldiq (BQ, SMARTUP dan ko'chirish) va Excel import ----
// Import qoldiqni o'zgartirmaydi: faqat qoralama BQ; qoldiq/qarz/kassa tasdiqlangan BQ dan (seed — mavjud boshlang'ich ma'lumot)
var BQ_TYPES = ['goods', 'mt', 'yt', 'cash'], BQ_CUT = '30.09.2026';
var BQ_ROLES = permView({ view: 'opening.view', list: 'opening.list', create: 'opening.create', goods: 'opening.goods', approve: 'opening.approve', cancel: 'opening.cancel' }, 'BQ_ROLES');
function bqCopy(x) { return x ? JSON.parse(JSON.stringify(x)) : null; }
function bqByNo(no) { return (store.bqs || []).filter(function (x) { return x.no === no; })[0] || null; }
function bqKey(type, br, wh) { return type === 'goods' ? 'goods|' + br + '|' + wh : type + '|' + br; }
function bqPosted(type, br, wh) { return (store.bqs || []).filter(function (x) { return x.status === 'posted' && bqKey(x.type, x.branch, x.wh) === bqKey(type, br, wh); })[0] || null; }
function bqSeedOff(type, br, wh) { var k = bqKey(type, br, wh); if (store.bqHide && store.bqHide[k]) return true; return (store.bqs || []).some(function (x) { return x.seed && x.status === 'cancelled' && bqKey(x.type, x.branch, x.wh) === k; }); }
function nextBqNo(br) { var m = 0; (store.bqs || []).forEach(function (x) { if (x.no && x.branch === br) m = Math.max(m, +x.no.split('-')[2]); }); return 'BQ-' + br + '-' + pad6(m + 1); }
function saveBq(x) { store.bqs = store.bqs || []; var c = bqCopy(x); if (!c.no) c.no = nextBqNo(c.branch); if (!c.id) c.id = c.no; var a = store.bqs.slice(), i = a.map(function (y) { return y.id; }).indexOf(c.id); if (i >= 0) a[i] = c; else a.push(c); store.bqs = a; store.v++; return bqCopy(c); }
function deleteBq(id) { store.bqs = (store.bqs || []).filter(function (x) { return x.id !== id; }); store.v++; }
function bqLive(type, br) { return (store.bqs || []).filter(function (x) { return !x.seed && x.status === 'posted' && x.type === type && (!br || x.branch === br); }); }
function bqBatches() { var out = []; bqLive('goods').forEach(function (x) { x.lines.forEach(function (l, k) { if (!(l.qty > 0)) return; out.push({ id: 'Q' + x.no + '-' + k, pid: l.pid, branch: x.branch, wh: x.wh, zone: l.zone, batch: l.batch, exp: l.exp, mfg: l.mfg || '', cost: l.cost || 0, qty: l.qty, reserved: 0, doc: null, docDate: x.cutoff, supplier: '', bq: x.no }); }); }); return out; }
function bqDebtLines(kind, party, br) { var out = []; bqLive(kind, br).forEach(function (x) { x.lines.forEach(function (l) { if (l.party === party && l.sysNo) out.push({ no: l.sysNo, date: l.date, due: l.due, sum: r2(l.left), ret: 0, open: true, extNo: l.extNo || '', bq: x.no }); }); }); return out; }
function accOpen(a) { var v = store.bqHide && store.bqHide['cash|' + a.branch] ? 0 : a.open; (store.bqs || []).forEach(function (x) { if (x.type !== 'cash' || x.branch !== a.branch) return; if (x.seed && x.status === 'cancelled') v = 0; }); bqLive('cash', a.branch).forEach(function (x) { x.lines.forEach(function (l) { if (l.acct === a.id) v += l.sum || 0; }); }); return r2(v); }
function bqOfArch(no) { var hit = null; (store.bqs || []).forEach(function (x) { if (hit || x.status !== 'posted') return; x.lines.forEach(function (l) { if (!hit && l.sysNo === no) hit = { no: x.no, line: l.id }; }); }); return hit; }
function bqOfBatch(b) { if (!b || !b.bq) return null; var x = bqByNo(b.bq); return x ? { no: x.no, cutoff: x.cutoff } : null; }
function bqCutoff(br, wh) { var best = null; (store.bqs || []).forEach(function (x) { if (x.status !== 'posted' || x.branch !== br || (x.type === 'goods' && wh && x.wh !== wh)) return; if (!best || pD(x.cutoff) > pD(best.date)) best = { date: x.cutoff, no: x.no }; }); return best; }
function bqCutoffErr(br, wh, date) { var c = bqCutoff(br, wh), d = pD(date); return c && d != null && d <= pD(c.date) ? c : null; }
function bqSum(x) { var s = { n: x.lines.length, qty: 0, cost: 0, quar: 0, parties: 0, sum: 0, paid: 0, left: 0, overdue: 0, adv: 0 }, ps = {};
  x.lines.forEach(function (l) { if (x.type === 'goods') { s.qty += l.qty || 0; s.cost += (l.qty || 0) * (l.cost || 0); if (l.zone === 'karantin') s.quar++; }
    else if (x.type === 'cash') s.sum += l.sum || 0;
    else { ps[l.party] = 1; s.sum += l.sum || 0; s.paid += l.paid || 0; s.left += l.left || 0; if (l.left < 0) s.adv++; else if (l.left > 0 && pD(l.due) < T0) s.overdue++; } });
  s.parties = Object.keys(ps).length; s.cost = r2(s.cost); s.sum = r2(s.sum); s.paid = r2(s.paid); s.left = r2(s.left); return s; }
function bqMaxNo(pre, br) { var m = 0, f = function (no) { var a = String(no || '').split('-'); if (a[0] + '-' === pre && a[1] === br) m = Math.max(m, +a[2] || 0); };
  (store.arOpen || []).forEach(function (x) { f(x.no); }); (store.sales || []).forEach(function (x) { f(x.no); }); store.receipts.forEach(function (x) { f(x.no); }); (store.bqs || []).forEach(function (x) { x.lines.forEach(function (l) { f(l.sysNo); }); });
  if (pre === 'SV-' && store.saleSeq && store.saleSeq[br]) m = Math.max(m, store.saleSeq[br] - 1); return m; }
function bqPost(x, who) { var c = bqCopy(x), at = nowStr(), dup = bqPosted(c.type, c.branch, c.wh); if (dup && dup.id !== c.id) return { err: 'dup', doc: dup };
  if (c.type === 'mt' || c.type === 'yt') { var pre = c.type === 'mt' ? 'SV-' : 'KR-', m = bqMaxNo(pre, c.branch); c.lines.forEach(function (l) { l.sysNo = pre + c.branch + '-' + pad6(++m); }); if (c.type === 'mt' && store.saleSeq) { store.saleSeq = Object.assign({}, store.saleSeq); store.saleSeq[c.branch] = Math.max(store.saleSeq[c.branch] || 1, m + 1); } }
  c.status = 'posted'; c.postedAt = at; c.postedBy = who; c.log = (c.log || []).concat([{ kind: 'posted', who: who, at: at }]); return { doc: saveBq(c) }; }
var BQ_PAGE = { sale: 'shipments', tout: 'transfer', tin: 'transfer', inv: 'inventory', out: 'writeoff', ret: 'creturns', pick: 'orders', pickIn: 'orders' };
function bqFirstMove(x) { var cut = pD(x.cutoff), list = [], add = function (no, date, kind, page) { var d = pD(String(date || '').slice(0, 10)); if (!no || d == null) return; list.push({ no: no, date: fD(d), t: d, kind: kind, page: page }); };
  if (x.type === 'goods') { batches().forEach(function (b) { if (b.branch !== x.branch || b.wh !== x.wh) return; (b.moves || []).forEach(function (m) { add(m.no, m.date, m.kind, BQ_PAGE[m.kind] || 'stock'); }); });
    store.receipts.forEach(function (r) { if (r.status === 'posted' && r.branch === x.branch && r.wh === x.wh) add(r.no, r.date, 'in', 'receipt'); });
    (store.orders || []).forEach(function (o) { if (o.branch === x.branch && o.wh === x.wh && RESERVING.indexOf(o.status) >= 0) add(o.no, o.date, 'order', 'orders'); }); }
  if (x.type === 'mt' || x.type === 'yt') { var ps = {}; x.lines.forEach(function (l) { ps[l.party] = 1; });
    (store.pays || []).forEach(function (p) { if (p.kind === x.type && p.branch === x.branch && ps[p.party] && p.status === 'posted') add(p.no, p.date, 'pay', 'payments'); });
    if (x.type === 'mt') (store.sales || []).forEach(function (s) { if (s.branch === x.branch && ps[s.cust]) add(s.no, s.at, 'sale', 'shipments'); });
    else store.receipts.forEach(function (r) { if (r.status === 'posted' && r.branch === x.branch && ps[r.supplier]) add(r.no, r.date, 'in', 'receipt'); }); }
  if (x.type === 'cash') x.lines.forEach(function (l) { accMoves(l.acct).forEach(function (m) { if (m.status === 'posted') add(m.no, m.date, 'money', /^K/.test(l.acct) ? 'cash' : 'bank'); }); });
  var after = list.filter(function (e) { return e.t > cut; }), use = after.length ? after : list; use.sort(function (a, b) { return a.t - b.t || (a.no < b.no ? -1 : 1); }); return use[0] || null; }
function bqCancel(x, who, reason) { var mv = bqFirstMove(x); if (mv) return { err: 'moved', move: mv }; var c = bqCopy(x), at = nowStr(); c.status = 'cancelled'; c.cancelledAt = at; c.cancelledBy = who; c.cancelReason = reason || ''; c.log = (c.log || []).concat([{ kind: 'cancelled', who: who, at: at, reason: reason || '' }]); return { doc: saveBq(c) }; }
function bqStatus(type, br, wh) { var ds = (store.bqs || []).filter(function (x) { return bqKey(x.type, x.branch, x.wh) === bqKey(type, br, wh) && x.status !== 'cancelled'; }); var p = ds.filter(function (x) { return x.status === 'posted'; })[0]; if (p) return { st: 'posted', doc: p }; var d = ds.filter(function (x) { return x.status === 'draft'; })[0]; return d ? { st: 'draft', doc: d } : { st: 'none', doc: null }; }
function seedBq() { store.bqs = []; store.bqHide = {}; store.impProfiles = {};
  var who = DIRECTOR, c0 = '01.10.2026 09:20', at = '01.10.2026 10:00';
  BRANCHES.forEach(function (b) {
    var mk = function (type, wh, lines) { var x = { no: nextBqNo(b.code), branch: b.code, type: type, wh: wh || '', cutoff: BQ_CUT, source: 'smartup', file: 'SMARTUP_' + { goods: 'qoldiq', mt: 'debitor', yt: 'kreditor', cash: 'kassa' }[type] + '_' + b.code + '_30.09.2026.xlsx', note: '', status: 'posted', seed: true, lines: lines, createdBy: who, createdAt: c0, postedBy: who, postedAt: at,
      log: [{ kind: 'create', who: who, at: c0 }, { kind: 'import', who: who, at: '01.10.2026 09:24', n: lines.length }, { kind: 'posted', who: who, at: at }] }; x.id = x.no; store.bqs.push(x); return x; };
    b.wh.forEach(function (w) { var os = OPEN.filter(function (o) { return o.branch === b.code && o.wh === w; }); if (!os.length) return; var x = mk('goods', w, os.map(function (o, k) { return { id: 'g' + k, pid: o.pid, batch: o.batch, exp: o.exp, zone: o.zone, qty: o.qty, cost: o.cost, src: o.id }; })); os.forEach(function (o) { o.bq = x.no; }); });
    ['mt', 'yt'].forEach(function (k) { var xs = (store.arOpen || []).filter(function (a) { return a.kind === k && a.branch === b.code; }); if (!xs.length) return; mk(k, '', xs.map(function (a, i) { return { id: 'd' + i, party: a.party, extNo: a.extNo || ('SU-' + b.code + '-' + (4100 + i * 7)), sysNo: a.no, date: a.date, due: a.due, sum: a.sum, paid: 0, left: a.sum }; })); });
    mk('cash', '', ACCOUNTS.filter(function (a) { return a.branch === b.code; }).map(function (a, i) { return { id: 'c' + i, acct: a.id, sum: a.open }; }));
  }); }
// Demo: tanlangan katakni "kiritilmagan" holatiga keltirish (seed hujjat olib tashlanadi)
function bqDemoClear(type, br, wh) { var k = bqKey(type, br, wh); store.bqs = (store.bqs || []).filter(function (x) { return bqKey(x.type, x.branch, x.wh) !== k; }); if (type !== 'mt' && type !== 'yt') { store.bqHide = Object.assign({}, store.bqHide || {}); store.bqHide[k] = 1; } store.demoDirty = true; store.v++; }
// Import: format normalizatsiyasi va tekshiruv
var C2L = { 'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'j', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'x', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh', 'ъ': '', 'ы': 'i', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya', 'ў': "o'", 'қ': 'q', 'ғ': "g'", 'ҳ': 'h' };
function toLat(s) { return String(s || '').toLowerCase().split('').map(function (ch) { return C2L[ch] != null ? C2L[ch] : ch; }).join(''); }
function bqNorm(s) { return toLat(s).replace(/ts/g, 'c').replace(/[^a-z0-9]/g, ''); }
function bqNum(v) { if (v == null) return null; if (typeof v === 'number') return v; var s = String(v).replace(/[\s\u00a0]/g, ''); if (!s) return null; var lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc >= 0) s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  else if (ld >= 0 && /^-?\d{1,3}(\.\d{3}){2,}$/.test(s)) s = s.replace(/\./g, '');
  return /^-?\d+(\.\d+)?$/.test(s) ? +s : NaN; }
function bqDate(v) { if (v == null || v === '') return ''; if (typeof v === 'number' || /^\d{5}$/.test(String(v))) { var n = +v; return n > 20000 && n < 80000 ? fD(Date.UTC(1899, 11, 30) + n * DAY) : null; }
  var s = String(v).trim(), m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/.exec(s); if (m) return fD(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return fD(Date.UTC(+m[1], +m[2] - 1, +m[3])); return null; }
function bigr(s) { var o = {}; for (var i = 0; i < s.length - 1; i++) { var k = s.slice(i, i + 2); o[k] = (o[k] || 0) + 1; } return o; }
function dice(a, b) { if (a === b) return 1; if (a.length < 2 || b.length < 2) return 0; var A = bigr(a), B = bigr(b), n = 0, t = 0; Object.keys(A).forEach(function (k) { n += Math.min(A[k], B[k] || 0); t += A[k]; }); Object.keys(B).forEach(function (k) { t += B[k]; }); return 2 * n / t; }
function bqMatch(name) { var q = bqNorm(name), best = null; if (!q) return { pid: null, conf: 0 }; PRODUCTS.forEach(function (p) { if (!p.active) return; var c = Math.round(dice(q, bqNorm(p.name)) * 100); if (!best || c > best.conf) best = { pid: p.id, conf: c }; }); return best.conf >= 60 ? best : { pid: null, conf: best.conf, near: best.pid }; }
function bqSimilar(name, n) { var q = bqNorm(name); return PRODUCTS.filter(function (p) { return p.active; }).map(function (p) { return { pid: p.id, name: p.name, conf: Math.round(dice(q, bqNorm(p.name)) * 100) }; }).sort(function (a, b) { return b.conf - a.conf; }).slice(0, n || 3); }
var BQ_ZSYN = { asosiy: ['asosiy', 'asosiy saqlash', 'основной', 'основная', 'основной склад'], karantin: ['karantin', 'карантин'], qabul: ['qabul', 'приёмка', 'приемка'], seyf: ['seyf', 'сейф'], sovuq: ['sovuq', 'sovuq saqlash', 'холодильник', 'холод'] };
function bqZone(s) { var q = bqNorm(s); if (!q) return ''; var hit = null; Object.keys(BQ_ZSYN).forEach(function (k) { if (!hit && BQ_ZSYN[k].some(function (z) { return bqNorm(z) === q; })) hit = k; }); return hit || null; }
var BQ_FIELDS = {
  products: [['code', 0, ['mahsulotkodi', 'kodtovara', 'kod', 'code']], ['name', 1, ['mahsulotnomi', 'naimenovanie', 'nomi', 'name', 'tovar']], ['contractName', 0, ['shartnomadaginomi', 'nazvaniepodogovoru', 'podogovoru', 'shartnoma']], ['classifier', 1, ['klassifikatornomi', 'klassifikator', 'mnn', 'xalqaronomi']], ['maker', 1, ['ishlabchiqaruvchi', 'proizvoditel', 'maker']], ['country', 0, ['ishlabchiqargandavlat', 'stranaproizvodstva', 'strana', 'davlat', 'country']], ['cat', 1, ['kategoriya', 'gruppa', 'category']], ['form', 0, ['dorishakli', 'lekarstvennayaforma', 'forma']], ['dose', 0, ['dozasi', 'dozirovka', 'doza']], ['pack', 0, ['qadoqdagisoni', 'kolvovupakovke', 'vupakovke']], ['unit', 0, ['asosiybirlik', 'edinica', 'birlik', 'unit']], ['barcode', 0, ['shtrixkod', 'barcode', 'ean']], ['ikpu', 1, ['ikpukodi', 'ikpu', 'mxik']], ['farmId', 1, ['farmid', 'farm']], ['note', 0, ['izoh', 'primechanie', 'note']]],
  goods: [['name', 1, ['naimenovanie', 'mahsulot', 'tovar', 'nomi', 'name']], ['batch', 1, ['seriya', 'partiya', 'batch']], ['exp', 1, ['srokgodnosti', 'muddat', 'yaroqlilikmuddati', 'expiry']], ['zone', 0, ['zonaxraneniya', 'zona', 'yacheyka']], ['qty', 1, ['kolvo', 'kolichestvo', 'miqdor', 'qty']], ['cost', 1, ['sebestoimost', 'tannarx', 'cost']], ['barcode', 0, ['shtrixkod', 'barcode', 'ean']]],
  mt: [['party', 1, ['kontragent', 'mijoz', 'pokupatel', 'klient']], ['doc', 1, ['dokument', 'hujjat', 'nomer']], ['date', 1, ['data', 'sana']], ['due', 1, ['srokoplati', 'tolovmuddati', 'muddat']], ['sum', 1, ['summa']], ['paid', 0, ['oplacheno', 'tolangan']], ['left', 1, ['ostatok', 'qoldiq', 'dolg']], ['ctrl', 0, ['kontroliruem', 'nazoratdagi', 'narkotik']]],
  yt: [['party', 1, ['postavshik', 'kontragent', 'yetkazibberuvchi']], ['doc', 1, ['dokument', 'hujjat', 'nomer']], ['date', 1, ['data', 'sana']], ['due', 1, ['srokoplati', 'tolovmuddati', 'muddat']], ['sum', 1, ['summa']], ['paid', 0, ['oplacheno', 'tolangan']], ['left', 1, ['ostatok', 'qoldiq', 'dolg']]],
  cust: [['stir', 1, ['inn', 'stir', 'innpinfl']], ['cname', 1, ['naimenovanie', 'nomi', 'kontragent', 'name', 'nazvanie']], ['ctype', 0, ['tip', 'turi', 'vid']], ['region', 0, ['region', 'hudud', 'oblast']], ['address', 0, ['adres', 'manzil']], ['phone', 0, ['telefon', 'tel']], ['limit', 0, ['limit', 'kreditlimit']], ['days', 0, ['ocrochka', 'tolovmuddati', 'srokoplati']], ['disc', 0, ['skidka', 'chegirma']]],
  sup: [['stir', 1, ['inn', 'stir']], ['cname', 1, ['naimenovanie', 'nomi', 'postavshik', 'name']], ['region', 0, ['region', 'hudud']], ['address', 0, ['adres', 'manzil']], ['phone', 0, ['telefon', 'tel']], ['days', 0, ['ocrochka', 'tolovmuddati', 'srokoplati']], ['lead', 0, ['srokpostavki', 'yetkazish']]],
  prices: [['code', 0, ['kod', 'shtrixkod', 'shtrix', 'barcode', 'ean', 'artikul', 'kodtovara']], ['name', 0, ['naimenovanie', 'mahsulot', 'tovar', 'nomi']], ['batch', 0, ['partiya', 'seriya', 'partiyano']], ['ptype', 0, ['tipceny', 'narxturi', 'vidceny', 'tip']], ['price', 1, ['cena', 'narx', 'price', 'novayacena']]],
  cash: [['acct', 1, ['schyotkassa', 'schyot', 'schetkassa', 'schet', 'kassa', 'hisob', 'kassahisob']], ['sum', 1, ['summa', 'ostatok', 'qoldiq']]] };
function bqFields(type) { return (BQ_FIELDS[type] || []).map(function (f) { return { key: f[0], req: !!f[1] }; }); }
function bqAutoMap(type, headers) { var m = {}, used = {}; (BQ_FIELDS[type] || []).forEach(function (f) { headers.forEach(function (h, i) { if (m[f[0]] != null || used[i]) return; var q = bqNorm(h).replace(/[^a-z]/g, ''); if (q && f[2].some(function (s) { return q === s || q.indexOf(s) === 0; })) { m[f[0]] = i; used[i] = 1; } }); }); return m; }
function prodSampleRows() {
  var P = function (id) { return prodById(id); }, cost = function (p) { return openCost(p.id); };
  var CY = { 2: 'Парацетамол 500мг', 9: 'Диклофенак 75мг 3мл', 10: 'Метформин 850мг', 22: 'Амброксол 30мг', 19: 'Ципрофлоксацин 500мг' };
  var fmtC = function (n, i) { var a = Math.floor(n), t = String(a).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return [String(a), t + '.00', t.replace(/ /g, ',') + '.00', t.replace(/ /g, '.') + ',00'][i % 4]; };
  var fmtD = function (t, i) { var d = fD(t); return i % 3 === 0 ? d : i % 3 === 1 ? d.split('.').reverse().join('-') : String(Math.round((t - Date.UTC(1899, 11, 30)) / DAY)); };
  var pre = function (p) { return p.name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase(); };
  var row = function (p, k, o) { o = o || {}; var i = p.id * 3 + k, exp = T0 + (o.days != null ? o.days : 300 + (p.id * 41 + k * 97) % 500) * DAY;
    return { name: o.name || CY[p.id] || p.name, batch: o.batch || pre(p) + '-25' + ('0' + ((p.id + k * 5) % 12 + 1)).slice(-2) + (11 + k * 6), exp: o.exp != null ? o.exp : fmtD(exp, i), zone: o.zone != null ? o.zone : (i % 5 === 0 ? 'Asosiy saqlash' : 'Основной'), qty: o.qty != null ? o.qty : String(40 + ((p.id * 37 + k * 53) % 30) * 10), unit: p.unit === 'dona' ? 'шт.' : 'уп.', cost: o.cost != null ? o.cost : fmtC(cost(p), i) }; };
  var normal = [2, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 30, 31, 33, 36], rows = [];
  normal.forEach(function (id) { rows.push(row(P(id), 0)); rows.push(row(P(id), 1)); });
  var sp = [
    [3, row(P(37), 0, { batch: 'BI-240815', days: -50, exp: '2026-08-15' })], [9, row(P(38), 0, { batch: 'KL-240910', days: -24, exp: '10.09.2026' })],
    [14, row(P(7), 0, { name: 'Ибупрофен таб.' })], [27, row(P(7), 1, { name: 'Ибупрофен таб.' })],
    [20, null], [33, row(P(40), 0, { cost: '0' })], [38, row(P(40), 1, { days: 47 })], [44, row(P(5), 2, { days: 71 })],
    [6, { name: 'Витамин C 1000мг шипучий', batch: 'VC-2506', exp: '30.06.2027', zone: 'Основной', qty: '120', unit: 'уп.', cost: '18 400.00' }],
    [17, row(P(11), 2, { qty: '12,5' })], [24, row(P(15), 2, { exp: '' })], [30, row(P(4), 0, { zone: 'Основной' })], [41, row(P(39), 0, { zone: 'Основной' })], [50, row(P(2), 2, { zone: 'Seyf' })] ];
  sp.forEach(function (x) { var r = x[1] || Object.assign({}, rows[8]); rows.splice(Math.min(x[0], rows.length), 0, r); });
  return rows; }
var KT_SAMPLE = [['302 118 447', 'Шифо Фарм', 'Аптека', 'Самарканд', 'ул. Регистан, 18', '+998 66 233 11 47', '20 000 000', '15', '0'], ['308559271', "Navro'z Farm", 'Аптека', 'Самарканд', 'ул. Гагарина, 9', '+998 66 234 50 12', '15000000', '21', '2'], ['309 412 776', 'Зарафшон Фарм', 'Аптека', 'Самарканд', 'ул. Ибн Сино, 4', '+998 66 230 12 09', '12 000 000', '14', '0'], ['310 225 418', 'Samarqand Med Clinic', 'Клиника', 'Самарканд', "Spitamen shoh ko'chasi, 44", '+998 66 231 77 30', '30000000', '30', '2'], ['311 904 552', 'Ургут Дори', 'Аптека', 'Ургут', 'ул. Навои, 2', '+998 66 552 13 40', '8 000 000', '14', '0'], ['312 670 119', 'Kattaqo\'rg\'on shifoxonasi', 'Больница', "Kattaqo'rg'on", "Mustaqillik ko'chasi, 1", '+998 66 452 20 18', '40 000 000', '45', '0'], ['31344091', 'Афросиёб Фарм', 'Аптека', 'Самарканд', 'ул. Амира Темура, 61', '+998 66 233 09 81', '10000000', '14', '1'], ['314 118 207', 'Pastdarg\'om Farm', 'Аптека', "Pastdarg'om", "Juma sh., Navro'z ko'chasi, 7", '+998 66 403 22 15', '6 000 000', '14', '0'], ['315 772 604', 'Dental Plus SMQ', 'Клиника', 'Самарканд', "Beruniy ko'chasi, 12", '+998 66 230 44 18', '9 000 000', '21', '0'], ['316 509 331', 'Юнона Фарм', 'Аптека', 'Самарканд', 'ул. Ташкентская, 33', '+998 66 233 81 02', '11 000 000', '21', '1']];
function bqSample(type, br, wh) {
  if (type === 'products') { var c0 = prodById(8) || {}, b0 = (prodById(2) || {}).barcodes || [''];
    var PG = [['Mahsulot kodi', 'Mahsulot nomi', 'Shartnomadagi nomi', 'Klassifikator nomi', 'Ishlab chiqaruvchi', 'Davlat', 'Kategoriya', 'Dori shakli', 'Doza', 'Qadoqdagi soni', 'Birlik', 'Shtrix-kod', 'IKPU', 'Farm ID', 'Izoh'],
      ['', 'Sefuroksim 750mg', 'Цефуроксим порошок 750 мг №1', 'Sefuroksim', 'KRKA', 'Sloveniya', 'Antibiotiklar', 'Flakon', '750 mg', '1', 'dona', '3838989614416', '03004001001099001', 'FRM-0099001', ''],
      ['58204417', 'Pantoprazol 20mg', 'Пантопразол таблетки 20 мг №14', 'Pantoprazol', 'Nobel', "O'zbekiston", 'Gastroenterologiya', 'Tabletka', '20 mg', '14', 'qadoq', '4006014000018', '03004001001099002', 'FRM-0099002', 'Yangi pozitsiya'],
      [c0.code || '', 'Esomeprazol 40mg', 'Эзомепразол капсулы 40 мг №14', 'Ezomeprazol', 'KRKA', 'Sloveniya', 'Gastroenterologiya', 'Kapsula', '40 mg', '14', 'qadoq', '', '03004001001099003', 'FRM-0099003', ''],
      ['', 'Valsartan 80mg', 'Валсартан таблетки 80 мг №28', 'Valsartan', 'Berlin-Chemie', 'Germaniya', 'Yurak-qon tomir', 'Tabletka', '80 mg', '28', 'qadoq', b0[0], '03004001001099004', 'FRM-0099004', ''],
      ['', 'Gliklazid 60mg', '', 'Gliklazid', 'Gedeon Richter', 'Vengriya', 'Endokrinologiya', 'Tabletka', '60 mg', '30', 'qadoq', '599700131', '03004001001099005', 'FRM-0099005', ''],
      ['', 'Omeprazol 20mg', 'Омепразол капсулы 20 мг №28', 'Omeprazol', 'KRKA', 'Sloveniya', 'Gastroenterologiya', 'Kapsula', '20 mg', '28', 'qadoq', '', '03004001001099006', 'FRM-0099006', ''],
      ['', 'Rozuvastatin 10mg', 'Розувастатин таблетки 10 мг №30', 'Rozuvastatin', 'Gedeon Richter', 'Vengriya', 'Yurak-qon tomir', 'Tabletka', '10 mg', '30', 'qadoq', '', '', 'FRM-0099007', '']];
    return { file: 'Mahsulotlar_SMARTUP_04.10.2026.xlsx', size: 9800, sheets: [{ name: 'Товары', grid: PG }], headerRow: 1 }; }
  if (type === 'prices') { var PR = [['Омепразол 20мг', 'Оптовая', '34 200'], ['Paracetamol 500mg', 'Оптовая', '6 400'], ['Парацетамол 500мг', 'Мелкий опт', '6 650'], ['Amoksitsillin 500mg', 'Оптовая', '22 400'], ['Ibuprofen 400mg', 'Тендер', '9 900'], ['Цефтриаксон 1г', 'Оптовая', '15 500'], ['Noshpa forte', 'Оптовая', '12 000'], ['Kavinton 5mg', 'Оптовая', '37 500'], ['Pantoprazol 40mg', 'Оптовая', '0']];
    var CD = function (n) { var p = PRODUCTS.filter(function (x) { return bqNorm(x.name) === bqNorm(n); })[0]; return p ? p.code : ''; };
    return { file: 'Narxlar_' + br + '_15.10.2026.xlsx', size: 7400, sheets: [{ name: 'Цены', grid: [['Код', 'Наименование', 'Тип цены', 'Новая цена']].concat(PR.map(function (r, i) { return [i % 3 === 1 ? '' : CD(r[0]), r[0], r[1], r[2]]; })) }], headerRow: 1 }; }
  if (type === 'cust' || type === 'sup') { var H3 = type === 'cust' ? ['ИНН', 'Наименование', 'Тип', 'Регион', 'Адрес', 'Телефон', 'Лимит', 'Отсрочка (дней)', 'Скидка %'] : ['ИНН', 'Наименование', 'Регион', 'Адрес', 'Телефон', 'Отсрочка (дней)', 'Срок поставки'];
    var R3 = type === 'cust' ? KT_SAMPLE : [['301 552 418', 'Nobel Pharmsanoat', 'Toshkent', "Mahtumquli ko'chasi, 120", '+998 71 230 10 40', '30', '4'], ['317 220 145', 'Samarkand Pharm Distribution', 'Самарканд', 'ул. Дагбитская, 3', '+998 66 233 40 70', '21', '2'], ['3188', 'Zarafshon Lab', 'Навои', 'ул. Галаба, 5', '+998 79 223 11 05', '14', '3']];
    return { file: 'SMARTUP_' + (type === 'cust' ? 'mijozlar' : 'yetkazuvchilar') + '_' + br + '.xlsx', size: 8200, sheets: [{ name: type === 'cust' ? 'Контрагенты' : 'Поставщики', grid: [H3].concat(R3) }], headerRow: 1 }; }
  var bn = (BRANCHES.filter(function (b) { return b.code === br; })[0] || {}).name || br;
  if (type === 'goods') { var code = wh === "Marg'ilon ombori" ? 'MRG' : br, rows = prodSampleRows(), H = ['№', 'Наименование', 'Серия', 'Срок годности', 'Зона хранения', 'Кол-во', 'Ед. изм.', 'Себестоимость', 'Сумма'];
    var grid = [['Остатки товаров на 30.09.2026', '', '', '', '', '', '', '', ''], ['Склад: ' + (wh === "Marg'ilon ombori" ? 'Маргилан' : wh) + ' · выгрузка SMARTUP', '', '', '', '', '', '', '', ''], H].concat(rows.map(function (r, i) { var q = bqNum(r.qty), c = bqNum(r.cost); return [String(i + 1), r.name, r.batch, r.exp, r.zone, r.qty, r.unit, r.cost, q > 0 && c >= 0 ? String(Math.round(q * c * 100) / 100) : '']; }));
    return { file: 'SMARTUP_qoldiq_' + code + '_30.09.2026.xlsx', size: 48600, sheets: [{ name: 'Остатки', grid: grid }, { name: 'Сводка', grid: [['Склад', 'Позиций', 'Сумма'], ['Маргилан', String(rows.length), '']] }], headerRow: 3 }; }
  if (type === 'mt' || type === 'yt') { var H2 = [type === 'mt' ? 'Контрагент' : 'Поставщик', 'Документ', 'Дата', 'Срок оплаты', 'Сумма', 'Оплачено', 'Остаток'].concat(type === 'mt' ? ['Контролируемые'] : []);
    var R = type === 'mt' ? [['Дорихона 777', 'SU-BX-1182', '20.08.2026', '20.09.2026', '2 500 000,00', '500 000,00', '2 000 000,00'], ['Asia Pharm', 'SU-BX-1190', '2026-09-05', '2026-10-05', '1,500,000.00', '0', '1,500,000.00'], ['Dorixona 777', 'SU-BX-1207', '25.09.2026', '25.10.2026', '1.000.000,00', '', '1.000.000,00']]
      : [['Nobel Pharmsanoat', 'NB-24410', '12.09.2026', '12.10.2026', '3 200 000.00', '0', '3 200 000.00'], ['KRKA Farma', 'KR-77812', '20.08.2026', '19.09.2026', '1 850 000.00', '0', '1 850 000.00']];
    return { file: 'SMARTUP_' + (type === 'mt' ? 'debitor' : 'kreditor') + '_' + br + '_30.09.2026.xlsx', size: 9400, sheets: [{ name: type === 'mt' ? 'Дебиторка' : 'Кредиторка', grid: [H2].concat(R.map(function (r) { return type === 'mt' ? r.concat(['нет']) : r; })) }], headerRow: 1 }; }
  var acc = ACCOUNTS.filter(function (a) { return a.branch === br; }), rowsC = acc.map(function (a) { return [a.kind === 'cash' ? 'Касса · ' + bn : a.bank + ' р/с ' + a.acc, String(a.open).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',00']; });
  return { file: 'SMARTUP_kassa_' + br + '_30.09.2026.xlsx', size: 6200, sheets: [{ name: 'Денежные средства', grid: [['Счёт / касса', 'Сумма']].concat(rowsC) }], headerRow: 1 }; }
function bqParty(type, br, s) { var q = bqNorm(s); if (!q) return null; if (type === 'mt') { var c = CUSTOMERS.filter(function (x) { return !!(x.bt && x.bt[br]) && (bqNorm(x.name) === q || String(x.stir).replace(/\s/g, '') === q); })[0]; return c ? c.id : null; } var sp = SUPPLIERS.filter(function (x) { return bqNorm(x.name) === q || String(x.stir).replace(/\s/g, '') === q; })[0]; return sp ? sp.name : null; }
function bqAcct(br, s) { var dg = String(s || '').replace(/\D/g, ''), q = bqNorm(s), as = ACCOUNTS.filter(function (a) { return a.branch === br; });
  if (dg.length >= 10) { var a1 = as.filter(function (a) { return a.acc && dg.indexOf(a.acc) >= 0; })[0]; if (a1) return a1.id; }
  if (/kassa|kasa/.test(q)) { var a2 = as.filter(function (a) { return a.kind === 'cash'; })[0]; if (a2) return a2.id; }
  var a3 = as.filter(function (a) { return a.bank && q.indexOf(bqNorm(a.bank)) >= 0; })[0]; return a3 ? a3.id : null; }
// recs: [{ i, raw: {field: value}, fix: {field: value}, pick: pid|party|acct }]
function bqValidate(type, br, wh, recs) { var zs = zonesFor(br, wh), zk = zs.map(function (z) { return z.key; }), seen = {};
  return recs.map(function (r) { var v = Object.assign({}, r.raw, r.fix || {}), msgs = [], E = function (c, p) { msgs.push({ t: 'err', c: c, p: p || {} }); }, W = function (c, p) { msgs.push({ t: 'warn', c: c, p: p || {} }); }, out = { i: r.i, v: v };
    if (type === 'products') { var fs = {}; ['code', 'name', 'contractName', 'classifier', 'maker', 'country', 'cat', 'form', 'dose', 'pack', 'unit', 'barcode', 'ikpu', 'farmId', 'note'].forEach(function (k) { fs[k] = String(v[k] == null ? '' : v[k]).trim(); }); Object.assign(out, fs);
      [['name', 'Mahsulot nomi'], ['classifier', 'Klassifikator nomi'], ['maker', 'Ishlab chiqaruvchi'], ['cat', 'Kategoriya'], ['ikpu', 'IKPU kodi'], ['farmId', 'Farm ID']].forEach(function (k) { if (!fs[k[0]]) E('pReq', { f: k[1] }); });
      var fk = Object.keys(FORMS).filter(function (k) { return bqNorm(FORMS[k]) === bqNorm(fs.form) || k === fs.form; })[0]; out.form = fk || ''; if (fs.form && !fk) W('pFormUnknown', { t: fs.form });
      var cd = fs.code.replace(/\D/g, ''), taken = cd && (prodByCode(cd) || seen['c' + cd]); if (cd && (!/^[1-9]\d{7}$/.test(cd) || taken)) { W('pCodeAuto', { c: cd }); cd = ''; } if (cd) seen['c' + cd] = r.i; out.code = cd; out.codeAuto = !cd;
      if (fs.barcode) { var be = eanCheck(fs.barcode), bp = PRODUCTS.filter(function (p) { return (p.barcodes || []).indexOf(fs.barcode) >= 0; })[0]; if (be) E('pBcBad'); else if (bp) E('pBcDup', { n: bp.name }); else if (seen['b' + fs.barcode]) E('pBcDupFile', { r: seen['b' + fs.barcode] }); else seen['b' + fs.barcode] = r.i; }
      var nd = fs.name && PRODUCTS.filter(function (p) { return bqNorm(p.name) === bqNorm(fs.name) && bqNorm(p.maker) === bqNorm(fs.maker); })[0]; if (nd) E('pNameDup', { n: nd.name });
    } else if (type === 'goods') {
      var m = r.pick ? { pid: r.pick, conf: 100, manual: true } : bqMatch(v.name); out.pid = m.pid; out.conf = m.conf; out.manual = !!m.manual; out.near = m.near || null;
      var p = m.pid ? prodById(m.pid) : null; if (!p) E('notFound'); else if (!m.manual && m.conf < 90) W('lowConf', { c: m.conf });
      var q = bqNum(v.qty); out.qty = q; if (q == null || isNaN(q) || q <= 0) E('qtyBad'); else if (q % 1 !== 0) E('qtyFrac');
      var e = bqDate(v.exp); out.exp = e || ''; if (e === '') E('expMissing'); else if (e === null) E('expBad');
      var c = bqNum(v.cost); out.cost = c == null || isNaN(c) ? 0 : c; if (c != null && isNaN(c)) E('costBad'); else if (!(c > 0)) W('cost0');
      var z = bqZone(v.zone); if (z === null) { E('zoneUnknown', { z: v.zone }); z = ''; }
      if (z === '') z = p && p.ctrl && zk.indexOf('seyf') >= 0 ? 'seyf' : 'asosiy';
      if (zk.indexOf(z) < 0) E('zoneNotInWh', { z: v.zone || z });
      var days = e ? Math.round((pD(e) - T0) / DAY) : null; out.days = days;
      if (p && p.ctrl && (!ctrlAllowed(br, wh) || z !== 'seyf')) E('ctrlWh');
      if (days != null && days < 0 && !msgs.some(function (x) { return x.t === 'err'; })) { W('expired', { d: -days }); if (zk.indexOf('karantin') >= 0) z = 'karantin'; }
      else if (days != null && days >= 0 && days <= CONFIG.expiryWarnDays) W('near', { d: days });
      out.zone = z; out.batch = String(v.batch || '').trim(); if (!out.batch) E('batchMissing');
      var key = out.pid + '|' + out.batch + '|' + z; if (out.pid && seen[key]) W('dup', { r: seen[key] }); else if (out.pid) seen[key] = r.i;
    } else if (type === 'mt' || type === 'yt') {
      var pt = r.pick != null ? r.pick : bqParty(type, br, v.party); out.party = pt; if (pt == null) E('partyNotFound');
      out.doc = String(v.doc || '').trim(); if (!out.doc) E('docMissing');
      var d1 = bqDate(v.date), d2 = bqDate(v.due); out.date = d1 || ''; out.due = d2 || ''; if (!d1) E(d1 === '' ? 'dateMissing' : 'dateBad'); if (!d2) E(d2 === '' ? 'dueMissing' : 'dueBad');
      var sm = bqNum(v.sum), pd = bqNum(v.paid), lf = bqNum(v.left); out.sum = sm; out.paid = pd == null || isNaN(pd) ? 0 : pd; out.left = lf == null || isNaN(lf) ? (sm || 0) - out.paid : lf;
      if (sm == null || isNaN(sm)) E('sumBad'); if (lf != null && isNaN(lf)) E('sumBad');
      var cf = bqNorm(v.ctrl); out.ctrl = /^(da|ha|yes|1|true|\+)$/.test(cf); if (out.ctrl && pt != null && type === 'mt') { var cc = custById(pt); if (!licValid(cc)) E('ctrlNoLic'); }
      if (out.left < 0) W('adv'); else if (out.left === 0) W('zeroLeft'); else if (d2 && pD(d2) < T0) W('overdue', { d: Math.round((T0 - pD(d2)) / DAY) });
    } else if (type === 'prices') {
      var cd3 = String(v.code || '').replace(/\s/g, ''), pc3 = cd3 ? (prodByCode(cd3) || PRODUCTS.filter(function (p) { return (p.barcodes || []).indexOf(cd3) >= 0; })[0]) : null; if (!String(v.name || '').trim() && !cd3) E('notFound');
      var m3 = r.pick ? { pid: r.pick, conf: 100, manual: true } : pc3 ? { pid: pc3.id, conf: 100 } : bqMatch(v.name || ''); out.batch = String(v.batch || '').trim() || null; if (!v.name && pc3) v.name = pc3.name; out.pid = m3.pid; out.conf = m3.conf; out.manual = !!m3.manual; out.near = m3.near || null; if (!m3.pid) E('notFound'); else if (!m3.manual && m3.conf < 90) W('lowConf', { c: m3.conf });
      var tq3 = bqNorm(v.ptype), TP = { optovaya: 'base', ulgurji: 'base', melkiyopt: 'base', kichikulgurji: 'base', tender: 'base', narx: 'base', bazaviy: 'base' }; (store.ptypes || []).forEach(function (pt) { TP[bqNorm(pt.name)] = pt.code; }); out.ptype = tq3 ? TP[tq3] || null : (out.ptype0 || 'base'); if (!out.ptype) E('ptypeBad', { t: v.ptype });
      var pr3 = bqNum(v.price); out.price = pr3; if (pr3 == null || isNaN(pr3) || pr3 <= 0) E('priceBad');
      if (out.pid && out.ptype && pr3 > 0) { var cur3 = priceAt(out.pid, out.ptype, br), lc3 = costBasis(out.pid, br); out.cur = cur3 ? cur3.price : null; if (lc3 && pr3 < lc3.costV) W('belowCost', { c: lc3.costV, b: lc3.batch || '' }); if (cur3 && Math.abs(pr3 - cur3.price) / cur3.price > CONFIG.priceWarnPct / 100) W('bigChange', { x: Math.round((pr3 - cur3.price) / cur3.price * 1000) / 10 }); if (!cur3) W('newPrice'); }
      var key3 = out.pid + '|' + out.ptype; if (out.pid && seen[key3]) W('dup', { r: seen[key3] }); else if (out.pid) seen[key3] = r.i;
    } else if (type === 'cust' || type === 'sup') {
      var sd = stirD(v.stir); out.stir = sd; out.name = String(v.cname || '').trim(); out.region = String(v.region || '').trim(); out.address = String(v.address || '').trim(); out.phone = String(v.phone || '').trim();
      if (!sd) E('stirMissing'); else if (sd.length !== 9) E('stirBad', { n: sd.length }); if (!out.name) E('nameMissing');
      var tq = bqNorm(v.ctype), TM = { apteka: 'pharmacy', dorixona: 'pharmacy', klinika: 'clinic', klinik: 'clinic', bolnica: 'hospital', bolnitsa: 'hospital', shifoxona: 'hospital', distribyutor: 'distributor', distributor: 'distributor' }; out.ctype = tq ? (TM[tq] || null) : null; if (tq && !out.ctype) { W('typeUnknown', { t: v.ctype }); out.ctype = 'pharmacy'; }
      var lm = bqNum(v.limit), dy = bqNum(v.days), ds2 = bqNum(v.disc), ld = bqNum(v.lead); out.limit = lm == null || isNaN(lm) ? 0 : lm; out.days = dy == null || isNaN(dy) ? 0 : Math.round(dy); out.disc = ds2 == null || isNaN(ds2) ? 0 : ds2; out.lead = ld == null || isNaN(ld) ? 0 : Math.round(ld); if (lm != null && isNaN(lm)) E('limitBad');
      if (sd.length === 9) { var ex = ktByStir(sd); out.exist = ex ? ex.key : null; out.existName = ex ? ex.name : '';
        if (ex) { var TT = type === 'cust' ? ex.cTerms : ex.sTerms, bnm = (BRANCHES.filter(function (b) { return b.code === br; })[0] || {}).name || br; if (TT[br]) W('termsExist', { n: ex.name, b: bnm }); else W('stirExists', { n: ex.name, b: bnm }); }
        if (seen[sd]) E('stirDupFile', { r: seen[sd] }); else seen[sd] = r.i; }
    } else {
      var ac = r.pick || bqAcct(br, v.acct); out.acct = ac; if (!ac) E('acctNotFound');
      var s2 = bqNum(v.sum); out.sum = s2; if (s2 == null || isNaN(s2)) E('sumBad'); else if (s2 < 0 && ac && (accById(ac) || {}).kind === 'cash') E('cashNeg');
      if (ac && recs.filter(function (y) { return y !== r && (y.pick || bqAcct(br, Object.assign({}, y.raw, y.fix || {}).acct)) === ac; }).length && seen[ac]) W('dup', { r: seen[ac] }); if (ac && !seen[ac]) seen[ac] = r.i;
    }
    out.msgs = msgs; out.st = msgs.some(function (x) { return x.t === 'err'; }) ? 'err' : msgs.length ? 'warn' : 'ok'; return out; }); }
function bqLinesFrom(type, rows) { return rows.filter(function (r) { return r.st !== 'err'; }).map(function (r, k) {
  if (type === 'products') return { row: r.i, code: r.code, codeAuto: r.codeAuto, name: r.name, contractName: r.contractName, classifier: r.classifier, maker: r.maker, country: r.country, cat: r.cat, form: r.form, dose: r.dose, pack: r.pack, perPack: r.pack, unit: r.unit || 'dona', barcodes: r.barcode ? [r.barcode] : [], ikpu: r.ikpu, farmId: r.farmId, note: r.note };
  if (type === 'goods') return { id: 'i' + k, pid: r.pid, batch: r.batch, exp: r.exp, zone: r.zone, qty: r.qty, cost: r.cost, row: r.i, warn: r.msgs.map(function (m) { return m.c; }) };
  if (type === 'cash') return { id: 'i' + k, acct: r.acct, sum: r.sum, row: r.i };
  if (type === 'prices') return { id: 'i' + k, pid: r.pid, type: r.ptype, batch: r.batch || null, price: r.price, cur: r.cur, row: r.i };
  if (type === 'cust' || type === 'sup') return { id: 'i' + k, stir: r.stir, name: r.name, ctype: r.ctype, region: r.region, address: r.address, phone: r.phone, limit: r.limit, days: r.days, disc: r.disc, lead: r.lead, exist: r.exist, row: r.i };
  return { id: 'i' + k, party: r.party, extNo: r.doc, date: r.date, due: r.due, sum: r.sum, paid: r.paid, left: r2(r.left), row: r.i }; }); }

// ---- 20: Kontragentlar — markazda bitta karta (STIR), shartlar/limit/qarz filial bo'yicha ----
var KT_TYPES = ['pharmacy', 'clinic', 'hospital', 'distributor', 'maker'], KT_PRICE = null; var PT_CUST0 = { 3: 'dist', 5: 'dist', 17: 'health' };
var KT_R = permView({ createC: 'clients.create', createS: 'suppliers.create', contactC: 'clients.contact', contactS: 'suppliers.contact', termsC: 'clients.terms', termsS: 'suppliers.terms', bank: 'clients.bank', blockC: 'clients.block', blockS: 'suppliers.block', lic: 'clients.lic', all: 'clients.all' }, 'KT_R');
var CUST_N0 = CUSTOMERS.length, SUP_N0 = SUPPLIERS.length;
function stirD(s) { return String(s || '').replace(/\D/g, ''); }
function stirF(s) { var d = stirD(s); return d.length === 9 ? d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6) : d; }
function accF(s) { return stirD(s).replace(/(\d{4})(?=\d)/g, '$1 '); }
var KT_CT = [0, 'pharmacy', 'pharmacy', 'clinic', 'pharmacy', 'pharmacy', 'pharmacy', 'pharmacy', 'pharmacy', 'hospital', 'distributor', 'clinic', 'pharmacy', 'pharmacy', 'clinic', 'pharmacy', 'pharmacy', 'clinic', 'clinic', 'pharmacy', 'hospital'];
// 24: faqat kontragent kontaktlari — o'z xodimlarimiz EMPLOYEES da
var KT_PEOPLE = ['Dilfuza Rashidova', 'Bahodir Toshev', 'Nodira Qodirova', 'Sherzod Aliqulov', 'Malika Ergasheva', 'Javlon Mirzayev', 'Gulchehra Sattorova', 'Otabek Normatov', 'Zarina Yoqubova', 'Rustam Hamidov', 'Feruza Abdullayeva', 'Anvar Sobirov'];
var KT_POS = ['Direktor', 'Bosh farmatsevt', 'Xarid menejeri', 'Bosh hisobchi', 'Ombor mudiri'];
var KT_BANKS = [['Kapitalbank', '01158'], ['Asaka bank', '00873'], ['Ipoteka-bank', '00423'], ['Hamkorbank', '00083'], ['Aloqabank', '00401'], ["O'zmilliybank", '00450']];
var KT_OPS = empByBranch('operator');
var KT_BUY = empByBranch(['purchase', 'operator']);
function ktSlug(n) { return String(n).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14) || 'info'; }
function ktKey(kind, ref) { var c = (store.kts || []).filter(function (k) { return kind === 'mt' ? k.cust === ref : k.sup === ref; })[0]; return c ? c.key : null; }
function ktByKey(k) { return (store.kts || []).filter(function (x) { return x.key === k; })[0] || null; }
function ktByStir(s) { var d = stirD(s); return d ? (store.kts || []).filter(function (x) { return x.stir === d; })[0] || null : null; }
function ktOf(kind, ref) { var k = ktKey(kind, ref); return k ? ktByKey(k) : null; }
function ktLic(card, kind) { var ls = (card.lic || []).filter(function (l) { return l.kind === kind; }).sort(function (a, b) { return pD(b.until) - pD(a.until); }); return ls[0] || null; }
function ktLicState(l) { if (!l) return { st: 'none', days: null }; var d = Math.round((pD(l.until) - T0) / DAY); return { st: d < 0 ? 'expired' : d <= 30 ? 'soon' : 'ok', days: d }; }
function ktCopy(x) { return JSON.parse(JSON.stringify(x)); }
function seedKt() {
  var out = [], ev = function (at, who, kind, ch) { return { at: at, who: who, kind: kind, changes: ch || [] }; };
  CUSTOMERS.slice(0, CUST_N0).forEach(function (c, i) {
    var t = KT_CT[c.id] || 'pharmacy', d = stirD(c.stir), bk = KT_BANKS[c.id % KT_BANKS.length], p1 = KT_PEOPLE[c.id % 12], p2 = KT_PEOPLE[(c.id * 5 + 3) % 12];
    var pharmUntil = { 13: '20.10.2026', 15: '28.10.2026', 19: '30.09.2026' }[c.id] || fD(Date.UTC(2027 + (c.id % 2), (c.id * 3) % 12, 10 + (c.id % 15)));
    var lic = [{ id: 'l1', kind: 'pharm', no: 'FA-' + String(1000 + c.id * 37).slice(-4) + '-' + (2021 + c.id % 4), issued: fD(Date.UTC(2021 + c.id % 4, (c.id * 2) % 12, 5 + c.id % 20)), until: pharmUntil, file: 'litsenziya_FA_' + d.slice(-4) + '.pdf' }];
    if (c.license) lic.push({ id: 'l2', kind: 'ctrl', no: c.license.no, issued: fD(pD(c.license.until) - 3 * 365 * DAY), until: c.license.until, file: 'nazorat_' + c.license.no + '.pdf' });
    var b0 = custBrs(c)[0], cT = {}; cT[b0] = { active: true, limit: c.limit, days: c.terms, disc: c.disc, price: PT_CUST0[c.id] || 'base', minMonths: c.minDays ? Math.round(c.minDays / 30) : 0, operator: KT_OPS[b0], addr: c.address };
    if (c.id === 2) cT.SMQ = Object.assign({}, cT[b0], { limit: 20000000, days: 15 });
    if (c.id === 7 || c.id === 12) cT.TSH = Object.assign({}, cT[b0], { operator: KT_OPS.TSH }); // Toshkentda tasdiqlangan buyurtmalari bor (BY-TSH-000318/319) — sharti seed'ga
    if (c.id === 10) cT.SMQ = { active: true, limit: 30000000, days: 30, disc: 2, price: 'base', minMonths: 0, operator: KT_OPS.SMQ, addr: "Samarqand sh., Mirzo Ulug'bek ko'chasi, 72 (Akfa Medline ombori)" };
    var hist = [ev('01.10.2026 09:24', DIRECTOR, 'create', [{ label: 'src', to: 'SMARTUP' }])];
    if (c.id % 3 === 2) hist.push(ev('02.10.2026 11:' + (10 + c.id), KT_OPS[b0] === 'Malika Yusupova' ? 'Sardor Aliyev' : 'Akmal Karimov', 'edit', [{ label: 'limit', br: b0, from: c.limit - 10000000, to: c.limit }]));
    if (c.id === 2) hist.push(ev('03.10.2026 15:40', 'Sardor Aliyev', 'edit', [{ label: 'disc', br: 'TSH', from: 4, to: 5 }]));
    if (c.blocked) hist.push(ev('02.10.2026 17:05', 'Nilufar Tosheva', 'block', [{ label: 'status', from: 'active', to: 'blocked' }, { label: 'reason', to: c.blocked }]));
    out.push({ key: 'c' + c.id, stir: d, name: c.name, legal: t === 'hospital' ? c.name + ' DM' : '«' + c.name + '» MChJ', type: t, region: c.region, address: c.address, phone: c.phone, email: ktSlug(c.name) + '@mail.uz',
      contacts: [{ name: p1, pos: KT_POS[c.id % 5], phone: '+998 9' + (c.id % 10) + ' ' + String(100 + c.id * 13).slice(-3) + ' ' + String(10 + c.id * 7).slice(-2) + ' ' + String(20 + c.id * 3).slice(-2) }].concat(c.id % 2 ? [] : [{ name: p2, pos: KT_POS[(c.id + 2) % 5], phone: '+998 9' + ((c.id + 3) % 10) + ' ' + String(300 + c.id * 11).slice(-3) + ' ' + String(40 + c.id).slice(-2) + ' ' + String(60 + c.id * 2).slice(-2) }]),
      bank: { bank: bk[0], mfo: bk[1], acc: '2020800' + ('0' + (c.id % 10)) + d + '0' + (c.id % 10) }, lic: lic, cust: c.id, sup: c.id === 10 ? 'Akfa Medline' : null, cTerms: cT, sTerms: c.id === 10 ? { TSH: { active: true, days: 30, buyer: KT_BUY.TSH, lead: 5 } } : {},
      status: c.blocked ? 'blocked' : 'active', reason: c.blocked || '', statusAt: c.blocked ? '02.10.2026 17:05' : '', statusBy: c.blocked ? 'Nilufar Tosheva' : '', hist: hist }); });
  SUPPLIERS.filter(function (x) { return !x.both; }).slice(0, SUP_N0).forEach(function (sp, i) {
    var d = stirD(sp.stir), bk = KT_BANKS[(i + 2) % KT_BANKS.length], brs = {}; store.receipts.forEach(function (r) { if (r.supplier === sp.name) brs[r.branch] = 1; }); brs.TSH = 1;
    var sT = {}; Object.keys(brs).forEach(function (b) { sT[b] = { active: true, days: sp.terms, buyer: KT_BUY[b], lead: 3 + (i + b.length) % 5 }; });
    var lic = [{ id: 'l1', kind: 'pharm', no: 'FI-' + String(2000 + i * 53) + '-' + (2020 + i % 4), issued: fD(Date.UTC(2020 + i % 4, i * 2, 12)), until: fD(Date.UTC(2027 + i % 3, (i * 5) % 12, 20)), file: 'litsenziya_FI_' + d.slice(-4) + '.pdf' }];
    if (/Nobel|KRKA/.test(sp.name)) lic.push({ id: 'l2', kind: 'ctrl', no: 'NZ-' + String(410 + i) + '-2024', issued: '15.02.2024', until: '15.02.2029', file: 'nazorat_NZ_' + (410 + i) + '.pdf' });
    out.push({ key: 's' + (i + 1), stir: d, name: sp.name, mainPay: SUP_PAY0[sp.name] || 'bank', legal: '«' + sp.name + '» ' + (i === 4 ? 'vakolatxonasi' : 'MChJ'), type: i === 5 ? 'distributor' : 'maker', region: i === 4 ? 'Toshkent' : ['Toshkent', 'Toshkent', 'Toshkent viloyati', 'Toshkent', '', 'Toshkent'][i], address: ["Yashnobod tumani, Mahtumquli ko'chasi, 120", "Olmazor tumani, Qorasaroy ko'chasi, 4", "Zangiota tumani, Eshonguzar, Sanoat zonasi 3", "Mirobod tumani, Afrosiyob ko'chasi, 12", "Yunusobod tumani, Amir Temur ko'chasi, 107B", "Chilonzor tumani, Muqimiy ko'chasi, 59"][i], phone: '+998 71 2' + String(30 + i * 7) + ' ' + String(10 + i * 11) + ' ' + String(40 + i * 9), email: ktSlug(sp.name) + '@pharm.uz',
      contacts: [{ name: KT_PEOPLE[(i + 6) % 12], pos: 'Savdo menejeri', phone: '+998 90 ' + String(110 + i * 41) + ' ' + String(20 + i * 6) + ' ' + String(30 + i * 5) }], bank: sp.bank0 ? { bank: sp.bank0[0], mfo: bankMfo(sp.bank0[0]) || bk[1], acc: sp.bank0[1] } : { bank: bk[0], mfo: bk[1], acc: '2020800' + i + '0' + d + '01' }, docPre: sp.pre || '', lic: lic, cust: null, sup: sp.name, cTerms: {}, sTerms: sT,
      status: 'active', reason: '', statusAt: '', statusBy: '', hist: [ev('01.10.2026 09:24', DIRECTOR, 'create', [{ label: 'src', to: 'SMARTUP' }])] }); });
  store.kts = out; ktApply(); }
// CUSTOMERS/SUPPLIERS — store.kts dan hosil bo'ladigan ko'rinish (har ktSave/restoreBase da qayta quriladi; boshqa manba yo'q). Qarz — faqat debtOf
function ktApply() { if (!store.kts) return; var cs = [], ss = [], dual = [];
  store.kts.forEach(function (k) {
    var pl = ktLic(k, 'pharm'), ps = ktLicState(pl), cl = ktLic(k, 'ctrl'), bk = k.bank || {}, st = k.status || 'active';
    if (k.cust != null) { var T = k.cTerms || {}, hb = T[k.home] ? k.home : Object.keys(T)[0], t0 = T[hb] || {};
      var c = { id: k.cust, key: k.key, name: k.name, legal: k.legal, region: k.region, address: k.address, phone: k.phone, stir: stirF(k.stir), bt: ktCopy(T), limit: t0.limit || 0, terms: t0.days || 0, disc: t0.disc || 0, minDays: t0.minMonths ? t0.minMonths * 30 : null,
        license: cl ? { no: cl.no, until: cl.until } : null, blocked: st === 'blocked' ? (k.reason || 'Bloklangan') : null, inactive: st === 'inactive', licBlock: ps.st === 'expired' || ps.st === 'none' ? (ps.st === 'none' ? 'nolic' : pl.until) : null, bank: bk.bank || '', mfo: bk.mfo || '', acc: bk.acc || '', both: !!k.sup };
      debtProps('mt', c); cs.push(c); }
    if (k.sup) { var S = k.sTerms || {}, s0 = S.TSH || S[Object.keys(S)[0]] || {};
      var x = { name: k.sup, key: k.key, mainPay: k.mainPay || 'bank', legal: k.legal, stir: stirF(k.stir), terms: s0.days || 0, bt: ktCopy(S), blocked: st === 'blocked' ? (k.reason || 'Bloklangan') : null, inactive: st === 'inactive', bank: bk.bank || '', mfo: bk.mfo || '', acc: bk.acc || '', docPre: k.docPre || '', both: k.cust != null };
      debtProps('yt', x); (k.cust != null ? dual : ss).push(x); } });
  CUSTOMERS.length = 0; cs.sort(function (a, b) { return a.id - b.id; }).forEach(function (c) { CUSTOMERS.push(c); });
  SUPPLIERS.length = 0; ss.concat(dual).forEach(function (x) { SUPPLIERS.push(x); }); }
// Yetkazib beruvchi tanlovi: shu filialda sharti faol, bloklanmagan, faol
function supsIn(br) { return SUPPLIERS.filter(function (x) { var t = x.bt && x.bt[br]; return !!t && t.active !== false && !x.blocked && !x.inactive; }); }
function supPick(br, cur) { var L = supsIn(br).map(function (x) { return { value: x.name, label: x.name, search: x.name + ' ' + x.stir }; }); if (cur && !L.some(function (o) { return o.value === cur; })) { var k = supOk(cur, br); L.unshift({ value: cur, label: cur + ' · ' + ({ blocked: 'bloklangan', inactive: 'nofaol', noTerms: 'bu filialda sharti yo\u02BBq', none: 'topilmadi' }[k.k] || ''), search: cur, muted: true }); } return L; }
function supOk(name, br) { var x = supByName(name); if (!x) return { ok: false, k: 'none' }; if (x.blocked) return { ok: false, k: 'blocked', text: x.blocked }; if (x.inactive) return { ok: false, k: 'inactive' }; if (br && !(x.bt && x.bt[br] && x.bt[br].active !== false)) return { ok: false, k: 'noTerms' }; return { ok: true }; }
function ktSave(card, who, kind, changes) { var c = ktCopy(card), at = nowStr(); if (kind) c.hist = (c.hist || []).concat([{ at: at, who: who, kind: kind, changes: changes || [] }]); var a = (store.kts || []).slice(), i = a.map(function (x) { return x.key; }).indexOf(c.key); if (i >= 0) a[i] = c; else a.push(c); store.kts = a; ktApply(); store.v++; return ktCopy(c); }
function ktNewCust(br) { var m = 0; CUSTOMERS.forEach(function (c) { m = Math.max(m, c.id); }); (store.kts || []).forEach(function (k) { if (k.cust != null) m = Math.max(m, k.cust); }); return m + 1; }
function ktCreate(o, who) { var at = nowStr(), d = stirD(o.stir), ex = ktByStir(d); if (ex) return { err: 'dup', card: ex };
  var c = { key: '', stir: d, name: o.name, legal: o.legal || '«' + o.name + '» MChJ', type: o.type || 'pharmacy', mainPay: o.mainPay || (o.kind === 'mt' ? undefined : 'bank'), region: o.region || '', address: o.address || '', phone: o.phone || '', email: o.email || '', contacts: o.contacts || [], bank: o.bank || { bank: '', mfo: '', acc: '' }, lic: o.lic || [], cust: null, sup: null, cTerms: {}, sTerms: {}, status: 'active', reason: '', statusAt: '', statusBy: '', isNew: true, home: o.branch, hist: [{ at: at, who: who, kind: 'create', changes: [{ label: 'src', to: o.src || 'form' }] }] };
  if (o.kind === 'mt') { c.cust = ktNewCust(); c.key = 'c' + c.cust; c.cTerms[o.branch] = Object.assign({ active: true, limit: 0, days: 0, disc: 0, price: 'base', minMonths: 0, operator: KT_OPS[o.branch] || '', addr: o.address || '' }, o.terms || {}); }
  else { c.sup = o.name; c.key = 's' + ((store.kts || []).filter(function (k) { return /^s\d+$/.test(k.key); }).length + 1); c.sTerms[o.branch] = Object.assign({ active: true, days: 0, buyer: KT_BUY[o.branch] || '', lead: 0 }, o.terms || {}); }
  return { card: ktSave(c, null) }; }
// T7b: YB ro'yxati uchun — keyingi to'lov kuni, bonus balans, universal qidiruv
function ktSupInfo(card, br) { var sup = card.sup, B = br && br !== 'ALL' ? br : null, nx = null; supInvoices(B || 'ALL').forEach(function (x) { if (x.party !== sup || !(x.left > 0) || x.prepaid || x.days == null) return; if (!nx || x.days < nx.days) nx = { date: x.due, days: x.days, sum: x.left, no: x.no }; else if (x.days === nx.days) nx.sum = r2(nx.sum + x.left); });
  var bb = 0; BRANCHES.forEach(function (b) { if (!B || b.code === B) bb = r2(bb + bonusOf(sup, b.code).balance); }); var cr = (card.hist || []).filter(function (h) { return h.kind === 'create'; })[0];
  return { next: nx, bucket: nx ? (nx.days < 0 ? 'late' : nx.days === 0 ? 'today' : nx.days <= 3 ? '3d' : 'later') : null, bonus: bb, created: cr ? String(cr.at).slice(0, 10) : '' }; }
// T8: mijoz ro'yxati uchun — muddati o'tgan taqsimoti, operator, narx turi, oxirgi sotuv/to'lov
function ktCustInfo(card, br) { var B = br && br !== 'ALL' ? br : null, T = card.cTerms || {}, brs = Object.keys(T).filter(function (b) { return !B || b === B; }), q = debtOf('mt', card.cust, B || 'ALL'), od = 0, maxLate = 0, lastSale = null, lastPay = null;
  brs.forEach(function (b) { ledger('mt', card.cust, b).invoices.forEach(function (x) { if (x.left > 0 && x.late > 0) { od = r2(od + x.left); maxLate = Math.max(maxLate, x.late); } }); var L = ledger('mt', card.cust, b); if (L.last && (!lastPay || pD(L.last.date) > pD(lastPay.date))) lastPay = L.last; });
  (store.sales || []).forEach(function (s) { if (s.cust === card.cust && (!B || s.branch === B) && (!lastSale || pD(s.at.slice(0, 10)) > pD(lastSale.date))) lastSale = { no: s.no, date: s.at.slice(0, 10), sum: s.sum }; });
  var b0 = brs[0], t0 = b0 ? T[b0] : {}, cr = (card.hist || []).filter(function (h) { return h.kind === 'create'; })[0], lim = brs.reduce(function (s, b) { return s + (T[b].limit || 0); }, 0);
  if (q.overdue > od) { od = r2(q.overdue); maxLate = Math.max(maxLate, q.overdueDays || 0); } // T8 #3: boshlang'ich qoldiq (sotuvsiz) qarzi ham ko'rinadi — debtOf bilan bir xil
  var bucket = maxLate <= 0 ? null : maxLate <= 30 ? '1-30' : maxLate <= 60 ? '31-60' : maxLate <= 90 ? '61-90' : '90plus';
  return { aging: q.aging, debt: q.debt, overdue: od, maxLate: maxLate, bucket: bucket, operators: brs.map(function (b) { return T[b].operator; }).filter(Boolean), priceTypes: brs.map(function (b) { return T[b].price || 'base'; }), price: t0.price || 'base', operator: t0.operator || '', limit: lim, over: lim > 0 && q.debt > lim, lastSale: lastSale, lastPay: lastPay, advance: q.advance, created: cr ? String(cr.at).slice(0, 10) : '' }; }
function ktNorm(s) { return toLatK(String(s || '').toLowerCase()); }
function toLatK(s) { var M = { 'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'j', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'x', 'ц': 's', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh', 'ъ': "'", 'ы': 'i', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya', 'ў': "o'", 'қ': 'q', 'ғ': "g'", 'ҳ': 'h' }; return s.replace(/[ʻʼ‘’`]/g, "'").split('').map(function (c) { return M[c] != null ? M[c] : c; }).join(''); }
// Qidiruv: { where: 'name'|'legal'|..., label, value } yoki null; raqamlarda bo'sh joy/chiziqcha e'tiborsiz
function ktSearch(card, q) { var t = ktNorm(String(q || '').trim()); if (!t) return { where: 'all' }; var dq = String(q).replace(/\D/g, ''), dig = dq.length >= 3 && /^[\d\s+\-()]+$/.test(String(q).trim());
  var F = [['name', 'Nom', card.name], ['legal', 'Yuridik nom', card.legal], ['stir', 'STIR', card.stir], ['phone', 'Telefon', card.phone], ['email', 'E-mail', card.email], ['address', 'Manzil', [card.region, card.address].filter(Boolean).join(', ')]];
  (card.contacts || []).forEach(function (c) { F.push(['contact', 'Kontakt', c.name]); F.push(['cphone', 'Kontakt telefoni', c.phone + ' (' + c.name + ')', c.phone]); });
  if (card.bank) { F.push(['acc', 'Hisob raqami', card.bank.acc]); F.push(['mfo', 'MFO', card.bank.mfo]); }
  var T = card.sTerms || {}; Object.keys(T).forEach(function (b) { if (T[b].buyer) F.push(['buyer', "Ta'minot mas'uli", T[b].buyer]); });
  var CT = card.cTerms || {}; Object.keys(CT).forEach(function (b) { if (CT[b].operator) F.push(['operator', "Operator (mas'ul)", CT[b].operator]); });
  if (card.cust != null) { (store.orders || []).forEach(function (o) { if (o.cust === card.cust && o.no) F.push(['order', 'Buyurtma', o.no]); }); (store.sales || []).forEach(function (s) { if (s.cust === card.cust) { F.push(['sale', 'Sotuv', s.no]); if (s.inv) F.push(['sale', 'Hisob-faktura', s.inv]); } }); }
  if (card.sup) { store.receipts.forEach(function (r) { if (r.supplier === card.sup && r.no) F.push(['rc', 'Kirim', r.no]); }); (store.arOpen || []).forEach(function (x) { if (x.kind === 'yt' && x.party === card.sup) F.push(['rc', 'Kirim (arxiv)', x.no]); }); }
  for (var i = 0; i < F.length; i++) { var f = F[i], v = String(f[2] || ''), raw = String(f[3] || f[2] || ''); if (!v) continue;
    if (dig) { var dv = raw.replace(/\D/g, ''); if (dv && dv.indexOf(dq) >= 0) return { where: f[0], label: f[1], value: v }; continue; }
    if (ktNorm(v).indexOf(t) >= 0 || (dq.length >= 3 && raw.replace(/\D/g, '').indexOf(dq) >= 0 && /\d/.test(t) && t.replace(/[^a-z']/g, '').length === 0) || ktNorm(v).replace(/[\s\-]/g, '').indexOf(t.replace(/[\s\-]/g, '')) >= 0) return { where: f[0], label: f[1], value: v }; }
  return null; }
function ktCards(kind) { return (store.kts || []).filter(function (k) { return kind === 'mt' ? k.cust != null : !!k.sup; }); }
function ktTermsOf(card, kind) { return kind === 'mt' ? card.cTerms : card.sTerms; }
function ktDebt(card, kind, br) { var T = ktTermsOf(card, kind), ref = kind === 'mt' ? card.cust : card.sup; if (br && !T[br]) return { debt: 0, overdue: 0, limit: 0, advance: 0, status: 'ok' };
  var q = debtOf(kind, ref, br || 'ALL'), lim = kind === 'mt' ? (br ? (T[br].limit || 0) : Object.keys(T).reduce(function (s, b) { return s + (T[b].limit || 0); }, 0)) : 0;
  return { debt: q.debt, overdue: q.overdue, limit: lim, advance: q.advance, status: q.overdue > 0 ? 'overdue' : lim && q.debt > lim ? 'limit' : 'ok' }; }
function ktOrderBlock(c, br) { if (!c) return null; if (br && c.bt && !c.bt[br]) return { k: 'noTerms' }; if (c.blocked) return { k: 'blocked', text: c.blocked }; if (c.licBlock) return { k: 'lic', until: c.licBlock === 'nolic' ? '' : c.licBlock }; if (c.inactive) return { k: 'inactive' }; if (br && c.bt && c.bt[br] && c.bt[br].active === false) return { k: 'brOff' }; return null; }
function ktBlockImpact(card) { var r = { cont: 0, pend: 0, nos: [] }; if (card.cust == null) return r; (store.orders || []).forEach(function (o) { if (o.cust !== card.cust) return; if (RESERVING.indexOf(o.status) >= 0) { r.cont++; r.nos.push(o.no); } else if (o.status === 'pending') r.pend++; }); return r; }
function ktLast(card, kind) { var ref = kind === 'mt' ? card.cust : card.sup, lo = null, lp = null;
  if (kind === 'mt') (store.orders || []).forEach(function (o) { if (o.cust === ref && o.no && (!lo || pD(o.date) > pD(lo.date) || (o.date === lo.date && o.no > lo.no))) lo = { no: o.no, date: o.date, id: o.id }; });
  else store.receipts.forEach(function (r) { if (r.supplier === ref && r.status === 'posted' && (!lo || pD(r.date) > pD(lo.date))) lo = { no: r.no, date: r.date, id: r.id }; });
  (store.pays || []).forEach(function (p) { if (p.kind === kind && p.party === ref && p.status === 'posted' && (!lp || pD(p.date) > pD(lp.date))) lp = { no: p.no, date: p.date, sum: p.sum }; }); return { order: lo, pay: lp }; }
function ktDocs(card, kind) { var ref = kind === 'mt' ? card.cust : card.sup;
  if (kind === 'mt') return (store.orders || []).filter(function (o) { return o.cust === ref && o.no; }).map(function (o) { return { id: o.id, no: o.no, date: o.date, branch: o.branch, status: o.status, sum: orderTotals(o).total }; }).sort(function (a, b) { return pD(b.date) - pD(a.date) || (a.no < b.no ? 1 : -1); }).slice(0, 20);
  return store.receipts.filter(function (r) { return r.supplier === ref; }).map(function (r) { return { id: r.id, no: r.no, date: r.date, branch: r.branch, status: r.status, sum: rcGross(r) }; }).sort(function (a, b) { return pD(b.date) - pD(a.date); }).slice(0, 20); }
function ktSupProducts(name, from, to) { var m = {}, f = from ? pD(from) : null, t = to ? pD(to) : null; store.receipts.forEach(function (r) { if (r.supplier !== name || r.status !== 'posted') return; var d = pD(r.date); if ((f && d < f) || (t && d > t)) return; (r.lines || []).forEach(function (l) { var x = m[l.pid] || (m[l.pid] = { pid: l.pid, qty: 0, last: null, price: 0, n: 0 }); x.qty += l.qty || 0; x.n++; if (!x.last || d >= pD(x.last)) { x.last = r.date; x.price = l.price || l.cost || 0; } }); }); return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return pD(b.last) - pD(a.last); }); }
function ktSimilar(name, exceptKey) { var q = bqNorm(name); if (q.length < 3) return []; return (store.kts || []).filter(function (k) { return k.key !== exceptKey; }).map(function (k) { var n = bqNorm(k.name); return { card: k, c: Math.round(dice(q, n) * 100), inc: n && (n.indexOf(q) >= 0 || q.indexOf(n) >= 0) }; }).filter(function (x) { return x.c >= 70 || x.inc; }).sort(function (a, b) { return b.c - a.c; }).slice(0, 3); }
function ktImport(type, br, lines, who) { var r = { created: 0, terms: 0, skipped: 0 }; lines.forEach(function (l) { var ex = ktByStir(l.stir), kind = type === 'cust' ? 'mt' : 'yt';
    if (ex) { var c = ktCopy(ex), T = kind === 'mt' ? c.cTerms : c.sTerms; if (T[br]) { r.skipped++; return; }
      T[br] = kind === 'mt' ? { active: true, limit: l.limit || 0, days: l.days || 0, disc: l.disc || 0, price: 'base', minMonths: 0, operator: KT_OPS[br] || '', addr: l.address || c.address } : { active: true, days: l.days || 0, buyer: KT_BUY[br] || '', lead: l.lead || 0 };
      if (kind === 'yt' && !c.sup) c.sup = c.name; if (kind === 'mt' && c.cust == null) c.cust = ktNewCust();
      ktSave(c, who, 'terms', [{ label: 'termsAdd', br: br, to: 'import' }]); r.terms++; return; }
    var o = ktCreate({ kind: kind, branch: br, stir: l.stir, name: l.name, type: l.ctype || (kind === 'mt' ? 'pharmacy' : 'maker'), region: l.region, address: l.address, phone: l.phone, src: 'import', terms: kind === 'mt' ? { limit: l.limit || 0, days: l.days || 0, disc: l.disc || 0 } : { days: l.days || 0, lead: l.lead || 0 } }, who); if (o.card) r.created++; }); return r; }

// ---- 21: Narxlar (mahsulot × narx turi × filial, QQSsiz, kuchga kirish sanasi bilan) va kichik ma'lumotnomalar ----
// ---- 3-qadam: Narx turlari — yagona manba store.ptypes. NR_TYPES / KT_PRICE — faol turlar kodlari (jonli massiv) ----
var NR_TYPES = []; KT_PRICE = NR_TYPES;
var NR_NOPRICE = { 23: 1, 30: 1 };
var NR_R = permView({ create: 'prices.create', approve: 'prices.approve', below: 'prices.below', all: 'prices.all', cost: 'prices.cost' }, 'NR_R');
var PT0 = [['base', 'Narx', 'Bazaviy narx', 0, 1], ['promo', 'Promo', 'Promo narx', 0], ['aksiya', 'Aksiya', 'Aksiya narxi', 0], ['vozvrat', 'Vozvrat', 'Qaytarish narxi', 0], ['health', 'Health Line narxi', 'Health Line', 0], ['batch', 'Ulgurji partiya narxi', 'Partiya narxi', 1], ['tdisc', 'Tovar chegirmasi', 'Chegirma', 0], ['dist', 'Distribyutor narxi', 'Distribyutor', 0]];
function seedPtypes() { var at = '28.10.2025 10:00'; store.ptypes = PT0.map(function (t, i) { return { id: 'pt' + (i + 1), code: t[0], name: t[1], alt: t[2], cur: "so'm", kind: 'sale', batch: !!t[3], base: !!t[4], active: true, at: at, who: DIRECTOR, hist: [{ at: at, who: DIRECTOR, kind: 'create', changes: [] }] }; }); ptApply(); }
function ptApply() { NR_TYPES.length = 0; (store.ptypes || []).forEach(function (t) { if (t.active) NR_TYPES.push(t.code); }); }
function ptByCode(c) { return (store.ptypes || []).filter(function (t) { return t.code === c; })[0] || null; }
function ptBase() { return (store.ptypes || []).filter(function (t) { return t.base; })[0] || { code: 'base' }; }
function ptName(c) { var t = ptByCode(c); return t ? t.name : c || ''; }
function ptSave(t, who) { var a = (store.ptypes || []).slice(), at = nowStr(), old = t.id ? a.filter(function (x) { return x.id === t.id; })[0] : null, c = JSON.parse(JSON.stringify(t));
  if (!String(c.name || '').trim()) return { err: 'name' };
  if (a.some(function (x) { return x.id !== c.id && bqNorm(x.name) === bqNorm(c.name); })) return { err: 'dup' };
  if (old && old.batch !== c.batch && (store.prices || []).some(function (e) { return e.type === old.code; })) return { err: 'batchLocked' };
  if (old && old.base && c.active === false) return { err: 'baseOff' };
  if (old && c.active === false) { var n = ptCusts(old.code).length; if (n) return { err: 'inUse', n: n }; }
  if (!old) { c.id = 'pt' + (Date.now() % 1e7); c.code = 'pt' + (Date.now() % 1e7); c.at = at; c.who = who; c.hist = []; c.cur = c.cur || "so'm"; c.kind = 'sale'; }
  if (c.base) a.forEach(function (x) { if (x.id !== c.id) x.base = false; });
  var ch = old ? [['name', 'Nomi'], ['alt', 'Muqobil nomi'], ['batch', "Partiya bo'yicha"], ['base', 'Bazaviy'], ['active', 'Holat']].filter(function (k) { return String(old[k[0]]) !== String(c[k[0]]); }).map(function (k) { return { label: k[1], from: String(old[k[0]]), to: String(c[k[0]]) }; }) : [];
  c.hist = (c.hist || []).concat([{ at: at, who: who, kind: old ? 'edit' : 'create', changes: ch }]); c.last = at;
  var i = a.map(function (x) { return x.id; }).indexOf(c.id); if (i >= 0) a[i] = c; else a.push(c); store.ptypes = a; ptApply(); store.v++;
  auditAdd({ kind: old ? 'change' : 'create', act: old ? 'change' : 'create', who: who, obj: c.name, objType: 'ptype', page: 'prices', text: old ? "Narx turi o'zgartirildi" : 'Narx turi yaratildi', diff: ch.map(function (x) { return { f: x.label, from: x.from, to: x.to }; }) }); return { ok: true, t: c }; }
// Mijozlar (filial sharti) — shu turga biriktirilgan
function ptCusts(code, br) { var out = []; CUSTOMERS.forEach(function (c) { Object.keys(c.bt || {}).forEach(function (b) { if ((!br || b === br) && c.bt[b] && c.bt[b].price === code) out.push({ id: c.id, name: c.name, br: b }); }); }); return out; }
function ptAttach(code, ids, br, who) { var n = 0, at = nowStr(); (store.kts || []).forEach(function (k) { if (k.cust == null || !k.cTerms) return; Object.keys(k.cTerms).forEach(function (b) { if (b !== br) return; var t = k.cTerms[b], on = ids.indexOf(k.cust) >= 0;
    var nv = on ? code : t.price === code ? ptBase().code : t.price; if (nv === t.price) return; k.hist = (k.hist || []).concat([{ at: at, who: who, kind: 'edit', changes: [{ label: 'Narx turi', from: ptName(t.price), to: ptName(nv), br: b }] }]); t.price = nv; n++; }); });
  ktApply(); store.v++; return n; }
function r100(n) { return Math.round(n / 100) * 100; }
function r100up(n, step) { step = step || 100; return Math.ceil(n / step - 1e-9) * step; }
// Narx yozuvi: { pid, type, br, batch?, price (QQS bilan), eff, doc }
function priceAt(pid, type, br, date, batch) { var t = date ? pD(date) : T0, best = null; (store.prices || []).forEach(function (e) { if (e.pid !== pid || e.type !== type || e.br !== br || (e.batch || null) !== (batch || null)) return; var d = pD(e.eff); if (d <= t && (!best || d > pD(best.eff) || (d === pD(best.eff) && e.doc > best.doc))) best = e; }); return best; }
function priceNext(pid, type, br, date, batch) { var t = date ? pD(date) : T0, best = null; (store.prices || []).forEach(function (e) { if (e.pid !== pid || e.type !== type || e.br !== br || (e.batch || null) !== (batch || null)) return; var d = pD(e.eff); if (d > t && (!best || d < pD(best.eff))) best = e; }); return best; }
function priceHist(pid, type, br, batch) { return (store.prices || []).filter(function (e) { return e.pid === pid && e.type === type && e.br === br && (batch === undefined || (e.batch || null) === (batch || null)); }).sort(function (a, b) { return pD(a.eff) - pD(b.eff) || (a.doc < b.doc ? -1 : 1); }); }
function basePrice(pid, br, date) { var e = priceAt(pid, ptBase().code, br || 'TSH', date); return e ? e.price : null; }
// Y2: partiya narxi ustun. Qator qismi (partiya) narxi: 1) shu partiyaning narxi — mijoz turida, bo'lmasa bazaviy turda; 2) mijoz turining umumiy narxi; 3) bazaviy umumiy narx.
// Qator FEFO bo'yicha bir nechta partiyaga tushsa — har qism o'z narxida, qator narxi — o'rtacha tortilgan.
function prCtx(o) { var c = custAt(o.cust, o.branch), base = ptBase().code, t = (c && c.priceType) || base, pt = ptByCode(t); return { c: c, br: o.branch || 'TSH', wh: o.wh || 'Asosiy ombor', date: o.date || fD(T0), base: base, t: t, tt: pt && pt.active !== false ? t : base, pt: pt, md: (c && c.minDays) || 0 }; }
function batchPriceAt(pid, X, batch) { if (!batch) return null; var e = priceAt(pid, X.tt, X.br, X.date, batch); if (e) return { price: e.price, type: X.tt, doc: e.doc, src: 'batch' }; if (X.tt !== X.base) { e = priceAt(pid, X.base, X.br, X.date, batch); if (e) return { price: e.price, type: X.base, doc: e.doc, src: 'batch' }; } return null; }
function genPriceAt(pid, X) { if (X.pt && X.pt.active !== false && X.t !== X.base && !X.pt.batch) { var e = priceAt(pid, X.t, X.br, X.date); if (e) return { price: e.price, type: X.t, doc: e.doc, src: 'type' }; } var b0 = priceAt(pid, X.base, X.br, X.date); return b0 ? { price: b0.price, type: X.base, doc: b0.doc, src: 'base', fallback: X.t !== X.base ? X.t : null } : null; }
function ownRes(b, no) { var q = 0; if (no) (b.resDocs || []).forEach(function (r) { if (r.no === no) q += r.qty; }); return q; }
// FEFO rejasi: buyurtmaning o'z bandi qaytarib qo'shiladi; qoldiq yetmasa — partiyasiz qism (umumiy narx)
function planFor(o, pid, qty, X) { X = X || prCtx(o); var left = qty, out = [];
  batches().filter(function (b) { return b.pid === pid && b.branch === X.br && b.wh === X.wh && b.status === 'open' && b.days != null && b.days >= X.md && (b.avail + ownRes(b, o.no)) > 0; }).sort(function (a, b) { return pD(a.exp) - pD(b.exp); })
    .forEach(function (b) { if (left <= 0) return; var q = Math.min(left, b.avail + ownRes(b, o.no)); out.push({ batch: b.batch, exp: b.exp, qty: q, bonus: !!b.bonus }); left -= q; });
  if (left > 0) out.push({ batch: null, exp: '', qty: left }); return out; }
function splitSum(split, q) { var s = 0; split.forEach(function (x) { s += x.qty * x.price; }); return q ? s / q : 0; }
function priceInfo(o, pid, qty) { var X = prCtx(o);
  if (qty == null) { var ln = (o.lines || []).filter(function (l) { return l.pid === pid; })[0]; qty = ln ? ln.qty : 0; }
  var q = qty > 0 ? qty : 1, g = genPriceAt(pid, X), split = [], miss = false, usedG = false, first = null;
  planFor(o, pid, q, X).forEach(function (s) { var r = batchPriceAt(pid, X, s.batch); if (!r) { r = g; usedG = true; } if (!r) { miss = true; return; } var seg = { batch: s.batch, exp: s.exp, qty: s.qty, price: r.price, src: r.src, type: r.type, doc: r.doc }; split.push(seg); if (!first) first = seg; });
  if (miss || !first) return null;
  var bp = split.filter(function (x) { return x.src === 'batch'; }), prices = {}; split.forEach(function (x) { prices[x.price] = 1; });
  return { price: splitSum(split, q), type: first.type, batch: bp.length ? bp[0].batch : null, doc: first.doc, fallback: usedG && g ? g.fallback || null : null, split: split, batchPriced: bp.length > 0, mixed: Object.keys(prices).length > 1 }; }
function priceFor(o, pid, qty) { var x = priceInfo(o, pid, qty); return x ? x.price : null; }
// Qoralama: kiritilgan paytdagi narxlar surati — umumiy narx ('*') va filial omboridagi shu mahsulotning partiya narxlari
function priceSnap(o, pid) { var X = prCtx(o), g = genPriceAt(pid, X), pb = {}; if (g) pb['*'] = g.price; batches().forEach(function (b) { if (b.pid !== pid || b.branch !== X.br || b.wh !== X.wh || pb[b.batch] != null) return; var r = batchPriceAt(pid, X, b.batch); if (r) pb[b.batch] = r.price; }); return pb; }
function priceStamp(o, l, force) { if (!l.pid || l.fz || (!force && l.p0 != null && l.pb)) return l; if (!force && l.p0 != null && !l.pb) return l; var x = priceFor(o, l.pid, l.qty); if (x == null) return l; l.pb = priceSnap(o, l.pid); l.p0 = x; return l; }
function snapSplit(o, l) { if (!l.pb) return null; var q = l.qty > 0 ? l.qty : 1, out = [], bad = false; planFor(o, l.pid, q).forEach(function (s) { var p = s.batch && l.pb[s.batch] != null ? l.pb[s.batch] : l.pb['*']; if (p == null) { bad = true; return; } out.push({ batch: s.batch, exp: s.exp, qty: s.qty, price: p, src: s.batch && l.pb[s.batch] != null ? 'batch' : 'gen' }); }); return bad ? null : { price: splitSum(out, q), split: out }; }
// Qator qismlari (partiyalar bo'yicha soni va narxi) — tasdiqlanganda muzlatilgan, qoralamada surat bo'yicha
function lineSplit(l, o) { if (!l || !l.pid) return []; if (l.fz) return l.fz.split || [{ batch: null, qty: l.qty || 0, price: l.fz.price, src: 'gen' }]; if (!o) return [];
  if (l.price != null) return planFor(o, l.pid, l.qty > 0 ? l.qty : 1).map(function (s) { return { batch: s.batch, exp: s.exp, qty: s.qty, price: l.price, src: 'manual' }; });
  var sp = snapSplit(o, l); if (sp) return sp.split; var pi = priceInfo(o, l.pid, l.qty); return pi ? pi.split : []; }
function priceDiffOf(o, l) { if (!l.pid || l.price != null || l.fz || l.p0 == null) return null; var a = linePrice(l, o), b = priceFor(o, l.pid, l.qty); return b != null && Math.abs(a - b) > 0.005 ? { from: a, to: b } : null; }
// Sotuv/hisob-faktura: yig'ilgan partiyalar muzlatilgan qismlarga to'liq mos bo'lsa — partiya narxi, aks holda qatorning muzlatilgan o'rtacha narxi
function pickPrice(o, l, batch) { var w = linePrice(l, o), S = l && l.fz && l.fz.split; if (!S || S.length < 2) return S && S[0] && S[0].batch === batch ? S[0].price : w;
  var got = {}; picksOf(o).forEach(function (x) { if (x.pid === l.pid) got[x.batch] = (got[x.batch] || 0) + x.qty; }); var ok = S.every(function (s) { return s.batch && got[s.batch] === s.qty; }) && Object.keys(got).length === S.length;
  if (!ok) return w; var s = S.filter(function (y) { return y.batch === batch; })[0]; return s ? s.price : w; }
function lastCost(pid, br) { var best = null; batches().forEach(function (b) { if (b.pid !== pid || (br && b.branch !== br) || !(b.cost > 0)) return; var d = pD(b.docDate) || 0; if (!best || d > best.d) best = { d: d, cost: b.cost, doc: b.doc, date: b.docDate }; }); return best; }
function avgCost(pid, br) { var q = 0, s = 0; batches().forEach(function (b) { if (b.pid !== pid || (br && b.branch !== br) || !(b.qty > 0) || !(b.cost > 0)) return; q += b.qty; s += b.qty * b.cost; }); if (q) return s / q; var lc = lastCost(pid, br); return lc ? lc.cost : null; }
function vatOf(pid) { var p = prodById(pid) || {}; return p.vatNone ? 0 : p.vat || 0; }
function withVat(pid, net) { return net == null ? null : net * (1 + vatOf(pid) / 100); }
// Tannarx asosi — filialdagi qoldiqli partiyalarning eng yuqori tannarxi; qoldiq bo'lmasa — oxirgi kirim. costV — QQS bilan
function costBasis(pid, br, batch) { var best = null; if (batch) { var hit = false; batches().forEach(function (b) { if (b.pid !== pid || (br && b.branch !== br) || b.batch !== batch) return; hit = true; if (b.cost > 0 && (!best || b.cost > best.cost)) best = { cost: b.cost, batch: b.batch, doc: b.doc, date: b.docDate, src: 'batch' }; }); if (hit) { if (best) best.costV = r2(withVat(pid, best.cost)); return best; } } batches().forEach(function (b) { if (b.pid !== pid || (br && b.branch !== br) || (batch && b.batch !== batch) || !(b.qty > 0) || !(b.cost > 0)) return; if (!best || b.cost > best.cost) best = { cost: b.cost, batch: b.batch, doc: b.doc, date: b.docDate, src: 'batch' }; }); if (!best) { var lc = lastCost(pid, br); if (lc) best = { cost: lc.cost, batch: null, doc: lc.doc, date: lc.date, src: 'receipt' }; } if (best) best.costV = r2(withVat(pid, best.cost)); return best; }
function nrByNo(no) { return (store.nos || []).filter(function (x) { return x.no === no; })[0] || null; }
function nextNoNo(br) { var m = 0; (store.nos || []).forEach(function (x) { if (x.no && x.no.split('-')[1] === br) m = Math.max(m, +x.no.split('-')[2]); }); return 'NO-' + br + '-' + pad6(m + 1); }
function saveNo(x) { var c = JSON.parse(JSON.stringify(x)); if (!c.no) { c.no = nextNoNo(c.branch); c.id = c.no; } var a = (store.nos || []).slice(), i = a.map(function (y) { return y.id; }).indexOf(c.id); if (i >= 0) a[i] = c; else a.push(c); store.nos = a; store.v++; return JSON.parse(JSON.stringify(c)); }
function nrBranches(x) { return x.scope === 'all' ? BRANCHES.map(function (b) { return b.code; }) : [x.branch]; }
// Tekshiruv: l = { pid, batch?, price } (QQS bilan). below — tannarxdan (QQS bilan) past; bigs — priceWarnPct dan ko'p
function nrCheckLine(type, br, eff, l) { var cb = costBasis(l.pid, br, l.batch), cur = priceAt(l.pid, type, br, eff, l.batch); return { below: !!(cb && l.price < cb.costV), cost: cb, cur: cur ? cur.price : null, pct: cur ? (l.price - cur.price) / cur.price * 100 : null, big: !!(cur && Math.abs(l.price - cur.price) / cur.price > CONFIG.priceWarnPct / 100) }; }
function nrCheck(x) { var out = { errs: [], below: [], bigs: [] }, t0 = pD(x.eff); if (t0 == null) out.errs.push({ k: 'eff' }); else if (t0 < T0) out.errs.push({ k: 'past' }); if (!x.lines.length) out.errs.push({ k: 'lines' });
  nrBranches(x).forEach(function (b) { x.lines.forEach(function (l) { if (!(l.price > 0)) { out.errs.push({ k: 'price', l: l }); return; } var c = nrCheckLine(x.type, b, x.eff, l); if (c.below) out.below.push({ l: l, br: b, cost: c.cost.costV }); if (c.big) out.bigs.push({ l: l, br: b, pct: c.pct }); }); }); return out; }
function nrDraftImpact(type, brs, eff, lines) { var n = 0, nos = [], base = ptBase().code; (store.orders || []).forEach(function (o) { if (o.status !== 'draft' || brs.indexOf(o.branch) < 0 || pD(o.date) < pD(eff)) return; var inf = function (pid) { return priceInfo(o, pid) || {}; };
    if (o.lines.some(function (l) { return !l.fz && l.price == null && lines.some(function (y) { if (y.pid !== l.pid) return false; if (y.batch) { var s = lineSplit(l, o).filter(function (z) { return z.batch === y.batch; })[0], pc = prCtx(o); return !!s && (type === pc.tt || type === base) && y.price !== s.price; } return inf(l.pid).type === type && y.price !== l.p0; }); })) { n++; nos.push(o.no); } }); return { n: n, nos: nos }; }
function nrApply(c) { c.lines.forEach(function (l) { store.prices.push(Object.assign({ pid: l.pid, type: c.type, br: c.branch, price: l.price, eff: c.eff, doc: c.no }, l.batch ? { batch: l.batch } : {})); }); store.prices = store.prices.slice(); }
// Narx o'rnatish: har filialga o'z hujjati; tannarxdan past qatorlar — alohida hujjat (Direktor tasdig'ida)
function nrSet(o, who) { var at = nowStr(), out = []; (o.branches || [o.branch]).forEach(function (b) { var ok = [], low = [];
    o.lines.forEach(function (l) { var c = nrCheckLine(o.type, b, o.eff, l), ln = { pid: l.pid, batch: l.batch || null, price: l.price, old: c.cur, cost: c.cost ? c.cost.costV : null }; (c.below ? low : ok).push(ln); });
    var base = { branch: b, scope: 'cur', type: o.type, eff: o.eff, src: o.src || 'set', rc: o.rc || null, note: o.note || '', createdBy: who, createdAt: at };
    if (ok.length) { var d1 = saveNo(Object.assign({}, base, { lines: ok, status: 'posted', postedBy: who, postedAt: at, log: [{ kind: 'posted', who: who, at: at }] })); nrApply(d1); out.push(d1); }
    if (low.length) { var d2 = saveNo(Object.assign({}, base, { lines: low, status: 'pending', sentAt: at, log: [{ kind: 'send', who: who, at: at }] })); out.push(d2); notify && notify({ kind: 'approval', text: d2.no + ' — tannarxdan past narx, Direktor tasdig\u02BBi kerak' }); } });
  store.v++; return out; }
function nrApprove(x, who, role) { if (!can(role || 'director', 'prices.below')) return { err: 'role' }; var c = JSON.parse(JSON.stringify(x)), at = nowStr(); if (c.status !== 'pending') return { err: 'status' }; c.status = 'posted'; c.postedBy = who; c.postedAt = at; c.approvedBy = who; c.log = (c.log || []).concat([{ kind: 'approved', who: who, at: at }]); c = saveNo(c); nrApply(c); return { doc: c }; }
function nrReject(x, who, reason, role) { if (!can(role || 'director', 'prices.below')) return { err: 'role' }; if (!String(reason || '').trim()) return { err: 'reason' }; var c = JSON.parse(JSON.stringify(x)), at = nowStr(); c.status = 'rejected'; c.rejectedBy = who; c.rejectedAt = at; c.rejectReason = reason; c.log = (c.log || []).concat([{ kind: 'rejected', who: who, at: at, reason: reason }]); return { doc: saveNo(c) }; }
function nrCancel(x, who, reason) { if (x.status !== 'posted' || pD(x.eff) <= T0) return { err: 'effective' }; if (!String(reason || '').trim()) return { err: 'reason' }; var c = JSON.parse(JSON.stringify(x)), at = nowStr(); store.prices = (store.prices || []).filter(function (e) { return e.doc !== c.no; }); c.status = 'cancelled'; c.cancelledAt = at; c.cancelledBy = who; c.cancelReason = reason; c.log = (c.log || []).concat([{ kind: 'cancelled', who: who, at: at, reason: reason }]); return { doc: saveNo(c) }; }
function nrLinesOf(x) { return x.lines || []; }
function nrPost(x, who) { var at = nowStr(), c = saveNo(Object.assign({}, x, { status: 'posted', postedBy: who, postedAt: at, log: (x.log || []).concat([{ kind: 'posted', who: who, at: at }]) })); nrApply(c); return c; }
function ptStats(code, br) { var brs = br && br !== 'ALL' ? [br] : BRANCHES.map(function (b) { return b.code; }), act = PRODUCTS.filter(function (p) { return p.active; }), has = {}, last = null;
  (store.prices || []).forEach(function (e) { if (e.type !== code || brs.indexOf(e.br) < 0 || pD(e.eff) > T0) return; has[e.pid] = 1; });
  (store.nos || []).forEach(function (x) { if (x.type !== code || x.status !== 'posted' || nrBranches(x).every(function (b) { return brs.indexOf(b) < 0; })) return; var d = String(x.postedAt || x.createdAt || '').slice(0, 10); if (d && (!last || pD(d) > pD(last))) last = d; });
  return { priced: act.filter(function (p) { return has[p.id]; }).length, total: act.length, custs: br && br !== 'ALL' ? ptCusts(code, br).length : ptCusts(code).length, last: last }; }
function prNo(no) { var x = nrByNo(no); if (!x) return null; var t = ptByCode(x.type) || {};
  return { form: 'no', no: x.no, src: x.no, kind: 'no', ok: true, status: x.status === 'posted' ? 'posted' : x.status === 'cancelled' ? 'cancelled' : 'draft', date: String(x.createdAt || '').slice(0, 10) || fD(T0), branch: x.branch, seller: prBranch(x.branch), type: t.name || x.type, eff: x.eff, srcKind: x.src, rc: x.rc || null, note: x.note || '', st: x.status,
    lines: (x.lines || []).map(function (l) { var p = prodById(l.pid) || {}; return { code: p.code || '', name: p.name || '', batch: l.batch || '', old: l.old, price: l.price }; }), signs: [['Tuzdi', x.createdBy || ''], ['Tasdiqladi', x.approvedBy || x.postedBy || '']] }; }
function nrSum(x) { return r2((x.lines || []).reduce(function (s, l) { return s + (l.price || 0); }, 0)); }
function seedPrices() { var E = [], nos = [], who = DIRECTOR, H = [['01.11.2025', 0.92, '28.10.2025 10:00', 'smartup', "SMARTUP dan ko'chirilgan narx tarixi"], ['01.04.2026', 0.97, '28.03.2026 11:20', 'set', 'Yetkazib beruvchilar narxi oshgani uchun'], ['01.08.2026', 1, '29.07.2026 16:05', 'set', "Mavsumiy qayta ko'rib chiqish"]];
  var seq = {}, doc = function (br, type, eff, at, src, note, lines, st, x) { seq[br] = (seq[br] || 0) + 1; var no = 'NO-' + br + '-' + pad6(seq[br]); lines.forEach(function (l) { if (st === 'posted') E.push(Object.assign({ pid: l.pid, type: type, br: br, price: l.price, eff: eff, doc: no }, l.batch ? { batch: l.batch } : {})); });
    nos.push(Object.assign({ no: no, id: no, scope: 'cur', branch: br, type: type, eff: eff, src: src, note: note, status: st, seed: true, lines: lines, createdBy: who, createdAt: at, postedBy: st === 'posted' ? who : null, postedAt: st === 'posted' ? at : null, log: [{ kind: st === 'posted' ? 'posted' : 'send', who: who, at: at }] }, x || {})); return no; };
  var B = function (p) { return r100(BASE0[p.id] * 1.12); }, priced = PRODUCTS.filter(function (p) { return !NR_NOPRICE[p.id] && BASE0[p.id]; });
  BRANCHES.forEach(function (b) { H.forEach(function (h, i) { doc(b.code, 'base', h[0], h[2], h[3], h[4], priced.map(function (p) { return { pid: p.id, price: r100(B(p) * h[1]), old: i ? r100(B(p) * H[i - 1][1]) : null }; }), 'posted'); }); });
  var sp = function (type, list, k, note) { doc('TSH', type, '01.08.2026', '29.07.2026 16:30', 'set', note, list.map(function (p) { return { pid: p.id, price: r100(B(p) * k) }; }), 'posted'); };
  var p28 = priced.filter(function (p) { return p.id <= 30; }); sp('dist', p28, 0.95, 'Distribyutorlar uchun −5%'); sp('health', p28, 0.97, 'Health Line −3%'); sp('vozvrat', p28, 0.95, 'Qaytarish narxi −5%');
  sp('promo', priced.filter(function (p) { return [2, 7, 11, 15, 19].indexOf(p.id) >= 0; }), 0.9, 'Oktabr promo'); sp('aksiya', priced.filter(function (p) { return [5, 9, 12, 16].indexOf(p.id) >= 0; }), 0.85, 'Kuzgi aksiya'); sp('tdisc', priced.filter(function (p) { return [3, 10, 14].indexOf(p.id) >= 0; }), 0.93, 'Tovar chegirmasi');
  var near = batches().filter(function (x) { return x.branch === 'TSH' && x.wh === 'Asosiy ombor' && x.status === 'open' && x.days != null && x.days >= 0 && x.days < 400 && BASE0[x.pid] && !NR_NOPRICE[x.pid]; }).sort(function (a, c) { return a.days - c.days; }), seen = {}, bl = [];
  near.forEach(function (x) { var k = x.pid + '|' + x.batch; if (seen[k] || bl.length >= 6) return; seen[k] = 1; var p = prodById(x.pid); bl.push({ pid: x.pid, batch: x.batch, price: r100(B(p) * (0.85 + (bl.length % 4) * 0.02)) }); });
  doc('TSH', 'batch', '20.09.2026', '18.09.2026 09:40', 'set', 'Muddati yaqin partiyalar', bl, 'posted');
  var bis = PRODUCTS.filter(function (p) { return p.name === 'Bisoprolol 5mg'; })[0]; if (bis) doc('TSH', 'base', '15.10.2026', '02.10.2026 14:15', 'set', 'Bisoprolol — yangi kirim narxi', [{ pid: bis.id, price: r100(26900 * 1.12), old: B(bis) }], 'posted');
  store.prices = E;
  var ib = prodById(7); if (ib) doc('TSH', 'base', '06.10.2026', '04.10.2026 11:30', 'set', 'Raqobatchi narxiga tushirish', [{ pid: ib.id, price: r100(B(ib) * 0.55), old: B(ib) }], 'pending', { createdBy: 'Bekzod Tursunov', sentAt: '04.10.2026 11:30', log: [{ kind: 'send', who: 'Bekzod Tursunov', at: '04.10.2026 11:30' }] });
  // Y2: kirim bo'yicha partiya narxi (bazaviy «Narx» turida) — KR-TSH-000118: MT-2508 umumiy narxdan past, DF-2507 yuqori
  var rc8 = (store.receipts || []).filter(function (r) { return r.no === 'KR-TSH-000118' && r.status === 'posted'; })[0], q36 = prodById(36), q9 = prodById(9);
  if (rc8 && q36 && q9) doc('TSH', 'base', '04.10.2026', '04.10.2026 09:15', 'rc', 'Kirim partiyalari narxi', [{ pid: 36, batch: 'MT-2508', price: 12500, old: B(q36), cost: r2(9500 * 1.12) }, { pid: 9, batch: 'DF-2507', price: 13500, old: B(q9), cost: r2(8600 * 1.12) }], 'posted', { rc: 'KR-TSH-000118' });
  store.nos = nos; seedP0(); }
function seedP0() { (store.orders || []).forEach(function (o) { o.lines.forEach(function (l) { if (l.fz) return; priceStamp(o, l, true); if (l.p0 == null) l.p0 = 0; }); }); }
var LK_KINDS = ['makers', 'cats', 'countries', 'units', 'regions', 'fleet', 'items'];
var COUNTRIES = ["O'zbekiston", 'Avstriya', 'Belarus', 'Belgiya', 'Bolgariya', 'Buyuk Britaniya', 'Chexiya', 'Daniya', 'Fransiya', 'Germaniya', 'Hindiston', 'Irlandiya', 'Isroil', 'Italiya', 'Ispaniya', 'Janubiy Koreya', 'Latviya', 'Litva', 'Misr', 'Niderlandiya', 'Pokiston', 'Polsha', 'Qozog\u02BBiston', 'Rossiya', 'Ruminiya', 'Serbiya', 'Shveysariya', 'Shvetsiya', 'Slovakiya', 'Sloveniya', 'Turkiya', 'Ukraina', 'Vengriya', 'Xitoy', 'Xorvatiya', 'Yaponiya', 'AQSh', 'Eron', 'Gruziya', 'Armaniston'];
var LK_R = permView({ makers: 'lookups.makers', cats: 'lookups.cats', countries: 'lookups.cats', units: 'lookups.units', ptypes: 'lookups.ptypes', regions: 'lookups.regions', fleet: 'lookups.fleet', items: 'lookups.items' }, 'LK_R');
var CAT_PARENT = { Antibiotiklar: 'Infeksiyaga qarshi', Antigistaminlar: 'Allergiya va immunitet', Analgetiklar: "Og'riq va yallig'lanish", Gastroenterologiya: 'Ovqat hazm qilish', Kardiologiya: 'Yurak va qon tomir', Endokrinologiya: 'Endokrin tizim', Nevrologiya: 'Asab tizimi', Vitaminlar: 'Vitaminlar va BAD' };
var MAKER_C = { Nobel: "O'zbekiston", 'Jurabek Laboratories': "O'zbekiston", KRKA: 'Sloveniya', 'Gedeon Richter': 'Vengriya', 'Novo Nordisk': 'Daniya', Sanofi: 'Fransiya', Berlin: 'Germaniya', Bayer: 'Germaniya', Servier: 'Fransiya', Teva: 'Isroil' };
function seedLk() { var at = '01.10.2026 09:30', who = DIRECTOR, id = 0, mk = function (o) { id++; return Object.assign({ id: 'k' + id, active: true, at: at, who: who, hist: [{ at: at, who: who, kind: 'create', changes: [] }] }, o); };
  var makers = [], cats = [], seenM = {}, seenC = {}, par = {};
  PRODUCTS.forEach(function (p) { if (!seenM[p.maker]) { seenM[p.maker] = 1; makers.push(mk({ name: p.maker, country: MAKER_COUNTRY[p.maker] || MAKER_C[p.maker] || '' })); } });
  PRODUCTS.forEach(function (p) { if (seenC[p.cat]) return; seenC[p.cat] = 1; var pn = CAT_PARENT[p.cat] || 'Boshqa preparatlar'; if (!par[pn]) { par[pn] = mk({ name: pn, parent: null, ord: Object.keys(par).length }); cats.push(par[pn]); } cats.push(mk({ name: p.cat, parent: par[pn].id, ord: cats.filter(function (c) { return c.parent === par[pn].id; }).length })); });
  var units = [['dona', 'dona', false], ['qadoq', 'qad.', false], ['flakon', 'fl.', false], ['ampula', 'amp.', false], ['kilogramm', 'kg', true], ['litr', 'l', true]].map(function (u) { return mk({ name: u[0], short: u[1], frac: u[2] }); });
  var regs = {}; CUSTOMERS.forEach(function (c) { if (!regs[c.region]) regs[c.region] = mk({ name: c.region, prov: /Toshkent/.test(c.region) ? 'Toshkent sh.' : c.region.split(',')[0] + ' viloyati', branch: custBrs(c)[0], driver: custBrs(c)[0] === 'TSH' ? (c.region.length % 5) + 1 : null }); });
  var drivers = DRIVERS.map(function (d) { return mk({ did: d.id, emp: empIdByName(d.name), name: d.name, phone: d.phone, lic: 'AF ' + String(1203450 + d.id * 3317), branch: 'TSH' }); });
  var cars = VEHICLES.map(function (v, i) { return mk({ no: v.no, model: v.type.split(' · ')[0], fridge: !!v.fridge, cap: [1500, 800, 3500, 600, 1200, 1500][i] || 1000, boxCap: [60, 30, 120, 12, 50, 60][i] || 40, branch: 'TSH' }); });
  var items = MOP_ITEMS.out.map(function (n) { return mk({ name: n, dir: 'out' }); }).concat(MOP_ITEMS.in.map(function (n) { return mk({ name: n, dir: 'in' }); }));
  store.lk = { makers: makers, cats: cats, units: units, regions: Object.keys(regs).map(function (k) { return regs[k]; }), drivers: drivers, cars: cars, items: items, prodMaker: {}, countries: COUNTRIES.map(function (n) { return mk({ name: n }); }) };
  lkApply(); }
function lkApply() { var k = store.lk; if (!k) return;
  DRIVERS.length = 0; k.drivers.forEach(function (d) { var e = d.emp && (store.emps || []).filter(function (x) { return x.id === d.emp; })[0]; DRIVERS.push({ id: d.did, emp: d.emp || null, name: e ? e.first + ' ' + e.last : d.name, phone: e ? e.phone : d.phone, active: d.active, lic: d.lic, branch: d.branch }); });
  VEHICLES.length = 0; k.cars.forEach(function (v) { VEHICLES.push({ no: v.no, type: v.model + (v.fridge ? ' · refrijerator' : ' · furgon'), fridge: !!v.fridge, active: v.active, cap: v.cap, branch: v.branch }); });
  MOP_ITEMS.out = k.items.filter(function (x) { return x.dir === 'out' && x.active; }).map(function (x) { return x.name; }); MOP_ITEMS.in = k.items.filter(function (x) { return x.dir === 'in' && x.active; }).map(function (x) { return x.name; }); }
function lkUse(kind, it) { var n = 0, what = 'prod', k = store.lk;
  if (kind === 'makers') n = PRODUCTS.filter(function (p) { var o = k.prodMaker[p.id]; return o ? o === it.id : p.maker === it.name && !it.note; }).length;
  else if (kind === 'cats') { var ch = k.cats.filter(function (c) { return c.parent === it.id; }).map(function (c) { return c.name; }); n = PRODUCTS.filter(function (p) { return p.cat === it.name || ch.indexOf(p.cat) >= 0; }).length; }
  else if (kind === 'countries') n = PRODUCTS.filter(function (p) { return p.country === it.name; }).length;
  else if (kind === 'units') n = PRODUCTS.filter(function (p) { return p.unit === it.name || (it.name === 'ampula' && p.form === 'ampoule') || (it.name === 'flakon' && p.form === 'vial'); }).length;
  else if (kind === 'ptypes') { what = 'cust'; n = CUSTOMERS.filter(function (c) { return c.bt && Object.keys(c.bt).some(function (b) { return c.bt[b].price === it.code; }); }).length; }
  else if (kind === 'regions') { what = 'cust'; n = CUSTOMERS.filter(function (c) { return c.region === it.name; }).length; }
  else if (kind === 'drivers') { what = 'trip'; n = (store.trips || []).filter(function (t) { return t.driver === it.did; }).length; }
  else if (kind === 'cars') { what = 'trip'; n = (store.trips || []).filter(function (t) { return t.car === it.no; }).length; }
  else if (kind === 'items') { what = 'mop'; n = (store.mops || []).filter(function (m) { return m.item === it.name; }).length; }
  return { n: n, what: what }; }
function lkSave(kind, it, who, ev, changes) { var a = store.lk[kind].slice(), c = JSON.parse(JSON.stringify(it)), at = nowStr(); if (!c.id) { c.id = 'k' + (Date.now() % 1e7); c.at = at; c.who = who; c.hist = []; } c.hist = (c.hist || []).concat([{ at: at, who: who, kind: ev || 'edit', changes: changes || [] }]);
  var i = a.map(function (x) { return x.id; }).indexOf(c.id); if (i >= 0) a[i] = c; else a.push(c); store.lk = Object.assign({}, store.lk); store.lk[kind] = a;
  // T6: haydovchi — bitta shaxs, bitta yozuv: ism, telefon va holat xodim yozuviga yoziladi
  if (kind === 'drivers' && c.emp) { var e = (store.emps || []).filter(function (x) { return x.id === c.emp; })[0]; if (e) { var nm = String(c.name || '').trim().split(/\s+/), ne = Object.assign({}, e, { first: nm[0] || e.first, last: nm.slice(1).join(' ') || e.last, phone: c.phone || e.phone, status: c.active === false ? 'blocked' : (e.status === 'blocked' ? 'active' : e.status), blockReason: c.active === false ? (e.blockReason || "Ma'lumotnomada nofaol qilindi") : '' }); if (JSON.stringify(ne) !== JSON.stringify(e)) empSave(ne, who); } }
  lkApply(); store.v++; return c; }
function lkDup(kind, name, exceptId) { var q = bqNorm(name); if (!q) return null; return (store.lk[kind] || []).filter(function (x) { return x.id !== exceptId && bqNorm(x.name || x.no || '') === q; })[0] || null; }
function lkMerge(mainId, dupId, who) { var k = store.lk, main = k.makers.filter(function (m) { return m.id === mainId; })[0], dup = k.makers.filter(function (m) { return m.id === dupId; })[0]; if (!main || !dup) return 0; var moved = 0, pm = Object.assign({}, k.prodMaker);
  PRODUCTS.forEach(function (p) { if (pm[p.id] === dup.id || (!pm[p.id] && p.maker === dup.name && !dup.note)) { if (main.name === p.maker && !main.note) delete pm[p.id]; else pm[p.id] = main.id; moved++; } }); store.lk = Object.assign({}, k, { prodMaker: pm });
  var d2 = JSON.parse(JSON.stringify(dup)); d2.active = false; d2.mergedInto = main.id; lkSave('makers', d2, who, 'merge', [{ label: 'merge', to: main.name }, { label: 'moved', to: String(moved) }]); return moved; }
// ---- 2-qadam: Mahsulotlar — store.products (PRODUCTS bilan bitta massiv). Yaratish/tahrir/nofaol — faqat shu funksiyalar orqali ----
function prodPersist() { try { localStorage.setItem(PROD_KEY, JSON.stringify({ products: PRODUCTS, audit: (store.audit || []).filter(function (a) { return a.objType === 'product' && !a.seed; }) })); } catch (e) {} }
function prodLoad() { try { var x = JSON.parse(localStorage.getItem(PROD_KEY) || 'null'); if (!x || !Array.isArray(x.products) || !x.products.length) return null; PRODUCTS.length = 0; x.products.forEach(function (p) { delete p.price; PRODUCTS.push(p); }); return x.audit || []; } catch (e) { return null; } }
function prodApply() { var a = store.products; if (a && a !== PRODUCTS) { PRODUCTS.length = 0; a.forEach(function (p) { PRODUCTS.push(p); }); } store.products = PRODUCTS; }
function prodActive() { return PRODUCTS.filter(function (p) { return p.active; }); }
function prodByCode(code, exceptId) { code = String(code || ''); return PRODUCTS.filter(function (p) { return p.code === code && p.id !== exceptId; })[0] || null; }
function prodNewCode() { var t = {}; PRODUCTS.forEach(function (p) { t[p.code] = 1; }); return genCode(t); }
// EAN-13 / EAN-8: '' — to'g'ri; aks holda xato kaliti
function eanCheck(s) { s = String(s || ''); if (!/^\d+$/.test(s)) return 'digits'; if (s.length !== 8 && s.length !== 13) return 'len'; var sum = 0; for (var i = s.length - 2, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += +s[i] * w; return (10 - sum % 10) % 10 === +s[s.length - 1] ? '' : 'check'; }
function prodOpen(o) { return ['delivered', 'shipped', 'cancelled', 'rejected', 'closed', 'done', 'returned'].indexOf(o.status) < 0; }
function prodOpenOrders(pid) { return (store.orders || []).filter(function (o) { return prodOpen(o) && o.lines.some(function (l) { return l.pid === pid; }); }); }
function prodHasMoves(pid) { if (!pid) return false; return batches().some(function (b) { return b.pid === pid; }) || store.receipts.some(function (r) { return r.status === 'posted' && r.lines.some(function (l) { return l.pid === pid; }); }) || (store.orders || []).some(function (o) { return o.status !== 'draft' && o.lines.some(function (l) { return l.pid === pid; }); }); }
var PROD_F = [['code', 'Mahsulot kodi'], ['name', 'Mahsulot nomi'], ['contractName', 'Shartnomadagi nomi'], ['classifier', 'Klassifikator nomi'], ['maker', 'Ishlab chiqaruvchi'], ['country', 'Ishlab chiqargan davlat'], ['cat', 'Kategoriya'], ['supplyBy', "Ta'minot bo'yicha mas'ul"], ['form', 'Dori shakli'], ['dose', 'Dozasi'], ['pack', 'Qadoqdagi soni'], ['unit', 'Asosiy birlik'], ['perPack', '1 qadoqdagi dona soni'], ['barcodes', 'Shtrix-kodlar'], ['ikpu', 'IKPU kodi'], ['farmId', 'Farm ID'], ['ctrl', 'Nazoratdagi'], ['mark', 'Markirovka'], ['rx', "Retsept bo'yicha beriladi"], ['vat', 'QQS'], ['minQty', 'Min. buyurtma miqdori'], ['maxQty', 'Maks. miqdor (tasdiqsiz)'], ['note', 'Izoh']];
function prodFmt(p, k) { var v = p[k]; if (k === 'barcodes') return (v || []).join(', '); if (k === 'vat') return p.vatNone ? 'QQSsiz' : (v || 0) + '%'; if (typeof v === 'boolean') return v ? 'Ha' : "Yo'q"; if (k === 'form') return FORMS[v] || v || ''; return v == null ? '' : String(v); }
// f — formadagi maydonlar (+ id tahrirda). Natija: { ok, p } yoki { err: 'codeFmt' | 'codeDup', other }
function prodSave(f, who, opt) {
  if (!/^[1-9]\d{7}$/.test(String(f.code || ''))) return { err: 'codeFmt' };
  var other = prodByCode(f.code, f.id); if (other) return { err: 'codeDup', other: other };
  var at = nowStr(), old = f.id ? prodById(f.id) : null, p = Object.assign({}, old || { active: true, stock: 0, createdAt: at, createdBy: who }, f);
  p.barcodes = (f.barcodes || []).slice(); p.vatNone = f.vat === 'none'; p.vat = p.vatNone ? 0 : +(f.vat != null ? f.vat : 12); p.minQty = parseInt(p.minQty, 10) > 0 ? parseInt(p.minQty, 10) : null; p.maxQty = parseInt(p.maxQty, 10) > 0 ? parseInt(p.maxQty, 10) : null; if (old && (old.minQty !== p.minQty || old.maxQty !== p.maxQty)) p.mmUser = true;
  if (!old) p.id = PRODUCTS.reduce(function (m, x) { return Math.max(m, x.id); }, 0) + 1;
  var diff = old ? PROD_F.filter(function (k) { return prodFmt(old, k[0]) !== prodFmt(p, k[0]); }).map(function (k) { return { f: k[1], key: k[0], from: prodFmt(old, k[0]) || '—', to: prodFmt(p, k[0]) || '—' }; }) : [];
  if (old && !diff.length) return { ok: true, p: old, same: true };
  if (old) PRODUCTS[PRODUCTS.indexOf(old)] = p; else PRODUCTS.push(p);
  var codeCh = diff.some(function (x) { return x.key === 'code'; });
  auditAdd({ kind: old ? 'change' : 'create', act: old ? 'change' : 'create', who: who, obj: p.name, objType: 'product', page: 'products', pid: p.id, text: !old ? 'Mahsulot yaratildi · kod ' + p.code : codeCh ? "Mahsulot kodi o'zgartirildi" : 'Mahsulot tahrirlandi', diff: diff });
  if (!(opt && opt.temp)) prodPersist(); return { ok: true, p: p, codeChanged: codeCh };
}
function prodSetActive(ids, active, who, reason) { var n = 0; ids.forEach(function (id) { var p = prodById(id); if (!p || p.active === active) return; var c = Object.assign({}, p, { active: active, inactiveReason: active ? '' : reason || '' }); PRODUCTS[PRODUCTS.indexOf(p)] = c; n++;
    auditAdd({ kind: 'status', act: 'change', who: who, obj: p.name, objType: 'product', page: 'products', pid: id, text: reason || '', diff: [{ f: 'Holat', from: active ? 'Nofaol' : 'Faol', to: active ? 'Faol' : 'Nofaol' }] }); });
  prodPersist(); store.v++; return n; }
function prodHist(pid) { var t = function (a) { return pDT(String(a.at).slice(0, 16)) || 0; }; return (store.audit || []).filter(function (a) { return a.objType === 'product' && a.pid === pid; }).map(function (a, i) { return { a: a, i: i }; }).sort(function (x, y) { return (t(y.a) - t(x.a)) || (y.i - x.i); }).map(function (x) { return x.a; }); }
// Harakatlar — store dagi haqiqiy hujjatlar (q > 0 — kirim, q < 0 — chiqim)
function prodMoves(pid) { var out = [], add = function (date, type, kind, no, br, wh, q, ref) { if (!q) return; out.push({ date: String(date || '').slice(0, 10), t: pDT(String(date || '').slice(0, 16)) || pD(String(date || '').slice(0, 10)) || 0, type: type, kind: kind, no: no, branch: br, wh: wh || '', q: q, ref: ref || { kind: kind, no: no } }); }, sumL = function (ls, f) { return (ls || []).filter(function (l) { return l.pid === pid; }).reduce(function (s, l) { return s + (f ? f(l) : l.qty || 0); }, 0); };
  store.receipts.forEach(function (r) { if (r.status === 'posted' || r.status === 'accepted') add(r.date, r.status === 'accepted' ? 'Kirim (qabulda)' : 'Kirim', 'kr', r.no, r.branch, r.wh, sumL(r.lines, function (l) { return rcGood(l) + rcDmg(l) + (l.bonusQty > 0 ? l.bonusQty : 0); })); }); // T11a: qabuldagi kirim ham (Qoldiqlar bilan bir xil)
  (store.sales || []).forEach(function (s) { if (pD(s.at.slice(0, 10)) <= pD(BQ_CUT)) return; var o = orderOfSale(s.no) || {}; add(s.at, 'Sotuv', 'sv', s.no, s.branch, o.wh, -saleLines(s.no).filter(function (x) { return x.pid === pid; }).reduce(function (a, x) { return a + x.sold; }, 0)); });
  var D = store.docs || {}; [['qm', 'Mijozdan qaytarish', 1], ['hc', 'Hisobdan chiqarish', -1], ['qy', 'Yetkazib beruvchiga qaytarish', -1]].forEach(function (k) { (D[k[0]] || []).forEach(function (x) { if (x.status === 'posted') add(x.postedAt || x.date, k[1], k[0], x.no, x.branch, x.wh, k[2] * sumL(x.lines)); }); });
  (store.transfers || []).forEach(function (x) { if (x.status === 'draft' || x.status === 'cancelled' || x.status === 'pending') return; var q = sumL(x.lines, function (l) { return l.qty || 0; }), r = sumL(x.lines, function (l) { return l.recv != null ? l.recv : l.qty || 0; }), lb = TR_LABEL[x.kind] || x.kind;
    if (x.kind === 'zk') { if (q) out.push({ date: x.date, t: pD(x.date) || 0, type: lb, kind: 'tr', no: x.no, branch: x.from.branch, wh: x.from.wh, q: 0, zone: q }); return; }
    add(x.sentAt || x.date, lb, 'tr', x.no, x.from.branch, x.from.wh, -q); if (x.status === 'received') add(x.receivedAt || x.date, lb, 'tr', x.no, x.to.branch, x.to.wh, r); });
  (store.invs || []).forEach(function (x) { if (x.status === 'posted') add(x.postedAt || x.date, 'Inventarizatsiya', 'iv', x.no, x.branch, x.wh, sumL(x.lines, function (l) { return l.counted != null ? l.counted - (l.book || 0) : 0; })); });
  out.sort(function (a, b) { return b.t - a.t; }); var bal = batches().filter(function (b) { return b.pid === pid; }).reduce(function (s, b) { return s + b.qty; }, 0); out.forEach(function (m) { m.bal = bal; bal -= m.q; }); return out; }
// Universal qidiruv: kod, nomlar, shtrix-kod, IKPU, Farm ID (lotin/kirill farqisiz). Natija: null yoki { field, value } — nom bo'yicha bo'lsa field = 'name'
function prodMatch(p, q) { if (!q) return { field: '' }; var n = toLat(q), F = [['name', p.name], ['code', p.code], ['contractName', p.contractName], ['classifier', p.classifier], ['ikpu', p.ikpu], ['farmId', p.farmId]];
  for (var i = 0; i < F.length; i++) if (toLat(F[i][1] || '').indexOf(n) >= 0) return { field: F[i][0], value: F[i][1] };
  var bc = (p.barcodes || []).filter(function (b) { return b.indexOf(q) >= 0; })[0]; return bc ? { field: 'barcode', value: bc } : null; }
function prodSearch(q, opt) { opt = opt || {}; return PRODUCTS.filter(function (p) { return (opt.all || p.active) && prodMatch(p, q); }); }
function seedProdAudit() { var om = prodById(8), cf = prodById(3); if (!om || !cf) return; var oldC = String(+om.code + (om.code[0] === '9' ? -1111111 : 1111111));
  store.audit = (store.audit || []).concat([{ seed: 1, kind: 'change', act: 'change', who: 'Dilnoza Rahimova', at: '03.10.2026 11:20:14', obj: om.name, objType: 'product', page: 'products', pid: 8, text: "Mahsulot kodi o'zgartirildi", diff: [{ f: 'Mahsulot kodi', key: 'code', from: oldC, to: om.code }] },
    { seed: 1, kind: 'change', act: 'change', who: 'Bekzod Tursunov', at: '02.10.2026 16:05:41', obj: om.name, objType: 'product', page: 'products', pid: 8, text: 'Mahsulot tahrirlandi', diff: [{ f: "Ta'minot bo'yicha mas'ul", key: 'supplyBy', from: '—', to: om.supplyBy || '—' }, { f: 'Shartnomadagi nomi', key: 'contractName', from: 'Омепразол 20 мг №28', to: om.contractName }] },
    { seed: 1, kind: 'change', act: 'change', who: 'Dilnoza Rahimova', at: '01.10.2026 10:12:03', obj: cf.name, objType: 'product', page: 'products', pid: 3, text: 'Mahsulot tahrirlandi', diff: [{ f: 'IKPU kodi', key: 'ikpu', from: '—', to: cf.ikpu }] }]); if (PROD_SAVED_AUDIT) store.audit = store.audit.concat(PROD_SAVED_AUDIT); }
// Yagona boshlang'ich holat: demolar o'z nusxasida ishlaydi, tozalashda shu holatga qaytadi
var BASE = null, SNAP = ['co', 'rl', 'emps', 'audit', 'cfg', 'vatHist', 'brs', 'whs', 'sess', 'pins', 'locks', 'receipts', 'orders', 'sales', 'saleSeq', 'trips', 'docs', 'pays', 'mops', 'closes', 'recon', 'era', 'arOpen', 'advs', 'recons', 'transfers', 'invs', 'markAdj', 'bqs', 'bqHide', 'impProfiles', 'kts', 'prices', 'nos', 'lk', 'ptypes', 'bns', 'clk', 'nakSeq'];
function takeBase() { store.t0 = Date.now(); BASE = {}; SNAP.forEach(function (k) { BASE[k] = store[k] === undefined ? undefined : JSON.stringify(store[k]); }); }
function restoreBase(force) { if (store.demoHold && !force) return; SNAP.forEach(function (k) { store[k] = BASE[k] === undefined ? undefined : JSON.parse(BASE[k]); }); ptApply(); ktApply(); empApply(); lkApply(); store.notifs = []; store.openDocs = {}; store.demoDirty = false; store.t0 = Date.now(); store.v++; }
function setOrders(a) { freezeOrders(a); store.orders = a; store.v++; }
// 0-a: tasdiqlangan buyurtma qatorlariga narx, chegirma, narx turi va QQS yozib qo'yiladi — keyin shartlardan qayta hisoblanmaydi
function orderFrozen(o) { return o && o.status !== 'draft' && o.status !== 'pending'; }
function freezeOrders(a) { (a || []).forEach(function (o) { if (!orderFrozen(o) || o.lines.every(function (l) { return l.fz; })) return; var c = custAt(o.cust, o.branch); o.lines.forEach(function (l) { if (l.fz) return; var p = prodById(l.pid) || {}; l.fz = { price: linePrice(l, o), split: lineSplit(l, o), disc: c ? c.disc : 0, ptype: c ? c.priceType : null, vat: p.vat || 0, at: o.date }; }); }); }
function nextOrderNo(br) { var m = 0; store.orders.forEach(function (o) { if (o.no && o.branch === br) m = Math.max(m, +o.no.split('-')[2]); }); return 'BY-' + br + '-' + ('00000' + (m + 1)).slice(-6); }
function setReceipts(a) { var was = {}; (store.receipts || []).forEach(function (r) { was[r.id || r.no] = r.status; }); store.receipts = a; store.v++;
  a.forEach(function (r) { if (r.status === 'posted' && r.no && was[r.id || r.no] !== 'posted' && !advFor(r.no) && !r.fromBonus) (r.prepaid ? rcPrepay(r) : autoAdv('yt', r.supplier, r.branch, r.no, r.postedBy || ACC)); }); }
// 100% oldindan: avans faqat shu kirimga yopiladi (yetmasa — qolgani oddiy qarz, to'lov kuni bilan)
function rcPrepay(r) { var L = ledger('yt', r.supplier, r.branch), x = L.invoices.filter(function (i) { return i.no === r.no; })[0]; if (!x || !(L.advance > 0) || !(x.left > 0)) return null; var s = r2(Math.min(L.advance, x.left)), at = nowStr();
  return saveAdv({ kind: 'yt', branch: r.branch, party: r.supplier, date: at.slice(0, 10), auto: true, src: r.no, alloc: [{ no: r.no, sum: s }], status: 'posted', note: '100% oldindan', createdBy: r.postedBy || 'Tizim', createdAt: at, postedBy: 'Tizim', postedAt: at, log: [{ kind: 'auto', who: 'Tizim', at: at, src: r.no }] }); }
// ---- 22: Rollar va ruxsatlar (yagona manba: PERMISSIONS + ROLE_PERMS, tekshiruv — can()) va xodimlar ----
var ROLE_IDS = ['director', 'admin', 'branch', 'operator', 'purchase', 'keeper', 'cashier', 'accountant', 'marker', 'picker', 'driver']; // T9-4a2: 'whmanager' → 'keeper' («Ombor mudiri»)
var ROLE_MAP = { whmanager: 'keeper' };
// T5: «Bosh sahifa turi» — rol sozlamasi (roles[].home); standart rollar uchun boshlang'ich qiymat
var HOME_KINDS = ['director', 'branch', 'operator', 'purchase', 'keeper', 'cashier', 'accountant', 'picker', 'marker', 'driver'];
var HOME_STD = { director: 'director', admin: 'director', branch: 'branch', operator: 'operator', purchase: 'purchase', keeper: 'keeper', cashier: 'cashier', accountant: 'accountant', marker: 'marker', picker: 'picker', driver: 'driver' }; // yagona manba (Medix ERP shundan o'qiydi)
var RL_MODS = ['sales', 'wh', 'money', 'ref', 'rep', 'admin', 'special'];
var PERMISSIONS = [];
function rlP(key, mod, type, roles, x) { PERMISSIONS.push(Object.assign({ key: key, mod: mod, type: type, page: key.split('.')[0], roles: roles.slice(), lock: null, src: 'menu' }, x || {})); }
(function () { var DR = ['director'], BOSS = ['director', 'admin'], BDA = ['branch', 'director', 'admin'], A = ['director', 'admin', 'branch', 'operator', 'purchase', 'keeper', 'cashier', 'accountant'];
  // 1a: har kalitning standart rollari — avvalgi massivlar bilan aynan bir xil (src: qaysi joydan ko'chirilgani)
  var V = { orders: ['director', 'admin', 'branch', 'operator'], ship: ['operator', 'keeper', 'branch', 'director', 'admin'], pick: ['keeper', 'branch', 'director', 'admin'], receipt: ['director', 'admin', 'branch', 'purchase', 'keeper'],
    stock: ['director', 'admin', 'branch', 'operator', 'purchase', 'keeper'], expiry: ['director', 'admin', 'branch', 'purchase', 'keeper'], mk: ['keeper', 'branch', 'director', 'admin'], opening: ['director', 'admin', 'accountant', 'branch'],
    qm: ['operator', 'keeper', 'branch', 'director', 'admin'], hc: ['keeper', 'branch', 'director', 'admin'], qy: ['purchase', 'keeper', 'branch', 'director', 'admin'], prod: ['director', 'admin', 'branch', 'operator', 'purchase', 'accountant', 'keeper'], rep: ['director', 'admin', 'branch', 'accountant'] };
  rlP('orders.view', 'sales', 'view', V.orders); rlP('orders.create', 'sales', 'create', V.orders, { src: 'Orders.CREATE' }); rlP('orders.cancel', 'sales', 'cancel', V.orders, { src: 'OrderCard (o\'z buyurtmasi)' });
  rlP('orders.manage', 'sales', 'cancel', BDA, { src: 'OrderCard.MGR' }); rlP('orders.cancelPick', 'sales', 'cancel', BDA, { src: 'OrderCard.MGR' }); rlP('orders.price', 'sales', 'special', BDA, { src: 'OrderEntry.PRICE_ROLES' });
  rlP('approvals.view', 'sales', 'view', BDA); rlP('approvals.branch', 'sales', 'approve', BDA, { src: 'APPROVAL.branchRoles' }); rlP('approvals.director', 'sales', 'approve', DR, { lock: 'dir', src: 'APPROVAL.directorRoles' });
  rlP('reports.pickers', 'rep', 'view', BDA.concat(['keeper']), { src: "T9-2 (Yig'uvchilar natijasi)" }); rlP('reports.markers', 'rep', 'view', BDA.concat(['keeper']), { src: 'T9-3 (Markirovkachilar natijasi)' }); rlP('orders.queue', 'sales', 'special', BDA, { src: "T9-1 (yig'ish va markirovka vaqtini berish)" });
  rlP('orders.check', 'sales', 'approve', BDA, { src: "T9-4a (hisobdan o'tkazish)" }); rlP('orders.docs', 'sales', 'create', BDA, { src: 'T9-4a (hujjatlashtirish, reys tuzish)' });
  rlP('picking.do', 'sales', 'special', ['picker'], { page: 'orders', src: "T5 (yig'ishni boshlash/yakunlash)" }); 
  rlP('trip.driver', 'sales', 'special', ['driver'], { page: 'shipments', src: 'T5 (haydovchi: reys, yuklash, yetkazish, naqd)' });
  rlP('shipments.view', 'sales', 'view', V.ship); rlP('shipments.trip', 'sales', 'create', ['operator', 'branch', 'director', 'admin'], { src: 'SHIP.planRoles' }); rlP('shipments.ship', 'sales', 'approve', ['keeper', 'branch', 'director', 'admin'], { src: 'SHIP.shipRoles' });
  rlP('receipt.view', 'wh', 'view', V.receipt.concat(['accountant'])); rlP('receipt.create', 'wh', 'create', ['purchase', 'keeper', 'branch', 'director', 'admin'], { src: 'Receipts.create' }); rlP('receipt.accept', 'wh', 'approve', ['keeper', 'branch', 'director', 'admin'], { src: 'T7a (ombor mudiri qabuli)' }); rlP('receipt.post', 'wh', 'approve', ['branch', 'accountant', 'director', 'admin'], { src: 'T7a (o\'tkazish)' }); rlP('receipt.cancel', 'wh', 'cancel', BDA, { src: 'Receipts.cancel' }); rlP('receipt.cancelPosted', 'wh', 'cancel', BOSS, { src: "T7a (o'tkazilganni bekor qilish)" });
  rlP('supplierBonus.confirm', 'money', 'approve', ['accountant', 'director', 'admin'], { page: 'receipt', src: 'T7a (bonus tasdiqlash)' });
  rlP('supplierPay.notify', 'money', 'special', ['accountant', 'director', 'admin'], { page: 'sdebt', src: 'T7b (to\u02BBlov kuni eslatmalari)' }); rlP('supplierBonus.notify', 'money', 'special', ['accountant', 'director', 'admin'], { page: 'sdebt', src: 'T7b (bonus eslatmalari)' });
  rlP('stock.view', 'wh', 'view', V.stock); rlP('expiry.view', 'wh', 'view', V.expiry);
  rlP('transfer.view', 'wh', 'view', ['keeper', 'purchase', 'branch', 'director', 'admin', 'cashier', 'accountant'], { src: 'TR_ROLES.view' }); rlP('transfer.zk', 'wh', 'create', ['keeper', 'branch', 'director', 'admin'], { src: 'TR_ROLES.zk' }); rlP('transfer.ok', 'wh', 'create', ['keeper', 'purchase', 'branch', 'director', 'admin'], { src: 'TR_ROLES.okCreate' }); rlP('transfer.fs', 'wh', 'create', ['purchase', 'branch', 'director', 'admin'], { src: 'TR_ROLES.fsCreate' });
  rlP('transfer.send', 'wh', 'special', ['keeper', 'branch', 'director', 'admin'], { src: 'TR_ROLES.send' }); rlP('transfer.receive', 'wh', 'special', ['keeper', 'branch', 'director', 'admin'], { src: 'TR_ROLES.receive' }); rlP('transfer.resolve', 'wh', 'approve', BDA, { src: 'TR_ROLES.resolve' }); rlP('transfer.quar', 'wh', 'approve', BDA, { src: 'TR_ROLES.quarOut' }); rlP('transfer.cancel', 'wh', 'cancel', BDA, { src: 'TR_ROLES.cancel' });
  rlP('inventory.view', 'wh', 'view', ['keeper', 'branch', 'director', 'admin', 'accountant'], { src: 'IV_ROLES.view' }); rlP('inventory.create', 'wh', 'create', BDA, { src: 'IV_ROLES.create' }); rlP('inventory.count', 'wh', 'create', ['keeper', 'branch', 'director', 'admin'], { src: 'IV_ROLES.count' }); rlP('inventory.openCount', 'wh', 'special', BDA, { src: 'IV_ROLES.openCount' });
  rlP('inventory.approve', 'wh', 'approve', BDA, { src: 'IV_ROLES.approve' }); rlP('inventory.director', 'wh', 'approve', BOSS, { src: 'IV_ROLES.approveDir' });
  // T5: markirovka — faqat Markirovkachi (excl: Direktorga avtomatik berilmaydi)
  rlP('marking.view', 'wh', 'view', ['marker'], { excl: true }); rlP('marking.scan', 'wh', 'create', ['marker'], { excl: true, src: 'yangi (markirovka bosqichi)' }); rlP('marking.export', 'wh', 'special', ['marker'], { excl: true, src: 'yangi (markirovka bosqichi)' });
  rlP('opening.view', 'wh', 'view', V.opening); rlP('opening.list', 'wh', 'view', ['director', 'admin', 'accountant'], { src: 'BQ_ROLES.list' }); rlP('opening.create', 'wh', 'create', ['director', 'admin', 'accountant'], { src: 'BQ_ROLES.create' }); rlP('opening.goods', 'wh', 'create', BOSS, { src: 'BQ_ROLES.goods' }); rlP('opening.approve', 'wh', 'approve', BOSS, { src: 'BQ_ROLES.approve' }); rlP('opening.cancel', 'wh', 'cancel', DR, { lock: 'dir', src: 'BQ_ROLES.cancel' });
  rlP('qm.view', 'wh', 'view', V.qm); rlP('qm.create', 'wh', 'create', ['operator', 'branch', 'director', 'admin'], { src: 'DOC_ROLES.qm.create' }); rlP('qm.approve', 'wh', 'approve', ['keeper', 'branch', 'director', 'admin'], { src: 'DOC_ROLES.qm.post' });
  rlP('hc.view', 'wh', 'view', V.hc); rlP('hc.create', 'wh', 'create', ['keeper', 'branch', 'director', 'admin'], { src: 'DOC_ROLES.hc.create' }); rlP('hc.approve', 'wh', 'approve', BDA, { src: 'HC_RULE.branchRoles' }); rlP('hc.director', 'wh', 'approve', BOSS, { src: 'HC_RULE.directorRoles' });
  rlP('qy.view', 'wh', 'view', V.qy); rlP('qy.create', 'wh', 'create', ['purchase', 'keeper', 'branch', 'director', 'admin'], { src: 'DOC_ROLES.qy.create' }); rlP('qy.approve', 'wh', 'approve', ['keeper', 'branch', 'director', 'admin'], { src: 'DOC_ROLES.qy.post' });
  rlP('payments.view', 'money', 'view', ['cashier', 'accountant', 'branch', 'director', 'admin'], { src: 'PAY_ROLES.view' }); rlP('payments.create', 'money', 'create', ['cashier', 'accountant', 'director', 'admin'], { src: 'PAY_ROLES.create' }); rlP('payments.noncash', 'money', 'special', A.filter(function (r) { return r !== 'cashier'; }), { src: 'PAY_ROLES.cashOnly (teskari)' });
  rlP('payments.mt', 'money', 'create', ['cashier', 'accountant', 'director', 'admin'], { src: 'PAY_ROLES.postMt' }); rlP('payments.yt', 'money', 'create', ['cashier', 'accountant', 'director', 'admin'], { src: 'PAY_ROLES.sendYt' }); rlP('payments.ytDirect', 'money', 'approve', BOSS, { src: 'PaymentDoc (director/admin)' }); rlP('payments.ytApprove', 'money', 'approve', BDA, { src: 'PAY_ROLES.postYt' }); rlP('payments.cancel', 'money', 'cancel', BDA, { src: 'PAY_ROLES.cancel' });
  rlP('cash.view', 'money', 'view', ['cashier', 'accountant', 'branch', 'director', 'admin'], { src: 'MOP_ROLES.cashView' }); rlP('cash.create', 'money', 'create', ['cashier', 'branch', 'director', 'admin'], { src: 'MOP_ROLES.ko' }); rlP('cash.io', 'money', 'create', ['cashier', 'accountant', 'branch', 'director', 'admin'], { src: 'MOP_ROLES.io' });
  rlP('cash.approve', 'money', 'approve', BDA, { src: 'MOP_ROLES.approve' }); rlP('cash.cancel', 'money', 'cancel', BDA, { src: 'MOP_ROLES.cancel' }); rlP('cash.close', 'money', 'special', ['cashier', 'branch', 'director', 'admin'], { src: 'MOP_ROLES.close' }); rlP('cash.closeDiff', 'money', 'special', BDA, { src: 'MOP_ROLES.approve', requiresPin: true }); // 25 (0-e): kunni yopish va farqni imzolash alohida
  rlP('bank.view', 'money', 'view', ['accountant', 'branch', 'director', 'admin', 'cashier'], { src: 'MOP_ROLES.bankView' }); // Y4: kassir bank/Terminal'ni faqat ko'radi rlP('bank.create', 'money', 'create', ['accountant', 'branch', 'director', 'admin'], { src: 'MOP_ROLES.bo' }); rlP('bank.recon', 'money', 'special', ['accountant', 'branch', 'director', 'admin'], { src: 'MOP_ROLES.recon' });
  rlP('cdebt.view', 'money', 'view', ['cashier', 'accountant', 'branch', 'director', 'admin'], { src: 'ADV_ROLES.viewAr' }); rlP('sdebt.view', 'money', 'view', ['accountant', 'branch', 'director', 'admin', 'purchase'], { src: 'ADV_ROLES.viewAp' }); // T12a: Xarid — faqat ko'rish (to'lov, avans, bonus kalitlari yo'q)
  rlP('recon.view', 'money', 'view', ['accountant', 'branch', 'director', 'admin'], { src: 'RECON_ROLES' }); rlP('recon.create', 'money', 'create', ['accountant', 'branch', 'director', 'admin'], { src: 'RECON_ROLES / ADV_ROLES.recon' });
  rlP('adv.create', 'money', 'create', ['accountant', 'branch', 'director', 'admin'], { page: 'cdebt', src: 'ADV_ROLES.create' }); rlP('adv.cancel', 'money', 'cancel', ['accountant', 'branch', 'director', 'admin'], { page: 'cdebt', src: 'ADV_ROLES.cancel' }); rlP('adv.cancelAuto', 'money', 'cancel', BDA, { page: 'cdebt', src: 'ADV_ROLES.cancelAuto' });
  rlP('products.view', 'ref', 'view', V.prod); rlP('products.create', 'ref', 'create', ['director', 'admin', 'purchase'], { src: 'Products.EDIT_ROLES' });
  rlP('clients.view', 'ref', 'view', A); rlP('clients.create', 'ref', 'create', ['operator', 'branch', 'director', 'admin'], { src: 'KT_R.createC' }); rlP('clients.contact', 'ref', 'create', ['operator', 'branch', 'director', 'admin'], { src: 'KT_R.contactC' }); rlP('clients.terms', 'ref', 'special', BDA, { src: 'KT_R.termsC' }); rlP('clients.block', 'ref', 'cancel', BDA, { src: 'KT_R.blockC' });
  rlP('clients.lic', 'ref', 'special', ['operator', 'purchase', 'branch', 'director', 'admin'], { src: 'KT_R.lic' }); rlP('clients.bank', 'ref', 'special', ['accountant', 'director', 'admin'], { src: 'KT_R.bank' }); rlP('clients.all', 'ref', 'special', BOSS, { src: 'KT_R.all' });
  rlP('suppliers.view', 'ref', 'view', A); rlP('suppliers.create', 'ref', 'create', ['purchase', 'director', 'admin'], { src: 'KT_R.createS' }); rlP('suppliers.contact', 'ref', 'create', ['purchase', 'director', 'admin'], { src: 'KT_R.contactS' }); rlP('suppliers.terms', 'ref', 'special', ['purchase', 'branch', 'director', 'admin'], { src: 'KT_R.termsS' }); rlP('suppliers.block', 'ref', 'cancel', ['purchase', 'branch', 'director', 'admin'], { src: 'KT_R.blockS' });
  rlP('prices.view', 'ref', 'view', A); rlP('prices.create', 'ref', 'create', ['purchase', 'branch', 'director', 'admin'], { src: 'NR_R.create' }); rlP('prices.approve', 'ref', 'approve', BDA, { src: 'NR_R.approve' }); rlP('prices.below', 'ref', 'approve', DR, { lock: 'dir', src: 'NR_R.below' });
  rlP('prices.all', 'ref', 'special', BOSS, { src: 'NR_R.all' }); rlP('prices.cost', 'ref', 'special', ['director', 'admin', 'branch', 'accountant', 'purchase'], { src: 'NR_R.cost' });
  rlP('lookups.view', 'ref', 'view', A); rlP('lookups.makers', 'ref', 'create', ['purchase', 'director', 'admin'], { src: 'LK_R.makers' }); rlP('lookups.cats', 'ref', 'create', ['purchase', 'director', 'admin'], { src: 'LK_R.cats' }); rlP('lookups.units', 'ref', 'create', BOSS, { src: 'LK_R.units' }); rlP('lookups.ptypes', 'ref', 'create', BOSS, { src: 'LK_R.ptypes' });
  rlP('lookups.regions', 'ref', 'create', BDA, { src: 'LK_R.regions' }); rlP('lookups.fleet', 'ref', 'create', BDA, { src: 'LK_R.fleet' }); rlP('lookups.items', 'ref', 'create', ['accountant', 'director', 'admin'], { src: 'LK_R.items' });
  rlP('reports.view', 'rep', 'view', V.rep); rlP('reports.own', 'rep', 'view', ['operator'], { src: "T12a (o'z savdosi — Savdo hisobotida faqat o'z buyurtmalari)" }); rlP('reports.all', 'rep', 'special', ['director', 'admin', 'accountant'], { src: 'Reports.brLocked' });
  ['company', 'branches', 'warehouses', 'staff', 'roles', 'audit', 'settings'].forEach(function (k) { rlP(k + '.view', 'admin', 'view', BOSS); });
  rlP('company.edit', 'admin', 'create', BOSS, { src: 'AdminOrg.canEdit' }); rlP('staff.edit', 'admin', 'create', BOSS, { src: 'AdminStaff.ro' });
  rlP('special.cost', 'special', 'special', ['director', 'admin', 'branch', 'accountant'], { page: null, src: 'COST_ROLES' }); rlP('special.ctrl', 'special', 'special', V.mk, { page: null, src: 'menu' });
  rlP('special.whs', 'special', 'special', ['keeper'], { page: null, excl: true, src: "WizStaff/AdminStaff (role === 'keeper')" }); rlP('special.till', 'special', 'special', ['cashier'], { page: null, excl: true, src: "WizStaff/AdminStaff (role === 'cashier')" });
})();
PERMISSIONS.forEach(function (p) { if (p.page === 'transfer') p.roles = p.roles.filter(function (r) { return r !== 'cashier'; }); if (p.key === 'audit.view' || p.key === 'staff.view') p.roles = p.roles.concat(['branch']); });
// 1a: yangi standart rollar — standart ruxsatlari (tannarx yo'q, FEFO PIN yo'q)
var NEW_ROLE_PERMS = { picker: ['orders.view', 'picking.do'], driver: ['trip.driver'], marker: ['orders.view', 'marking.view', 'marking.scan', 'marking.export'],
  keeper: ['orders.view', 'orders.cancelPick', 'orders.queue', 'orders.check', 'orders.docs', 'reports.pickers', 'reports.markers', 'transfer.resolve', 'shipments.trip'] }; // T9-4a2: Ombor mudiri = eski Ombor mudiri + eski Ombor mudiri kalitlari // T9-4a: Jo'natish menyusi o'rniga panelning «Hujjatlashtirish» yorlig'i
Object.keys(NEW_ROLE_PERMS).forEach(function (r) { NEW_ROLE_PERMS[r].forEach(function (k) { PERMISSIONS.forEach(function (p) { if (p.key === k && p.roles.indexOf(r) < 0) p.roles.push(r); }); }); });
PERMISSIONS.forEach(function (p) { if (NEW_ROLE_PERMS.marker.indexOf(p.key) < 0) p.roles = p.roles.filter(function (r) { return r !== 'marker'; }); if (p.key === 'receipt.post' || /^(marking\.|picking\.do|trip\.driver)/.test(p.key)) p.roles = p.roles.filter(function (r) { return r !== 'keeper'; }); }); // T9-3: Markirovkachi — faqat Panel va Buyurtmalar (tannarxsiz)
var PERM_BY = {}; PERMISSIONS.forEach(function (p) { PERM_BY[p.key] = p; });
var NAV_PERM = { orders: 'orders.view', approvals: 'approvals.view', shipments: 'shipments.view', delivery: 'shipments.view', interbranch: 'orders.view', receipt: 'receipt.view', stock: 'stock.view', expiry: 'expiry.view', transfer: 'transfer.view', inventory: 'inventory.view', marking: 'marking.view', opening: 'opening.view',
  creturns: 'qm.view', writeoff: 'hc.view', sreturns: 'qy.view', payments: 'payments.view', cash: 'cash.view', bank: 'bank.view', cdebt: 'cdebt.view', sdebt: 'sdebt.view', recon: 'recon.view', products: 'products.view', clients: 'clients.view', suppliers: 'suppliers.view', prices: 'prices.view', lookups: 'lookups.view', reports: 'reports.view', pickrep: 'reports.pickers', markrep: 'reports.markers',
  company: 'company.view', branches: 'branches.view', warehouses: 'warehouses.view', staff: 'staff.view', roles: 'roles.view', audit: 'audit.view', settings: 'settings.view' };
function rlDefault(role) { var o = {}; PERMISSIONS.forEach(function (p) { if (role === 'director' ? !p.excl : (p.lock !== 'dir' && p.roles.indexOf(role) >= 0)) o[p.key] = true; }); return o; }
function rlLock(role, key) { var p = PERM_BY[key]; if (role === 'director') return 'dir'; if (p && p.excl) return null; if (p && p.lock === 'dir') return 'only'; return null; }
function permsOf(role) { var m = store.rl && store.rl.perms[role]; return m || {}; }
function can(role, perm) { role = ROLE_MAP[role] || role; if (role === 'director') return !(PERM_BY[perm] && PERM_BY[perm].excl); return !!permsOf(role)[perm]; }
function navCan(role, page) { if (page === 'home') return true; if (page === 'reports' && (can(role, 'reports.pickers') || can(role, 'reports.markers') || can(role, 'reports.own'))) return true; var k = NAV_PERM[page]; return !!k && can(role, k); }
// T12a: menyuda ko'rinish — panel rollari (yig'uvchi, markirovkachi) uchun faqat Panel; sahifalar panel ichidan ochilishda davom etadi (navCan)
var PANEL_ONLY = ['picker', 'marker'];
function menuCan(role, page) { if (page === 'home') return true; if (PANEL_ONLY.indexOf(rlHome(role)) >= 0) return false; return navCan(role, page); }
function whoCan(perm) { return ((store.rl && store.rl.roles) || []).filter(function (r) { return r.active !== false && can(r.id, perm); }).map(function (r) { return r.id; }); }
function rlRoles() { return (store.rl && store.rl.roles) || []; }
function rlHome(role) { role = ROLE_MAP[role] || role; var r = rlRoles().filter(function (x) { return x.id === role; })[0], h = r && (ROLE_MAP[r.home] || r.home); return (h && HOME_KINDS.indexOf(h) >= 0) ? h : (HOME_STD[role] || 'operator'); }
// T9-4a2: eski rol id'lari (whmanager) — xodimlar, uy turi va huquqlar yangi rolga o'tkaziladi; nusxa rollar ham
function rlMigrate() { if (!store.rl) return; store.rl.roles = store.rl.roles.filter(function (r) { return !ROLE_MAP[r.id]; }); store.rl.roles.forEach(function (r) { if (ROLE_MAP[r.home]) r.home = ROLE_MAP[r.home]; if (ROLE_MAP[r.from]) r.from = ROLE_MAP[r.from]; });
  Object.keys(ROLE_MAP).forEach(function (o) { var n = ROLE_MAP[o], m = store.rl.perms[o]; if (m) { store.rl.perms[n] = Object.assign({}, m, store.rl.perms[n] || {}); delete store.rl.perms[n]['receipt.post']; delete store.rl.perms[o]; } });
  var seen = {}; store.emps = (store.emps || []).filter(function (e) { if (ROLE_MAP[e.role]) e.role = ROLE_MAP[e.role]; var k = e.first + '|' + e.last + '|' + e.branch; if (seen[k]) return false; seen[k] = 1; return true; }); }
function allBr(role) { var r = rlRoles().filter(function (x) { return x.id === role; })[0]; return !!r && (r.scope === 'all' || can(role, 'reports.all')); } // «barcha filiallar» doirasi — rol sozlamasidan
function rlToggle(perms, key, on) { var p = PERM_BY[key], m = Object.assign({}, perms), off = []; if (!p) return { perms: m, off: off };
  if (on) { m[key] = true; if (p.page && p.type !== 'view' && PERM_BY[p.page + '.view']) m[p.page + '.view'] = true; }
  else { delete m[key]; if (p.type === 'view') PERMISSIONS.forEach(function (q) { if (q.key !== key && q.page === p.page && m[q.key]) { delete m[q.key]; off.push(q.key); } }); }
  return { perms: m, off: off }; }
function rlDiff(a, b) { var add = [], rem = []; PERMISSIONS.forEach(function (p) { if (!!a[p.key] !== !!b[p.key]) (b[p.key] ? add : rem).push(p.key); }); return { add: add, rem: rem }; }
function rlSave(roles, perms, who) { if (store.rlFail) { store.rlFail = false; return { err: 'fail' }; }
  if (!(store.emps || []).some(function (e) { return e.role === 'director' && e.status !== 'blocked'; })) return { err: 'noDirector' };
  var P = JSON.parse(JSON.stringify(perms)); P.director = rlDefault('director'); var old = store.rl ? store.rl.perms : {}, diff = [];
  Object.keys(P).forEach(function (r) { var x = rlDiff(old[r] || {}, P[r] || {}); x.add.forEach(function (k) { diff.push({ f: r, from: '', to: k, op: '+' }); }); x.rem.forEach(function (k) { diff.push({ f: r, from: k, to: '', op: '-' }); }); });
  store.rl = { roles: JSON.parse(JSON.stringify(roles)), perms: P };
  auditAdd({ kind: 'perm', who: who, obj: 'Rollar va ruxsatlar', objType: 'role', page: 'roles', text: diff.length + ' ta ruxsat', diff: diff }); store.v++; return { ok: true }; }
var EMP_LIMIT = 40, LOGIN_URL = 'https://medix.uz/kirish';
function latLogin(s) { return toLat(String(s || '')).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function empByLogin(login, exceptId) { return (store.emps || []).filter(function (e) { return e.login === login && e.id !== exceptId; })[0] || null; }
function empLoginFor(first, last, exceptId) { var b = latLogin(first).slice(0, 1) + '.' + latLogin(last); if (b === '.') return ''; var n = 1, x = b; while (empByLogin(x, exceptId)) { n++; x = b + n; } return x; }
function empName(e) { return e ? e.first + ' ' + e.last : ''; }
function empPw() { var A = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789', o = ''; for (var i = 0; i < 10; i++) o += A[Math.floor(Math.random() * A.length)]; return o; }
function empCash(name) { return ACCOUNTS.filter(function (a) { return a.kind === 'cash' && Object.keys(a).some(function (k) { return a[k] === name; }); }).map(function (a) { return a.id; }); }
function seedRl() { store.rl = { roles: ROLE_IDS.map(function (id) { return { id: id, std: true, scope: id === 'director' || id === 'admin' ? 'all' : 'own', active: true, home: HOME_STD[id] }; }), perms: {} };
  ROLE_IDS.forEach(function (r) { store.rl.perms[r] = rlDefault(r); }); store.emps = []; store.audit = [];
  EMP0.forEach(function (x, i) { var e = { id: 'e' + (i + 1), last: x[0], first: x[1], mid: x[2], role: x[3], branch: x[4], phone: x[5], status: x[6], whs: [], cash: [], login: '' };
    e.blockReason = x[7] || ''; e.login = empLoginFor(e.first, e.last, e.id); if (can(e.role, 'special.whs')) e.whs = e.branch === 'TSH' ? ['Asosiy ombor', 'Sovuq ombor'] : ['Asosiy ombor']; if (can(e.role, 'special.till')) e.cash = empCash(empName(e)); store.emps.push(e); }); rlMigrate(); empApply(); }
function empSave(e, who) { var c = JSON.parse(JSON.stringify(e)); if (!c.id) { var m = 0; (store.emps || []).forEach(function (x) { m = Math.max(m, +x.id.slice(1)); }); c.id = 'e' + (m + 1); } var a = (store.emps || []).slice(), i = a.map(function (x) { return x.id; }).indexOf(c.id), o = i >= 0 ? a[i] : null; if (i >= 0) a[i] = c; else a.push(c); store.emps = a; empApply();
  // 23: har xodim o'zgarishi auditga
  if (store.wizardDone !== false && store.audit) { var W = who || store.actor || DIRECTOR, nm = c.first + ' ' + c.last, RL = function (r) { return { director: 'Direktor', admin: 'Bosh administrator', branch: 'Filial rahbari', operator: 'Operator', purchase: "Xarid bo'yicha mas'ul", keeper: 'Ombor mudiri', cashier: 'Kassir', accountant: 'Buxgalter', marker: 'Markirovkachi', picker: "Yig'uvchi", driver: 'Haydovchi' }[r] || ((rlRoles().filter(function (x) { return x.id === r; })[0] || {}).name) || r; }, BR = function (b) { return b || 'Barcha filiallar'; }, ST = { new: 'Kirmagan', active: 'Faol', blocked: 'Bloklangan' };
    if (!o) auditAdd({ kind: 'create', act: 'create', who: W, obj: nm, objType: 'emp', page: 'staff', branch: c.branch, text: RL(c.role) + ' · ' + BR(c.branch), diff: [{ f: 'Rol', from: '', to: RL(c.role) }, { f: 'Filial', from: '', to: BR(c.branch) }, { f: 'Login', from: '', to: c.login }] });
    else { var d = []; if (o.role !== c.role) d.push({ f: 'Rol', from: RL(o.role), to: RL(c.role) }); if ((o.branch || null) !== (c.branch || null)) d.push({ f: 'Filial', from: BR(o.branch), to: BR(c.branch) }); if (o.phone !== c.phone) d.push({ f: 'Telefon', from: o.phone, to: c.phone }); if (o.login !== c.login) d.push({ f: 'Login', from: o.login, to: c.login }); if ((o.first + o.last + (o.mid || '')) !== (c.first + c.last + (c.mid || ''))) d.push({ f: 'F.I.Sh.', from: o.first + ' ' + o.last, to: nm });
      if (o.status !== c.status) d.push({ f: 'Holat', from: ST[o.status] || o.status, to: ST[c.status] || c.status }); if (c.blockReason && o.blockReason !== c.blockReason && c.status === 'blocked') d.push({ f: 'Sabab', from: '', to: c.blockReason });
      if (d.length) auditAdd({ kind: o.status !== c.status ? (c.status === 'blocked' ? 'block' : 'unblock') : 'edit', act: o.status !== c.status && c.status === 'blocked' ? 'block' : 'change', who: W, obj: nm, objType: 'emp', page: 'staff', branch: c.branch, text: d.map(function (x) { return x.f; }).join(', '), diff: d }); } }
  store.v++; return c; }
function empAct(id, kind, text, who, diff) { var e = (store.emps || []).filter(function (x) { return x.id === id; })[0]; if (!e) return; auditAdd({ kind: kind, act: 'change', who: who || store.actor || DIRECTOR, obj: e.first + ' ' + e.last, objType: 'emp', page: 'staff', branch: e.branch, text: text, diff: diff || [] }); }
function rlFinish(who, x) { auditAdd({ kind: 'wizardDone', act: 'setting', who: who, obj: 'Sozlash ustasi', objType: 'setting', page: 'company', text: 'Sozlash ustasi yakunlandi', data: x || null }); store.wizardDone = true; store.v++; }

// ---- 23: Boshqaruv — filiallar, omborlar va zonalar, audit jurnali, sozlamalar, profil ----
var ZT_KEY = { recv: 'qabul', store: 'asosiy', cold: 'sovuq', ctrl: 'seyf', quar: 'karantin', ship: null };
var ZT_REQ = ['recv', 'quar', 'ship'];
function seedBs() {
  store.co = { name: 'Medix Group' };
  store.cfg = JSON.parse(JSON.stringify(CFG0));
  store.vatHist = [{ rate: 15, from: '01.10.2019', who: 'SMARTUP importi' }, { rate: 12, from: '01.01.2023', who: DIRECTOR }];
  store.brs = BR_INFO.map(function (b) { return Object.assign(JSON.parse(JSON.stringify(b)), { active: true }); });
  store.whs = WH_SRC.map(function (w) { var br = BRANCHES[w[1] - 1].code, cold = /Sovuq/.test(w[2]) || ctrlAllowed(br, w[2]), ctrl = ctrlAllowed(br, w[2]);
    var z = [['Qabul', 'recv'], ['Asosiy saqlash', 'store']]; if (cold) z.push(['Sovuq saqlash', 'cold']); if (ctrl) z.push(['Seyf', 'ctrl']); z.push(['Karantin', 'quar'], ["Jo'natish", 'ship']);
    return { id: w[0], branch: br, name: w[2], address: w[3], ctrl: ctrl, active: true, zones: z.map(function (x, i) { return { id: w[0] + '-z' + (i + 1), name: x[0], type: x[1], key: ZT_KEY[x[1]], open: x[1] === 'store' || x[1] === 'cold' || x[1] === 'ctrl', active: true }; }) }; });
  store.sess = {}; store.pins = {}; store.pinCode = {}; store.locks = {}; EMPLOYEES.forEach(function (e) { store.pinCode[e.name] = '1234'; if (pinNeeded(e.role)) store.pins[e.name] = '01.10.2026'; });
  store.audit = [
    { kind: 'wizardDone', act: 'setting', who: DIRECTOR, at: '01.10.2026 08:40:12', obj: 'Sozlash ustasi', objType: 'setting', page: 'company', text: 'Sozlash ustasi yakunlandi, tizim ishga tushirildi' },
    { kind: 'cfg', act: 'setting', who: DIRECTOR, at: '01.10.2026 08:46:30', obj: 'Muddat ogohlantirish chegarasi', objType: 'setting', page: 'settings', key: 'expiryWarnDays', text: 'Ombor sozlamasi', diff: [{ f: 'Muddat ogohlantirish chegarasi', from: '60 kun', to: '90 kun' }] },
    { kind: 'perm', who: DIRECTOR, at: '02.10.2026 16:10:44', obj: 'Rollar va ruxsatlar', objType: 'role', page: 'roles', text: '2 ta ruxsat', diff: [{ f: 'branch', from: '', to: 'audit.view', op: '+' }, { f: 'branch', from: '', to: 'staff.view', op: '+' }] },
    { kind: 'perm', who: DIRECTOR, at: '03.10.2026 10:05:18', obj: 'Rollar va ruxsatlar', objType: 'role', page: 'roles', text: '1 ta ruxsat', diff: [{ f: 'cashier', from: 'transfer.view', to: '', op: '-' }] }
  ];
}
function auditAdd(e) { var x = Object.assign({ at: nowStr() + ':' + ('0' + (new Date().getSeconds())).slice(-2) }, e); store.audit = (store.audit || []).concat([x]); store.v++; return x; }
function auAct(k) { k = String(k || ''); if (/^(create|made|new)/.test(k)) return 'create'; if (/cancel|reject|annul/.test(k)) return 'cancel'; if (/^(post|approv|confirm|accept|finish|done|close|deliver|receiv|ship|transit|sent)/.test(k)) return 'approve'; return 'change'; }
function auHash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
var AU_IP = { TSH: '10.0.1.', SMQ: '10.0.2.', BXR: '10.0.3.', FRG: '10.0.4.' };
function auDevice(e, seed) { var r = e && e.role, br = (e && e.branch) || 'TSH', n = 20 + auHash(seed + (e ? e.name : '')) % 60; return (r === 'keeper' ? 'Android planshet · Medix' : r === 'director' ? 'macOS · Safari 18' : 'Windows · Chrome 129') + ' · ' + (AU_IP[br] || '10.0.1.') + n; }
function auditRaw() { var out = [], seen = {};
  function add(at, who, kind, obj, x) { if (!at || !who) return; var s = String(at).replace(',', ''), sec = s.length > 16 ? s.slice(17, 19) : ('0' + auHash(obj + kind + s) % 60).slice(-2), t = pDT(s.slice(0, 16)); if (t == null) return; var e = empByName(who);
    out.push({ id: 'a' + out.length, at: s.slice(0, 16) + ':' + sec, t: t + (+sec) * 1000, who: who, role: e ? e.role : null, branch: x.branch !== undefined ? x.branch : e ? e.branch : null, act: x.act || auAct(kind), kind: kind, obj: obj, objType: x.type, page: x.page || null, text: x.text || '', diff: x.diff || [], device: x.device || auDevice(e, s), ctrl: !!x.ctrl }); }
  var ctrlOf = function (lines) { return (lines || []).some(function (l) { var p = prodById(l.pid); return p && p.ctrl; }); };
  (store.receipts || []).forEach(function (r) { (r.history || []).forEach(function (h) { add(h.time, h.who, histKind(h), r.no || 'Qoralama', { type: 'kr', page: 'receipt', branch: r.branch, text: h.action, ctrl: ctrlOf(r.lines), diff: (h.changes || []).map(function (c) { return { f: c.field || c.label || '', from: c.from, to: c.to }; }) }); }); });
  (store.orders || []).forEach(function (o) { orderLog(o).forEach(function (h) { add(h.at, h.who, h.kind, o.no || 'Qoralama', { type: 'by', page: 'orders', branch: o.branch, text: h.reason || h.note || '', ctrl: ctrlOf(o.lines) }); }); });
  var gen = function (list, type, page, br) { (list || []).forEach(function (x) { (x.log || []).forEach(function (h) { add(h.at, h.who, h.kind, x.no || 'Qoralama', { type: type || x.kind, page: typeof page === 'function' ? page(x) : page, branch: br ? br(x) : x.branch, text: h.reason || h.note || '', ctrl: ctrlOf(x.lines) }); }); }); };
  gen(store.pays, null, 'payments'); gen(store.mops, null, function (m) { return m.kind === 'bo' ? 'bank' : 'cash'; }); gen(store.recons, 'as', 'recon');
  gen(store.transfers, 'tr', 'transfer', function (t) { return t.from && t.from.branch; }); gen(store.bqs, 'bq', 'opening'); gen(store.nos, 'no', 'prices');
  ['qm', 'hc', 'qy'].forEach(function (k) { gen((store.docs || {})[k], k, { qm: 'creturns', hc: 'writeoff', qy: 'sreturns' }[k]); });
  gen(store.invs, 'iv', 'inventory');
  (store.kts || []).forEach(function (c) { (c.hist || []).forEach(function (h) { add(h.at, h.who, h.kind, c.name, { type: 'kt', page: c.cust != null ? 'clients' : 'suppliers', branch: null, text: '', diff: (h.changes || []).map(function (x) { return { f: x.label, from: x.from, to: x.to, br: x.br }; }) }); }); });
  (store.audit || []).forEach(function (a) { var s = String(a.at); add(s.length === 16 ? s + ':' + ('0' + auHash(a.kind + s) % 60).slice(-2) : s, a.who, a.kind, a.obj || '', { act: a.act || ({ perm: 'perm', cfg: 'setting', login: 'login', loginFail: 'loginFail', block: 'block' }[a.kind]) || auAct(a.kind), type: a.objType, page: a.page, branch: a.branch, text: a.text, diff: a.diff, device: a.device }); });
  // Kirishlar: har xodim har kuni birinchi harakatidan 5–25 daqiqa oldin kirgan
  var first = {}; out.forEach(function (a) { if (!a.role) return; var k = a.who + '|' + a.at.slice(0, 10); if (!first[k] || a.t < first[k]) first[k] = a.t; });
  Object.keys(first).forEach(function (k) { var w = k.split('|')[0], t = first[k] - (5 + auHash(k) % 20) * 60000, s = fDT(t); add(s + ':' + ('0' + auHash(k + 's') % 60).slice(-2), w, 'login', w, { act: 'login', type: 'emp', page: 'staff', text: 'Muvaffaqiyatli' }); });
  [['Shahlo Nazarova', '04.10.2026 08:31:07', 3], ['Malika Yusupova', '02.10.2026 08:52:40', 2], ['Nilufar Tosheva', '03.10.2026 09:14:22', 1], ['Bekzod Tursunov', '01.10.2026 18:47:09', 1]].forEach(function (f) { for (var i = 0; i < f[2]; i++) add(f[1].slice(0, 14) + ('0' + (+f[1].slice(14, 16) + i)).slice(-2) + f[1].slice(16), f[0], 'loginFail', f[0], { act: 'loginFail', type: 'emp', page: 'staff', text: "Noto'g'ri parol" }); });
  out.sort(function (a, b) { return b.t - a.t; }); out.forEach(function (a, i) { a.id = 'a' + (out.length - i); }); return out; }
// 24 (0-e): Tarix va Audit uchun yagona harakat turlari lug'ati
var ACT_KINDS = ['create', 'change', 'send', 'post', 'cancel', 'return', 'confirm', 'reject', 'pinSign', 'print'];
function histKind(h) { if (h.kind !== 'status') return h.kind; return /bekor/i.test(h.action || '') ? 'cancel' : /yubor/i.test(h.action || '') ? 'send' : 'post'; }
function auditList() { return memo('audit', auditRaw); }
function lastLogin(name) { var L = auditList(); for (var i = 0; i < L.length; i++) if (L[i].who === name && L[i].act === 'login') return L[i]; return null; }
// Filial / ombor holati: yopish shartlari raqamlar bilan
function bsStock(br, wh, zone) { var B = batches().filter(function (b) { return b.qty > 0 && (!br || b.branch === br) && (!wh || b.wh === wh) && (!zone || b.zone === zone); }), P = {};
  B.forEach(function (b) { P[b.pid] = 1; }); return { qty: B.reduce(function (s, b) { return s + b.qty; }, 0), val: r2(B.reduce(function (s, b) { return s + b.qty * (b.cost || 0); }, 0)), prods: Object.keys(P).length, ctrl: B.filter(function (b) { return b.p && b.p.ctrl; }).reduce(function (s, b) { return s + b.qty; }, 0) }; }
function bsOpenDocs(br, wh) { var O = {}, inc = function (k, ok) { if (ok) O[k] = (O[k] || 0) + 1; }, open = function (s) { return s === 'draft' || s === 'pending'; };
  (store.orders || []).forEach(function (o) { inc('by', o.branch === br && (!wh || o.wh === wh) && open(o.status)); });
  (store.receipts || []).forEach(function (r) { inc('kr', r.branch === br && (!wh || r.wh === wh) && open(r.status)); });
  ['qm', 'hc', 'qy'].forEach(function (k) { ((store.docs || {})[k] || []).forEach(function (x) { inc(k, x.branch === br && (!wh || x.wh === wh) && open(x.status)); }); });
  if (!wh) { (store.pays || []).forEach(function (p) { inc(p.kind, p.branch === br && open(p.status)); }); (store.mops || []).forEach(function (m) { inc(m.kind, m.branch === br && open(m.status)); }); }
  return O; }
function bsTransit(br, wh) { return (store.transfers || []).filter(function (t) { return t.status === 'transit' && [t.from, t.to].some(function (x) { return x && x.branch === br && (!wh || x.wh === wh); }); }).length; }
function bsCustDebt(br) { return r2(custsIn(br).reduce(function (s, c) { return s + (ledger('mt', c.id, br).debt || 0); }, 0)); }
function bsSupDebt(br) { return r2(SUPPLIERS.reduce(function (s, x) { return s + (ledger('yt', x.name, br).debt || 0); }, 0)); }
function bsMoney(br) { return r2(ACCOUNTS.filter(function (a) { return a.branch === br; }).reduce(function (s, a) { return s + accBalance(a.id); }, 0)); }
function bsBranchCheck(br) { var st = bsStock(br), od = bsOpenDocs(br), n = Object.keys(od).reduce(function (s, k) { return s + od[k]; }, 0);
  var c = [{ key: 'stock', ok: st.qty === 0, qty: st.qty, val: st.val, page: 'stock' }, { key: 'docs', ok: n === 0, n: n, by: od, page: 'orders' }, { key: 'cdebt', ok: bsCustDebt(br) === 0, sum: bsCustDebt(br), page: 'cdebt' },
    { key: 'sdebt', ok: bsSupDebt(br) === 0, sum: bsSupDebt(br), page: 'sdebt' }, { key: 'money', ok: bsMoney(br) === 0, sum: bsMoney(br), page: 'cash' }, { key: 'transit', ok: bsTransit(br) === 0, n: bsTransit(br), page: 'transfer' }];
  return { list: c, ok: c.every(function (x) { return x.ok; }) }; }
function bsWhCheck(br, wh) { var st = bsStock(br, wh), od = bsOpenDocs(br, wh), n = Object.keys(od).reduce(function (s, k) { return s + od[k]; }, 0), tr = bsTransit(br, wh);
  var c = [{ key: 'stock', ok: st.qty === 0, qty: st.qty, val: st.val, page: 'stock' }, { key: 'docs', ok: n === 0, n: n, by: od, page: 'orders' }, { key: 'transit', ok: tr === 0, n: tr, page: 'transfer' }]; return { list: c, ok: c.every(function (x) { return x.ok; }) }; }
function bsDocCount(br) { var n = 0, f = function (L) { (L || []).forEach(function (x) { if (x.branch === br && x.no && x.status !== 'draft') n++; }); };
  f(store.orders); f(store.receipts); f(store.pays); f(store.mops); f(store.sales); f(store.bqs); f(store.nos); ['qm', 'hc', 'qy'].forEach(function (k) { f((store.docs || {})[k]); }); (store.transfers || []).forEach(function (t) { if (t.from && t.from.branch === br) n++; }); return n; }
function bsSave(kind, list, who, obj, diff, page) { store[kind] = list; if (diff && diff.length) auditAdd({ kind: 'edit', act: 'change', who: who, obj: obj, objType: kind === 'brs' ? 'branch' : 'wh', page: page, text: diff.map(function (x) { return x.f; }).join(', '), diff: diff }); else store.v++; }
// Sozlamalar
function cfgMeta(k) { var L = (store.audit || []).filter(function (a) { return a.kind === 'cfg' && a.key === k; }); return L.length ? L[L.length - 1] : null; }
function cfgSave(changes, who) { var c = Object.assign({}, store.cfg); changes.forEach(function (x) { c[x.key] = x.to; }); store.cfg = c; changes.forEach(function (x) { auditAdd({ kind: 'cfg', act: 'setting', who: who, obj: x.label, objType: 'setting', page: 'settings', key: x.key, text: x.section || '', diff: [{ f: x.label, from: x.fromText, to: x.toText }] }); }); }
function vatAdd(rate, from, who) { store.vatHist = (store.vatHist || []).concat([{ rate: rate, from: from, who: who }]); auditAdd({ kind: 'cfg', act: 'setting', who: who, obj: 'QQS stavkasi', objType: 'setting', page: 'settings', key: 'vat', text: from + ' dan', diff: [{ f: 'QQS stavkasi', from: CONFIG.vat + '%', to: rate + '%' }] }); }
function expiryWarn(br, days) { var W = days == null ? CONFIG.expiryWarnDays : days; return batches().filter(function (b) { return b.qty > 0 && (!br || br === 'ALL' || b.branch === br) && b.days != null && b.days >= 0 && b.days <= W; }).length; }
function pendingOrders() { return (store.orders || []).filter(function (o) { return o.status === 'pending'; }).length; }
function docPrefixes() { var M = {}, f = function (L, pre) { (L || []).forEach(function (x) { if (!x.no) return; var a = x.no.split('-'), k = a[0]; if (pre && k !== pre) return; M[k] = M[k] || { prefix: k, last: '', n: 0 }; if (x.no > M[k].last) M[k].last = x.no; M[k].n++; }); };
  f(store.orders); f(store.receipts); f(store.sales); f(store.pays); f(store.mops); f(store.transfers); f(store.bqs); f(store.nos); f(store.recons); f(store.advs); f(store.invs); f(store.trips); ['qm', 'hc', 'qy'].forEach(function (k) { f((store.docs || {})[k]); });
  return Object.keys(M).sort().map(function (k) { return M[k]; }); }
function empAudit(name, n) { return auditList().filter(function (a) { return a.who === name; }).slice(0, n || 50); }
function sessionsOf(name) { if (!store.sess[name]) { var e = empByName(name) || {}, ip = AU_IP[e.branch || 'TSH'] || '10.0.1.', ll = lastLogin(name);
    store.sess[name] = [{ id: 's1', device: 'Windows 11', browser: 'Chrome 129', ip: ip + (20 + auHash(name) % 50), last: nowStr(), cur: true }, { id: 's2', device: 'Android 14 · planshet', browser: 'Medix ilovasi', ip: ip + (70 + auHash(name + 'b') % 50), last: ll ? ll.at.slice(0, 16) : '03.10.2026 17:40', cur: false }, { id: 's3', device: 'macOS 15', browser: 'Safari 18', ip: '85.143.' + (auHash(name) % 200) + '.' + (auHash(name + 'c') % 250), last: '02.10.2026 21:14', cur: false }]; }
  return store.sess[name]; }
function pinNeeded(role) { return PERMISSIONS.some(function (p) { return p.requiresPin && can(role, p.key); }); }
// 24 (0-a): PIN — shaxsiy imzo. Tasdiqlovchi: shu filialda shu ruxsatga ega faol xodim
function pinApprovers(perm, br) { return (store.emps || []).filter(function (e) { return e.status !== 'blocked' && (e.branch == null || !br || br === 'ALL' || e.branch === br) && can(e.role, perm); }).sort(function (a, b) { return (a.branch ? 0 : 1) - (b.branch ? 0 : 1); }).map(function (e) { return { name: e.first + ' ' + e.last, role: e.role, branch: e.branch }; }); }
function pinLock(name) { var l = (store.locks || {})[name]; return l && l.until && l.until > Date.now() ? l : null; }
function pinCheck(name, pin, perm, br) { if (!name) return { err: 'who' }; if (perm && !pinApprovers(perm, br).some(function (a) { return a.name === name; })) return { err: 'perm' };
  var lk = pinLock(name); if (lk) return { err: 'locked', until: lk.until, min: Math.ceil((lk.until - Date.now()) / 60000) };
  store.locks = Object.assign({}, store.locks); var l = store.locks[name] && !store.locks[name].until ? store.locks[name] : { tries: 0 };
  if ((store.pinCode || {})[name] && store.pinCode[name] === pin) { delete store.locks[name]; return { ok: true }; }
  l = { tries: l.tries + 1 }; if (l.tries >= CONFIG.pinTries) { l.until = Date.now() + CONFIG.pinLockMin * 60000; store.locks[name] = l; return { err: 'locked', until: l.until, min: CONFIG.pinLockMin }; }
  store.locks[name] = l; return { err: 'wrong', left: CONFIG.pinTries - l.tries }; }
function pinSign(perm, approver, executor, obj, x) { x = x || {}; return auditAdd({ kind: 'pinSign', act: 'approve', who: approver, obj: obj, objType: x.type || null, page: x.page || null, branch: x.branch || null, text: (x.text ? x.text + ' · ' : '') + 'PIN bilan imzolandi · Bajaruvchi: ' + executor, perm: perm, exec: executor }); }
function pinSet(name, code) { store.pins[name] = fD(T0); store.pinCode = Object.assign({}, store.pinCode); store.pinCode[name] = code; store.v++; }
function pinOf(name) { return store.pins[name] || null; }
function pinWeak(p) { if (!/^\d{4}$/.test(p)) return 'format'; if (/^(\d)\1{3}$/.test(p)) return 'same'; var a = p.split('').map(Number), up = a.every(function (x, i) { return !i || x === a[i - 1] + 1; }), dn = a.every(function (x, i) { return !i || x === a[i - 1] - 1; }); return up || dn ? 'seq' : null; }

// ---- 24: Bosh sahifalar — yangi hisob yo'q, faqat mavjud funksiyalardan yig'iladi (memo: store.v / CONFIG) ----
var DATA_FROM = '30.09.2026';
function bhB(br) { return !br || br === 'ALL' ? null : br; }
function bhRange(per) { var t = T0, dw = (new Date(t).getUTCDay() + 6) % 7, f, pf, pt;
  if (per === 'day') { f = t; pf = t - DAY; pt = t - DAY; } else if (per === 'week') { f = t - dw * DAY; pf = f - 7 * DAY; pt = f - DAY; }
  else { var d0 = new Date(t); f = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1); pt = f - DAY; var p0 = new Date(pt); pf = Date.UTC(p0.getUTCFullYear(), p0.getUTCMonth(), 1); }
  return { from: f, to: t, pFrom: pf, pTo: pt, cmp: pf >= pD(DATA_FROM), dataFrom: pD(DATA_FROM) }; }
function bhSales(per, br, prev) { var r = bhRange(per), a = prev ? r.pFrom : r.from, b = prev ? r.pTo : r.to, B = bhB(br); return (store.sales || []).filter(function (s) { var t = pD(s.at.slice(0, 10)); return t >= a && t <= b && (!B || s.branch === B); }); }
function batchCost(pid, batch) { var b = batches().filter(function (x) { return x.pid === pid && x.batch === batch; })[0]; return b ? b.cost : ((costBasis(pid) || {}).cost || 0); }
function saleNet(no) { return memo('bhNet:' + no, function () { return r2(saleLines(no).reduce(function (s, x) { return s + x.left * x.price; }, 0)); }); }
function saleCost(no) { return memo('bhCost:' + no, function () { return r2(saleLines(no).reduce(function (s, x) { return s + x.left * batchCost(x.pid, x.batch); }, 0)); }); }
// Yalpi foyda: savdo (QQSsiz, qaytarishlar ayirilgan) − sotilgan partiyalar tannarxi. 25-hisobot ham shundan o'qiydi
function grossProfit(per, br, prev) { return memo('bhGP:' + per + br + !!prev, function () { var r = bhRange(per), F = rptFacts(fD(prev ? r.pFrom : r.from), fD(prev ? r.pTo : r.to), br), s = 0, c = 0; F.forEach(function (x) { s += x.net; c += x.cost; }); s = r2(s); c = r2(c); return { sales: s, cost: c, gp: r2(s - c), margin: s ? Math.round((s - c) / s * 1000) / 10 : null, n: bhSales(per, br, prev).length }; }); } // 25a: rptFacts dan — QM o'z sanasida
function bhDaily(per, br) { return memo('bhDay:' + per + br, function () { var r = bhRange(per), from = per === 'day' ? r.to - 6 * DAY : r.from, out = [];
  for (var t = from; t <= r.to; t += DAY) { var day = fD(t), L = (store.sales || []).filter(function (s) { return s.at.slice(0, 10) === day && (!bhB(br) || s.branch === bhB(br)); }); out.push({ date: day, t: t, none: t < r.dataFrom, sum: r2(rptFacts(day, day, br).reduce(function (a, x) { return a + x.net; }, 0)), n: L.length }); } return out; }); }
function bhTopProducts(per, br) { var m = {}, r = bhRange(per); rptFacts(fD(r.from), fD(r.to), br).forEach(function (x) { var k = m[x.pid] || (m[x.pid] = { pid: x.pid, name: x.prod, qty: 0, sum: 0 }); k.qty += x.qty; k.sum = r2(k.sum + x.net); }); return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.sum - a.sum; }); }
function bhGroupDebt(B) { return r2((B ? [B] : BRANCHES.map(function (b) { return b.code; })).reduce(function (s, b) { return s + groupDebt('mt', b).reduce(function (t, g) { return t + (g.debt || 0); }, 0); }, 0)); }
function bhDebt(br) { return memo('bhDebt:' + br, function () { var B = bhB(br), tot = 0, over = 0, ag = [0, 0, 0, 0, 0], agN = [0, 0, 0, 0, 0], top = []; // T10a: «Barcha filiallar» — filiallar yig'indisi (debtOf ALL bilan bir xil)
  brCodes(br).forEach(function (b) { custsIn(b).forEach(function (c) { var L = ledger('mt', c.id, b); tot += L.debt || 0; over += L.overdue || 0; var a = agingOf(L); a.forEach(function (v, i) { ag[i] += v; if (v > 0.005) agN[i]++; }); if (L.debt > 0) top.push({ id: c.id, name: c.name, branch: L.branch || b, debt: L.debt, overdue: L.overdue || 0, days: L.overdueDays || 0, a90: a[4] }); }); });
  top.sort(function (a, b) { return b.debt - a.debt; }); return { total: r2(tot), overdue: r2(over), aging: ag.map(r2), agingN: agN, top: top, n90: top.filter(function (x) { return x.a90 > 0; }), group: bhGroupDebt(B) }; }); }
function bhSupDebt(br) { var B = bhB(br), lim = T0 + 7 * DAY, tot = 0, due7 = 0; (B ? [B] : BRANCHES.map(function (b) { return b.code; })).forEach(function (b) { SUPPLIERS.forEach(function (s) { var L = supLedger(s.name, b); tot += L.debt || 0; (L.invoices || []).forEach(function (x) { if (x.left > 0 && pD(x.due) <= lim) due7 += x.left; }); }); }); return { total: r2(tot), due7: r2(due7) }; }
function bhMoney(br) { var B = bhB(br), o = { cash: 0, bank: 0, term: 0, accs: [] }; ACCOUNTS.forEach(function (a) { if (B && a.branch !== B) return; var v = accBalance(a.id); if (a.kind === 'term') o.term = r2(o.term + v); o[a.kind === 'cash' ? 'cash' : 'bank'] += v; o.accs.push({ id: a.id, name: a.name, kind: a.kind, branch: a.branch, bal: r2(v), closed: a.kind === 'cash' ? dayClosed(a.id, fD(T0)) : null, last: a.kind === 'cash' ? lastClosed(a.id) : null }); }); o.cash = r2(o.cash); o.bank = r2(o.bank); o.total = r2(o.cash + o.bank); return o; }
function bhStockValue(br) { var B = bhB(br); return r2(batches().reduce(function (s, b) { return s + (b.qty > 0 && (!B || b.branch === B) ? b.qty * b.cost : 0); }, 0)); }
function bhExpiry(br, days) { var B = bhB(br), W = days == null ? CONFIG.expiryWarnDays : days, L = batches().filter(function (b) { return b.qty > 0 && (!B || b.branch === B) && b.days != null && b.days >= 0 && b.days <= W; }); return { n: L.length, qty: L.reduce(function (s, b) { return s + b.qty; }, 0), cost: r2(L.reduce(function (s, b) { return s + b.qty * b.cost; }, 0)) }; }
function bhExpiredOpen(br) { var B = bhB(br); return batches().filter(function (b) { return b.qty > 0 && (!B || b.branch === B) && b.days != null && b.days < 0 && b.zoneType !== 'quar'; }); }
function bhWait(at) { var t = pDT(String(at || '').replace(',', '')); return t == null ? 0 : Math.max(0, Math.round((NOW - t) / 60000)); }
// T10a: bosh sahifa — to'lov turi bo'yicha bo'linish (Naqd / Perechisleniye / Online). Qarzlar ledger'dan (debtOf bilan bir manba)
var PT3 = ['cash', 'bank', 'online'];
function pt3() { return { cash: 0, bank: 0, online: 0, total: 0 }; }
function pt3Add(o, k, v) { k = PT3.indexOf(k) >= 0 ? k : 'bank'; o[k] = r2(o[k] + v); o.total = r2(o.total + v); return o; }
function pt3Sum(a) { var o = pt3(); a.forEach(function (x) { PT3.forEach(function (k) { pt3Add(o, k, x[k] || 0); }); }); return o; }
function brCodes(br) { var B = bhB(br); return B ? [B] : BRANCHES.map(function (b) { return b.code; }); }
var SYS_FROM = function () { return pD(BQ_CUT) + DAY; }; // T10a (1.7.1): kesish sanasigacha (BQ) bo'lgan sotuvlar boshlang'ich qoldiqqa kirgan — davr hisobiga qo'shilmaydi
function perRange(per) { var r = per && typeof per === 'object' ? { from: pD(per.from), to: pD(per.to || per.from) } : bhRange(per); return Object.assign({}, r, { dataFrom: Math.max(pD(DATA_FROM), SYS_FROM()) }); }
function saleByNo(no) { return (store.sales || []).filter(function (x) { return x.no === no; })[0] || null; }
function bhSalesPT(per, br) { return memo('bhSPT:' + JSON.stringify(per) + br, function () { var r = perRange(per), a = Math.max(r.from, r.dataFrom), B = bhB(br), o = pt3();
  // T11b: sof savdo (QQS bilan) = sotuv − yetkazilmagan (o.ret, SV sanasida) − QM (o'z sanasida); rptFacts.sum — Operatorlar bilan bir manba. Buyurtmasiz (demo) sotuvlar — summasi bo'yicha
  var pt = {}, ptOf = function (no) { if (!(no in pt)) { var od = orderOfSale(no); pt[no] = od ? payTypeOf(od) : 'bank'; } return pt[no]; };
  rptFacts(fD(a), fD(r.to), br).forEach(function (x) { pt3Add(o, ptOf(x.kind === 'qm' ? x.sale : x.doc), x.sum); });
  (store.sales || []).forEach(function (x) { var t = pD(x.at.slice(0, 10)); if (x.oid != null || t < a || t > r.to || (B && x.branch !== B)) return; pt3Add(o, 'bank', x.sum); }); return o; }); }
function bhDebtPTb(b) { var o = pt3(); custsIn(b).forEach(function (c) { (ledger('mt', c.id, b).invoices || []).forEach(function (x) { if (!(x.left > 0)) return; var sv = saleByNo(x.no), od = sv && orderById(sv.oid); pt3Add(o, od ? payTypeOf(od) : 'bank', x.left); }); });
  var res = r2(bhDebt(b).total - o.total); if (Math.abs(res) >= 0.01) pt3Add(o, 'bank', res); return o; }
function bhDebtPT(br) { return memo('bhDPT:' + br, function () { return pt3Sum(brCodes(br).map(bhDebtPTb)); }); }
function bhSupDebtPT(br) { return memo('bhYPT:' + br, function () { var o = pt3(); brCodes(br).forEach(function (b) { var p = pt3(); supInvoices(b).forEach(function (x) { if (x.left > 0) pt3Add(p, x.payType, x.left); }); var res = r2(bhSupDebt(b).total - p.total); if (Math.abs(res) >= 0.01) pt3Add(p, 'bank', res); PT3.forEach(function (k) { pt3Add(o, k, p[k]); }); }); return o; }); }
function bhExpPT(per, br) { return memo('bhEPT:' + JSON.stringify(per) + br, function () { var r = perRange(per), a = Math.max(r.from, r.dataFrom), B = bhB(br), o = pt3();
  (store.mops || []).forEach(function (m) { if (m.status !== 'posted' || (m.kind !== 'ko' && m.kind !== 'bo') || (B && m.branch !== B)) return; var t = pD(m.date); if (t < a || t > r.to) return; var ac = accById(m.acct) || {}; pt3Add(o, ac.kind === 'card' ? 'online' : m.kind === 'ko' ? 'cash' : 'bank', m.sum); }); return o; }); }
// T10a: buyurtma holatlari — bosh sahifa bloki va Buyurtmalar yorliqlari uchun YAGONA hisob
var ST_ALL = ['draft', 'pending', 'queued', 'picking', 'marking', 'checking', 'docs', 'loading', 'shipped', 'delivered', 'undelivered', 'rejected', 'cancelled'];
var ST_HOME = ST_ALL.slice(0, 11);
var ST_EV = { draft: ['create'], pending: ['send'], queued: ['approve', 'confirm'], picking: ['pickStart'], marking: ['picked'], checking: ['marked', 'checkStart'], docs: ['checked', 'docTrip'], loading: ['documented'], ready: ['documented', 'picked'], shipped: ['shipped'], delivered: ['delivered'], undelivered: ['undelivered', 'fail'], rejected: ['reject'], cancelled: ['cancel'] };
function stKey(st) { return st === 'ready' ? 'loading' : st; }
function stEnteredAt(o) { var ks = ST_EV[o.status] || [], lg = orderLog(o), e = null; for (var i = lg.length - 1; i >= 0; i--) if (ks.indexOf(lg[i].kind) >= 0) { e = lg[i]; break; } return e && e.at ? e.at : (o.date + ' ' + (o.time || '00:00')); }
function orderLate(o, days) { var st = stKey(o.status); if (['delivered', 'rejected', 'cancelled'].indexOf(st) >= 0) return false; var t = pDT(stEnteredAt(o)); return t != null && (nowMs() - t) > (days == null ? CONFIG.orderLateDays : days) * DAY; }
// list — allaqachon filtrlangan buyurtmalar. opt.statuses — kataklar; opt.delivPer — «Yetkazildi» davri ({from,to} ms)
function ordStats(list, opt) { opt = opt || {}; var keys = opt.statuses || ST_ALL, m = {}; keys.forEach(function (k) { m[k] = { status: k, n: 0, sum: 0, lateN: 0, lateSum: 0 }; });
  (list || []).forEach(function (o) { var k = stKey(o.status), x = m[k]; if (!x) return;
    if (k === 'delivered' && opt.delivPer) { var d = o.ship && o.ship.deliveredAt ? pDT(o.ship.deliveredAt) : pDT(stEnteredAt(o)); if (d == null || d < opt.delivPer.from || d > opt.delivPer.to + DAY - 1) return; }
    var t = orderTotals(o).total; x.n++; x.sum = r2(x.sum + t); if (opt.late !== false && orderLate(o)) { x.lateN++; x.lateSum = r2(x.lateSum + t); } });
  return keys.map(function (k) { return m[k]; }); }
function bhApprovals(br) { return memo('bhAp:' + br, function () { var B = bhB(br), inB = function (x) { return !B || x.branch === B; }, out = [], W = ['pending', 'sent'];
  (store.orders || []).forEach(function (o) { if (o.status !== 'pending' || !inB(o)) return; var cr = creditCheck(o); out.push({ type: 'order', no: o.no, id: o.id, who: o.op, sum: orderTotals(o).total, wait: waitMin(o), level: cr.level || 'branch', page: 'approvals', branch: o.branch }); });
  (store.pays || []).forEach(function (p) { if (p.kind === 'yt' && p.status === 'pending' && inB(p)) out.push({ type: 'yt', no: p.no, who: p.sentBy || p.createdBy, sum: p.sum, wait: bhWait(p.sentAt), level: 'branch', page: 'payments', branch: p.branch }); });
  (store.mops || []).forEach(function (m) { if (W.indexOf(m.status) >= 0 && mopNeedsApproval(m) && inB(m)) out.push({ type: 'ko', no: m.no, who: m.sentBy || m.by, sum: m.sum, wait: bhWait(m.sentAt), level: 'branch', page: 'cash', branch: m.branch }); });
  (store.transfers || []).forEach(function (x) { if (x.kind === 'zk' && W.indexOf(x.status) >= 0 && trNeedsAppr(x) && inB(x.from)) out.push({ type: 'zk', no: x.no, who: x.createdBy, sum: trSum(x), wait: bhWait(x.sentAt), level: 'branch', page: 'transfer', branch: x.from.branch }); });
  [['hc', 'writeoff'], ['qm', 'creturns'], ['qy', 'sreturns']].forEach(function (k) { ((store.docs || {})[k[0]] || []).forEach(function (x) { if (W.indexOf(x.status) >= 0 && inB(x)) out.push({ type: k[0], no: x.no, who: x.createdBy, sum: docSum(x), wait: bhWait(x.sentAt), level: k[0] === 'hc' && hcNeedsDirector(x) ? 'director' : 'branch', page: k[1], branch: x.branch }); }); });
  (store.invs || []).forEach(function (x) { if (W.indexOf(x.status) >= 0 && inB(x)) out.push({ type: 'iv', no: x.no, who: x.createdBy, sum: ivSum(x).shortS, wait: bhWait(x.sentAt), level: ivNeedsDir(x) ? 'director' : 'branch', page: 'inventory', branch: x.branch }); });
  (store.nos || []).forEach(function (x) { if (W.indexOf(x.status) >= 0 && (!B || nrBranches(x).indexOf(B) >= 0)) out.push({ type: 'no', no: x.no, who: x.createdBy, sum: nrSum(x), wait: bhWait(x.sentAt), level: 'price', page: 'prices', branch: x.branch }); });
  return out.sort(function (a, b) { return b.wait - a.wait; }); }); }
function bhLicExpired(br) { var B = bhB(br); return ktCards('mt').filter(function (k) { var c = custById(k.cust); if (!c || (B && !(c.bt && c.bt[B]))) return false; return (k.lic || []).some(function (l) { return l.kind === 'pharm' && ktLicState(l).st === 'expired'; }); }); }
function bhInvDue(br) { var B = bhB(br); return Object.keys(IV_LAST).filter(function (k) { var a = k.split('|'); if (B && a[0] !== B) return false; var last = pD(IV_LAST[k]); (store.invs || []).forEach(function (x) { if (x.status === 'posted' && x.branch === a[0] && x.wh === a[1] && pD(x.date) > last) last = pD(x.date); }); return Math.round((T0 - last) / DAY) > CONFIG.invRemindDays; }).map(function (k) { var a = k.split('|'); return { branch: a[0], wh: a[1], days: Math.round((T0 - pD(IV_LAST[k])) / DAY) }; }); }
function bhCashOpenDays(br) { var B = bhB(br), y = T0 - DAY, out = []; ACCOUNTS.forEach(function (a) { if (a.kind !== 'cash' || (B && a.branch !== B)) return; var c = lastClosed(a.id), from = c ? pD(c.date) + DAY : pD(DATA_FROM); for (var t = from; t <= y; t += DAY) out.push({ acct: a.id, name: a.name, date: fD(t) }); }); return out; }
function bhBankOpen(br) { var B = bhB(br), n = 0; ACCOUNTS.forEach(function (a) { if (a.kind !== 'bank' || (B && a.branch !== B)) return; var r = (store.recon || {})[a.id], t = r ? pD(r.date) : -Infinity; accMoves(a.id).forEach(function (m) { if (m.status === 'posted' && pD(m.date) > t) n++; }); }); return n; }
// «Diqqat talab qiladi» — bildirishnomalar (00) ham shundan o'qiydi
// T7b: yetkazib beruvchilar qarzi — kirim (hujjat) darajasida; days = to'lov kunigacha (manfiy — kechikkan)
function supInvoices(br) { var B = bhB(br), out = []; BRANCHES.forEach(function (b) { if (B && b.code !== B) return; SUPPLIERS.forEach(function (sp) { ledger('yt', sp.name, b.code).invoices.forEach(function (x) { var rc = x.rc ? store.receipts.filter(function (r) { return r.no === x.no; })[0] : null, t = pD(x.due);
  out.push({ no: x.no, date: x.date, due: x.due, sum: r2(x.sum - (x.ret || 0)), paid: x.paid, left: x.left, late: x.late, party: sp.name, branch: b.code, archive: !!x.open, payType: rc ? rc.payType || 'bank' : (sp.mainPay || 'bank'), owner: rc ? rc.owner || '' : '', prepaid: !!(rc && rc.prepaid), days: t == null ? null : Math.round((t - T0) / DAY) }); }); }); }); return out; }
function supDueBucket(x) { if (!(x.left > 0) || x.days == null) return null; return x.days < 0 ? 'late' : x.days === 0 ? 'today' : x.days <= 3 ? '3d' : null; }
function supBonusList(br) { var B = bhB(br), out = []; store.receipts.forEach(function (r) { if (r.status !== 'posted' || !r.bonus || !r.bonus.on || (B && r.branch !== B)) return; var t = pD(r.bonus.date); out.push({ no: r.no, date: r.date, party: r.supplier, branch: r.branch, gross: rcGross(r), sum: r.bonus.sum, pct: r.bonus.pct, bdate: r.bonus.date, state: r.bonus.state, bnsNo: r.bonus.bnsNo || '', reason: r.bonus.reason || '', owner: r.owner || '', days: t == null ? null : Math.round((t - T0) / DAY) }); }); return out; }
function supBonusBalances(br) { var B = bhB(br), out = []; BRANCHES.forEach(function (b) { if (B && b.code !== B) return; SUPPLIERS.forEach(function (sp) { var o = bonusOf(sp.name, b.code); if (o.balance > 0 || o.expected.length) { var last = (store.bns || []).filter(function (x) { return x.supplier === sp.name && x.branch === b.code && x.status === 'posted'; }).map(function (x) { return pD(x.date); }).sort().pop(); out.push({ party: sp.name, branch: b.code, balance: o.balance, expSum: o.expSum, expN: o.expected.length, idle: o.balance > 0 && last != null && (T0 - last) / DAY > 30 }); } }); }); return out; }
// Eslatmalar: Direktor/Buxgalter (matritsa) + kirimdagi «Kim nomiga» xodimi
function supReminders(br, role, me) { var out = [], P = can(role, 'supplierPay.notify'), Bn = can(role, 'supplierBonus.notify'), fm = function (n) { return fMk(n); };
  supInvoices(br).forEach(function (x) { var k = supDueBucket(x); if (!k || x.prepaid || !(P || (me && x.owner === me))) return; var sh = x.party.split(' ')[0];
    out.push({ id: 'sp-' + x.no, tone: k === 'late' ? 'danger' : 'warning', icon: k === 'late' ? 'clock-alert' : 'calendar-clock', kind: k, text: sh + ': ' + x.no + ' · ' + fm(x.left) + ' · ' + (k === 'late' ? (-x.days) + ' kun kechikdi' : k === 'today' ? "bugun to'lanadi" : x.days + ' kun qoldi'), href: '#sdebt?due=' + k + '&open=' + x.no }); });
  supBonusList(br).forEach(function (x) { if (x.state !== 'wait' || x.days == null || x.days > 3 || !(Bn || (me && x.owner === me))) return; out.push({ id: 'sb-' + x.no, tone: x.days < 0 ? 'danger' : 'warning', icon: 'gift', kind: 'bonus', text: 'Bonusni tasdiqlang: ' + x.party.split(' ')[0] + ' · ' + x.no + ' · ' + fm(x.sum) + ' · ' + (x.days < 0 ? (-x.days) + ' kun o\u02BBtdi' : x.days === 0 ? 'bugun' : x.days + ' kun qoldi'), href: '#sdebt?tab=bonus' }); });
  if (Bn) supBonusBalances(br).forEach(function (x) { if (x.idle) out.push({ id: 'su-' + x.party + x.branch, tone: 'info', icon: 'gift', kind: 'bonusIdle', text: 'Bonus balans ishlatilmagan (30+ kun): ' + x.party.split(' ')[0] + ' · ' + fm(x.balance), href: '#sdebt?tab=bonus' }); });
  return out; }
function fMk(n) { var a = (Math.round(Math.abs(n || 0) * 100) / 100).toFixed(2).split('.'); return (n < 0 ? '−' : '') + a[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + a[1]; }
// T10a2: «Diqqat talab qiladi» — guruhlar (qarz yoshi 4, muddat 3, yo'ldagi ko'chirishlar har biri, YB to'lov kuni 3). bell=true — qo'ng'iroqcha uchun (karantin, inventarizatsiya, kassa ham)
var AG_BANDS = [['1-30', '1–30'], ['31-60', '31–60'], ['61-90', '61–90'], ['90plus', '90+']], EXP_BANDS = [['0-30', 0, 30], ['31-60', 31, 60], ['61-90', 61, 90]];
function bhExpBands(br) { var B = bhB(br), W = CONFIG.expiryWarnDays, L = batches().filter(function (b) { return b.qty > 0 && (!B || b.branch === B) && b.days != null && b.days >= 0 && b.days <= W; }); // T10a3 (1.7.3): chegara (expiryWarnDays) — Muddat nazorati bilan bir xil
  return EXP_BANDS.filter(function (e) { return e[1] <= W; }).map(function (e) { var to = Math.min(e[2], W), l = L.filter(function (b) { return b.days >= e[1] && b.days <= to; }); return { band: e[0], from: e[1], to: to, n: l.length, qty: l.reduce(function (s, b) { return s + b.qty; }, 0), sum: r2(l.reduce(function (s, b) { return s + (b.value != null ? b.value : b.qty * b.cost); }, 0)) }; }); }
function bhTransitDocs(br) { var B = bhB(br), out = []; (store.transfers || []).forEach(function (x) { if (x.kind === 'zk' || x.status !== 'transit' || (B && x.from.branch !== B && x.to.branch !== B)) return; var at = x.sentAt || (x.date + ' 00:00'), t = pDT(String(at).replace(',', ''));
  out.push({ no: x.no, kind: x.kind, from: x.from, to: x.to, sentAt: at, date: String(at).slice(0, 10), days: t == null ? 0 : Math.max(0, Math.floor((NOW - t) / DAY)), qty: x.lines.reduce(function (s, l) { return s + (l.qty || 0); }, 0) }); });
  return out.sort(function (a, b) { return b.days - a.days || (a.no < b.no ? -1 : 1); }); }
// Tasdiqlash sahifasi bilan YAGONA manba: «Mening» ro'yxati (buyurtmalar) + narx o'zgarishi tasdiqlari. Approvals.dc.html va bosh sahifa shundan o'qiydi
function apprPage(br, role) { var B = bhB(br), o = (store.orders || []).filter(function (x) { return x.status === 'pending' && (!B || x.branch === B) && canApprove(creditCheck(x).level || 'branch', role); }),
  p = can(role, 'prices.below') ? (store.nos || []).filter(function (x) { return x.status === 'pending' && (!B || x.branch === B); }) : []; // T10a3 (1.7.2): narx tasdig'i — faqat tasdiqlay oladigan rolga
  return { orders: o, prices: p, n: o.length + p.length, sum: r2(o.reduce(function (s, x) { return s + orderTotals(x).total; }, 0) + p.reduce(function (s, x) { return s + nrSum(x); }, 0)) }; }
function bhAttention(br, role, bell) { return memo('bhAt:' + br + role + !!bell, function () { var B = bhB(br), out = [], mk = function (tone, key, n, val, page, extra) { return Object.assign({ tone: n ? tone : 'neutral', key: key, n: n, val: val, page: page.split('?')[0], href: '#' + page + (page.indexOf('?') >= 0 ? '&' : '?') + 'branch=' + (B || 'ALL') }, extra || {}); },
    add = function (tone, key, n, val, page, extra) { if (n) out.push(mk(tone, key, n, val, page, extra)); }, grp = function (list) { if (list.some(function (x) { return x.n; })) list.forEach(function (x) { if (x.n || !bell) out.push(x); }); }, sm = function (a, f) { return r2(a.reduce(function (s, x) { return s + f(x); }, 0)); };
  if (can(role, 'approvals.branch') || can(role, 'approvals.director')) { var ap = apprPage(br, role); add('warning', rlHome(role) === 'director' ? 'apprDir' : 'apprMine', ap.n, ap.sum, 'approvals', { vars: { o: ap.orders.length, p: ap.prices.length } }); }
  if (can(role, 'cdebt.view')) { var db = bhDebt(br); grp(AG_BANDS.map(function (a, i) { return mk(i < 2 ? 'warning' : 'danger', 'debtA', db.agingN[i + 1], db.aging[i + 1], 'cdebt?aging=' + a[0], { vars: { r: a[1] } }); })); }
  var le = bhLicExpired(br); if (can(role, 'clients.view')) add('danger', 'licExp', le.length, null, 'clients?lic=expired', { names: le.map(function (k) { return k.name; }) });
  if (can(role, 'expiry.view')) { var cc = can(role, 'special.cost'); grp(bhExpBands(br).map(function (e, i) { return mk(i ? 'warning' : 'danger', 'expB', e.n, cc ? e.sum : null, 'expiry?band=' + e.band, { vars: { r: e.from + '–' + e.to, q: e.qty } }); })); }
  if (can(role, 'transfer.view')) { var td = bhTransitDocs(br); if (bell) add('warning', 'transit', td.length, null, 'transfer?status=transit'); else if (td.length) out.push(mk(td.some(function (x) { return x.days > 3; }) ? 'warning' : 'info', 'transit', td.length, null, 'transfer?status=transit', { list: td })); }
  if (can(role, 'supplierPay.notify')) { var si = supInvoices(br).filter(function (x) { return !x.prepaid; }); grp([['late', 'danger', 'supPayLate'], ['today', 'warning', 'supPayToday'], ['3d', 'warning', 'supPay3d']].map(function (z) { var l = si.filter(function (x) { return supDueBucket(x) === z[0]; }); return mk(z[1], z[2], l.length, sm(l, function (x) { return x.left; }), 'sdebt?due=' + z[0]); })); }
  if (can(role, 'supplierBonus.notify')) { var sb = supBonusList(br).filter(function (x) { return x.state === 'wait' && x.days != null && x.days <= 3; }); add(sb.some(function (x) { return x.days < 0; }) ? 'danger' : 'warning', 'supBonus', sb.length, sm(sb, function (x) { return x.sum; }), 'sdebt?tab=bonus'); }
  if (can(role, 'receipt.post')) { var ra = store.receipts.filter(function (r) { return r.status === 'accepted' && (!B || r.branch === B); }); add('warning', 'rcAccepted', ra.length, null, 'receipt?status=accepted'); }
  if (can(role, 'cash.view')) { var dcl = drvCash(br); add('warning', 'drvCash', dcl.length, sm(dcl, function (x) { return x.sum; }), 'cash'); }
  if (bell) { if (can(role, 'stock.view')) add('danger', 'expOpen', bhExpiredOpen(br).length, null, 'stock?exp=expired'); if (can(role, 'inventory.view')) add('warning', 'invDue', bhInvDue(br).length, null, 'inventory'); if (can(role, 'cash.view')) add('warning', 'cashOpen', bhCashOpenDays(br).length, null, 'cash'); }
  return out; }); }
function bhFlow(br, op, day) { var B = bhB(br), st = ['pending', 'queued', 'picking', 'marking', 'checking', 'docs', 'loading', 'shipped', 'delivered'], m = {}; st.forEach(function (k) { m[k] = { n: 0, sum: 0 }; }); (store.orders || []).forEach(function (o) { var k0 = o.status === 'ready' ? 'loading' : o.status; if (m[k0] && (!B || o.branch === B) && (!op || o.op === op) && (!day || o.date === day)) { m[k0].n++; m[k0].sum = r2(m[k0].sum + orderTotals(o).total); } }); return st.map(function (k) { return Object.assign({ status: k }, m[k]); }); }
function bhCalendar(br, n) { var B = bhB(br), days = []; for (var i = 0; i < (n || 14); i++) days.push({ date: fD(T0 + i * DAY), t: T0 + i * DAY, inc: 0, out: 0 }); var put = function (due, left, k) { var x = pD(due); if (x == null || !(left > 0)) return; var i = Math.max(0, Math.round((x - T0) / DAY)); if (i < days.length) days[i][k] = r2(days[i][k] + left); };
  custsIn(B).forEach(function (c) { (ledger('mt', c.id, B).invoices || []).forEach(function (x) { put(x.due, x.left, 'inc'); }); }); (B ? [B] : BRANCHES.map(function (b) { return b.code; })).forEach(function (b) { SUPPLIERS.forEach(function (s) { (supLedger(s.name, b).invoices || []).forEach(function (x) { put(x.due, x.left, 'out'); }); }); }); return days; }
function bhSetup() { return [{ key: 'products', done: PRODUCTS.length > 0, page: 'products' }, { key: 'clients', done: CUSTOMERS.length > 0, page: 'clients' }, { key: 'prices', done: !!(store.prices && store.prices.length), page: 'prices' }, { key: 'opening', done: (store.bqs || []).some(function (x) { return x.status === 'posted'; }), page: 'opening' }]; }

// ---- 25: Hisobotlar — grossProfit ichki funksiyalaridan (saleLines, batchCost) va 17 dagi transfer funksiyalaridan ----
function rptRange(preset) { var t = T0, d0 = new Date(t), y = d0.getUTCFullYear(), m = d0.getUTCMonth(), f = t, to = t;
  if (preset === 'day') f = t; else if (preset === 'week') f = bhRange('week').from; else if (preset === 'month') f = Date.UTC(y, m, 1);
  else if (preset === 'prevMonth') { f = Date.UTC(y, m - 1, 1); to = Date.UTC(y, m, 1) - DAY; } else if (preset === 'quarter') f = Date.UTC(y, Math.floor(m / 3) * 3, 1); else if (preset === 'ytd') f = Date.UTC(y, 0, 1);
  return { from: fD(f), to: fD(to) }; }
function rptPrev(from, to) { var a = pD(from), b = pD(to), n = Math.round((b - a) / DAY) + 1; return { from: fD(a - n * DAY), to: fD(a - DAY), cmp: a - n * DAY >= pD(DATA_FROM) }; }
function rptFacts(from, to, br, withFs) { return memo('rpt:' + from + to + br + !!withFs, function () { var a = pD(from), b = pD(to), B = bhB(br), out = [];
  // 25a (0-a): QM qaytarish sanasida ayiriladi; jo'natishdagi rad etish (o.ret) — SV sanasida
  var qmS = function (q) { return q.saleNo || q.sale; }, qmQ = {}; ((store.docs || {}).qm || []).forEach(function (q) { if (q.status !== 'posted') return; q.lines.forEach(function (l) { var k = qmS(q) + '|' + l.pid + '|' + l.batch; qmQ[k] = (qmQ[k] || 0) + (l.qty || 0); }); });
  var meta = function (s) { var o = orderOfSale(s.no) || {}, c = custById(s.cust) || {}, ca = custAt(s.cust, s.branch) || {}; return { custId: s.cust, cust: c.name, region: c.region || '—', op: o.op || '—', ptype: ca.price || '—' }; };
  (store.sales || []).forEach(function (s) { var t = pD(s.at.slice(0, 10)); if (t < a || t > b || (B && s.branch !== B)) return; var m = meta(s);
    saleLines(s.no).forEach(function (x) { var p = prodById(x.pid) || {}, dq = Math.max(0, x.prior - (qmQ[s.no + '|' + x.pid + '|' + x.batch] || 0)), q = x.sold - dq, net = r2(q * x.price / (1 + (p.vat || 0) / 100)), bc = batchCost(x.pid, x.batch);
      out.push(Object.assign({ kind: 'sv', doc: s.no, date: s.at.slice(0, 10), t: t, branch: s.branch, pid: x.pid, prod: p.name, cat: p.cat || '—', maker: p.maker || '—', batch: x.batch, qty: q, sold: x.sold, retQty: dq, price: x.price, gross: r2(x.sold * x.price), ret: r2(dq * x.price), net: net, sum: r2(q * x.price), vat: r2(net * (p.vat || 0) / 100), bcost: bc, cost: r2(q * bc) }, m)); }); });
  ((store.docs || {}).qm || []).forEach(function (q) { if (q.status !== 'posted') return; var t = pD(q.date), s = saleByNo(qmS(q)); if (!s || t < a || t > b || (B && (q.branch || s.branch) !== B)) return; var m = meta(s), SL = saleLines(s.no);
    q.lines.forEach(function (l) { var x = SL.filter(function (y) { return y.pid === l.pid && y.batch === l.batch; })[0] || {}, p = prodById(l.pid) || {}, pr = x.price || 0, rq = l.qty || 0, net = r2(-rq * pr / (1 + (p.vat || 0) / 100)), bc = batchCost(l.pid, l.batch);
      out.push(Object.assign({ kind: 'qm', doc: q.no, sale: s.no, date: q.date, t: t, branch: q.branch || s.branch, pid: l.pid, prod: p.name, cat: p.cat || '—', maker: p.maker || '—', batch: l.batch, qty: -rq, sold: 0, retQty: rq, price: pr, gross: 0, ret: r2(rq * pr), net: net, sum: r2(-rq * pr), vat: r2(net * (p.vat || 0) / 100), bcost: bc, cost: r2(-rq * bc) }, m)); }); });
  if (withFs) (store.transfers || []).forEach(function (x) { if (x.kind !== 'fs' || ['received', 'diff', 'transit'].indexOf(x.status) < 0) return; var t = pD(x.date); if (t < a || t > b || (B && x.from.branch !== B)) return; var tb = BRANCHES.filter(function (q) { return q.code === x.to.branch; })[0] || {};
    x.lines.forEach(function (l) { var q = x.status === 'transit' ? (l.qty || 0) : trRecvQty(l), s = trLineSum(x, l, q), p = prodById(l.pid) || {};
      out.push({ kind: 'fs', doc: x.no, date: x.date, t: t, branch: x.from.branch, custId: null, cust: tb.name || x.to.branch, region: '—', op: x.createdBy || '—', pid: l.pid, prod: p.name, cat: p.cat || '—', maker: p.maker || '—', ptype: 'fs', batch: l.batch, qty: q, sold: q, retQty: 0, price: l.cost, gross: s.net, ret: 0, net: s.net, vat: s.vat, bcost: l.cost, cost: r2(q * l.cost) }); }); });
  return out; }); }
function rptFsDocs(from, to, br) { return memo('rptFs:' + from + to + br, function () { var a = from ? pD(from) : -Infinity, b = to ? pD(to) : Infinity, B = bhB(br), out = [];
  (store.transfers || []).forEach(function (x) { if (x.kind !== 'fs' || ['transit', 'received', 'diff', 'rejected'].indexOf(x.status) < 0) return; var t = pD(x.date); if (t < a || t > b || (B && x.from.branch !== B && x.to.branch !== B)) return;
    var sent = 0, rc = 0; x.lines.forEach(function (l) { sent += l.qty || 0; rc += x.status === 'transit' ? 0 : trRecvQty(l); }); var sm = trSum(x, x.status !== 'transit'), g = groupDebt('mt', x.from.branch).filter(function (q) { return q.docs.indexOf(x.no) >= 0; })[0], left = g ? (g.docs.length === 1 ? g.debt : sm.total) : 0;
    out.push({ no: x.no, inv: x.inv, date: x.date, from: x.from.branch, to: x.to.branch, status: x.status, sent: sent, recv: rc, diff: x.status === 'transit' ? 0 : rc - sent, cost: sm.net, vat: sm.vat, total: sm.total, paid: r2(sm.total - left), left: r2(left), transitCost: x.status === 'transit' ? trSum(x).net : 0 }); });
  return out; }); }

// ---- 25a: Chop etish — summa so'z bilan va shakl ma'lumotlari (hujjat sahifasidagi o'sha funksiyalardan) ----
function sumInWordsUz(n) { var U = ['', 'bir', 'ikki', 'uch', "to'rt", 'besh', 'olti', 'yetti', 'sakkiz', "to'qqiz"], T = ['', "o'n", 'yigirma', "o'ttiz", 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', "to'qson"], S = ['', 'ming', 'million', 'milliard', 'trillion'];
  var v = Math.round(Math.abs(+n || 0) * 100), som = Math.floor(v / 100), tiyin = v % 100, out = [];
  var tri = function (x) { var h = Math.floor(x / 100), t = Math.floor(x % 100 / 10), u = x % 10, w = []; if (h) w.push(U[h] + ' yuz'); if (t) w.push(T[t]); if (u) w.push(U[u]); return w.join(' '); };
  if (!som) out.push('nol'); else { var g = 0; while (som > 0) { var x = som % 1000; if (x) out.unshift(tri(x) + (S[g] ? ' ' + S[g] : '')); som = Math.floor(som / 1000); g++; } }
  var s = out.join(' ').replace(/\s+/g, ' ').trim(); return s.charAt(0).toUpperCase() + s.slice(1) + " so'm " + ('0' + tiyin).slice(-2) + ' tiyin'; }
function bankMfo(name) { var b = KT_BANKS.filter(function (x) { return x[0] === name; })[0]; return b ? b[1] : ''; }
function prBranch(code) { var b = (store.brs || []).filter(function (x) { return x.code === code; })[0] || {}, bk = (b.banks || []).filter(function (x) { return x.main; })[0] || (b.banks || [])[0] || {};
  return { name: b.legal || b.name || code, short: b.name || code, stir: b.stir || '', vatNo: b.vatNo || '', address: [b.region, b.address].filter(Boolean).join(', '), phone: b.phone ? '+998 ' + String(b.phone).replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4') : '', bank: bk.bank || '', acc: bk.acc || '', mfo: bk.mfo != null ? bk.mfo : bankMfo(bk.bank) }; }
function prParty(custId) { var k = ktOf ? ktOf('mt', custId) : null, c = custById(custId) || {}, lic = k && (k.lic || []).filter(function (l) { return l.kind === 'pharm'; })[0];
  return { name: (k && k.legal) || c.name || '', short: c.name || '', stir: (k && k.stir) || String(c.stir || '').replace(/\D/g, ''), vatNo: (k && k.vatNo) || '', address: (k && k.address) || c.address || '', phone: (k && k.phone) || c.phone || '', bank: k && k.bank ? k.bank.bank : '', acc: k && k.bank ? k.bank.acc : '', mfo: k && k.bank ? k.bank.mfo : '', lic: lic ? lic.no + ' · ' + lic.until + ' gacha' : '' }; }
function prPrints(no, form) { return auditList().filter(function (a) { return a.kind === 'print' && a.obj === no && (!form || (a.text || '').indexOf(form) === 0); }).length; }
function prLog(no, form, copies, who, type, page, br) { return auditAdd({ kind: 'print', act: 'print', who: who, obj: no, objType: type, page: page, branch: br, text: form + ' · ' + copies + ' nusxa' }); }
function printData(form, no, q) { var D0 = { form: form, no: no, ok: false };
  if (form === 'pick') return prPick(no) || D0; if (form === 'picks') { var ds = (q || [no]).map(prPick).filter(Boolean); return ds.length ? { form: 'picks', no: ds.map(function (x) { return x.no; }).join(', '), src: ds[0].no, kind: 'by', ok: true, status: 'posted', date: ds[0].date, branch: ds[0].branch, seller: ds[0].seller, docs: ds } : D0; } if (form === 'kio' || form === 'kco' || form === 'cash') return prCash(no) || D0; if (form === 'akt') return prAkt(no, q) || D0; if (form === 'no') return prNo(no) || D0; if (form === 'trip') return prTrip(no) || D0;
  if (form === 'nak' || form === 'hf') {
    var s = saleByNo(no) || (form === 'nak' ? (store.sales || []).filter(function (y) { return y.nak && y.nak === no; })[0] : null); if (!s && form === 'nak') { var pn = prNakOrder(no); if (pn) return pn; } if (s) { var o = orderOfSale(no) || {}, t = saleTotals(o), tr = s.trip ? tripByNo(s.trip) : null, dr = tr ? driverById(tr.driver) : null, cu = custAt(s.cust, s.branch) || {};
      var lines = saleLines(no).map(function (x) { var p = prodById(x.pid) || {}, b = batches().filter(function (y) { return y.pid === x.pid && y.batch === x.batch; })[0] || {}, tot = r2(x.sold * x.price), vat = r2(tot * (p.vat || 0) / (100 + (p.vat || 0))), sum = r2(tot - vat); return { pid: x.pid, name: p.name, code: p.code || '', maker: p.maker || '', batch: x.batch, exp: x.exp || b.exp || '', unit: p.unit || 'dona', qty: x.sold, price: r2(x.price / (1 + (p.vat || 0) / 100)), priceVat: x.price, sum: sum, vatPct: p.vat || 0, vat: vat, total: tot, mxik: p.ikpu || '', ctrl: !!p.ctrl, mark: !!p.mark }; });
      return { form: form, no: form === 'hf' ? s.inv : (s.nak || s.no), src: s.no, kind: 'sv', ok: true, status: 'posted', date: s.at.slice(0, 10), branch: s.branch, seller: prBranch(s.branch), buyer: prParty(s.cust), basis: o.no || '', contract: cu.contract || '', delivery: tr ? { trip: tr.no, driver: dr ? dr.name : '', car: tr.car } : { pickup: true, rep: (o.ship && o.ship.receiver) || '', proxy: '' }, lines: lines, tot: { net: r2(t.total - t.vat), vat: t.vat, total: t.total, qty: t.qty, rows: lines.length },
        signs: form === 'nak' ? [['Berdi (Ombor mudiri)', s.by || empNames('keeper', s.branch)[0] || ''], ['Qabul qildi (mijoz vakili)', ''], tr ? ['Haydovchi', dr ? dr.name : ''] : null].filter(Boolean) : [['Rahbar (Filial rahbari)', prSigner(s.branch, 'branch')], ['Bosh hisobchi', prSigner(s.branch, 'accountant')], ['Tovarni oldi', '']] }; }
    var x = trByNo ? trByNo(no) : null; if (!x) x = (store.transfers || []).filter(function (y) { return y.inv === no; })[0];
    if (x && x.kind === 'fs') { var sm = trSum(x), L2 = x.lines.map(function (l) { var p = prodById(l.pid) || {}, q = l.qty || 0, ls = trLineSum(x, l, q); return { pid: l.pid, name: p.name, code: p.code || '', maker: p.maker || '', batch: l.batch, exp: l.exp || '', unit: p.unit || 'dona', qty: q, price: l.cost, sum: ls.net, vatPct: x.vat, vat: ls.vat, total: r2(ls.net + ls.vat), mxik: p.ikpu || '', ctrl: !!p.ctrl, mark: !!p.mark }; });
      return { form: form, no: form === 'hf' ? x.inv : x.no, src: x.no, kind: 'fs', ok: true, status: x.status === 'draft' ? 'draft' : x.status === 'cancelled' ? 'cancelled' : 'posted', date: x.date, branch: x.from.branch, seller: prBranch(x.from.branch), buyer: prBranch(x.to.branch), basis: x.no, contract: '', delivery: { pickup: false, trip: '', driver: '', car: '' }, lines: L2, tot: { net: sm.net, vat: sm.vat, total: sm.total, qty: sm.qty, rows: L2.length },
        signs: form === 'nak' ? [['Berdi (Ombor mudiri)', empNames('keeper', x.from.branch)[0] || ''], ['Qabul qildi (Ombor mudiri)', empNames('keeper', x.to.branch)[0] || '']] : [['Rahbar (Filial rahbari)', prSigner(x.from.branch, 'branch')], ['Bosh hisobchi', prSigner(x.from.branch, 'accountant')], ['Tovarni oldi', '']] }; }
  }
  return D0; }

// ---- 25a (2-bo'lak): chop etish sozlamalari, Code128, qolgan shakllar ma'lumoti ----
function prCfg() { if (!store.prCfg) store.prCfg = { signers: {}, reprint: true, nakVariant: 'price' }; return store.prCfg; }
function prCfgSet(patch) { store.prCfg = Object.assign({}, prCfg(), patch); store.v++; }
function prSigner(br, role) { var o = (prCfg().signers || {})[br] || {}; return o[role] || empNames(role, br)[0] || ''; }
var C128 = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');
function code128(text) { var v = [104], s = String(text || ''); for (var i = 0; i < s.length; i++) v.push(s.charCodeAt(i) - 32); var c = v.reduce(function (a, x, i) { return a + x * (i || 1); }, 0) % 103; v.push(c, 106);
  var bars = [], x = 10; v.forEach(function (k) { var p = C128[k]; for (var j = 0; j < p.length; j++) { var w = +p[j]; if (j % 2 === 0) bars.push({ x: x, w: w }); x += w; } }); return { bars: bars, w: x + 10, check: c }; }
function prSaleOf(o) { return (store.sales || []).filter(function (y) { var oo = orderOfSale(y.no); return oo && oo.id === o.id; })[0] || null; }
function prPick(no) { var o = (store.orders || []).filter(function (x) { return x.no === no; })[0]; if (!o) return null; var t = tripOfOrder(o.id), pl = pickPlan(o), bs = batches(), ZO = PICK.zoneOrder;
  var lines = []; pl.forEach(function (l) { var p = prodById(l.pid) || {}; (l.plan.length ? l.plan : [{ batch: '', exp: '', zone: l.zone, qty: l.qty }]).forEach(function (b) { var bb = bs.filter(function (y) { return y.pid === l.pid && y.batch === b.batch; })[0] || {}; lines.push({ pid: l.pid, name: p.name, code: p.code || '', unit: p.unit || 'dona', zone: b.zone || l.zone, zoneLabel: bb.zoneLabel || b.zone || l.zone, batch: b.batch, exp: b.exp, qty: b.qty, mark: !!p.mark, ctrl: !!p.ctrl }); }); });
  lines.sort(function (a, b) { return (ZO[a.zone] || 0) - (ZO[b.zone] || 0); });
  return { form: 'pick', no: o.no, src: o.no, kind: 'by', ok: true, status: ['queued', 'picking'].indexOf(o.status) >= 0 ? 'posted' : o.status === 'draft' ? 'draft' : o.status === 'cancelled' ? 'cancelled' : 'other', orderStatus: o.status, date: o.date, branch: o.branch, seller: prBranch(o.branch), cust: (custById(o.cust) || {}).name || '', delivery: o.delivery, trip: t ? t.no : '', ready: o.delivDate || '', lines: lines, bar: code128(o.no), tot: { qty: lines.reduce(function (a, x) { return a + (x.qty || 0); }, 0), rows: lines.length }, signs: [['Terdi', (o.pk && o.pk.by) || ''], ['Tekshirdi', ''], ['Vaqt', '']] }; }
function prCash(no) { var p = (store.pays || []).filter(function (x) { return x.no === no; })[0], m = (store.mops || []).filter(function (x) { return x.no === no; })[0], x = p || m; if (!x) return null;
  var acct = x.acct, a = accById(acct) || {}; if (a.kind !== 'cash') return { form: 'cash', no: no, ok: false, reason: 'bank' };
  var dir = p ? (p.kind === 'mt' ? 'in' : 'out') : m.dir, br = x.branch, who = p ? (p.kind === 'mt' ? ((custById(p.party) || {}).name || '') : p.party) : (m.party || '');
  var basis = p ? (p.alloc || []).map(function (q) { return { no: q.no, sum: q.sum }; }) : [], basisText = p ? (p.kind === 'mt' ? "Qarzni to'lash" : "Yetkazib beruvchiga to'lov") : [m.item, m.note].filter(Boolean).join(' · ');
  var lg = x.log || [], post = lg.filter(function (l) { return l.kind === 'post'; })[0] || {}, sent = lg.filter(function (l) { return l.kind === 'send'; })[0], appr = dir === 'out' && x.sum >= CONFIG.cashBranchApprove && sent && post.who && post.who !== x.createdBy ? { who: post.who, at: post.at } : null;
  var cashier = CASH_RESP[acct] || x.createdBy || '', acc = prSigner(br, 'accountant');
  return { form: dir === 'in' ? 'kio' : 'kco', no: x.no, src: x.no, kind: p ? p.kind : 'ko', ok: true, status: x.status === 'posted' ? 'posted' : x.status === 'cancelled' ? 'cancelled' : 'draft', date: x.date, branch: br, seller: prBranch(br), acct: a.name || acct, who: who, basisText: basisText, basis: basis, sum: x.sum, vat: 0, appr: appr,
    signs: dir === 'in' ? [['Bosh hisobchi', acc], ['Kassir', cashier]] : [['Rahbar', prSigner(br, 'branch')], ['Bosh hisobchi', acc], ['Kassir', cashier], ['Oluvchi', '']] }; }
function prAkt(no, q) { var a = no ? reconByNo(no) : null, k = a || q; if (!k) return null; var mt = k.kind === 'mt', name = mt ? ((custById(k.party) || {}).name || '') : k.party, rc = reconCalc(k.kind, k.party, k.branch, k.from, k.to);
  return { form: 'akt', no: a ? a.no : '', src: a ? a.no : 'AS:' + k.kind + ':' + k.party + ':' + k.branch, kind: 'as', ok: true, status: a && a.status === 'cancelled' ? 'cancelled' : 'posted', date: fD(T0), branch: k.branch, seller: prBranch(k.branch), partyName: name, mt: mt, from: k.from, to: k.to, open: rc.open, rows: rc.rows, dr: rc.dr, cr: rc.cr, close: rc.close,
    signs: [['Medix Group (' + ((BRANCHES.filter(function (b) { return b.code === k.branch; })[0] || {}).name || k.branch) + ')', prSigner(k.branch, 'branch')], [name, '']] }; }
// T9-4a: nakladnoy «Hujjatlashtirilmoqda»da raqamlanadi — sotuvdan oldin buyurtmaning terilgan partiyalaridan
function prNakOrder(no) { var o = (store.orders || []).filter(function (x) { return x.dc && x.dc.nak === no; })[0]; if (!o || !o.pk) return null;
  var cu = custAt(o.cust, o.branch) || {}, tr = o.dc.trip ? tripByNo(o.dc.trip) : null, dr = tr ? driverById(tr.driver) : null, lines = [];
  o.pk.lines.forEach(function (pl) { var l = o.lines[pl.i] || o.lines.filter(function (y) { return y.pid === pl.pid; })[0] || {}, p = prodById(pl.pid) || {}, pr = r2((linePrice(l, o) || 0) * (1 - (cu.disc || 0) / 100));
    (pl.picks || []).forEach(function (x) { if (!(x.qty > 0)) return; var pr = r2((pickPrice(o, l, x.batch) || 0) * (1 - (cu.disc || 0) / 100)), tot = r2(x.qty * pr), vat = r2(tot * (p.vat || 0) / (100 + (p.vat || 0)));
      lines.push({ pid: pl.pid, name: p.name, code: p.code || '', maker: p.maker || '', batch: x.batch, exp: x.exp || '', unit: p.unit || 'dona', qty: x.qty, price: r2(pr / (1 + (p.vat || 0) / 100)), priceVat: pr, sum: r2(tot - vat), vatPct: p.vat || 0, vat: vat, total: tot, mxik: p.ikpu || '', ctrl: !!p.ctrl, mark: !!p.mark }); }); });
  var T = lines.reduce(function (a, x) { a.total = r2(a.total + x.total); a.vat = r2(a.vat + x.vat); a.qty += x.qty; return a; }, { total: 0, vat: 0, qty: 0 }), at = o.dc.at || nowStr();
  return { form: 'nak', no: no, src: o.no, kind: 'by', ok: true, status: 'posted', date: at.slice(0, 10), branch: o.branch, seller: prBranch(o.branch), buyer: prParty(o.cust), basis: o.no, contract: cu.contract || '', delivery: tr ? { trip: tr.no, driver: dr ? dr.name : '', car: tr.car } : { pickup: true, rep: '', proxy: '' }, lines: lines, tot: { net: r2(T.total - T.vat), vat: T.vat, total: T.total, qty: T.qty, rows: lines.length },
    signs: [['Berdi (Ombor mudiri)', o.dc.by || ''], ['Qabul qildi (mijoz vakili)', ''], tr ? ['Haydovchi', dr ? dr.name : ''] : null].filter(Boolean) }; }
function prTrip(no) { var t = tripByNo(no); if (!t) return null; var docs = t.stops.map(function (st) { var o = (store.orders || []).filter(function (x) { return x.id === st.oid; })[0], s = o && prSaleOf(o); return s ? printData('nak', s.no) : o && o.dc && o.dc.nak ? printData('nak', o.dc.nak) : null; }).filter(function (x) { return x && x.ok; });
  return { form: 'trip', no: t.no, src: t.no, kind: 'rs', ok: docs.length > 0, status: 'posted', date: t.date, branch: t.branch, docs: docs, missing: t.stops.length - docs.length }; }
function printForms(kind, no) { if (!no) return []; var F = function (form, n) { return { form: form, no: n || no }; };
  if (kind === 'order') { var o = (store.orders || []).filter(function (x) { return x.no === no; })[0]; if (!o) return []; var s = prSaleOf(o), out = [F('pick')]; if (s) out.push(F('nak', s.no), F('hf', s.no)); return out; }
  if (kind === 'fs') return [F('hf'), F('nak')];
  if (kind === 'pay') { var p = (store.pays || []).filter(function (x) { return x.no === no; })[0]; return p && (accById(p.acct) || {}).kind === 'cash' ? [F(p.kind === 'mt' ? 'kio' : 'kco')] : []; }
  if (kind === 'mop') { var m = (store.mops || []).filter(function (x) { return x.no === no; })[0]; return m && m.kind === 'ko' ? [F(m.dir === 'in' ? 'kio' : 'kco')] : []; }
  if (kind === 'as') return [F('akt')]; if (kind === 'rs') return [F('trip')]; return []; }
function printItems(kind, no, L) { return printForms(kind, no).map(function (f) { return { label: (L && L['ch_f_' + f.form]) || f.form, icon: 'printer', pick: function () { window.medixPrint && window.medixPrint(f.form, f.no); } }; }); }
function resetStore() { store.demoHold = false; restoreBase(true); }
seedKt(); seedPtypes(); seedPrices(); seedShip(); seedDocs(); initPay(); payEra(); seedMoney(); seedDebt(); seedTransfers(); seedInv(); seedBq(); seedP0(); seedLk(); seedRl(); seedBs(); seedProdAudit(); freezeOrders(store.orders); store.demoDirty = false; takeBase();
// T6: haqiqiy Excel (.xlsx) eksport — siqilmagan ZIP (STORE) + SpreadsheetML; tashqi kutubxonasiz
var CRC_T = null; function crc32(u8) { if (!CRC_T) { CRC_T = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } } var x = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) x = CRC_T[(x ^ u8[i]) & 0xFF] ^ (x >>> 8); return (x ^ 0xFFFFFFFF) >>> 0; }
function zipStore(files) { var enc = new TextEncoder(), parts = [], cd = [], off = 0, le = function (v, n) { var a = []; for (var i = 0; i < n; i++) a.push((v >>> (8 * i)) & 0xFF); return a; };
  files.forEach(function (f) { var nm = enc.encode(f[0]), dt = enc.encode(f[1]), crc = crc32(dt), h = [].concat(le(0x04034b50, 4), le(20, 2), le(0x0800, 2), le(0, 2), le(0, 2), le(0x5B21, 2), le(crc, 4), le(dt.length, 4), le(dt.length, 4), le(nm.length, 2), le(0, 2));
    parts.push(new Uint8Array(h), nm, dt); cd.push(new Uint8Array([].concat(le(0x02014b50, 4), le(20, 2), le(20, 2), le(0x0800, 2), le(0, 2), le(0, 2), le(0x5B21, 2), le(crc, 4), le(dt.length, 4), le(dt.length, 4), le(nm.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(off, 4))), nm); off += h.length + nm.length + dt.length; });
  var cdLen = cd.reduce(function (s, a) { return s + a.length; }, 0), end = new Uint8Array([].concat(le(0x06054b50, 4), le(0, 2), le(0, 2), le(files.length, 2), le(files.length, 2), le(cdLen, 4), le(off, 4), le(0, 2)));
  return new Blob(parts.concat(cd, [end]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); }
function xlsxBlob(rows, sheet) { var x = function (v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); },
    col = function (i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  var body = rows.map(function (r, ri) { return '<row r="' + (ri + 1) + '">' + r.map(function (v, ci) { var ref = col(ci) + (ri + 1), st = ri === 0 ? ' s="1"' : ''; return typeof v === 'number' && isFinite(v) ? '<c r="' + ref + '"' + st + '><v>' + v + '</v></c>' : '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + x(v) + '</t></is></c>'; }).join('') + '</row>'; }).join('');
  var nm = x(String(sheet || 'Sheet1').replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31));
  return zipStore([['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + nm + '" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>'],
    ['xl/worksheets/sheet1.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>' + body + '</sheetData></worksheet>']]); }
function xlsxDownload(name, rows, sheet) { try { var a = document.createElement('a'); a.href = URL.createObjectURL(xlsxBlob(rows, sheet)); a.download = /\.xlsx$/.test(name) ? name : name + '.xlsx'; document.body.appendChild(a); a.click(); a.remove(); return true; } catch (e) { return false; } }
window.MedixData = { xlsxBlob: xlsxBlob, xlsxDownload: xlsxDownload, PRODUCTS: PRODUCTS, FORMS: FORMS, SUPPLIERS: SUPPLIERS, BRANCHES: BRANCHES, zonesFor: zonesFor, ctrlAllowed: ctrlAllowed, RECEIPTS: RECEIPTS, TODAY: '04.10.2026', TOMORROW: '05.10.2026', store: store, batches: batches, setReceipts: setReceipts, resetStore: resetStore,
  CUSTOMERS: CUSTOMERS, ORDERS: ORDERS, ORDER_STATUS: ORDER_STATUS, RESERVING: RESERVING, custById: custById, licValid: licValid, availFor: availFor, fefoPlan: fefoPlan, linePrice: linePrice, orderTotals: orderTotals, setOrders: setOrders, nextOrderNo: nextOrderNo, prodById: prodById,
  APPROVAL: APPROVAL, NOW: NOW, nowStr: nowStr, pDT: pDT, creditCheck: creditCheck, canApprove: canApprove, approverName: approverName, orderLog: orderLog, waitMin: waitMin, shortOf: shortOf, picksOf: picksOf, custFin: custFin, notify: notify, orderAct: orderAct, MANAGERS: MANAGERS, DIRECTOR: DIRECTOR, KEEPER: KEEPER,
  PICK: PICK, pickPlan: pickPlan, ensurePk: ensurePk, startPick: startPick, finishPick: finishPick, finishMark: finishMark, MK_ISSUES: MK_ISSUES, mkKind: mkKind, mkParse: mkParse, mkPretty: mkPretty, mkLines: mkLines, mkSum: mkSum, mkLeft: mkLeft, mkCnt: mkCnt, markerOf: markerOf, activeMarkOf: activeMarkOf, startMark: startMark, markScan: markScan, markRemove: markRemove, markNone: markNone, markIssue: markIssue, markTimer: markTimer, markDone: markDone, markStats: markStats, markJournal: markJournal, mkDemo: mkDemo, setQueueTime: setQueueTime, queueRes: queueRes, pickAlts: pickAlts, pickTimer: pickTimer, pickerOf: pickerOf, activePickOf: activePickOf, pickIssue: pickIssue, PICK_ISSUES: PICK_ISSUES, pickDone: pickDone, pickStats: pickStats, notifyPerm: notifyPerm, queueNotify: queueNotify, canCancelOrder: canCancelOrder, clkAdd: clkAdd, nowMs: nowMs, zoneType: zoneType, pickUpdate: pickUpdate,
  DRIVERS: DRIVERS, HOME_KINDS: HOME_KINDS, HOME_STD: HOME_STD, rlHome: rlHome, allBr: allBr, VEHICLES: VEHICLES, AREA_ORDER: AREA_ORDER, RET_REASONS: RET_REASONS, SHIP: SHIP, areaOf: areaOf, driverById: driverById, carByNo: carByNo, orderByNo: orderByNo, saleTotals: saleTotals, shippedQty: shippedQty, lineSum: lineSum, dueDate: dueDate,
  handOff: handOff, tripByNo: tripByNo, tripCopy: tripCopy, saveTrip: saveTrip, tripOfOrder: tripOfOrder, planTrip: planTrip, cancelTrip: cancelTrip, shipTrip: shipTrip, finishTrip: finishTrip, stopReturns: stopReturns, shipReady: shipReady, shipInfo: shipInfo, shipReset: shipReset, nextTripNo: nextTripNo,
  QM_REASONS: QM_REASONS, HC_REASONS: HC_REASONS, QY_REASONS: QY_REASONS, HC_RULE: HC_RULE, DOC_ROLES: DOC_ROLES, STAFF: STAFF, supByName: supByName, saleByNo: saleByNo, orderOfSale: orderOfSale, qmReturned: qmReturned, saleLines: saleLines, custSales: custSales,
  lineDocSum: lineDocSum, docSum: docSum, docQty: docQty, docById: docById, docByNo: docByNo, saveDoc: saveDoc, deleteDoc: deleteDoc, hcNeedsDirector: hcNeedsDirector, postDoc: postDoc, sendDoc: sendDoc, cancelDoc: cancelDoc, qmBlock: qmBlock, whBatches: whBatches, qmLinesFor: qmLinesFor, qyLinesFor: qyLinesFor, docsReset: docsReset, docCopy: docCopy,
  ACCOUNTS: ACCOUNTS, PAY_ROLES: PAY_ROLES, accById: accById, accountsOf: accountsOf, accBalance: accBalance, rcGross: rcGross, ledger: ledger, custLedger: custLedger, supLedger: supLedger, supDebt: supDebt, saleLedger: saleLedger, rcLedger: rcLedger, autoAlloc: autoAlloc, payCopy: payCopy, payById: payById, payByNo: payByNo, nextPayNo: nextPayNo, savePay: savePay, deletePay: deletePay, postPay: postPay, sendPay: sendPay, returnPay: returnPay, cancelPay: cancelPay, custPending: custPending, payEra: payEra, payReset: payReset, restoreBase: restoreBase, accMoves: accMoves, lastClosed: lastClosed, dayClosed: dayClosed, closeDay: closeDay, reconcile: reconcile, totalMoney: totalMoney, MOP_ITEMS: MOP_ITEMS, MOP_RULE: MOP_RULE, MOP_ROLES: MOP_ROLES, mopCopy: mopCopy, mopById: mopById, mopByNo: mopByNo, nextMopNo: nextMopNo, saveMop: saveMop, deleteMop: deleteMop, mopNeedsApproval: mopNeedsApproval, mopEffects: mopEffects, postMop: postMop, sendMop: sendMop, returnMop: returnMop, cancelMop: cancelMop, invoicesOf: invoicesOf,
  ADV_ROLES: ADV_ROLES, advByNo: advByNo, advFor: advFor, advsOf: advsOf, saveAdv: saveAdv, advSum: advSum, postAdv: postAdv, cancelAdv: cancelAdv, autoAdv: autoAdv, advCopy: advCopy, partyName: partyName, partyStir: partyStir, agingOf: agingOf, debtState: debtState, debtOf: debtOf, supsIn: supsIn, supOk: supOk, supPick: supPick, empApply: empApply, debtMoves: debtMoves, reconCalc: reconCalc, reconByNo: reconByNo, saveRecon: saveRecon, reconStep: reconStep, reconsOf: reconsOf, reconCopy: reconCopy, demoSale: demoSale, openDebt: openDebt, TR_LABEL: TR_LABEL, TR_ROLES: TR_ROLES, TR_REASONS: TR_REASONS, TR_VAT: TR_VAT, trCopy: trCopy, trByNo: trByNo, trById: trById, saveTr: saveTr, deleteTr: deleteTr, trStep: trStep, defZone: defZone, trFree: trFree, trNeedsAppr: trNeedsAppr, trCheck: trCheck, trLineSum: trLineSum, trSum: trSum, trRecvQty: trRecvQty, trShort: trShort, transitList: transitList, resolveBack: resolveBack, resolveHc: resolveHc, trCancelBlock: trCancelBlock, groupDebt: groupDebt, whName: whName, nextTrNo: nextTrNo, zoneType: zoneType, partyBranch: partyBranch, supLedger: supLedger, HC_REASONS: HC_REASONS, IV_ROLES: IV_ROLES, IV_RULE: IV_RULE, IV_LAST: IV_LAST, ivCopy: ivCopy, ivByNo: ivByNo, saveIv: saveIv, deleteIv: deleteIv, ivZones: ivZones, ivScope: ivScope, ivActive: ivActive, ivLock: ivLock, pickLock: pickLock, ivWaitOrders: ivWaitOrders, ivStart: ivStart, ivStep: ivStep, ivDiff: ivDiff, ivSum: ivSum, ivCtrlDiff: ivCtrlDiff, ivNeedsDir: ivNeedsDir, lastCost: lastCost, marks: marks, markByCode: markByCode, markMismatch: markMismatch, gtinOf: gtinOf, docByNo: docByNo, orderOfSale: orderOfSale,
  BQ_TYPES: BQ_TYPES, BQ_CUT: BQ_CUT, BQ_ROLES: BQ_ROLES, bqCopy: bqCopy, bqByNo: bqByNo, bqKey: bqKey, bqPosted: bqPosted, bqStatus: bqStatus, saveBq: saveBq, deleteBq: deleteBq, bqSum: bqSum, bqPost: bqPost, bqCancel: bqCancel, bqFirstMove: bqFirstMove, bqOfArch: bqOfArch, bqOfBatch: bqOfBatch, bqCutoff: bqCutoff, bqCutoffErr: bqCutoffErr, bqDemoClear: bqDemoClear, accOpen: accOpen,
  toLat: toLat, bqNum: bqNum, bqDate: bqDate, bqMatch: bqMatch, bqSimilar: bqSimilar, bqZone: bqZone, bqFields: bqFields, bqAutoMap: bqAutoMap, bqSample: bqSample, bqValidate: bqValidate, bqLinesFrom: bqLinesFrom, agingOf: agingOf, bqNorm: bqNorm,
  KT_TYPES: KT_TYPES, KT_PRICE: KT_PRICE, KT_R: KT_R, KT_OPS: KT_OPS, KT_BUY: KT_BUY, stirD: stirD, stirF: stirF, accF: accF, ktKey: ktKey, ktByKey: ktByKey, ktByStir: ktByStir, ktOf: ktOf, ktLic: ktLic, ktLicState: ktLicState, ktCopy: ktCopy, ktSave: ktSave, ktCreate: ktCreate, ktCards: ktCards, ktTermsOf: ktTermsOf, ktDebt: ktDebt, ktOrderBlock: ktOrderBlock, ktBlockImpact: ktBlockImpact, ktLast: ktLast, ktDocs: ktDocs, ktSupProducts: ktSupProducts, ktSimilar: ktSimilar, ktImport: ktImport, ktApply: ktApply, openParty: openParty, custAt: custAt, custsIn: custsIn,
  NR_TYPES: NR_TYPES, NR_R: NR_R, priceAt: priceAt, priceNext: priceNext, priceSnap: priceSnap, priceStamp: priceStamp, priceDiffOf: priceDiffOf, lineSplit: lineSplit, planFor: planFor, pickPrice: pickPrice, batchPriceAt: batchPriceAt, prCtx: prCtx, priceHist: priceHist, priceFor: priceFor, lastCost: lastCost, nrByNo: nrByNo, saveNo: saveNo, nrBranches: nrBranches, nrCheck: nrCheck, nrDraftImpact: nrDraftImpact, nrPost: nrPost, nrCancel: nrCancel, nrLinesOf: nrLinesOf, r100: r100,
  LK_KINDS: LK_KINDS, LK_R: LK_R, lkUse: lkUse, lkSave: lkSave, lkDup: lkDup, lkMerge: lkMerge, lkApply: lkApply, costBasis: costBasis, custBrs: custBrs,
  ROLE_IDS: ROLE_IDS, RL_MODS: RL_MODS, PERMISSIONS: PERMISSIONS, PERM_BY: PERM_BY, NAV_PERM: NAV_PERM, rlDefault: rlDefault, rlLock: rlLock, permsOf: permsOf, can: can, navCan: navCan, whoCan: whoCan, rlRoles: rlRoles, rlToggle: rlToggle, rlDiff: rlDiff, rlSave: rlSave,
  EMP_LIMIT: EMP_LIMIT, LOGIN_URL: LOGIN_URL, empLoginFor: empLoginFor, empByLogin: empByLogin, empName: empName, empPw: empPw, empSave: empSave, empAct: empAct, rlFinish: rlFinish, seedRl: seedRl,
  EMPLOYEES: EMPLOYEES, empNames: empNames, ktCustInfo: ktCustInfo, ktSupInfo: ktSupInfo, ktSearch: ktSearch, ktNorm: ktNorm, supInvoices: supInvoices, supDueBucket: supDueBucket, supBonusList: supBonusList, supBonusBalances: supBonusBalances, supReminders: supReminders, bonusOf: bonusOf, bonusDecide: bonusDecide, rcDue: rcDue, rcAutoDue: rcAutoDue, rcTerms: rcTerms, rcGood: rcGood, rcDmg: rcDmg, rcPayQty: rcPayQty, rcHasFact: rcHasFact, rcBonusGoods: rcBonusGoods, basePrice: basePrice, empByName: empByName, CONFIG: CONFIG, CFG0: CFG0, orderFrozen: orderFrozen, freezeOrders: freezeOrders, ZT_REQ: ZT_REQ, auditAdd: auditAdd, auditList: auditList, lastLogin: lastLogin, bsStock: bsStock, bsOpenDocs: bsOpenDocs, bsTransit: bsTransit, bsCustDebt: bsCustDebt, bsSupDebt: bsSupDebt, bsMoney: bsMoney, bsBranchCheck: bsBranchCheck, bsWhCheck: bsWhCheck, bsDocCount: bsDocCount, bsSave: bsSave, cfgMeta: cfgMeta, cfgSave: cfgSave, vatAdd: vatAdd, expiryWarn: expiryWarn, pendingOrders: pendingOrders, docPrefixes: docPrefixes, empAudit: empAudit, sessionsOf: sessionsOf, pinOf: pinOf, pinNeeded: pinNeeded, prCfg: prCfg, prCfgSet: prCfgSet, prSigner: prSigner, code128: code128, printForms: printForms, printItems: printItems, prSaleOf: prSaleOf, sumInWordsUz: sumInWordsUz, bankMfo: bankMfo, prBranch: prBranch, prParty: prParty, prPrints: prPrints, prLog: prLog, printData: printData, pD: pD, fD: fD, rptRange: rptRange, rptPrev: rptPrev, rptFacts: rptFacts, rptFsDocs: rptFsDocs, bhGroupDebt: bhGroupDebt, DATA_FROM: DATA_FROM, bhRange: bhRange, bhSales: bhSales, saleNet: saleNet, saleCost: saleCost, batchCost: batchCost, grossProfit: grossProfit, bhDaily: bhDaily, bhTopProducts: bhTopProducts, bhDebt: bhDebt, bhSupDebt: bhSupDebt, bhMoney: bhMoney, bhStockValue: bhStockValue, bhExpiry: bhExpiry, bhExpiredOpen: bhExpiredOpen, bhApprovals: bhApprovals, bhLicExpired: bhLicExpired, bhInvDue: bhInvDue, bhCashOpenDays: bhCashOpenDays, bhBankOpen: bhBankOpen, bhAttention: bhAttention, bhFlow: bhFlow, bhCalendar: bhCalendar, bhSetup: bhSetup, bhWait: bhWait, NOW: NOW, CASH_RESP: CASH_RESP, pinApprovers: pinApprovers, pinLock: pinLock, pinCheck: pinCheck, pinSign: pinSign, pinSet: pinSet, empActive: empActive, histKind: histKind, ACT_KINDS: ACT_KINDS, KEEPER: KEEPER, pinWeak: pinWeak };
Object.defineProperty(window.MedixData, 'AUDIT', { get: auditList });
Object.assign(window.MedixData, { opSales: opSales, supGoods: supGoods, ivByNo: ivByNo }); // T10b
Object.assign(window.MedixData, { cashDash: cashDash, tillAccts: tillAccts, CASH_RESP: CASH_RESP, PT_OF: PT_OF, ioTypeOf: ioTypeOf, MOP_ITEMS: MOP_ITEMS, lastClosed: lastClosed, dayClosed: dayClosed, drvCash: drvCash }); // Y4
// 1a: eski nomlar — matritsadan o'qiladi
Object.defineProperty(window.MedixData, 'COST_ROLES', { get: function () { return whoCan('special.cost'); } });
Object.defineProperty(window.MedixData, 'RECON_ROLES', { get: function () { return whoCan('recon.create'); } });
window.MedixData.allBr = allBr; Object.assign(window.MedixData, { seedPtypes: seedPtypes, ptApply: ptApply, ptByCode: ptByCode, ptBase: ptBase, ptName: ptName, ptSave: ptSave, ptCusts: ptCusts, ptAttach: ptAttach, r100up: r100up, basePrice: basePrice, priceInfo: priceInfo, avgCost: avgCost, vatOf: vatOf, withVat: withVat, nrCheckLine: nrCheckLine, nrSet: nrSet, nrApprove: nrApprove, nrReject: nrReject, nrSum: nrSum, nrCheck: nrCheck, ptStats: ptStats, prNo: prNo, prodActive: prodActive, prodByCode: prodByCode, prodNewCode: prodNewCode, eanCheck: eanCheck, prodOpenOrders: prodOpenOrders, prodHasMoves: prodHasMoves, prodSave: prodSave, prodSetActive: prodSetActive, prodHist: prodHist, prodMoves: prodMoves, prodMatch: prodMatch, prodSearch: prodSearch, PROD_F: PROD_F, COUNTRIES: COUNTRIES }); window.MedixData.canR = canR; window.MedixData.PERM_KEYS = PK; window.MedixData.branchLead = branchLead; window.MedixData.pinApprovers = window.MedixData.pinApprovers || pinApprovers; window.MedixData.TR_ACT = TR_ACT;
Object.assign(window.MedixData, { FAIL_REASONS: FAIL_REASONS, FAIL_LABEL: FAIL_LABEL, PART_REASONS: PART_REASONS, PART_LABEL: PART_LABEL, RET_DIFF: RET_DIFF, payTypeOf: payTypeOf, drvByName: drvByName, tripsOfDriver: tripsOfDriver, stopOf: stopOf, tripOfAny: tripOfAny, stopPending: stopPending, cashExpect: cashExpect, tripLoad: tripLoad, tripUnload: tripUnload, tripStart: tripStart, stopSet: stopSet, tripFinish: tripFinish, tripSettle: tripSettle, retList: retList, retAccept: retAccept, drvCash: drvCash, cashAccept: cashAccept, SAMPLE_PHOTO: SAMPLE_PHOTO }); // T9-4b
Object.assign(window.MedixData, { POSTPICK: POSTPICK, CHK_REASONS: CHK_REASONS, STAGES: STAGES, STAGE_NORM: STAGE_NORM, checkerOf: checkerOf, activeCheckOf: activeCheckOf, startCheck: startCheck, checkSet: checkSet, chkLines: chkLines, finishCheck: finishCheck, checkReturn: checkReturn, rwOpen: rwOpen, fleetCars: fleetCars, tripDrivers: tripDrivers, dcTripOf: dcTripOf, placesOf: placesOf, docsTrip: docsTrip, docsPickup: docsPickup, docsDone: docsDone, docsUndo: docsUndo, tripDrop: tripDrop, dcCodes: dcCodes, prNakOrder: prNakOrder, openIssues: openIssues, issueResolve: issueResolve, stageOf: stageOf, stageInfo: stageInfo, monitorData: monitorData, mkGotB: mkGotB, orderById: orderById, markerOf: markerOf }); // T9-4a
Object.assign(window.MedixData, { maxQtyOver: maxQtyOver, custRecent: custRecent, custPayDefault: custPayDefault, openDocGet: openDocGet, openDocSet: openDocSet, availMap: availMap, catalogRows: catalogRows, DRAFT_CANCEL: DRAFT_CANCEL, cancelDraft: cancelDraft, mmFill: mmFill, PAY_TYPES: PAY_TYPES, payTypeName: payTypeName, apprReasonsOf: apprReasonsOf, orderCheck: orderCheck, submitOrder: submitOrder, mlnS: mlnS, lvlName: lvlName, PT3: PT3, ST_ALL: ST_ALL, ST_HOME: ST_HOME, stKey: stKey, stEnteredAt: stEnteredAt, orderLate: orderLate, ordStats: ordStats, perRange: perRange, bhSalesPT: bhSalesPT, bhDebtPT: bhDebtPT, bhSupDebtPT: bhSupDebtPT, bhExpPT: bhExpPT, brCodes: brCodes, bhExpBands: bhExpBands, bhTransitDocs: bhTransitDocs, apprPage: apprPage, AG_BANDS: AG_BANDS, EXP_BANDS: EXP_BANDS, demoUi: demoUi, holderOf: holderOf, menuCan: menuCan }); // T9-4c
})();
