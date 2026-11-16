/**
 * Sightline Studio vector brandmark and live-text wordmark/slogan lockup.
 */
import type { JSX } from "react";

export const BRAND_NAME = "Sightline Studio";
export const BRAND_SLOGAN = "Every sightline, proven before hanging.";

export interface BrandmarkProps {
  variant?: "header" | "slide" | "cover" | "mark-only";
  className?: string;
}

export function Brandmark({ variant = "header", className = "" }: BrandmarkProps): JSX.Element {
  const isMarkOnly = variant === "mark-only";
  const variantClass = variant !== "mark-only" ? `brandmark--${variant}` : "";

  return (
    <div
      className={`brandmark ${variantClass} ${className}`.trim()}
      data-brandmark={variant}
      aria-label={`${BRAND_NAME} — ${BRAND_SLOGAN}`}
    >
      <svg
        className="brandmark__mark"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 32 32"
        fill="none"
        role="img"
        aria-hidden="true"
      >
        <rect
          x="21"
          y="5"
          width="7"
          height="22"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M4 9L18.5 16L4 23"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="18.5" cy="16" r="2.6" fill="currentColor" />
      </svg>
      {!isMarkOnly && (
        <div className="brandmark__stack">
          <span className="brandmark__word">
            Sightline <span className="brandmark__word-secondary">Studio</span>
          </span>
          <span className="brandmark__slogan">{BRAND_SLOGAN}</span>
        </div>
      )}
    </div>
  );
}
