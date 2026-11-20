import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Package, Truck } from "lucide-react-native";
import { useT } from "../i18n";
import { ApiError } from "../lib/api";
import { acceptLoad, myTrip, startTrip } from "../lib/trips";
import { allLoaded, loadedCount, loadStates, type TripStop } from "../lib/trip-view";
import { useAsync } from "../lib/use-async";
import { Card, Chip, ErrorState, Loading, Notice, StatusIcons, mono } from "../ui/blocks";
import { Button } from "../ui/parts";
import { Progress } from "../ui/trip-parts";
import { color, font, radius, space, text } from "../ui/theme";

/** Yuklash (dizayn «Reys — yuklash»): har buyurtma qutilarini sanab «Qabul qildim», hammasi qabul qilingach — «Reysni boshlash». */
export default function Load() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const trip = useAsync(myTrip);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | "start" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (trip.loading && trip.data === undefined) return <Loading />;
  if (trip.error && trip.data === undefined)
    return (
      <View style={{ flex: 1, padding: space.lg, justifyContent: "center" }}>
        <ErrorState message={t("common.loadError")} retry={() => void trip.reload()} retryLabel={t("common.retry")} />
      </View>
    );
  const data = trip.data;
  if (!data || data.status !== "PLANNED") return <Redirect href="/home" />;

  function failure(e: unknown) {
    setError(e instanceof ApiError && e.problem.status > 0 && e.problem.detail ? e.problem.detail : t("common.saveError"));
  }

  async function accept(stop: TripStop) {
    const places = Number(counts[stop.id] ?? "");
    if (!Number.isInteger(places) || places < 1 || !data) return;
    setBusy(stop.id);
    setError(null);
    try {
      trip.set(await acceptLoad(data.id, stop.id, places));
    } catch (e) {
      failure(e);
    } finally {
      setBusy(null);
    }
  }

  async function start() {
    if (!data) return;
    setBusy("start");
    setError(null);
    try {
      await startTrip(data.id);
      router.replace("/home");
    } catch (e) {
      failure(e);
      setBusy(null);
    }
  }

  const states = loadStates(data);
  const ready = allLoaded(data);
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={[mono, { color: color.textSecondary, fontSize: 12 }]}>{data.number}</Text>
        <Text style={text.title}>{t("load.title", { count: states.length })}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 }}>
          <View style={{ flex: 1 }}>
            <Progress value={loadedCount(data)} total={states.length} />
          </View>
          <Text style={[text.caption, { fontSize: 13 }]} accessibilityLabel={t("load.progress", { done: loadedCount(data), total: states.length })}>
            {loadedCount(data)} / {states.length}
          </Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {states.map(({ stop, state }) => {
          const title = `${stop.seq} · ${stop.customer}`;
          if (state === "loaded")
            return (
              <Card key={stop.id} accent="done" style={styles.rowCard}>
                <View style={{ flex: 1 }}>
                  <Text style={text.bodyStrong}>{title}</Text>
                  <Text style={[text.caption, { fontSize: 13 }]}>
                    {stop.orderNumber} · {t("load.boxes", { count: stop.places })}
                  </Text>
                </View>
                <Chip label={t("load.accepted")} tone="success" icon={StatusIcons.done} />
              </Card>
            );
          if (state === "waiting")
            return (
              <Card key={stop.id} style={styles.rowCard}>
                <View style={{ flex: 1 }}>
                  <Text style={text.bodyStrong}>{title}</Text>
                  <Text style={[text.caption, { fontSize: 13 }]}>
                    {stop.orderNumber} · {t("load.boxes", { count: stop.places })}
                  </Text>
                </View>
                <Chip label={t("load.waiting")} tone="neutral" />
              </Card>
            );
          const raw = counts[stop.id] ?? "";
          const n = Number(raw);
          const entered = raw !== "" && Number.isInteger(n) && n > 0;
          const diff = entered ? n - stop.places : 0;
          return (
            <Card key={stop.id} accent="active">
              <View>
                <Text style={text.bodyStrong}>{title}</Text>
                <Text style={[text.caption, { fontSize: 13 }]}>
                  {stop.orderNumber} · {t("load.docBoxes", { count: stop.places })}
                </Text>
              </View>
              <Text style={text.label} nativeID={`cnt-${stop.id}`}>
                {t("load.counted")}
              </Text>
              <View style={[styles.input, entered && diff !== 0 && { borderColor: color.warning }]}>
                <TextInput
                  accessibilityLabelledBy={`cnt-${stop.id}`}
                  value={raw}
                  onChangeText={(v) => setCounts({ ...counts, [stop.id]: v.replace(/\D/g, "").slice(0, 4) })}
                  keyboardType="number-pad"
                  style={styles.field}
                />
                {entered ? (
                  diff === 0 ? (
                    <Chip label={t("load.match")} tone="success" icon={StatusIcons.done} />
                  ) : (
                    <Chip label={t("load.diff", { diff: diff > 0 ? `+${diff}` : String(diff) })} tone="warning" icon={StatusIcons.warn} />
                  )
                ) : null}
              </View>
              <Button label={t("load.accept")} icon={Package} loading={busy === stop.id} disabled={!entered || busy !== null} onPress={() => void accept(stop)} />
            </Card>
          );
        })}
        {error ? <Notice>{error}</Notice> : <Notice>{t("load.hint")}</Notice>}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={[text.caption, { textAlign: "center", fontSize: 13 }]}>{t("load.startHint")}</Text>
        <Button label={t("load.start")} icon={Truck} disabled={!ready || busy !== null} loading={busy === "start"} onPress={() => void start()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: color.surface, borderBottomWidth: 1, borderBottomColor: color.border, paddingHorizontal: 20, paddingBottom: 14, gap: 2 },
  body: { padding: space.lg, gap: space.md, paddingBottom: 24 },
  rowCard: { flexDirection: "row", alignItems: "center", gap: 10 },
  input: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 52,
    borderWidth: 1,
    borderColor: color.primary,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    backgroundColor: color.surface,
  },
  field: { flex: 1, fontFamily: font.semibold, fontSize: 20, color: color.textPrimary },
  footer: { backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.border, padding: space.lg, gap: 10 },
});
