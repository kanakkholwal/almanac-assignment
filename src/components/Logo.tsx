import * as React from "react";

import { cn } from "@/lib/utils";

export interface LogoProps extends React.SVGProps<SVGSVGElement> {
  /** Pixel size for both width and height. */
  size?: number;
}

/**
 * Almanac brand mark. The rounded backdrop is painted with `currentColor`,
 * so the logo tint follows the surrounding `color` (defaults to the accent).
 */
export function Logo({ size = 40, className, ...props }: LogoProps) {
  return (
    <svg
      viewBox="0 0 56 56"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Almanac"
      className={cn("shrink-0 text-accent", className)}
      {...props}
    >
      <rect x="1" y="1" width="54" height="54" rx="27" fill="currentColor" />
      <rect
        x="1"
        y="1"
        width="54"
        height="54"
        rx="27"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect x="11" y="23" width="12" height="21" rx="6" fill="white" />
      <rect x="13" y="25" width="10" height="10" rx="5" fill="black" />
      <rect x="32" y="23" width="12" height="21" rx="6" fill="white" />
      <rect x="34" y="25" width="10" height="10" rx="5" fill="black" />
    </svg>
  );
}
