import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Eye, EyeOff, Info, Languages, Lock, UserRound } from "lucide-react-native";
import { LOCALES, useT } from "../i18n";
import { login, LoginError } from "../lib/auth";
import { Button, Logo } from "../ui/parts";
import { color, font, radius, space, text, touch } from "../ui/theme";

export default function Login() {
  const { t, locale, setLocale } = useT();
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!user.trim() || !pass) return setError(t("login.required"));
    setBusy(true);
    setError(null);
    try {
      await login(user.trim(), pass);
      router.replace("/pin-set");
    } catch (e) {
      const kind = e instanceof LoginError ? e.kind : "network";
      setError(t(kind === "credentials" ? "login.failed" : kind === "role" ? "login.notDriver" : "login.network"));
    } finally {
      setBusy(false);
    }
  }

  const nextLocale = LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length];
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.brand900 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.hero, { paddingTop: insets.top + 20 }]}>
        <View style={styles.row}>
          <View style={[styles.row, { gap: 10 }]}>
            <Logo size={40} />
            <View>
              <Text style={[text.bodyStrong, { color: color.textOnDark, fontSize: 17 }]}>{t("app.name")}</Text>
              <Text style={[text.caption, { color: color.textOnDarkMuted, fontSize: 13 }]}>{t("app.role")}</Text>
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t("login.language")} onPress={() => setLocale(nextLocale)} style={styles.lang}>
            <Languages size={14} strokeWidth={1.5} color={color.textOnDark} />
            <Text style={styles.langText}>{locale === "ru" ? "RU" : locale === "uz-Cyrl" ? "ЎЗ" : "OʻZ"}</Text>
          </Pressable>
        </View>
        <Text style={[text.titleLg, { color: color.textOnDark, fontSize: 26, marginTop: 22 }]}>{t("login.title")}</Text>
        <Text style={[text.body, { color: color.textOnDarkMuted, marginTop: 6 }]}>{t("login.intro")}</Text>
      </View>
      <ScrollView style={styles.sheet} contentContainerStyle={[styles.sheetBody, { paddingBottom: insets.bottom + 20 }]} keyboardShouldPersistTaps="handled">
        <Text style={text.label} nativeID="lg">{t("login.login")}</Text>
        <View style={styles.input}>
          <UserRound size={20} strokeWidth={1.5} color={color.textSecondary} />
          <TextInput accessibilityLabelledBy="lg" value={user} onChangeText={setUser} autoCapitalize="none" autoCorrect={false} autoComplete="username" style={styles.field} />
        </View>
        <Text style={[text.label, { marginTop: space.md }]} nativeID="pw">{t("login.password")}</Text>
        <View style={styles.input}>
          <Lock size={20} strokeWidth={1.5} color={color.textSecondary} />
          <TextInput accessibilityLabelledBy="pw" value={pass} onChangeText={setPass} secureTextEntry={!show} autoComplete="password" onSubmitEditing={() => void submit()} style={styles.field} />
          <Pressable accessibilityRole="button" accessibilityLabel={t(show ? "login.hidePassword" : "login.showPassword")} onPress={() => setShow(!show)} hitSlop={12}>
            {show ? <EyeOff size={20} strokeWidth={1.5} color={color.textSecondary} /> : <Eye size={20} strokeWidth={1.5} color={color.textSecondary} />}
          </Pressable>
        </View>
        {error ? <Text accessibilityLiveRegion="polite" style={[text.body, { color: color.danger, marginTop: space.sm }]}>{error}</Text> : null}
        <Button label={t("login.submit")} loading={busy} onPress={() => void submit()} style={{ marginTop: space.lg }} />
        <View style={styles.note}>
          <Info size={18} strokeWidth={1.5} color={color.info} />
          <Text style={[text.caption, { color: color.info, fontSize: 13, lineHeight: 19, flex: 1 }]}>{t("login.forgot")}</Text>
        </View>
        <Text style={[text.caption, { textAlign: "center", marginTop: 28 }]}>{t("app.version", { version: Constants.expoConfig?.version ?? "1.0.0" })}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 24, paddingBottom: 40 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  lang: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: color.brand800, borderRadius: radius.pill, paddingHorizontal: 12, minHeight: 32 },
  langText: { fontFamily: font.semibold, fontSize: 12, color: color.textOnDark },
  sheet: { flex: 1, marginTop: -20, backgroundColor: color.background, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetBody: { padding: 20, paddingTop: 24, gap: 6 },
  input: { minHeight: touch.primary, borderWidth: 1, borderColor: color.border, borderRadius: radius.control, backgroundColor: color.surface, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  field: { flex: 1, fontFamily: font.regular, fontSize: 16, color: color.textPrimary, paddingVertical: 12 },
  note: { flexDirection: "row", gap: 10, backgroundColor: color.infoBg, borderRadius: radius.card, padding: 14, marginTop: space.lg },
});
