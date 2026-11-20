import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Truck } from "lucide-react-native";
import { color, radius, text } from "../ui/theme";

// M3 da: faol reys / oxirgi reyslar (dizayn «Bosh sahifa»). Hozircha boʻsh holat.
export default function Home() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + 20 }]}>
      <View style={styles.card}>
        <Truck size={26} strokeWidth={1.5} color={color.textSecondary} />
        <Text style={[text.bodyStrong, { fontSize: 17 }]}>100+</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.background, padding: 16 },
  card: { backgroundColor: color.surface, borderRadius: radius.card, borderWidth: 1, borderColor: color.border, padding: 28, alignItems: "center", gap: 8 },
});
