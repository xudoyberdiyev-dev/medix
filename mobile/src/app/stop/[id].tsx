import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Banknote, Camera, Check, CheckCircle2, ChevronLeft, Signature } from "lucide-react-native";
import { useT, type MessageKey } from "../../i18n";
import { ApiError } from "../../lib/api";
import { formatTiyin } from "../../lib/format";
import { cashDigits, checkCash, digitsToTiyin, groupDigits, tiyinToApi, tiyinToDigits } from "../../lib/stop-view";
import { deliver, myTrip, uploadPhoto } from "../../lib/trips";
import { stops, stopToCollect, type TripStop } from "../../lib/trip-view";
import { useAsync } from "../../lib/use-async";
import { Card, Chip, ErrorState, Loading, Notice, StatusIcons, mono } from "../../ui/blocks";
import { Button } from "../../ui/parts";
import { OutcomeSheet } from "../../ui/outcome-sheet";
import { SignatureSheet } from "../../ui/signature-sheet";
import { color, font, radius, space, text } from "../../ui/theme";

/** Bekatda (dizayn «Bekatda — yetkazish»): rasm (majburiy), naqd summa (kam — mijoz qarzi), Yetkazildi / Qisman / Yetkazilmadi. */
export default function Stop() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const trip = useAsync(myTrip);
  const [digits, setDigits] = useState<string | null>(null);
  const [busy, setBusy] = useState<"photo" | "deliver" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"partial" | "undelivered" | null>(null);
  const [signing, setSigning] = useState(false);

  if (trip.loading && trip.data === undefined) return <Loading />;
  if (trip.error && trip.data === undefined)
    return (
      <View style={{ flex: 1, padding: space.lg, justifyContent: "center" }}>
        <ErrorState message={t("common.loadError")} retry={() => void trip.reload()} retryLabel={t("common.retry")} />
      </View>
    );
  const data = trip.data;
  const stop: TripStop | undefined = data?.stops.find((s) => String(s.id) === id);
  if (!data || !stop || data.status !== "IN_TRANSIT" || stop.outcome) {
    return (
      <View style={{ flex: 1, padding: space.lg, paddingTop: insets.top + 40, gap: space.md }}>
        <Notice tone="info">{t("stop.notFound")}</Notice>
        <Button label={t("stop.back")} variant="secondary" onPress={() => router.replace("/home")} />
      </View>
    );
  }
  const tripId = data.id;
  const due = stopToCollect(stop);
  const isCash = due > 0n;
  const value = digits ?? tiyinToDigits(due);
  const collected = digitsToTiyin(value);
  const cash = checkCash(due, collected);

  function failure(e: unknown) {
    setError(e instanceof ApiError && e.problem.status > 0 && e.problem.detail ? e.problem.detail : t("common.saveError"));
  }

  async function takePhoto() {
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setError(t("stop.cameraDenied"));
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6, exif: false });
    const asset = shot.canceled ? null : shot.assets[0];
    if (!asset) return;
    setBusy("photo");
    try {
      await uploadPhoto(tripId, stop!.id, asset.uri);
      await trip.reload();
    } catch (e) {
      failure(e);
    } finally {
      setBusy(null);
    }
  }

  async function markDelivered() {
    setBusy("deliver");
    setError(null);
    try {
      await deliver(tripId, stop!.id, isCash ? tiyinToApi(collected) : null);
      router.replace("/home");
    } catch (e) {
      failure(e);
      setBusy(null);
    }
  }

  const total = stops(data).length;
  const hasPhoto = stop.photos > 0;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("stop.back")} onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <ChevronLeft size={24} strokeWidth={1.5} color={color.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[mono, { color: color.textSecondary, fontSize: 12 }]}>{t("stop.head", { seq: stop.seq, total, order: stop.orderNumber })}</Text>
          <Text style={text.title} numberOfLines={1}>
            {stop.customer}
          </Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" accessibilityLabel={t("stop.photoAdd")} onPress={() => void takePhoto()} disabled={busy !== null}>
          <Card style={[styles.task, hasPhoto && { borderColor: color.successBorder }]}>
            <View style={[styles.taskIcon, { backgroundColor: hasPhoto ? color.success : color.divider }]}>
              {hasPhoto ? <Check size={18} strokeWidth={2} color={color.textOnDark} /> : <Camera size={18} strokeWidth={1.5} color={color.textSecondary} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={text.bodyStrong}>{t("stop.photo")}</Text>
              <Text style={[text.caption, { fontSize: 13 }]}>
                {busy === "photo" ? t("stop.uploading") : hasPhoto ? t("stop.photoCount", { count: stop.photos }) : t("stop.photoNone")}
              </Text>
            </View>
            <Camera size={20} strokeWidth={1.5} color={color.textSecondary} />
          </Card>
        </Pressable>

        <Pressable accessibilityRole="button" accessibilityLabel={t("stop.signature")} onPress={() => setSigning(true)} disabled={busy !== null || stop.signed}>
          <Card style={[styles.task, stop.signed && { borderColor: color.successBorder }]}>
            <View style={[styles.taskIcon, { backgroundColor: stop.signed ? color.success : color.divider }]}>
              {stop.signed ? <Check size={18} strokeWidth={2} color={color.textOnDark} /> : <Signature size={18} strokeWidth={1.5} color={color.textSecondary} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={text.bodyStrong}>{t("stop.signature")}</Text>
              <Text style={[text.caption, { fontSize: 13 }]}>{stop.signed ? t("stop.signDone") : t("stop.signNone")}</Text>
            </View>
            <Signature size={20} strokeWidth={1.5} color={color.textSecondary} />
          </Card>
        </Pressable>

        {isCash ? (
          <Card accent="active">
            <View style={styles.spread}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Banknote size={20} strokeWidth={1.5} color={color.primaryButton} />
                <Text style={text.bodyStrong}>{t("stop.cash")}</Text>
              </View>
              <Text style={[text.caption, { fontSize: 13 }]}>{t("stop.cashDue", { amount: formatTiyin(due) })}</Text>
            </View>
            <Text style={text.label} nativeID="cash">
              {t("stop.cashTaken")}
            </Text>
            <TextInput
              accessibilityLabelledBy="cash"
              value={groupDigits(value)}
              onChangeText={(v) => setDigits(cashDigits(v))}
              keyboardType="number-pad"
              style={[styles.amount, cash.kind === "over" && { borderColor: color.danger }]}
            />
            <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
              <Pressable accessibilityRole="button" onPress={() => setDigits(tiyinToDigits(due))}>
                <Chip label={t("stop.cashFull")} tone="info" icon={cash.kind === "full" ? CheckCircle2 : undefined} />
              </Pressable>
              {cash.kind === "short" ? <Chip label={t("stop.cashShort", { amount: formatTiyin(cash.short) })} tone="warning" /> : null}
            </View>
            {cash.kind === "short" ? (
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                <StatusIcons.warn size={16} strokeWidth={1.5} color={color.warning} />
                <Text style={[text.caption, { color: color.warning, fontSize: 13 }]}>{t("stop.cashDebt", { amount: formatTiyin(cash.short) })}</Text>
              </View>
            ) : null}
            {cash.kind === "over" ? <Text style={[text.caption, { color: color.danger, fontSize: 13 }]}>{t("stop.cashOver")}</Text> : null}
          </Card>
        ) : (
          <Notice tone="info">{t("stop.noCash", { payment: t(`pay.${stop.paymentType}` as MessageKey) })}</Notice>
        )}
        {error ? <Notice>{error}</Notice> : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          label={t("stop.delivered")}
          icon={CheckCircle2}
          loading={busy === "deliver"}
          disabled={!hasPhoto || cash.kind === "over" || busy !== null}
          onPress={() => void markDelivered()}
        />
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Pressable accessibilityRole="button" onPress={() => setSheet("partial")} disabled={busy !== null} style={styles.secondary}>
            <Text style={[styles.secondaryText, { color: color.warning }]}>{t("stop.partial")}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setSheet("undelivered")} disabled={busy !== null} style={styles.secondary}>
            <Text style={[styles.secondaryText, { color: color.danger }]}>{t("stop.undelivered")}</Text>
          </Pressable>
        </View>
      </View>
      {signing ? (
        <SignatureSheet
          onClose={() => setSigning(false)}
          onSave={async (uri) => {
            setError(null);
            try {
              await uploadPhoto(tripId, stop.id, uri, true);
              setSigning(false);
              await trip.reload();
            } catch (e) {
              setSigning(false);
              failure(e);
            }
          }}
        />
      ) : null}
      {sheet ? (
        <OutcomeSheet
          tripId={tripId}
          stop={stop}
          initialTab={sheet}
          onClose={() => setSheet(null)}
          onDone={() => {
            setSheet(null);
            router.replace("/home");
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: color.surface,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
    paddingHorizontal: 12,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  body: { padding: space.lg, gap: space.md, paddingBottom: 24 },
  task: { flexDirection: "row", alignItems: "center", gap: 12 },
  taskIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  spread: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  amount: {
    height: 52,
    borderWidth: 1,
    borderColor: color.primary,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    textAlign: "right",
    fontFamily: font.bold,
    fontSize: 22,
    color: color.textPrimary,
    backgroundColor: color.surface,
  },
  footer: { backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.border, padding: space.lg, gap: 10 },
  secondary: {
    flex: 1,
    height: 44,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { fontFamily: font.semibold, fontSize: 15 },
});
