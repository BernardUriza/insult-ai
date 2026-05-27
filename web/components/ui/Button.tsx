import * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant → maps to an iai-btn-* semantic class.
   *  - ``primary`` — the main CTA (Roast it 🔥).
   *  - ``ghost`` — neutral / secondary (Stop, cancel).
   *  - ``chip`` — small inline pill (example targets, nav chips, ``chat →``). */
  variant?: "primary" | "ghost" | "chip";
  /** Size modifier. Default ``md``. ``sm`` is used for inline CTAs inside
   * cards (e.g. SampleRoast's "Run this live") where the standard padding
   * would dominate the layout. Wired via a `data-size` attribute so the CSS
   * variant ``.iai-btn-primary[data-size="sm"]`` stacks cleanly on top of
   * the base class without needing a class-merge helper. */
  size?: "sm" | "md";
  /** Shows a spinner and disables the button. */
  loading?: boolean;
}

const VARIANT: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "iai-btn-primary",
  ghost: "iai-btn-ghost",
  chip: "iai-btn-chip",
};

/** Button — styled only through `iai-btn-*` (see globals.css). `className` is for
 * layout (w-full, etc.), never for visual styling. */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${VARIANT[variant]} ${className}`.trim()}
      data-size={size === "md" ? undefined : size}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
