-- Production reliability: cover every currently uncovered public-schema foreign key.
-- Keep these indexes explicit so deletes/updates on referenced rows do not require
-- full scans of referencing tables and estate-scoped joins remain efficient.
create index if not exists admin_alerts_acknowledged_by_idx on public.admin_alerts (acknowledged_by);
create index if not exists admin_alerts_actor_user_id_idx on public.admin_alerts (actor_user_id);
create index if not exists admin_alerts_audit_log_id_idx on public.admin_alerts (audit_log_id);
create index if not exists electricity_recharge_orders_estate_id_idx on public.electricity_recharge_orders (estate_id);
create index if not exists electricity_recharge_orders_meter_id_idx on public.electricity_recharge_orders (meter_id);
create index if not exists estate_event_checkins_checked_in_by_idx on public.estate_event_checkins (checked_in_by);
create index if not exists estate_event_checkins_event_estate_idx on public.estate_event_checkins (event_id, estate_id);
create index if not exists estate_event_checkins_guest_estate_event_idx on public.estate_event_checkins (guest_id, estate_id, event_id);
create index if not exists estate_event_checkins_invitation_estate_event_idx on public.estate_event_checkins (invitation_id, estate_id, event_id);
create index if not exists estate_event_guests_created_by_idx on public.estate_event_guests (created_by);
create index if not exists estate_event_guests_estate_id_idx on public.estate_event_guests (estate_id);
create index if not exists estate_event_guests_event_estate_idx on public.estate_event_guests (event_id, estate_id);
create index if not exists estate_event_invitations_created_by_idx on public.estate_event_invitations (created_by);
create index if not exists estate_event_invitations_event_estate_idx on public.estate_event_invitations (event_id, estate_id);
create index if not exists estate_event_invitations_guest_estate_event_idx on public.estate_event_invitations (guest_id, estate_id, event_id);
create index if not exists estate_events_created_by_idx on public.estate_events (created_by);
create index if not exists estate_service_charges_created_by_idx on public.estate_service_charges (created_by);
create index if not exists legal_documents_created_by_idx on public.legal_documents (created_by);
create index if not exists rent_savings_contributions_estate_id_idx on public.rent_savings_contributions (estate_id);
create index if not exists resident_electricity_meters_estate_id_idx on public.resident_electricity_meters (estate_id);
create index if not exists resident_notification_recipients_estate_id_idx on public.resident_notification_recipients (estate_id);
create index if not exists resident_notifications_sent_by_idx on public.resident_notifications (sent_by);
create index if not exists security_emergency_alerts_created_by_idx on public.security_emergency_alerts (created_by);
create index if not exists security_emergency_alerts_resolved_by_idx on public.security_emergency_alerts (resolved_by);
create index if not exists security_incident_reports_reported_by_idx on public.security_incident_reports (reported_by);
create index if not exists security_incident_reports_reviewed_by_idx on public.security_incident_reports (reviewed_by);
create index if not exists security_shift_handovers_acknowledged_by_idx on public.security_shift_handovers (acknowledged_by);
create index if not exists security_shift_handovers_outgoing_officer_idx on public.security_shift_handovers (outgoing_officer);
create index if not exists service_charge_payments_charge_id_idx on public.service_charge_payments (charge_id);
create index if not exists service_charge_payments_estate_id_idx on public.service_charge_payments (estate_id);
create index if not exists visitor_pass_denials_denied_by_idx on public.visitor_pass_denials (denied_by);
create index if not exists visitor_pass_denials_estate_id_idx on public.visitor_pass_denials (estate_id);
create index if not exists visitor_pass_denials_visitor_pass_id_idx on public.visitor_pass_denials (visitor_pass_id);
create index if not exists visitor_visits_checked_in_by_idx on public.visitor_visits (checked_in_by);
create index if not exists visitor_visits_checked_out_by_idx on public.visitor_visits (checked_out_by);
