import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOSE_DELAY_MS, resetLive, STREAM_URL, subscribeLive, useLive } from "./live";

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
  emit(type: string) {
    this.listeners.get(type)?.forEach((fn) => fn());
  }
  close() {
    this.closed = true;
  }
}

const last = () => FakeEventSource.instances.at(-1);

describe("live (SSE)", () => {
  beforeEach(() => {
    resetLive();
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("oʻchiq boʻlsa ulanmaydi", () => {
    renderHook(() => useLive(["orders"], () => {}, false));
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("bir nechta obunachi — bitta ulanish; oxirgisi ketganda kechikib yopiladi", () => {
    vi.useFakeTimers();
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeLive("orders", a);
    const offB = subscribeLive("notifications", b);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(last()?.url).toBe(STREAM_URL);

    last()?.emit("orders");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();

    offA();
    expect(last()?.closed).toBe(false);
    offB();
    expect(last()?.closed).toBe(false);
    vi.advanceTimersByTime(CLOSE_DELAY_MS);
    expect(last()?.closed).toBe(true);
  });

  it("sahifa almashganda (darhol qayta obuna) ulanish saqlanadi", () => {
    vi.useFakeTimers();
    const off = subscribeLive("orders", () => {});
    off();
    const again = subscribeLive("orders", () => {});
    vi.advanceTimersByTime(CLOSE_DELAY_MS * 2);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(last()?.closed).toBe(false);
    again();
  });

  it("ready — ulandi va hammasi yangilanadi; xato — ulanmagan; hodisa — oxirgi callback", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender, unmount } = renderHook(({ cb }) => useLive(["orders", "trips"], cb), {
      initialProps: { cb: first },
    });
    expect(result.current).toBe(false);

    act(() => last()?.emit("ready"));
    expect(result.current).toBe(true);
    expect(first).toHaveBeenCalled();

    rerender({ cb: second });
    act(() => last()?.emit("trips"));
    expect(second).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.instances).toHaveLength(1);

    act(() => last()?.onerror?.(new Event("error")));
    expect(result.current).toBe(false);

    unmount();
  });
});
