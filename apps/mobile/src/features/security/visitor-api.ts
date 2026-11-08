export type VisitorPass = { id: string; visitor_name: string; visitor_phone: string | null; valid_from: string; valid_until: string; status: string; created_at: string };
export type GateVisit = { id: string; checked_in_at: string; visitor_passes?: { visitor_name?: string; visitor_phone?: string } | null };
export type VisitorApiContext = { accessToken: string | null | undefined; estateId: string | null; apiUrl: string };
export type VisitorApiResult = { error?: string; accessCode?: string; visits?: GateVisit[]; visitorPasses?: VisitorPass[]; visitorPass?: VisitorPass; [key: string]: unknown };

export function visitorApiErrorMessage(code: string | undefined): string {
  switch (code) {
    case "security_membership_required": return "Access denied: only active security staff assigned to this estate can manage gate visits.";
    case "estate_membership_required": return "Access denied: only an active resident of this estate can manage your visitor passes.";
    case "estate_subscription_inactive": return "This estate is temporarily unavailable because its subscription is inactive.";
    case "invalid_access_code": return "Enter the six-digit visitor access code.";
    case "visitor_pass_not_found_or_invalid": return "No visitor pass matches that code in this estate.";
    case "visitor_pass_expired_or_inactive": return "This visitor pass is expired, revoked, or inactive.";
    case "visitor_pass_already_used": return "This visitor pass has already been used and cannot be reused.";
    case "visitor_check_in_failed": return "Check-in could not be completed. Please try again.";
    case "active_visits_load_failed": return "Active visits could not be loaded. Check your gate permissions and connection.";
    case "open_visit_not_found_or_checkout_failed": return "This visit is no longer open or could not be checked out.";
    case "visitor_pass_list_failed": return "Visitor pass history could not be loaded.";
    case "visitor_pass_create_failed": return "The visitor pass could not be created. Confirm your estate membership and try again.";
    case "estate_not_found_or_unavailable": return "The selected estate could not be found or is unavailable.";
    default: return code ? "Visitor operation failed (" + code + ")." : "Visitor operation failed. Check your connection and try again.";
  }
}

export async function visitorRequest(context: VisitorApiContext, path: string, method: string, body?: unknown): Promise<VisitorApiResult> {
  if (!context.accessToken || !context.estateId || !context.apiUrl) throw new Error("Select an estate and confirm the API is configured.");
  const response = await fetch(context.apiUrl + "/v1/estates/" + encodeURIComponent(context.estateId) + path, {
    method,
    headers: { Authorization: "Bearer " + context.accessToken, Accept: "application/json", "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json() as VisitorApiResult;
  if (!response.ok) throw new Error(visitorApiErrorMessage(result.error));
  return result;
}
