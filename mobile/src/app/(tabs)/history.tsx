import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "../../i18n";
import { myHistory } from "../../lib/trips";
import { useAsync } from "../../lib/use-async";
import { TripList } from "../../ui/trip-parts";
import { color, space, text } from "../../ui/theme";

/** Tarix: yakunlangan va bekor qilingan reyslar (oxirgi 100 ta). */
export default function History() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const history = useAsync(myHistory);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ backgroundColor: color.surface, borderBottomWidth: 1, borderBottomColor: color.border, paddingTop: insets.top + 20, paddingHorizontal: 20, paddingBottom: 14 }}>
        <Text style={text.title}>{t("history.title")}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg }} refreshControl={<RefreshControl refreshing={history.loading} onRefresh={() => void history.reload()} />}>
        <TripList items={history.data ?? []} loading={history.loading} error={!!history.error} retry={() => void history.reload()} />
      </ScrollView>
    </View>
  );
}
