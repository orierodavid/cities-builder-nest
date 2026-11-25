-- The existing manager-read policy already covers these roles; avoid a duplicate permissive SELECT policy.
DROP POLICY IF EXISTS estate_managers_view_visitor_passes ON public.visitor_passes;
