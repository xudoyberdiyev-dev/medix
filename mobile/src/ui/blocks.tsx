import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { AlertTriangle, CheckCircle2, Clock, type LucideIcon } from "lucide-react-native";
import { Button } from "./parts";
import { color, font, radius, space, text } from "./theme";

export function Card({ children, style, accent }: { children: ReactNode; style?: StyleProp<ViewStyle>; accent?: "active" | "done" }) {
  return (
    <View
      style={[
        styles.card,
        accent === "active" && { borderColor: color.primary, borderWidth: 2 },
        accent === "done" && { borderLeftColor: color.success, borderLeftWidth: 3 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.section}>{children.toUpperCase()}</Text>;
}

type Tone = "success" | "neutral" | "warning" | "danger" | "info";
const TONE: Record<Tone, { fg: string; bg: string }> = {
  success: { fg: color.success, bg: color.successBg },
  neutral: { fg: color.textSecondary, bg: color.divider },
  warning: { fg: color.warning, bg: color.warningBg },
  danger: { fg: color.danger, bg: color.dangerBg },
  info: { fg: color.primaryButton, bg: color.primarySoft },
};

/** Holat = ikonka (ixtiyoriy) + soʻz + rang. */
export function Chip({ label, tone, icon: Icon }: { label: string; tone: Tone; icon?: LucideIcon }) {
  const c = TONE[tone];
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]}>
      {Icon ? <Icon size={14} strokeWidth={1.5} color={c.fg} /> : null}
      <Text style={[styles.chipText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

export const StatusIcons = { done: CheckCircle2, waiting: Clock, warn: AlertTriangle };

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={color.primaryButton} />
    </View>
  );
}

export function ErrorState({ message, retry, retryLabel }: { message: string; retry: () => void; retryLabel: string }) {
  return (
    <Card style={{ alignItems: "center", gap: space.md, paddingVertical: 24 }}>
      <AlertTriangle size={26} strokeWidth={1.5} color={color.danger} />
      <Text style={[text.body, { textAlign: "center" }]}>{message}</Text>
      <Button label={retryLabel} variant="secondary" onPress={retry} style={{ alignSelf: "stretch" }} />
    </Card>
  );
}

export function Notice({ children, tone = "warning" }: { children: string; tone?: "warning" | "info" }) {
  const c = tone === "warning" ? { fg: color.warning, bg: color.warningBg, border: color.warningBorder } : { fg: color.info, bg: color.infoBg, border: color.infoBg };
  return (
    <View style={[styles.notice, { backgroundColor: c.bg, borderColor: c.border }]}>
      <AlertTriangle size={16} strokeWidth={1.5} color={c.fg} style={{ marginTop: 2 }} />
      <Text style={[text.caption, { color: c.fg, fontSize: 13, lineHeight: 19, flex: 1 }]}>{children}</Text>
    </View>
  );
}

export const mono = { fontFamily: "monospace", fontSize: 13, color: color.textPrimary, fontWeight: "600" as const };

const styles = StyleSheet.create({
  card: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, borderRadius: radius.card, padding: 14, gap: 10 },
  section: { fontFamily: font.semibold, fontSize: 12, letterSpacing: 0.6, color: color.textSecondary, marginTop: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontFamily: font.semibold, fontSize: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  notice: { flexDirection: "row", gap: 8, borderWidth: 1, borderRadius: radius.card, padding: 12 },
});
