# 100+ Haydovchi — APK yigʻish va imzolash

APK GitHub Actions'da avtomatik yigʻiladi (`.github/workflows/mobile-apk.yml`):

- `develop` ga `mobile/**` oʻzgarishi push qilinsa → **Releases → «100+ Haydovchi — sinov (develop)»** (`haydovchi-dev`, har safar yangilanadi).
- `main` ga tushsa → **Releases → «100+ Haydovchi 1.0.0 (#N)»** (`haydovchi-v<versiya>-<N>`).
- Qoʻlda: Actions → `mobile-apk` → **Run workflow**.

APK'ni telefonga: Releases sahifasidan `.apk` faylni yuklab oling → oching → «Nomaʼlum manbalardan oʻrnatish»ga ruxsat bering.

## Imzolash kaliti (egasi bir marta qiladi)

Hozir Secrets'da kalit yoʻq — APK **vaqtinchalik debug kalit** bilan imzolanadi (fayl nomida `-debugkey`). U ishlaydi, lekin:

- debug kalit hammaga maʼlum — haqiqiy haydovchilarga tarqatish uchun yaramaydi;
- debug kalitli APK'dan egasining kalitli APK'ga oʻtganda ilovani **oʻchirib, qayta oʻrnatish** kerak boʻladi (Android imzo mos kelmasa yangilamaydi).

Shu sabab haydovchilarga tarqatishdan oldin kalit yarating. Kalit **bir marta** yaratiladi va **hech qachon yoʻqotilmasin** — yoʻqolsa, ilovani yangilab boʻlmaydi (hamma qayta oʻrnatadi).

### 1. Kalit yaratish (kompyuterda, JDK oʻrnatilgan boʻlsa)

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore yuzplus-upload.keystore -alias yuzplus \
  -keyalg RSA -keysize 4096 -validity 10000
```

Soʻralganda kuchli parol kiriting (keystore paroli va kalit paroli — bir xil boʻlishi mumkin). Ism/tashkilot maydonlariga «100+» yozsangiz yetarli.

### 2. GitHub Secrets'ga qoʻyish

Repo → **Settings → Secrets and variables → Actions → New repository secret**, toʻrttasi:

| Secret | Qiymat |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 yuzplus-upload.keystore` chiqishi (macOS: `base64 -i yuzplus-upload.keystore`) |
| `ANDROID_KEYSTORE_PASSWORD` | keystore paroli |
| `ANDROID_KEY_ALIAS` | `yuzplus` |
| `ANDROID_KEY_PASSWORD` | kalit paroli |

### 3. Saqlash

`yuzplus-upload.keystore` faylini va parolni ikki joyda saqlang (masalan, parol menejeri + flesh). Repo'ga **qoʻymang** (`.gitignore` `*.keystore` ni rad etadi).

Secrets qoʻyilgach keyingi yigʻishdan boshlab APK egasining kaliti bilan chiqadi (fayl nomida `-release`).

## Texnik

- `android/` papkasi repoda yoʻq (Expo CNG): CI `expo prebuild` bilan yaratadi.
- Imzolash `mobile/plugins/with-release-signing.js` config plugin orqali: `YUZPLUS_KEYSTORE` env boʻlsa release kalit, aks holda debug.
- `versionCode` = Actions ishga tushirish raqami (har yigʻish oldingisidan katta → yangilash ishlaydi).
- Arxitekturalar: `arm64-v8a`, `armeabi-v7a` (haqiqiy telefonlar; emulyator x86 kirmaydi — hajm kichikroq).
