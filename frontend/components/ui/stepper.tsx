import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export interface StepperProps {
  steps: { key: string; label: string; description?: string }[];
  /** 0 dan boshlanadi. */
  current: number;
  /** Faqat bajarilgan qadamga qaytish mumkin. */
  onStepClick?: (index: number) => void;
}

/** Qadamlar koʻrsatkichi (sozlash ustasi). Holat rang + belgi (check / raqam) + soʻz bilan. */
export function Stepper({ steps, current, onStepClick }: StepperProps) {
  return (
    <ol className="flex items-start">
      {steps.map((step, i) => {
        const done = i < current;
        const isCurrent = i === current;
        const clickable = done && onStepClick;
        const content = (
          <>
            <span
              className={cn(
                "tabular flex size-7 items-center justify-center rounded-full border-2 text-table font-semibold",
                done && "border-primary-button bg-primary-button text-white",
                isCurrent && "border-primary-button bg-surface text-primary-button",
                !done && !isCurrent && "border-border bg-surface text-text-secondary",
              )}
            >
              {done ? <Check size={16} strokeWidth={2} aria-hidden /> : i + 1}
            </span>
            <span
              className={cn(
                "mt-2 text-table",
                isCurrent ? "font-semibold text-text-primary" : done ? "text-text-primary" : "text-text-secondary",
              )}
            >
              {step.label}
              <span className="sr-only">{done ? " — bajarilgan" : isCurrent ? " — joriy qadam" : " — kelgusi"}</span>
            </span>
            {step.description ? <span className="text-caption text-text-secondary">{step.description}</span> : null}
          </>
        );
        return (
          <li
            key={step.key}
            aria-current={isCurrent ? "step" : undefined}
            className={cn(
              "relative flex flex-1 basis-0 flex-col items-center px-1 text-center",
              i > 0 &&
                "before:absolute before:top-[13px] before:right-[calc(50%+20px)] before:left-[calc(-50%+20px)] before:h-0.5 before:rounded-full",
              i > 0 && (done || isCurrent ? "before:bg-primary" : "before:bg-border"),
            )}
          >
            {clickable ? (
              <button type="button" onClick={() => onStepClick(i)} className="flex flex-col items-center rounded-control">
                {content}
              </button>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ol>
  );
}
