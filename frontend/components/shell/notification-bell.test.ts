import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STREAM_URL, useNotificationStream } from "./notification-bell";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  onerror: ((e: Event) => void) | null = null;
  private listeners = new Map<string, Set<() => void>>();
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(fn);
  }
  removeEventListener(type: string, fn: () => void) {
    this.listeners.get(type)?.delete(fn);
  }
  emit(type: string) {
    this.listeners.get(type)?.forEach((fn) => fn());
  }
  close() {
    this.closed = true;
  }
}

describe("useNotificationStream", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("kirmagan foydalanuvchi uchun ulanmaydi", () => {
    renderHook(() => useNotificationStream(false, () => {}));
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("ready — ulandi va roʻyxat yangilanadi; notifications — yana yangilanadi; xato — ulanmagan", () => {
    const onChanged = vi.fn();
    const { result, unmount } = renderHook(() => useNotificationStream(true, onChanged));
    const es = FakeEventSource.instances[0];
    expect(es?.url).toBe(STREAM_URL);
    expect(result.current).toBe(false);

    act(() => es?.emit("ready"));
    expect(result.current).toBe(true);
    expect(onChanged).toHaveBeenCalledTimes(1);

    act(() => es?.emit("notifications"));
    expect(onChanged).toHaveBeenCalledTimes(2);

    act(() => es?.onerror?.(new Event("error")));
    expect(result.current).toBe(false);

    unmount();
    expect(es?.closed).toBe(true);
  });

  it("eng oxirgi callback chaqiriladi (qayta ulanmasdan)", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useNotificationStream(true, cb), { initialProps: { cb: first } });
    rerender({ cb: second });
    act(() => FakeEventSource.instances[0]?.emit("notifications"));
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
