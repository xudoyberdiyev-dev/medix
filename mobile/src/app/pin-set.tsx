import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyRound } from "lucide-react-native";
import { useT } from "../i18n";
import { isComplete, popDigit, pushDigit } from "../lib/pin";
import { savePin } from "../lib/pin-store";
import { Keypad, PinDots } from "../ui/parts";
import { color, space, text } from "../ui/theme";

export default function PinSet() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [first, setFirst] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const confirming = first !== null;

  function digit(d: string) {
    const next = pushDigit(pin, d);
    setPin(next);
    setError(null);
    if (!isComplete(next)) return;
    if (!confirming) {
      setFirst(next);
      setPin("");
    } else if (next === first) {
      void savePin(next).then(() => router.replace("/home"));
    } else {
      setFirst(null);
      setPin("");
      setError(t("pin.mismatch"));
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }]}>
      <Text style={[text.caption, { color: color.primaryButton, fontSize: 12, paddingHorizontal: 20 }]}>{t(confirming ? "pin.confirmStep" : "pin.setStep")}</Text>
      <View style={styles.head}>
        <View style={styles.badge}>
          <KeyRound size={30} strokeWidth={1.5} color={color.primaryButton} />
        </View>
        <Text style={[text.titleLg, { textAlign: "center" }]}>{t(confirming ? "pin.confirmTitle" : "pin.setTitle")}</Text>
        <Text style={[text.body, { color: color.textSecondary, textAlign: "center" }]}>{t(confirming ? "pin.confirmIntro" : "pin.setIntro")}</Text>
      </View>
      <View style={{ marginTop: 36 }}>
        <PinDots count={pin.length} label={t("pin.progress", { count: pin.length })} />
      </View>
      {error ? <Text accessibilityLiveRegion="polite" style={[text.body, { color: color.danger, textAlign: "center", marginTop: space.md }]}>{error}</Text> : null}
      <View style={{ flex: 1 }} />
      <Keypad onDigit={digit} onDelete={() => setPin(popDigit(pin))} deleteLabel={t("pin.delete")} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.background },
  head: { alignItems: "center", gap: 10, paddingHorizontal: 32, paddingTop: 20 },
  badge: { width: 64, height: 64, borderRadius: 32, backgroundColor: color.primarySoft, alignItems: "center", justifyContent: "center" },
});
