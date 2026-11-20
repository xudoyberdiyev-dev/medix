import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT, type MessageKey } from "../i18n";
import { ApiError } from "../lib/api";
import { formatMoney, formatTiyin, toTiyin } from "../lib/format";
import { returnedAmount, tiyinToApi } from "../lib/stop-view";
import { partial, stopLines, undeliver } from "../lib/trips";
import type { TripStop } from "../lib/trip-view";
import { useAsync } from "../lib/use-async";
import { Card, ErrorState, Loading, Notice } from "./blocks";
import { Button } from "./parts";
import { color, font, radius, space, text } from "./theme";

const REASONS = ["closed", "noMoney", "notOrdered", "noAddress", "other"] as const;
type Reason = (typeof REASONS)[number];

/** «Qisman yetkazish yoki yetkazilmadi» pastki oynasi (dizayn «Qisman»). */
export function OutcomeSheet({
  tripId,
  stop,
  initialTab,
  onClose,
  onDone,
}: {
  tripId: number;
  stop: TripStop;
  initialTab: "partial" | "undelivered";
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState(initialTab);
  const lines = useAsync(() => stopLines(tripId, stop.id));
  const [returned, setReturned] = useState<Record<number, number>>({});
  const [reason, setReason] = useState<Reason | null>(null);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const back = returnedAmount(lines.data ?? [], returned);
  const pays = toTiyin(stop.total) - back;
  const anyReturned = Object.values(returned).some((q) => q > 0);
  const reasonText = reason === "other" ? other.trim() : reason ? t(`sheet.reasons.${reason}` as MessageKey) : "";

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (tab === "partial") {
        const body = (lines.data ?? []).map((l) => ({ saleLineId: l.id, qty: Math.min(returned[l.id] ?? 0, l.qty) })).filter((l) => l.qty > 0);
        // Naqd toʻlovda mijoz qolgan summani toʻlaydi (taxminiy; server oshib ketsa rad etadi)
        await partial(tripId, stop.id, t("sheet.partialReason"), body, stop.paymentType === "CASH" ? tiyinToApi(pays) : null);
      } else {
        await undeliver(tripId, stop.id, reasonText);
      }
      onDone();
    } catch (e) {
      setError(e instanceof ApiError && e.problem.status > 0 && e.problem.detail ? e.problem.detail : t("common.saveError"));
      setBusy(false);
    }
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityRole="button" accessibilityLabel={t("sheet.close")} style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.grip} />
        <Text style={[text.title, { marginBottom: space.md }]}>{stop.customer}</Text>
        <View style={styles.tabs} accessibilityRole="tablist">
          {(["partial", "undelivered"] as const).map((k) => {
            const on = tab === k;
            return (
              <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setTab(k)} style={[styles.tab, on && styles.tabOn]}>
                <Text style={[styles.tabText, on && { color: k === "partial" ? color.warning : color.danger }]}>
                  {t(k === "partial" ? "sheet.partialTab" : "sheet.undeliveredTab")}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: space.md, paddingVertical: space.md }} keyboardShouldPersistTaps="handled">
          {tab === "partial" ? (
            <>
              <Text style={[text.body, { color: color.textSecondary, fontSize: 14 }]}>{t("sheet.partialIntro")}</Text>
              {lines.loading && !lines.data ? (
                <Loading />
              ) : lines.error && !lines.data ? (
                <ErrorState message={t("common.loadError")} retry={() => void lines.reload()} retryLabel={t("common.retry")} />
              ) : (
                <Card style={{ paddingVertical: 4, gap: 0 }}>
                  {(lines.data ?? []).map((l, i) => (
                    <View key={l.id} style={[styles.line, i > 0 && { borderTopWidth: 1, borderTopColor: color.divider }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={text.bodyStrong}>{l.product}</Text>
                        <Text style={[text.caption, { fontSize: 13 }]}>{t("sheet.line", { qty: l.qty, price: formatMoney(l.price) })}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <Text style={text.caption} nativeID={`ret-${l.id}`}>
                          {t("sheet.returned")}
                        </Text>
                        <TextInput
                          accessibilityLabelledBy={`ret-${l.id}`}
                          value={String(returned[l.id] ?? 0)}
                          onChangeText={(v) => {
                            const n = Math.min(Number(v.replace(/\D/g, "") || "0"), l.qty);
                            setReturned({ ...returned, [l.id]: n });
                          }}
                          keyboardType="number-pad"
                          selectTextOnFocus
                          style={styles.qty}
                        />
                      </View>
                    </View>
                  ))}
                </Card>
              )}
              <Card>
                <View style={styles.spread}>
                  <Text style={text.caption}>{t("sheet.returned")}</Text>
                  <Text style={[text.bodyStrong, { color: color.warning }]}>{formatTiyin(back)}</Text>
                </View>
                <View style={styles.spread}>
                  <Text style={text.caption}>{t("sheet.customerPays")}</Text>
                  <Text style={[text.bodyStrong, { fontSize: 18 }]}>{formatTiyin(pays)}</Text>
                </View>
                <Text style={[text.caption, { fontSize: 11 }]}>{t("sheet.estimate")}</Text>
              </Card>
            </>
          ) : (
            <>
              <Text style={text.label}>{t("sheet.reasonTitle")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {REASONS.map((r) => {
                  const on = reason === r;
                  return (
                    <Pressable
                      key={r}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      onPress={() => setReason(r)}
                      style={[styles.reason, on && { borderColor: color.danger, backgroundColor: color.dangerBg }]}
                    >
                      <Text style={[styles.reasonText, on && { color: color.danger }]}>{t(`sheet.reasons.${r}` as MessageKey)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {reason === "other" ? (
                <TextInput
                  value={other}
                  onChangeText={(v) => setOther(v.slice(0, 300))}
                  placeholder={t("sheet.otherPlaceholder")}
                  placeholderTextColor={color.textDisabled}
                  multiline
                  style={styles.other}
                />
              ) : null}
            </>
          )}
          {error ? <Notice>{error}</Notice> : null}
        </ScrollView>
        {tab === "partial" ? (
          <Button label={t("sheet.markPartial")} loading={busy} disabled={!anyReturned || busy} onPress={() => void submit()} />
        ) : (
          <Button label={t("sheet.markUndelivered")} loading={busy} disabled={!reasonText || busy} onPress={() => void submit()} />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: color.overlay },
  sheet: { backgroundColor: color.background, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingHorizontal: space.lg, paddingTop: 10 },
  grip: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: color.borderStrong, marginBottom: 14 },
  tabs: { flexDirection: "row", backgroundColor: color.divider, borderRadius: radius.control, padding: 4 },
  tab: { flex: 1, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: color.surface },
  tabText: { fontFamily: font.semibold, fontSize: 15, color: color.textSecondary },
  line: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  qty: {
    width: 76,
    height: 40,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.control,
    textAlign: "right",
    paddingHorizontal: 10,
    fontFamily: font.semibold,
    fontSize: 17,
    color: color.textPrimary,
    backgroundColor: color.surface,
  },
  spread: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reason: { borderWidth: 1, borderColor: color.border, borderRadius: radius.pill, paddingHorizontal: 14, minHeight: 40, justifyContent: "center", backgroundColor: color.surface },
  reasonText: { fontFamily: font.medium, fontSize: 14, color: color.textPrimary },
  other: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.control,
    padding: 12,
    fontFamily: font.regular,
    fontSize: 15,
    color: color.textPrimary,
    backgroundColor: color.surface,
    textAlignVertical: "top",
  },
});
