import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { hasSession } from "../lib/auth";
import { hasPin } from "../lib/pin-store";

/** Boshlanish: qurilma tokeni va PIN boʻlsa — PIN bilan kirish; token bor, PIN yoʻq — PIN oʻrnatish; aks holda — login. */
export default function Start() {
  const [target, setTarget] = useState<"/pin" | "/pin-set" | "/login" | null>(null);
  useEffect(() => {
    void Promise.all([hasSession(), hasPin()]).then(([s, p]) => setTarget(!s ? "/login" : p ? "/pin" : "/pin-set"));
  }, []);
  return target ? <Redirect href={target} /> : null;
}
