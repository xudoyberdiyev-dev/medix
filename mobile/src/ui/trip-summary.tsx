import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Banknote, Package } from "lucide-react-native";
import { useT } from "../i18n";
import { formatMoney, formatTiyin } from "../lib/format";
import { cashDue, cashInHand, outcomeCounts, stops, type TripDetail } from "../lib/trip-view";
import { Card, Chip, StatusIcons, mono } from "./blocks";
import { Button } from "./parts";
import { color, space, text } from "./theme";

/** «Reys yakunlandi» (dizayn «Reys yakuni»): natijalar, Kassirga topshiriladigan naqd, omborga qaytadigan tovar, holat. */
export function TripSummary({ trip, onHome }: { trip: TripDetail; onHome: () => void }) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const c = outcomeCounts(trip);
  const due = cashDue(trip);
  const taken = cashInHand(trip);
  const debt = due > taken ? due - taken : 0n;
  const back = stops(trip).filter((s) => s.outcome === "PARTIAL" || s.outcome === "UNDELIVERED");
  const done = trip.status === "DONE";
  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={[mono, { color: color.textSecondary, fontSize: 12 }]}>{trip.number}</Text>
        <Text style={text.title}>{t("finish.title")}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          <Chip label={t("finish.delivered", { count: c.delivered })} tone="success" />
          <Chip label={t("finish.partial", { count: c.partial })} tone="warning" />
          <Chip label={t("finish.undelivered", { count: c.undelivered })} tone="danger" />
        </View>
        <Card>
          <View style={styles.titleRow}>
            <Banknote size={20} strokeWidth={1.5} color={color.primaryButton} />
            <Text style={text.bodyStrong}>{t("finish.cashTitle")}</Text>
          </View>
          <Row label={t("finish.due")} value={formatTiyin(due)} />
          <Row label={t("finish.taken")} value={formatTiyin(taken)} />
          <Row label={t("finish.debt")} value={formatTiyin(debt)} tone={debt > 0n ? color.warning : undefined} />
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <Text style={text.bodyStrong}>{t("finish.handover")}</Text>
            <Text style={[text.title, { fontSize: 22 }]}>{formatTiyin(taken)}</Text>
          </View>
        </Card>
        <Card>
          <View style={styles.titleRow}>
            <Package size={20} strokeWidth={1.5} color={color.warning} />
            <Text style={text.bodyStrong}>{t("finish.returnTitle")}</Text>
          </View>
          {back.length === 0 ? (
            <Text style={[text.body, { color: color.textSecondary }]}>{t("finish.noReturn")}</Text>
          ) : (
            back.map((s) => (
              <View key={s.id} style={styles.row}>
                <Text style={[text.body, { flex: 1 }]}>
                  {s.outcome === "PARTIAL"
                    ? t("finish.returnPartial", { customer: s.customer, number: s.returnNumber ?? "" })
                    : t("finish.returnWhole", { customer: s.customer, places: s.places })}
                </Text>
                {s.outcome === "PARTIAL" && s.returnTotal ? <Text style={text.bodyStrong}>{formatMoney(s.returnTotal)}</Text> : null}
              </View>
            ))
          )}
        </Card>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {done ? (
            <Chip label={t("finish.accepted")} tone="success" icon={StatusIcons.done} />
          ) : (
            <Chip label={t("finish.waiting")} tone="warning" icon={StatusIcons.waiting} />
          )}
          <Text style={[text.body, { color: color.textSecondary, flex: 1, fontSize: 14 }]}>{t(done ? "finish.acceptedText" : "finish.waitingText")}</Text>
        </Card>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: 16 }]}>
        <Button label={t("finish.home")} variant="secondary" onPress={onHome} />
      </View>
    </View>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.row}>
      <Text style={[text.body, { color: color.textSecondary }]}>{label}</Text>
      <Text style={[text.bodyStrong, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: color.surface, borderBottomWidth: 1, borderBottomColor: color.border, paddingHorizontal: 20, paddingBottom: 14, gap: 2 },
  body: { padding: space.lg, gap: space.md, paddingBottom: 24 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.divider, gap: 8 },
  footer: { backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.border, padding: space.lg },
});
