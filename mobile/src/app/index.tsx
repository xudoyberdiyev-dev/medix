import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { hasPin } from "../lib/pin-store";

/** Boshlanish: PIN oʻrnatilgan boʻlsa — PIN bilan kirish, aks holda — login. */
export default function Start() {
  const [target, setTarget] = useState<"/pin" | "/login" | null>(null);
  useEffect(() => {
    void hasPin().then((p) => setTarget(p ? "/pin" : "/login"));
  }, []);
  return target ? <Redirect href={target} /> : null;
}
