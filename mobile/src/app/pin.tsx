import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "../i18n";
import { isComplete, popDigit, pushDigit } from "../lib/pin";
import { logout } from "../lib/auth";
import { checkPin } from "../lib/pin-store";
import { Keypad, PinDots } from "../ui/parts";
import { color, font, space, text } from "../ui/theme";

export default function PinEnter() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  function digit(d: string) {
    const next = pushDigit(pin, d);
    setPin(next);
    if (!isComplete(next)) return;
    void checkPin(next).then((r) => {
      setPin("");
      if (r.ok) return router.replace("/home");
      if (r.locked) {
        setError(t("pin.locked"));
        void logout().then(() => router.replace("/login"));
        return;
      }
      setError(t("pin.wrong", { left: r.left }));
    });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 26 }]}>
      <View style={styles.head}>
        <Text style={[text.titleLg, { textAlign: "center" }]}>{t("pin.enter")}</Text>
      </View>
      <View style={{ marginTop: 32 }}>
        <PinDots count={pin.length} label={t("pin.progress", { count: pin.length })} />
      </View>
      <Text accessibilityLiveRegion="polite" style={[text.caption, { textAlign: "center", marginTop: 18, color: error ? color.danger : color.textSecondary }]}>
        {error ?? t("pin.limit")}
      </Text>
      <View style={{ flex: 1 }} />
      <Keypad onDigit={digit} onDelete={() => setPin(popDigit(pin))} deleteLabel={t("pin.delete")} />
      <Pressable
        accessibilityRole="button"
        onPress={() => void logout().then(() => router.replace("/login"))}
        style={{ alignSelf: "center", minHeight: 44, justifyContent: "center", marginTop: space.md }}
      >
        <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.primaryButton }}>{t("pin.forgot")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.background },
  head: { alignItems: "center", gap: 10, paddingHorizontal: 32 },
});
