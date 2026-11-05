"use client";

import { Eraser } from "lucide-react";
import { type PointerEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { isSignatureEnough, type Stroke, toCanvasPoint } from "./signature";

const WIDTH = 640;
const HEIGHT = 260;

function token(name: string, fallbackVar: string): string {
  if (typeof window === "undefined") return fallbackVar;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallbackVar;
}

/** Mijoz imzosi (SPEC 5.4: ixtiyoriy). Barmoq/stilus bilan chiziladi, PNG bo'lib yuklanadi. Har ochilishda yangidan mount qiling (key). */
export function SignatureModal({
  open,
  customer,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  customer: string;
  saving: boolean;
  onClose: () => void;
  onSave: (png: Blob) => void;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const strokes = useRef<Array<Array<{ x: number; y: number }>>>([]);
  const drawing = useRef(false);
  const [enough, setEnough] = useState(false);

  function point(e: PointerEvent<HTMLCanvasElement>) {
    const c = e.currentTarget;
    return toCanvasPoint(e.clientX, e.clientY, c.getBoundingClientRect(), c);
  }

  function down(e: PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    strokes.current.push([p]);
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = token("--color-text-primary", "black");
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const current = strokes.current[strokes.current.length - 1];
    const prev = current[current.length - 1];
    const p = point(e);
    current.push(p);
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = token("--color-text-primary", "black");
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    setEnough(isSignatureEnough(strokes.current as ReadonlyArray<Stroke>));
  }

  function clear() {
    strokes.current = [];
    setEnough(false);
    canvas.current?.getContext("2d")?.clearRect(0, 0, WIDTH, HEIGHT);
  }

  function save() {
    const src = canvas.current;
    if (!src) return;
    // Shaffof fon ba'zi ko'ruvchilarda qora bo'lib ko'rinadi — oq (surface) fonga ko'chiramiz
    const out = document.createElement("canvas");
    out.width = WIDTH;
    out.height = HEIGHT;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = token("--color-surface", "white");
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.drawImage(src, 0, 0);
    out.toBlob((b) => {
      if (b) onSave(b);
    }, "image/png");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Mijoz imzosi: ${customer}`}
      primaryAction={{ label: "Imzoni saqlash", onClick: save, loading: saving, disabled: !enough }}
    >
      <div className="flex flex-col gap-2">
        <div className="text-body text-text-secondary">Mijoz barmogʻi yoki stilus bilan ramka ichida imzo qoʻysin. Imzo ixtiyoriy.</div>
        <canvas
          ref={canvas}
          width={WIDTH}
          height={HEIGHT}
          aria-label="Imzo maydoni"
          className="h-48 w-full touch-none rounded-control border border-dashed border-border bg-surface"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        <div className="flex items-center justify-between">
          <span className="text-caption text-text-secondary">{enough ? "Imzo tayyor" : "Imzo hali chizilmagan"}</span>
          <Button variant="tertiary" icon={Eraser} onClick={clear}>
            Tozalash
          </Button>
        </div>
      </div>
    </Modal>
  );
}
