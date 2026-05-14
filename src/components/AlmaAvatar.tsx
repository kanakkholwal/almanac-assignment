import * as React from "react";

import { cn } from "@/lib/utils";

interface AlmaAvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: number;
  glow?: boolean;
}

export function AlmaAvatar({
  size = 40,
  glow = true,
  className,
  ...props
}: AlmaAvatarProps) {
  const id = React.useId();

  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0", className)}
      style={{ width: size, height: size }}
      {...props}
    >
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <defs>
          <radialGradient id={`${id}-bg`} cx="50%" cy="38%" r="60%">
            <stop offset="0%" stopColor="#2f2640" />
            <stop offset="60%" stopColor="#1a1424" />
            <stop offset="100%" stopColor="#0d0915" />
          </radialGradient>
          <radialGradient id={`${id}-eye`} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#ffa766" />
            <stop offset="60%" stopColor="#ff7426" />
            <stop offset="100%" stopColor="#e15a10" />
          </radialGradient>
          <radialGradient id={`${id}-shine`} cx="50%" cy="22%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.30)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>
        <circle cx="20" cy="20" r="20" fill={`url(#${id}-bg)`} />
        {glow ? <circle cx="20" cy="20" r="20" fill={`url(#${id}-shine)`} /> : null}
        <circle cx="13.5" cy="20.5" r="3.4" fill={`url(#${id}-eye)`} />
        <circle cx="26.5" cy="20.5" r="3.4" fill={`url(#${id}-eye)`} />
      </svg>
    </span>
  );
}
