export type VirtualAccountCreateInput = {
  residentId: string;
  estateId: string;
  fullName: string;
  email: string;
  phone: string | null;
  idempotencyKey: string;
};

export type ProviderVirtualAccount = {
  provider: string;
  customerReference: string | null;
  accountReference: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
};

export interface VirtualAccountProvider {
  readonly name: string;
  createDedicatedAccount(input: VirtualAccountCreateInput): Promise<ProviderVirtualAccount>;
}

/**
 * Provider selection is deliberately explicit. Add a concrete, signature-aware
 * adapter only after the business selects a provider and supplies server-side
 * credentials. Never accept provider keys or account details from a client.
 */
export function resolveVirtualAccountProvider(): VirtualAccountProvider | null {
  return null;
}
