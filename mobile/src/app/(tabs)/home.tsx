import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Redirect, router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MapPin, Navigation, Phone, Truck, WifiOff, X } from "lucide-react-native";
import { useT, type MessageKey } from "../../i18n";
import { formatDate, formatTiyin, weekday } from "../../lib/format";
import { getMe, type Me } from "../../lib/session";
import { myHistory } from "../../lib/trips";
import { isOffline, loadTrip } from "../../lib/trip-source";
import { useQueueInfo } from "../../lib/use-queue";
import { cashInHand, cashToCollect, mapUri, markedCount, nextStop, stopToCollect, stops, telUri, type TripDetail, type TripStop } from "../../lib/trip-view";
import { useAsync } from "../../lib/use-async";
import { Card, Chip, ErrorState, Loading, SectionLabel, StatusIcons, mono } from "../../ui/blocks";
import { Button } from "../../ui/parts";
import { firstName, Progress, TripList } from "../../ui/trip-parts";
import { color, font, radius, space, text } from "../../ui/theme";

/** «Reys» bo'limi: faol reys yo'q → bosh sahifa; yuklash → /load; yo'lda → keyingi manzil. */
export default function TripTab() {
  const { t } = useT();
  const trip = useAsync(loadTrip);
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    void getMe().then(setMe);
  }, []);
  useFocusEffect(
    useCallback(() => {
      void trip.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  if (trip.loading && trip.data === undefined) return <Loading />;
  if (trip.error && trip.data === undefined)
    return (
      <View style={{ flex: 1, padding: space.lg, justifyContent: "center" }}>
        <ErrorState message={t("common.loadError")} retry={() => void trip.reload()} retryLabel={t("common.retry")} />
      </View>
    );
  const active = trip.data ?? null;
  if (active?.status === "PLANNED") return <Redirect href="/load" />;
  if (active?.status === "IN_TRANSIT" || active?.status === "RETURN_WAIT")
    return <RouteView trip={active} refreshing={trip.loading} onRefresh={() => void trip.reload()} />;
  return <NoTrip me={me} refreshing={trip.loading} onRefresh={() => void trip.reload()} />;
}

function NoTrip({ me, refreshing, onRefresh }: { me: Me | null; refreshing: boolean; onRefresh: () => void }) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const history = useAsync(myHistory);
  const recent = (history.data ?? []).slice(0, 3);
  const plate = history.data?.[0]?.plateNumber;
  const name = firstName(me?.fullName);
  const now = new Date();
  const sub = [`${t(`weekday.${weekday(now)}` as MessageKey)}, ${formatDate(now)}`, plate].filter(Boolean).join(" · ");
  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={text.title}>{name ? t("home.hello", { name }) : t("home.helloNoName")}</Text>
        <Text style={[text.caption, { fontSize: 13 }]}>{sub}</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { onRefresh(); void history.reload(); }} />}
      >
        <Card style={{ alignItems: "center", paddingVertical: 28, gap: 8 }}>
          <View style={styles.iconCircle}>
            <Truck size={26} strokeWidth={1.5} color={color.textSecondary} />
          </View>
          <Text style={[text.bodyStrong, { fontSize: 17, marginTop: 4 }]}>{t("home.noTrip")}</Text>
          <Text style={[text.body, { color: color.textSecondary, textAlign: "center", fontSize: 14 }]}>{t("home.noTripHint")}</Text>
        </Card>
        <SectionLabel>{t("home.recent")}</SectionLabel>
        <TripList items={recent} loading={history.loading} error={!!history.error} retry={() => void history.reload()} />
      </ScrollView>
    </View>
  );
}

function RouteView({ trip, refreshing, onRefresh }: { trip: TripDetail; refreshing: boolean; onRefresh: () => void }) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const all = stops(trip);
  const done = markedCount(trip);
  const next = nextStop(trip);
  const rest = all.filter((s) => s.id !== next?.id);
  const queueInfo = useQueueInfo();
  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.dark, { paddingTop: insets.top + 16 }]}>
        <View style={styles.spread}>
          <Text style={[mono, { color: color.textOnDarkMuted }]}>{trip.number}</Text>
          {queueInfo.count > 0 || isOffline() ? (
            <View style={styles.offline}>
              <WifiOff size={14} strokeWidth={1.5} color={color.warningBorder} />
              <Text style={styles.offlineText}>
                {queueInfo.count > 0 ? t("route.offlineQueue", { count: queueInfo.count }) : t("route.offline")}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[text.title, { color: color.textOnDark }]}>{t("route.title", { done, total: all.length })}</Text>
        <Progress value={done} total={all.length} dark />
        <View style={{ flexDirection: "row", gap: 18 }}>
          <Text style={[text.caption, { color: color.textOnDarkMuted, fontSize: 13 }]}>
            {t("route.cash")} <Text style={styles.darkStrong}>{formatTiyin(cashInHand(trip), true)}</Text>
          </Text>
          <Text style={[text.caption, { color: color.textOnDarkMuted, fontSize: 13 }]}>
            {t("route.toCollect")} <Text style={styles.darkStrong}>{formatTiyin(cashToCollect(trip), true)}</Text>
          </Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {queueInfo.failed.length > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t("sheet.close")} onPress={() => void queueInfo.dismiss()}>
            <View style={styles.failed}>
              <Text style={[text.caption, { color: color.danger, fontSize: 13, flex: 1 }]}>
                {t("route.queueFailed", { count: queueInfo.failed.length, detail: queueInfo.failed[queueInfo.failed.length - 1]?.detail ?? "" })}
              </Text>
              <X size={16} strokeWidth={1.5} color={color.danger} />
            </View>
          </Pressable>
        ) : null}
        {next && trip.status === "IN_TRANSIT" ? (
          <>
            <SectionLabel>{t("route.next")}</SectionLabel>
            <NextStopCard trip={trip} stop={next} />
          </>
        ) : (
          <Card style={{ alignItems: "center", paddingVertical: 24, gap: 8 }}>
            <StatusIcons.done size={26} strokeWidth={1.5} color={color.success} />
            <Text style={[text.bodyStrong, { fontSize: 17 }]}>{t(trip.status === "RETURN_WAIT" ? "route.returnWait" : "route.allMarked")}</Text>
            <Text style={[text.body, { color: color.textSecondary, textAlign: "center", fontSize: 14 }]}>
              {t(trip.status === "RETURN_WAIT" ? "route.returnWaitHint" : "route.allMarkedHint")}
            </Text>
          </Card>
        )}
        {rest.length > 0 ? (
          <>
            <SectionLabel>{t("route.rest")}</SectionLabel>
            <Card style={{ paddingVertical: 4, gap: 0 }}>
              {rest.map((s, i) => (
                <RestRow key={s.id} stop={s} first={i === 0} />
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function NextStopCard({ trip, stop }: { trip: TripDetail; stop: TripStop }) {
  const { t } = useT();
  const tel = telUri(stop.phone);
  const map = mapUri(stop.address);
  const collect = stopToCollect(stop);
  return (
    <Card accent="active">
      <Text style={[text.title, { fontSize: 18 }]}>
        {stop.seq} · {stop.customer}
      </Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <MapPin size={16} strokeWidth={1.5} color={color.textSecondary} style={{ marginTop: 2 }} />
        <Text style={[text.body, { color: color.textSecondary, flex: 1, fontSize: 14 }]}>{stop.address ?? t("route.noAddress")}</Text>
      </View>
      <View style={{ flexDirection: "row" }}>
        <Fact label={t("route.boxes")} value={String(stop.places)} />
        <Fact label={t("route.payment")} value={t(`pay.${stop.paymentType}` as MessageKey)} />
        <Fact label={t("route.collect")} value={formatTiyin(collect)} tone={collect > 0n ? color.warning : undefined} />
      </View>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button label={t("route.road")} icon={Navigation} variant="secondary" disabled={!map} onPress={() => map && void Linking.openURL(map)} style={{ flex: 1, height: 44 }} />
        <Button label={t("route.call")} icon={Phone} variant="secondary" disabled={!tel} onPress={() => tel && void Linking.openURL(tel)} style={{ flex: 1, height: 44 }} />
      </View>
      <Button label={t("route.arrived")} onPress={() => router.push({ pathname: "/stop/[id]", params: { id: String(stop.id), trip: String(trip.id) } })} />
    </Card>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={[text.caption, { fontSize: 13 }]}>{label}</Text>
      <Text style={[text.bodyStrong, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

function RestRow({ stop, first }: { stop: TripStop; first: boolean }) {
  const { t } = useT();
  const right =
    stop.outcome === "DELIVERED"
      ? t("route.delivered")
      : stop.outcome === "PARTIAL"
        ? t("route.partial")
        : stop.outcome === "UNDELIVERED"
          ? t("route.undelivered")
          : t("route.restRow", { boxes: stop.places, payment: t(`pay.${stop.paymentType}` as MessageKey) });
  const done = !!stop.outcome;
  return (
    <View style={[styles.row, !first && styles.rowDivider]}>
      <View style={[styles.seq, { backgroundColor: done ? color.successBg : color.primarySoft }]}>
        <Text style={{ fontFamily: font.semibold, fontSize: 12, color: done ? color.success : color.primaryButton }}>{stop.seq}</Text>
      </View>
      <Text style={[text.body, { flex: 1 }]} numberOfLines={1}>
        {stop.customer}
      </Text>
      <Text style={[text.caption, { fontSize: 13, color: stop.outcome === "UNDELIVERED" ? color.danger : color.textSecondary }]}>{right}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: color.surface, borderBottomWidth: 1, borderBottomColor: color.border, paddingHorizontal: 20, paddingBottom: 14, gap: 2 },
  dark: { backgroundColor: color.brand900, paddingHorizontal: 20, paddingBottom: 16, gap: 10 },
  darkStrong: { fontFamily: font.semibold, color: color.textOnDark },
  spread: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  body: { padding: space.lg, gap: space.md, paddingBottom: 32 },
  iconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: color.divider, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  rowDivider: { borderTopWidth: 1, borderTopColor: color.divider },
  offline: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: color.brand800, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  offlineText: { fontFamily: font.semibold, fontSize: 12, color: color.warningBorder },
  failed: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: color.dangerBg, borderRadius: radius.card, padding: 12 },
  seq: { width: 22, height: 22, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});
