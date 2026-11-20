import { useEffect, useState } from "react";
import { clearFailures, failures, pending, subscribe } from "./queue";

/** Oflayn navbat holati: navbatdagi amallar soni va server rad etganlari. */
export function useQueueInfo() {
  const [count, setCount] = useState(0);
  const [failed, setFailed] = useState(failures());
  useEffect(() => {
    const update = () => {
      void pending().then((q) => setCount(q.length));
      setFailed([...failures()]);
    };
    update();
    return subscribe(update);
  }, []);
  return { count, failed, dismiss: clearFailures };
}
