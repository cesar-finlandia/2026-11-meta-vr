/**
 * Tabular-numeral metric readout supporting worst-case digit budgets,
 * non-wrapping numerals, separate units, and camera readability floors.
 */
import type { JSX } from "react";

export function formatBudgetedMetric(
  value: number,
  maxRawBeforeAbbrev = 10000
): { display: string; fullTitle: string } {
  const fullTitle = Number.isFinite(value) ? value.toLocaleString("en-US") : String(value);

  if (!Number.isFinite(value)) {
    return { display: "—", fullTitle: "Not a number" };
  }

  if (Math.abs(value) >= 1000000) {
    const formatted = (value / 1000000).toFixed(2);
    return { display: `${formatted}M`, fullTitle };
  }

  if (Math.abs(value) >= maxRawBeforeAbbrev) {
    const formatted = (value / 1000).toFixed(1);
    return { display: `${formatted}k`, fullTitle };
  }

  // Format with up to 1 decimal place if fractional, otherwise integer
  const formatted = Number.isInteger(value) ? value.toString() : value.toFixed(1);
  return { display: formatted, fullTitle };
}

export interface MetricBlockProps {
  eyebrow: string;
  value: number | string;
  pairedValue?: number | string;
  unit?: string;
  support: string;
  size?: "hero" | "lg" | "md";
  tone?: "default" | "success" | "warning" | "danger";
  testId?: string;
}

export function MetricBlock({
  eyebrow,
  value,
  pairedValue,
  unit,
  support,
  size = "lg",
  tone = "default",
  testId,
}: MetricBlockProps): JSX.Element {
  const isNumeric = typeof value === "number";
  const numInfo = isNumeric ? formatBudgetedMetric(value) : { display: String(value), fullTitle: String(value) };

  let pairedDisplay: string | null = null;
  let pairedTitle: string | null = null;
  if (pairedValue !== undefined) {
    if (typeof pairedValue === "number") {
      const pInfo = formatBudgetedMetric(pairedValue);
      pairedDisplay = pInfo.display;
      pairedTitle = pInfo.fullTitle;
    } else {
      pairedDisplay = String(pairedValue);
      pairedTitle = String(pairedValue);
    }
  }

  const toneClass = tone !== "default" ? `metric--${tone}` : "";
  const sizeClass = `metric__value--${size}`;

  return (
    <div className={`metric ${toneClass}`.trim()} data-metric={size}>
      <span className="eyebrow">{eyebrow}</span>
      <div className="metric__row" style={{ display: "inline-flex", alignItems: "baseline", whiteSpace: "nowrap" }}>
        <span
          className={`metric__value ${sizeClass}`}
          title={numInfo.fullTitle}
          data-testid={testId}
          {...(size === "hero" ? { "data-metric-hero": "true" } : {})}
          style={{ verticalAlign: "baseline" }}
        >
          {numInfo.display}
        </span>
        {pairedDisplay !== null && (
          <>
            <span className="metric__sep" style={{ verticalAlign: "baseline" }}>/</span>
            <span className={`metric__value ${sizeClass}`} title={pairedTitle ?? undefined} style={{ verticalAlign: "baseline" }}>
              {pairedDisplay}
            </span>
          </>
        )}
        {unit && <span className="metric__unit" style={{ verticalAlign: "baseline", alignSelf: "baseline" }}>{unit}</span>}
      </div>
      <span className="support">{support}</span>
    </div>
  );
}
