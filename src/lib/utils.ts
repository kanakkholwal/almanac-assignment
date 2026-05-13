import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { sanitizeUserText } from "@shared/sanitize";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function formatClock(date = new Date()) {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function normalizePrompt(input: string) {
  return sanitizeUserText(input, 2_000);
}
