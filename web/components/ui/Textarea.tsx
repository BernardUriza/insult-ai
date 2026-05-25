import * as React from "react";

/** Textarea — styled through `iai-input` (see globals.css). */
export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className = "", ...props }, ref) => (
  <textarea ref={ref} className={`iai-input ${className}`.trim()} {...props} />
));

Textarea.displayName = "Textarea";
