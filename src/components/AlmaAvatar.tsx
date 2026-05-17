import * as React from "react";

import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

interface AlmaAvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: number;
  glow?: boolean;
}

export function AlmaAvatar({
  size = 40,
  glow = true,
  className,
  style,
  ...props
}: AlmaAvatarProps) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0", className)}
      style={{
        width: size,
        height: size,
        filter: glow
          ? "drop-shadow(0 0 8px color-mix(in oklch, var(--color-accent) 55%, transparent))"
          : undefined,
        ...style,
      }}
      {...props}
    >
      <Logo size={size} />
    </span>
  );
}
