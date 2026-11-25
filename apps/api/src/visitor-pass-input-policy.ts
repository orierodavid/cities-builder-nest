export type VisitorFrequency = "once" | "daily" | "weekly";
export type VisitorPassInput = {
  visitorName: string;
  visitorPhone: string | null;
  visitorCount: number;
  frequency: VisitorFrequency;
  scheduleStartDate: string;
  scheduleEndDate: string;
  validFrom: Date;
  validUntil: Date;
};
const DEFAULT_VISITOR_PASS_DURATION_MS = 12 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
/** Normalize and validate one-time and recurring visitor passes. */
export function parseVisitorPassInput(input: {
  visitorName?: unknown; visitorPhone?: unknown; visitorCount?: unknown;
  frequency?: unknown; scheduleStartDate?: unknown; scheduleEndDate?: unknown;
}, nowMs = Date.now()): VisitorPassInput | null {
  const visitorName = typeof input.visitorName === "string" ? input.visitorName.trim() : "";
  const visitorPhone = typeof input.visitorPhone === "string" ? input.visitorPhone.trim() : null;
  const frequency = (input.frequency ?? "once") as VisitorFrequency;
  const visitorCount = input.visitorCount === undefined ? 1 : Number(input.visitorCount);
  const today = new Date(nowMs + 60 * 60 * 1000).toISOString().slice(0, 10);
  const start = input.scheduleStartDate === undefined ? today : input.scheduleStartDate;
  const end = input.scheduleEndDate === undefined ? start : input.scheduleEndDate;
  if (!["once", "daily", "weekly"].includes(frequency) ||
      !Number.isSafeInteger(visitorCount) || visitorCount < 1 || visitorCount > 50 ||
      visitorName.length < 2 || visitorName.length > 120 ||
      (visitorPhone !== null && (visitorPhone.length > 40 || !/^\+?[0-9 ()-]{7,40}$/.test(visitorPhone))) ||
      !validDate(start) || !validDate(end) || end < start) return null;
  if (frequency === "once" && start !== end) return null;
  const startAt = new Date(start + "T00:00:00.000+01:00");
  const endAt = new Date(end + "T23:59:59.999+01:00");
  if (endAt.getTime() <= nowMs || endAt.getTime() - startAt.getTime() > 366 * 24 * 60 * 60 * 1000) return null;
  const validFrom = frequency === "once" ? new Date(Math.max(nowMs, startAt.getTime())) : startAt;
  const validUntil = frequency === "once" ? new Date(validFrom.getTime() + DEFAULT_VISITOR_PASS_DURATION_MS) : endAt;
  if (validUntil.getTime() <= validFrom.getTime()) return null;
  return { visitorName, visitorPhone: visitorPhone || null, visitorCount, frequency, scheduleStartDate: start, scheduleEndDate: end, validFrom, validUntil };
}
