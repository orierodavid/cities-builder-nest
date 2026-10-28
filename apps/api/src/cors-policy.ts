export function isAllowedCorsOrigin(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  // Non-browser requests commonly omit Origin; browser origins must match exactly.
  return origin === undefined || allowedOrigins.has(origin);
}
