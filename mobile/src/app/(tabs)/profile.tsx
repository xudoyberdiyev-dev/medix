import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight, Info, KeyRound, Languages, LogOut, Smartphone, Truck, type LucideIcon } from "lucide-react-native";
import { LOCALES, useT, type MessageKey } from "../../i18n";
import { logout } from "../../lib/auth";
import { readJson } from "../../lib/queue";
import { getMe, type Me } from "../../lib/session";
import { myHistory } from "../../lib/trips";
import type { TripDetail } from "../../lib/trip-view";
import { useQueueInfo } from "../../lib/use-queue";
import { color, font, radius, space, text } from "../../ui/theme";

/** Profil va sozlamalar (dizayn «Profil»): PIN, til, mashina, oflayn navbat, versiya, chiqish. */
export default function Profile() {
  const { t, locale, setLocale } = useT();
  const insets = useSafeAreaInsets();
  const queue = useQueueInfo();
  const [me, setMe] = useState<Me | null>(null);
  const [plate, setPlate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void getMe().then(setMe);
    // Mashina: joriy reys (telefondagi nusxa), boʻlmasa — oxirgi reys
    void readJson<TripDetail | null>("reys.json", null).then(async (trip) => {
      if (trip?.plateNumber) return setPlate(trip.plateNumber);
      try {
        setPlate((await myHistory())[0]?.plateNumber ?? null);
      } catch {
        // internet yoʻq — mashina koʻrsatilmaydi
      }
    });
  }, []);
  const initials = (me?.fullName ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const nextLocale = LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length];
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={[styles.hero, { paddingTop: insets.top + 24 }]}>
        <View style={styles.avatar}>
          <Text style={{ fontFamily: font.semibold, fontSize: 24, color: color.textOnDark }}>{initials}</Text>
        </View>
        <Text style={[text.title, { marginTop: 10 }]}>{me?.fullName ?? ""}</Text>
        <Text style={[text.caption, { fontSize: 13 }]}>{me?.role.name ?? ""}</Text>
      </View>
      <View style={{ padding: space.lg, gap: space.md }}>
        <View style={styles.group}>
          <Item icon={KeyRound} label={t("profile2.pin")} onPress={() => router.push("/pin-set")} />
          <Item icon={Languages} label={t("profile2.lang")} value={t(`lang.${locale}` as MessageKey)} onPress={() => setLocale(nextLocale)} />
          <Item icon={Truck} label={t("profile2.vehicle")} value={plate ?? "—"} />
          <Item icon={Smartphone} label={t("profile2.queue")} value={t("profile2.queueCount", { count: queue.count })} last />
        </View>
        <View style={styles.group}>
          <Item icon={Info} label={t("profile.version")} value={Constants.expoConfig?.version ?? "1.0.0"} />
          <Item
            icon={LogOut}
            label={t("profile.logout")}
            danger
            last
            disabled={busy}
            onPress={() => {
              setBusy(true);
              void logout().then(() => router.replace("/login"));
            }}
          />
        </View>
        <Text style={[text.caption, { textAlign: "center" }]}>{t("profile.logoutHint")}</Text>
      </View>
    </ScrollView>
  );
}

function Item({
  icon: Icon,
  label,
  value,
  onPress,
  danger,
  last,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
  disabled?: boolean;
}) {
  const tint = danger ? color.danger : color.textSecondary;
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : "text"}
      onPress={onPress}
      disabled={!onPress || disabled}
      style={({ pressed }) => [styles.item, !last && styles.divider, pressed && { opacity: 0.7 }]}
    >
      <Icon size={20} strokeWidth={1.5} color={tint} />
      <Text style={[text.body, { flex: 1 }, danger && { color: color.danger, fontFamily: font.semibold }]}>{label}</Text>
      {value ? <Text style={[text.body, { color: color.textSecondary, fontSize: 14 }]}>{value}</Text> : null}
      {onPress && !danger ? <ChevronRight size={18} strokeWidth={1.5} color={color.textSecondary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", backgroundColor: color.surface, borderBottomWidth: 1, borderBottomColor: color.border, paddingBottom: 20 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: color.brand900, alignItems: "center", justifyContent: "center" },
  group: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, borderRadius: radius.card, paddingHorizontal: 14 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 50 },
  divider: { borderBottomWidth: 1, borderBottomColor: color.divider },
});
