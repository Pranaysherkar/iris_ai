/** First token of full name for greeting (e.g. "Ram Kumar" -> "Ram"). */
export function firstNameFromFullName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] ?? "there";
}
