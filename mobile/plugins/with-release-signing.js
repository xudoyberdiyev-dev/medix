// Expo config plugin: release APK'ni egasining kaliti bilan imzolash (CI'da, env orqali).
// Kalit yo'q bo'lsa — vaqtinchalik debug kalit (docs/mobil-apk.md).
// android/ papkasi qo'lda tahrirlanmaydi (CNG) — imzolash faqat shu plugin orqali.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARK = "// yuzplus-release-signing";

const SIGNING = `        ${MARK}
        if (System.getenv("YUZPLUS_KEYSTORE")) {
            release {
                storeFile file(System.getenv("YUZPLUS_KEYSTORE"))
                storePassword System.getenv("YUZPLUS_KEYSTORE_PASSWORD")
                keyAlias System.getenv("YUZPLUS_KEY_ALIAS")
                keyPassword System.getenv("YUZPLUS_KEY_PASSWORD")
            }
        }
`;

function applySigning(gradle) {
  if (gradle.includes(MARK)) return gradle;
  const withConfig = gradle.replace(/signingConfigs\s*\{\n/, (m) => m + SIGNING);
  // buildTypes.release ichidagi birinchi «signingConfig signingConfigs.debug»
  const releaseIdx = withConfig.search(/buildTypes\s*\{[\s\S]*?release\s*\{/);
  if (withConfig === gradle || releaseIdx < 0) {
    throw new Error("with-release-signing: build.gradle tuzilmasi kutilganidek emas");
  }
  const head = withConfig.slice(0, releaseIdx);
  const tail = withConfig
    .slice(releaseIdx)
    .replace(
      /(release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      '$1signingConfig System.getenv("YUZPLUS_KEYSTORE") ? signingConfigs.release : signingConfigs.debug',
    );
  return head + tail;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    c.modResults.contents = applySigning(c.modResults.contents);
    return c;
  });
};
module.exports.applySigning = applySigning;
