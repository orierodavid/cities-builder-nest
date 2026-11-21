-- Ensure account and legal controls restrict (rather than broaden) support-ticket visibility.
drop policy if exists support_tickets_legal_consent on public.support_tickets;
create policy support_tickets_legal_consent on public.support_tickets
as restrictive for all to authenticated
using (public.current_user_has_required_legal_consent())
with check (public.current_user_has_required_legal_consent());

drop policy if exists support_tickets_account_guard on public.support_tickets;
create policy support_tickets_account_guard on public.support_tickets
as restrictive for all to authenticated
using ((select private.is_account_access_enabled()))
with check ((select private.is_account_access_enabled()));

drop policy if exists support_ticket_messages_legal_consent on public.support_ticket_messages;
create policy support_ticket_messages_legal_consent on public.support_ticket_messages
as restrictive for all to authenticated
using (public.current_user_has_required_legal_consent())
with check (public.current_user_has_required_legal_consent());

drop policy if exists support_ticket_messages_account_guard on public.support_ticket_messages;
create policy support_ticket_messages_account_guard on public.support_ticket_messages
as restrictive for all to authenticated
using ((select private.is_account_access_enabled()))
with check ((select private.is_account_access_enabled()));