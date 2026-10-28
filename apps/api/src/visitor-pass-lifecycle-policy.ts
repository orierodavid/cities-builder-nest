export type VisitorPassState = {
  status: string;
  valid_from: string;
  valid_until: string;
};

/** Require a six-digit numeric access code without coercing non-string input. */
export function isValidVisitorAccessCode(value: unknown): value is string {
  return typeof value === "string" && /^\d{6}$/.test(value.trim());
}

/** A pass can be consumed only while active and inside its validity window. */
export function isVisitorPassCurrentlyValid(
  pass: VisitorPassState,
  nowMs = Date.now(),
): boolean {
  const from = new Date(pass.valid_from).getTime();
  const until = new Date(pass.valid_until).getTime();
  return pass.status === "active" &&
    Number.isFinite(from) &&
    Number.isFinite(until) &&
    from <= nowMs &&
    until > nowMs;
}

/** Map known database lifecycle failures to stable, non-sensitive API responses. */
export function visitorCheckInFailure(code?: string): { status: number; error: string } {
  if (code === "23505") return { status: 409, error: "visitor_pass_already_used" };
  if (code === "55000") return { status: 423, error: "estate_subscription_inactive" };
  if (code === "23514") return { status: 409, error: "visitor_pass_expired_or_inactive" };
  return { status: 400, error: "visitor_check_in_failed" };
}

/** Return a terminal pass error before attempting to insert a visit. */
export function visitorPassAvailabilityError(
  pass: VisitorPassState,
  nowMs = Date.now(),
): string | null {
  if (pass.status === "used") return "visitor_pass_already_used";
  if (pass.status !== "active") return "visitor_pass_expired_or_inactive";
  const from = new Date(pass.valid_from).getTime();
  const until = new Date(pass.valid_until).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(until) || from > nowMs || until <= nowMs) {
    return "visitor_pass_expired_or_inactive";
  }
  return null;
}
