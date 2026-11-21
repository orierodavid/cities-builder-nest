export type VirtualAccountCreateInput = {
  residentId: string; estateId: string; fullName: string; email: string;
  phone: string | null; idempotencyKey: string;
};
export type ProviderVirtualAccount = {
  provider: string; customerReference: string | null; accountReference: string;
  bankName: string; accountNumber: string; accountName: string;
};
export interface VirtualAccountProvider {
  readonly name: string;
  createDedicatedAccount(input: VirtualAccountCreateInput): Promise<ProviderVirtualAccount>;
}
async function paystackRequest(path: string, secret: string, body?: Record<string, unknown>) {
  const response = await fetch(`https://api.paystack.co${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  let payload: Record<string, unknown>;
  try { payload = await response.json(); } catch { throw new Error("paystack_invalid_response"); }
  if (!response.ok || payload.status !== true || !payload.data || typeof payload.data !== "object") {
    throw new Error(typeof payload.message === "string" ? payload.message.slice(0, 180) : "paystack_request_failed");
  }
  return payload.data as Record<string, unknown>;
}
export function resolveVirtualAccountProvider(name: string): VirtualAccountProvider | null {
  if (name !== "paystack" || !Deno.env.get("PAYSTACK_SECRET_KEY")) return null;
  return {
    name: "paystack",
    async createDedicatedAccount(input) {
      const secret = Deno.env.get("PAYSTACK_SECRET_KEY")!;
      const parts = input.fullName.trim().split(/\s+/);
      const customer = await paystackRequest("/customer", secret, {
        email: input.email, first_name: parts[0] || "",
        last_name: parts.slice(1).join(" ") || parts[0] || "",
        ...(input.phone ? { phone: input.phone } : {}),
      });
      const customerCode = typeof customer.customer_code === "string" ? customer.customer_code : "";
      if (!customerCode) throw new Error("paystack_customer_reference_missing");
      const dedicated = await paystackRequest("/dedicated_account", secret, {
        customer: customerCode, country: "NG",
      });
      const bank = dedicated.bank && typeof dedicated.bank === "object"
        ? dedicated.bank as Record<string, unknown> : {};
      const accountNumber = typeof dedicated.account_number === "string" ? dedicated.account_number : "";
      const accountName = typeof dedicated.account_name === "string" ? dedicated.account_name : "";
      const bankName = typeof bank.name === "string" ? bank.name : "";
      const accountReference = String(dedicated.id ?? accountNumber);
      if (!accountNumber || !accountName || !bankName || !accountReference) {
        throw new Error("paystack_dedicated_account_details_incomplete");
      }
      return { provider: "paystack", customerReference: customerCode, accountReference,
        bankName, accountNumber, accountName };
    },
  };
}
