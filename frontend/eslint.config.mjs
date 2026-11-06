import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // T12-audit №19: faqat ikonkali tugma — ekran oʻquvchi uchun aria-label majburiy.
    files: ["**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name='Button']:has(JSXAttribute[name.name='variant'][value.value='icon']):not(:has(JSXAttribute[name.name='aria-label'])):not(:has(JSXSpreadAttribute))",
          message: "Ikonkali tugmaga aria-label yozing (nima qilishini fe'l bilan: «Yopish», «Oʻchirish»).",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
