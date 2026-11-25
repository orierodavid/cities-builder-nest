import { supabase } from './supabase';

/**
 * Calculates outstanding active estate service charges for the signed-in
 * resident. Payment records are matched by apartment first so a confirmed
 * household payment clears the shared apartment charge for both residents.
 */
export async function loadPendingServiceChargeTotalKobo(): Promise<number> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('A signed-in resident is required to view pending charges.');

  const { data: memberships, error: membershipError } = await supabase
    .from('estate_memberships')
    .select('estate_id')
    .eq('user_id', user.id)
    .eq('membership_role', 'resident')
    .eq('status', 'active');
  if (membershipError) throw membershipError;

  const estateIds = [...new Set((memberships || []).map(row => row.estate_id).filter(Boolean))];
  if (!estateIds.length) return 0;

  const { data: assignments, error: assignmentError } = await supabase
    .from('resident_units')
    .select('estate_id,unit_id')
    .eq('resident_user_id', user.id)
    .is('end_date', null)
    .order('created_at', { ascending: false });
  if (assignmentError) throw assignmentError;

  const unitByEstate = new Map<string, string>();
  for (const assignment of assignments || []) {
    if (!unitByEstate.has(assignment.estate_id) && assignment.unit_id) {
      unitByEstate.set(assignment.estate_id, assignment.unit_id);
    }
  }

  let totalKobo = 0;
  for (const estateId of estateIds) {
    const [{ data: charges, error: chargesError }, { data: payments, error: paymentsError }] = await Promise.all([
      supabase.from('estate_service_charges')
        .select('id,amount_kobo')
        .eq('estate_id', estateId)
        .eq('is_active', true),
      (() => {
        const query = supabase.from('service_charge_payments')
          .select('charge_id,status,verified_at')
          .eq('estate_id', estateId);
        const unitId = unitByEstate.get(estateId);
        return unitId
          ? query.or(`unit_id.eq.${unitId},and(unit_id.is.null,resident_user_id.eq.${user.id})`)
          : query.eq('resident_user_id', user.id);
      })(),
    ]);
    if (chargesError) throw chargesError;
    if (paymentsError) throw paymentsError;

    const paidChargeIds = new Set(
      (payments || [])
        .filter(payment => payment.status === 'successful' && !!payment.verified_at)
        .map(payment => payment.charge_id)
        .filter(Boolean),
    );
    for (const charge of charges || []) {
      if (!paidChargeIds.has(charge.id)) totalKobo += Number(charge.amount_kobo) || 0;
    }
  }

  return totalKobo;
}
