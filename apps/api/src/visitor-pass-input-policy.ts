export type VisitorPassInput = {
  visitorName: string;
  visitorPhone: string | null;
  validFrom: Date;
  validUntil: Date;
};

const MAX_VISITOR_PASS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_VISITOR_PASS_DURATION_MS = 12 * 60 * 60 * 1000;

/** Normalize and validate the resident-provided visitor pass fields. */
export function parseVisitorPassInput(
  input: {
    visitorName?: unknown;
    visitorPhone?: unknown;
    validFrom?: unknown;
    validUntil?: unknown;
  },
  nowMs = Date.now(),
): VisitorPassInput | null {
  const visitorName = typeof input.visitorName === "string" ? input.visitorName.trim() : "";
  const visitorPhone = typeof input.visitorPhone === "string" ? input.visitorPhone.trim() : null;
  const validFrom = typeof input.validFrom === "string" ? new Date(input.validFrom) : new Date(nowMs);
  const validUntil = typeof input.validUntil === "string"
    ? new Date(input.validUntil)
    : new Date(nowMs + DEFAULT_VISITOR_PASS_DURATION_MS);

  if (
    visitorName.length < 2 ||
    visitorName.length > 120 ||
    (visitorPhone !== null && visitorPhone.length > 40) ||
    !Number.isFinite(validFrom.getTime()) ||
    !Number.isFinite(validUntil.getTime()) ||
    validUntil.getTime() <= nowMs ||
    validUntil.getTime() <= validFrom.getTime() ||
    validUntil.getTime() - validFrom.getTime() > MAX_VISITOR_PASS_DURATION_MS
  ) {
    return null;
  }

  return { visitorName, visitorPhone, validFrom, validUntil };
}
