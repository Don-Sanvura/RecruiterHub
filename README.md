# Neural Recruiter Hub

A responsive recruiter experience and company Info Hub. Recruiters submit RE-audits without entering credentials; Info Hub users sign in to review and manage records. Supabase anonymous Auth sessions and Postgres provide durable storage and enforce access with row-level security.

## Local development

Requirements: Node.js 20 or newer and npm.

```powershell
npm ci
npm run dev
```

Without Supabase environment values, Vite development mode runs a clearly marked local preview backed by browser storage. This preview is not persistent across devices. In production, the recruiter route silently creates an anonymous Supabase session for user-scoped private uploads. Info Hub remains role-protected.

## Configure Supabase

1. Create a Supabase project.
2. In the SQL editor, run [`supabase/schema.sql`](supabase/schema.sql).
3. Enable anonymous sign-ins in Supabase Auth. Create Info Hub accounts in Supabase Auth and set their trusted `app_metadata.role` to `info` using the dashboard or a trusted server/admin client. Example SQL for assigning that role:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"info"}'::jsonb
   where email = 'info-admin@example.com';
   ```

   Never place a Supabase service-role key in a `VITE_` variable or browser code.
4. Copy `.env.example` to `.env.local`, then set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the project URL and publishable key. These browser values are public; the table's RLS policies are the security boundary.
5. In Supabase Auth URL settings, set the deployed app URL and allow that URL for Info Hub email sign-in redirects.

The `info` role can read, add, edit, and delete company records. Anonymous recruiter sessions can insert only `recruiter-re-audit` records; they have no select, update, or delete policy. Audit records include recruiter identity, employee referral details, pitch, attachment path, and submission time. Info Hub listens for database changes and refreshes live.

## Private attachments

Optional PDF, DOC, DOCX, or TXT files (up to 10 MB) upload to the private `user-files` bucket under `<auth-user-id>/<random-id>-<filename>`. The schema permits anonymous recruiter sessions to upload only into their own Auth-ID folder and allows only Info-role users to read files. Info Hub creates 60-second signed URLs; it never uses public URLs. Keep the bucket private and enable anonymous sign-ins in Supabase Auth. Add CAPTCHA or rate limiting before broadly publishing the anonymous submission form.

## Production deployment

Build the static site:

```powershell
npm ci
npm run build
```

Deploy the generated `dist/` directory to a static host such as Vercel, Netlify, or Cloudflare Pages. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as build-time environment variables in the host, then rebuild. The application uses hash routes (`#/recruiter`, `#/hub`), so host-side rewrite rules are not required. A production build without Supabase values shows a setup screen instead of exposing local demo routes.

The spoken submission thank-you uses the browser Speech Synthesis API when available and leaves an on-screen confirmation as fallback. Voice selection and playback depend on the user's browser/device settings.