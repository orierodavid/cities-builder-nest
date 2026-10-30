# Cities Builder Nest Web Portal

Separate Next.js application for Platform Administrators and Facility Managers. Residents, Security Personnel, and Event Coordinators continue using the Expo mobile application.

## Setup

1. Copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` using the existing Cities Builder Nest Supabase project.
3. Run `npm install`, `npm run typecheck`, and `npm run dev` from `apps/web`.

The initial portal authenticates with Supabase Auth and checks `user_roles` and active `estate_memberships` before showing a management workspace. It does not grant permissions based on client-side role checks; database RLS and API authorization remain authoritative. Do not add a service-role key to this application.
