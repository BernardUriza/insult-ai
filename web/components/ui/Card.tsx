import type { ReactNode } from "react";

export interface CardProps {
  /** Softer surface (lighter bg) — used for the receipts panel. */
  soft?: boolean;
  className?: string;
  children: ReactNode;
}

/** Card — `iai-card` / `iai-card-soft` (see globals.css). */
export function Card({ soft = false, className = "", children }: CardProps) {
  return <div className={`${soft ? "iai-card-soft" : "iai-card"} ${className}`.trim()}>{children}</div>;
}

export function CardTitle({ className = "", children }: { className?: string; children: ReactNode }) {
  return <h2 className={`iai-card-title ${className}`.trim()}>{children}</h2>;
}
