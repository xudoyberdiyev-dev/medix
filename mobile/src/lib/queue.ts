import { File, Paths } from "expo-file-system";
import { ApiError } from "./api";
import { dropFirst, type Queued, type QueuedAction } from "./queue-core";
import { deliver, partial, undeliver, uploadPhoto } from "./trips";

// Oflayn navbat (M5): internet yoʻqda amallar telefonda saqlanadi va tartib bilan yuboriladi.
// Fayl: hujjatlar papkasi (ilova oʻchirilmaguncha saqlanadi). Server rad etgan amal — «failed» roʻyxatiga.
const QUEUE = "oflayn-navbat.json";
const FAILED = "oflayn-xatolar.json";

type Failed = { action: Queued; detail: string };

let queue: Queued[] | null = null;
let failed: Failed[] = [];
let flushing = false;
const listeners = new Set<() => void>();

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const f = new File(Paths.document, name);
    return f.exists ? (JSON.parse(await f.text()) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function writeJson(name: string, value: unknown): Promise<void> {
  await new File(Paths.document, name).write(JSON.stringify(value));
}

async function load(): Promise<Queued[]> {
  if (queue === null) {
    queue = await readJson<Queued[]>(QUEUE, []);
    failed = await readJson<Failed[]>(FAILED, []);
  }
  return queue;
}

async function save(): Promise<void> {
  await writeJson(QUEUE, queue ?? []);
  await writeJson(FAILED, failed);
  listeners.forEach((l) => l());
}

export async function pending(): Promise<Queued[]> {
  return [...(await load())];
}

export function failures(): Failed[] {
  return failed;
}

export async function clearFailures(): Promise<void> {
  failed = [];
  await save();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isNetworkError(e: unknown): boolean {
  return e instanceof ApiError && (e.problem.status === 0 || e.problem.status >= 502);
}

/** Rasmni kesh papkasidan doimiy papkaga koʻchiradi (tizim keshni tozalasa ham yoʻqolmasin). */
async function keep(uri: string): Promise<string> {
  if (uri.startsWith(Paths.document.uri)) return uri;
  const target = new File(Paths.document, `navbat-${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`);
  await new File(uri).copy(target);
  return target.uri;
}

export async function enqueue(action: QueuedAction): Promise<void> {
  const q = await load();
  const a = action.kind === "photo" ? { ...action, uri: await keep(action.uri) } : action;
  q.push({ ...a, id: `${Date.now()}-${q.length}`, at: new Date().toISOString() });
  await save();
}

async function send(a: Queued): Promise<void> {
  if (a.kind === "photo") await uploadPhoto(a.tripId, a.stopId, a.uri, a.signature);
  if (a.kind === "deliver") await deliver(a.tripId, a.stopId, a.cash);
  if (a.kind === "undeliver") await undeliver(a.tripId, a.stopId, a.reason);
  if (a.kind === "partial") await partial(a.tripId, a.stopId, a.reason, a.lines, a.cash);
}

function remove(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // fayl allaqachon yoʻq
  }
}

/** Navbatni tartib bilan yuboradi; internet yoʻq boʻlsa — toʻxtaydi va keyinroq qayta urinadi. */
export async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    for (;;) {
      const q = await load();
      const next = q[0];
      if (!next) break;
      try {
        await send(next);
      } catch (e) {
        if (isNetworkError(e)) break;
        if (e instanceof ApiError && e.problem.status === 401) break; // sessiya tugagan — login ekrani
        failed.push({ action: next, detail: e instanceof ApiError ? (e.problem.detail ?? e.problem.code ?? String(e.problem.status)) : String(e) });
      }
      if (next.kind === "photo") remove(next.uri);
      queue = dropFirst(q, next.id);
      await save();
    }
  } finally {
    flushing = false;
  }
}
