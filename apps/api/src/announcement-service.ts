export type AnnouncementInput = { title: string; body: string };

export type AnnouncementRepository<T> = {
  getActiveMembershipRole(estateId: string, userId: string): Promise<{ role: string | null; error?: boolean }>;
  insertDraft(estateId: string, userId: string, input: AnnouncementInput): Promise<{ data: T | null; error?: boolean }>;
};

export type AnnouncementCreation<T> =
  | { status: 400; body: { error: string; message?: string } }
  | { status: 403; body: { error: string } }
  | { status: 201; body: { announcement: T } };

function validateAnnouncement(body: unknown): { ok: true; value: AnnouncementInput } | { ok: false } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false };
  const candidate = body as Record<string, unknown>;
  if (typeof candidate.title !== "string" || typeof candidate.body !== "string") return { ok: false };
  const title = candidate.title.trim();
  const content = candidate.body.trim();
  if (title.length < 3 || title.length > 120 || content.length < 5 || content.length > 10000) return { ok: false };
  return { ok: true, value: { title, body: content } };
}

export async function createAnnouncementDraft<T>(
  estateId: string,
  userId: string,
  body: unknown,
  repository: AnnouncementRepository<T>,
): Promise<AnnouncementCreation<T>> {
  if (!estateId.trim()) return { status: 400, body: { error: "invalid_estate_id" } };
  const validation = validateAnnouncement(body);
  if (!validation.ok) {
    return { status: 400, body: { error: "invalid_announcement", message: "Title must be 3–120 characters and body 5–10000 characters." } };
  }
  const membership = await repository.getActiveMembershipRole(estateId, userId);
  if (membership.error) return { status: 403, body: { error: "estate_membership_check_failed" } };
  if (!membership.role) return { status: 403, body: { error: "active_estate_membership_required" } };
  if (!["estate_manager", "estate_admin"].includes(membership.role)) {
    return { status: 403, body: { error: "announcement_management_role_required" } };
  }
  const inserted = await repository.insertDraft(estateId, userId, validation.value);
  if (inserted.error || !inserted.data) return { status: 400, body: { error: "announcement_create_failed" } };
  return { status: 201, body: { announcement: inserted.data } };
}
