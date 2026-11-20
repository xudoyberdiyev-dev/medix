import { useEffect } from "react";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { I18nProvider } from "../i18n";
import { setOnSessionExpired } from "../lib/api";
import { clearPin } from "../lib/pin-store";
import { color } from "../ui/theme";

void SplashScreen.preventAutoHideAsync();

// Token bekor qilingan/eskirgan (masalan, rahbar sessiyalarni tugatdi) — PIN ham oʻchadi, login ekrani.
setOnSessionExpired(() => {
  void clearPin().then(() => router.replace("/login"));
});

export default function RootLayout() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.background } }} />
      </I18nProvider>
    </SafeAreaProvider>
  );
}
