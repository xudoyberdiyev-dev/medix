import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LogOut } from "lucide-react-native";
import { useT } from "../../i18n";
import { logout } from "../../lib/auth";
import { getMe, type Me } from "../../lib/session";
import { Card } from "../../ui/blocks";
import { Button } from "../../ui/parts";
import { color, font, space, text } from "../../ui/theme";

/** Profil (M6 da toʻliq: PIN almashtirish, til, mashina, oflayn navbat). Hozir: haydovchi, versiya, chiqish. */
export default function Profile() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void getMe().then(setMe);
  }, []);
  const initials = (me?.fullName ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <View style={{ flex: 1, padding: space.lg, paddingTop: insets.top + 20, gap: space.md }}>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={styles.avatar}>
          <Text style={{ fontFamily: font.semibold, fontSize: 18, color: color.primaryButton }}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[text.bodyStrong, { fontSize: 17 }]}>{me?.fullName ?? ""}</Text>
          <Text style={[text.caption, { fontSize: 13 }]}>{me?.role.name ?? ""}</Text>
        </View>
      </Card>
      <Card style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={text.body}>{t("profile.version")}</Text>
        <Text style={text.bodyStrong}>{Constants.expoConfig?.version ?? "1.0.0"}</Text>
      </Card>
      <View style={{ flex: 1 }} />
      <Button
        label={t("profile.logout")}
        icon={LogOut}
        variant="secondary"
        loading={busy}
        onPress={() => {
          setBusy(true);
          void logout().then(() => router.replace("/login"));
        }}
      />
      <Text style={[text.caption, { textAlign: "center" }]}>{t("profile.logoutHint")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: color.primarySoft, alignItems: "center", justifyContent: "center" },
});
