import { Pressable, StyleSheet, Text, View, type PressableProps } from "react-native";
import { Delete, type LucideIcon } from "lucide-react-native";
import { color, font, radius, text, touch } from "./theme";
import { PIN_LENGTH } from "../lib/pin";

export function Logo({ size = 40 }: { size?: number }) {
  const bar = size * 0.14;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size * 0.26, backgroundColor: color.accent, alignItems: "center", justifyContent: "center" }}
    >
      <View style={{ position: "absolute", width: size * 0.5, height: bar, borderRadius: bar / 2, backgroundColor: color.brand900 }} />
      <View style={{ position: "absolute", width: bar, height: size * 0.5, borderRadius: bar / 2, backgroundColor: color.brand900 }} />
    </View>
  );
}

type ButtonProps = Omit<PressableProps, "children"> & { label: string; icon?: LucideIcon; variant?: "primary" | "secondary"; loading?: boolean };

export function Button({ label, icon: Icon, variant = "primary", loading, disabled, style, ...rest }: ButtonProps) {
  const primary = variant === "primary";
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      style={(s) => [
        styles.btn,
        primary ? styles.btnPrimary : styles.btnSecondary,
        off && { opacity: 0.45 },
        s.pressed && !off && { opacity: 0.85 },
        typeof style === "function" ? style(s) : style,
      ]}
      {...rest}
    >
      {Icon ? <Icon size={20} strokeWidth={1.5} color={primary ? color.textOnDark : color.textPrimary} /> : null}
      <Text style={[styles.btnText, { color: primary ? color.textOnDark : color.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

export function PinDots({ count, label }: { count: number; label: string }) {
  return (
    <View accessible accessibilityLabel={label} style={styles.dots}>
      {Array.from({ length: PIN_LENGTH }, (_, i) => (
        <View key={i} style={[styles.dot, i < count && styles.dotFull]} />
      ))}
    </View>
  );
}

export function Keypad({ onDigit, onDelete, deleteLabel }: { onDigit: (d: string) => void; onDelete: () => void; deleteLabel: string }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
  return (
    <View style={styles.pad}>
      {keys.map((k, i) =>
        k === "" ? (
          <View key={i} style={styles.keyCell} />
        ) : k === "del" ? (
          <Pressable key={i} accessibilityRole="button" accessibilityLabel={deleteLabel} onPress={onDelete} style={[styles.keyCell, styles.key, { backgroundColor: "transparent" }]}>
            <Delete size={26} strokeWidth={1.5} color={color.textSecondary} />
          </Pressable>
        ) : (
          <Pressable key={i} accessibilityRole="button" accessibilityLabel={k} onPress={() => onDigit(k)} style={({ pressed }) => [styles.keyCell, styles.key, pressed && { backgroundColor: color.divider }]}>
            <Text style={styles.keyText}>{k}</Text>
          </Pressable>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { minHeight: touch.primary, borderRadius: radius.control, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  btnPrimary: { backgroundColor: color.primaryButton, borderColor: color.primaryButton },
  btnSecondary: { backgroundColor: color.surface, borderColor: color.border },
  btnText: { fontFamily: font.semibold, fontSize: 16 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 18 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: color.textDisabled },
  dotFull: { backgroundColor: color.primaryButton, borderColor: color.primaryButton },
  pad: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 24, rowGap: 10, justifyContent: "space-between" },
  keyCell: { width: "31.5%", height: 64 },
  key: { borderRadius: 14, backgroundColor: color.surface, alignItems: "center", justifyContent: "center" },
  keyText: { ...text.titleLg, fontFamily: font.medium, fontSize: 26 },
});
