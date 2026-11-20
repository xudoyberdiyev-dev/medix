import { StyleSheet, Text, View } from "react-native";
import { useT, type MessageKey } from "../i18n";
import { formatDayMonth, formatMoney } from "../lib/format";
import type { TripSummary } from "../lib/trip-view";
import { Card, Chip, ErrorState, Loading, mono } from "./blocks";
import { color, space, text } from "./theme";

export function firstName(fullName: string | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}

export function TripList({ items, loading, error, retry }: { items: TripSummary[]; loading: boolean; error: boolean; retry: () => void }) {
  const { t } = useT();
  if (loading && items.length === 0) return <Loading />;
  if (error && items.length === 0) return <ErrorState message={t("common.loadError")} retry={retry} retryLabel={t("common.retry")} />;
  if (items.length === 0) return <Text style={[text.body, { color: color.textSecondary, textAlign: "center", padding: space.lg }]}>{t("home.noHistory")}</Text>;
  return (
    <Card style={{ paddingVertical: 4, gap: 0 }}>
      {items.map((s, i) => (
        <View key={s.id} style={[styles.row, i > 0 && styles.rowDivider]}>
          <View style={{ flex: 1 }}>
            <Text style={mono}>{s.number}</Text>
            <Text style={[text.caption, { fontSize: 13 }]}>
              {t("home.tripRow", { date: formatDayMonth(s.tripDate), stops: s.orders, total: formatMoney(s.total) })}
            </Text>
          </View>
          <Chip label={t(`status.${s.status}` as MessageKey)} tone={s.status === "DONE" ? "success" : s.status === "CANCELLED" ? "danger" : "neutral"} />
        </View>
      ))}
    </Card>
  );
}

export function Progress({ value, total, dark }: { value: number; total: number; dark?: boolean }) {
  const pct = total > 0 ? Math.min(100, (value * 100) / total) : 0;
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: dark ? color.brand800 : color.divider, overflow: "hidden" }}>
      <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: dark ? color.accent : color.primary }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  rowDivider: { borderTopWidth: 1, borderTopColor: color.divider },
});
