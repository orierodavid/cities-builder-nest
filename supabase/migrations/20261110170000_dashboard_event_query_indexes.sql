-- Cover the ordered dashboard previews/counts and the estate-scoped event page.
-- Partial predicates match the dashboard filters so closed/unpublished rows do
-- not inflate these hot indexes.
CREATE INDEX IF NOT EXISTS idx_announcements_estate_published_dashboard
  ON public.announcements (estate_id, published_at DESC)
  WHERE published_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_requests_estate_open_dashboard
  ON public.maintenance_requests (estate_id, created_at DESC)
  WHERE status NOT IN ('resolved', 'closed');

CREATE INDEX IF NOT EXISTS idx_estate_events_estate_creator_page
  ON public.estate_events (estate_id, created_by, starts_at, id);
