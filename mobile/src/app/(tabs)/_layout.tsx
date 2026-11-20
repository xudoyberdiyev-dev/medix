import { Tabs } from "expo-router";
import { CalendarClock, Truck, UserRound } from "lucide-react-native";
import { useT } from "../../i18n";
import { color, font } from "../../ui/theme";

/** Pastki menyu (dizayn: Reys · Tarix · Profil). */
export default function TabsLayout() {
  const { t } = useT();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.primaryButton,
        tabBarInactiveTintColor: color.textSecondary,
        tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 12 },
        tabBarStyle: { backgroundColor: color.surface, borderTopColor: color.border, minHeight: 64 },
        sceneStyle: { backgroundColor: color.background },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t("tabs.trip"), tabBarIcon: ({ color: c }) => <Truck size={24} strokeWidth={1.5} color={c} /> }} />
      <Tabs.Screen name="history" options={{ title: t("tabs.history"), tabBarIcon: ({ color: c }) => <CalendarClock size={24} strokeWidth={1.5} color={c} /> }} />
      <Tabs.Screen name="profile" options={{ title: t("tabs.profile"), tabBarIcon: ({ color: c }) => <UserRound size={24} strokeWidth={1.5} color={c} /> }} />
    </Tabs>
  );
}
