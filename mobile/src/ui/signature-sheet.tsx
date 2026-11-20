import { useRef, useState } from "react";
import { Modal, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { File, Paths } from "expo-file-system";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "../i18n";
import { Button } from "./parts";
import { color, font, radius, space, text } from "./theme";

type SvgRef = { toDataURL: (cb: (base64: string) => void, options?: object) => void };

/** Mijoz imzosi (ixtiyoriy): barmoq bilan chiziladi → PNG fayl → serverga (signature=true). */
export function SignatureSheet({ onClose, onSave }: { onClose: () => void; onSave: (uri: string) => Promise<void> }) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [paths, setPaths] = useState<string[]>([]);
  const current = useRef<string>("");
  const [, force] = useState(0);
  const [busy, setBusy] = useState(false);
  const svg = useRef<SvgRef | null>(null);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        current.current = `M${e.nativeEvent.locationX.toFixed(1)},${e.nativeEvent.locationY.toFixed(1)}`;
        force((n) => n + 1);
      },
      onPanResponderMove: (e) => {
        current.current += ` L${e.nativeEvent.locationX.toFixed(1)},${e.nativeEvent.locationY.toFixed(1)}`;
        force((n) => n + 1);
      },
      onPanResponderRelease: () => {
        const d = current.current;
        current.current = "";
        if (d) setPaths((p) => [...p, d]);
      },
    }),
  ).current;

  function save() {
    if (!svg.current) return;
    setBusy(true);
    svg.current.toDataURL((base64) => {
      const file = new File(Paths.cache, `imzo-${Date.now()}.png`);
      file.write(base64, { encoding: "base64" });
      void onSave(file.uri).finally(() => setBusy(false));
    });
  }

  const empty = paths.length === 0 && !current.current;
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityRole="button" accessibilityLabel={t("sheet.close")} style={{ flex: 1, backgroundColor: color.overlay }} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.grip} />
        <View style={styles.spread}>
          <Text style={text.title}>{t("stop.signature")}</Text>
          <Pressable accessibilityRole="button" onPress={() => setPaths([])} hitSlop={10} disabled={empty}>
            <Text style={{ fontFamily: font.semibold, fontSize: 15, color: empty ? color.textDisabled : color.primaryButton }}>{t("stop.signClear")}</Text>
          </Pressable>
        </View>
        <Text style={[text.caption, { fontSize: 13 }]}>{t("stop.signHint")}</Text>
        <View style={styles.pad} {...pan.panHandlers}>
          <Svg ref={(r) => void (svg.current = r as unknown as SvgRef | null)} width="100%" height="100%">
            <Rect x="0" y="0" width="100%" height="100%" fill={color.surface} />
            {[...paths, current.current].filter(Boolean).map((d, i) => (
              <Path key={i} d={d} stroke={color.textPrimary} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </Svg>
        </View>
        <Button label={t("stop.signSave")} loading={busy} disabled={empty || busy} onPress={save} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: color.background, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: space.lg, paddingTop: 10, gap: space.md },
  grip: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: color.borderStrong },
  spread: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pad: { height: 240, borderWidth: 1, borderColor: color.border, borderRadius: radius.card, overflow: "hidden", backgroundColor: color.surface },
});
