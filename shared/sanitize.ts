const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export function sanitizeUserText(input: string, maxLength = 4_000) {
  return input
    .replace(CONTROL_CHARS, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeMultilineText(input: string, maxLength = 20_000) {
  return input
    .replace(CONTROL_CHARS, " ")
    .replace(/[<>]/g, "")
    .slice(0, maxLength);
}
