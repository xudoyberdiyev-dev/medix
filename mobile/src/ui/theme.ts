// 100+ tokenlari — frontend/app/globals.css bilan bir xil (yorugʻ mavzu).
// Komponentlarda HEX yozilmaydi: faqat shu tokenlar.
export const color = {
  brand900: "#123C3A",
  brand800: "#1A4D4A",
  primary: "#0D9488",
  primaryButton: "#0F766E",
  primarySoft: "#DDF5EE",
  accent: "#2DD4BF",
  background: "#F5F7F8",
  surface: "#FFFFFF",
  textPrimary: "#172B2A",
  textSecondary: "#5B6B6A",
  textDisabled: "#94A3A1",
  textOnDark: "#FFFFFF",
  textOnDarkMuted: "#B9D3CF",
  border: "#E2E8F0",
  divider: "#EEF2F4",
  borderStrong: "#CBD5D4",
  success: "#15803D",
  successBg: "#F0FDF4",
  successBorder: "#BBF7D0",
  warning: "#B45309",
  warningBg: "#FFFBEB",
  warningBorder: "#FDE68A",
  danger: "#B91C1C",
  dangerBg: "#FEF2F2",
  info: "#1D4ED8",
  infoBg: "#EFF6FF",
  overlay: "rgba(18,43,42,0.45)",
} as const;

export const radius = { control: 10, card: 12, sheet: 22, pill: 999 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

export const font = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

export const text = {
  title: { fontFamily: font.semibold, fontSize: 20, lineHeight: 25, color: color.textPrimary },
  titleLg: { fontFamily: font.semibold, fontSize: 24, lineHeight: 30, color: color.textPrimary },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: color.textPrimary },
  bodyStrong: { fontFamily: font.semibold, fontSize: 15, lineHeight: 21, color: color.textPrimary },
  label: { fontFamily: font.semibold, fontSize: 14, lineHeight: 19, color: color.textPrimary },
  caption: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: color.textSecondary },
} as const;

/** Barmoq bilan bosiladigan eng kichik balandlik (dizayn: 44+, asosiy tugma 52). */
export const touch = { min: 44, primary: 52 } as const;
