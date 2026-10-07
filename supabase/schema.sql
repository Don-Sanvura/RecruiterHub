create table if not exists public.company_records (
  id text primary key,
  company text not null check (length(trim(company)) between 1 and 120),
  site text not null default '',
  offer text not null default '',
  job text not null default '',
  notes text not null default '',
  status text not null default 'Researching',
  source text not null default 'info-hub' check (source in ('info-hub', 'recruiter-re-audit')),
  recruiter_name text not null default '',
  referral_name text not null default '',
  referral_email text not null default '',
  referral_context text not null default '',
  submitted_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_records
  add column if not exists attachment_path text not null default '';

create index if not exists company_records_company_idx on public.company_records (company);
create index if not exists company_records_source_submitted_idx on public.company_records (source, submitted_at desc);
create index if not exists company_records_updated_idx on public.company_records (updated_at desc);

create or replace function public.app_has_role(required_role text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = required_role, false);
$$;

alter table public.company_records enable row level security;
alter table public.company_records force row level security;

drop policy if exists "info users read company records" on public.company_records;
create policy "info users read company records"
  on public.company_records for select to authenticated
  using (public.app_has_role('info'));

drop policy if exists "authorized users submit records" on public.company_records;
create policy "authorized users submit records"
  on public.company_records for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      public.app_has_role('info')
      or (public.app_has_role('recruiter') and source = 'recruiter-re-audit')
      or (
        source = 'recruiter-re-audit'
        and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
      )
    )
  );

drop policy if exists "info users update company records" on public.company_records;
create policy "info users update company records"
  on public.company_records for update to authenticated
  using (public.app_has_role('info'))
  with check (public.app_has_role('info'));

drop policy if exists "info users delete company records" on public.company_records;
create policy "info users delete company records"
  on public.company_records for delete to authenticated
  using (public.app_has_role('info'));

grant select, insert, update, delete on public.company_records to authenticated;
grant execute on function public.app_has_role(text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.company_records;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

drop policy if exists "Recruiters upload own audit attachments" on storage.objects;
create policy "Recruiters upload own audit attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (
      public.app_has_role('recruiter')
      or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    )
  );

drop policy if exists "Info users read audit attachments" on storage.objects;
create policy "Info users read audit attachments"
  on storage.objects for select to authenticated
  using (bucket_id = 'user-files' and public.app_has_role('info'));

drop policy if exists "Recruiters read own audit attachments" on storage.objects;
create policy "Recruiters read own audit attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (
      public.app_has_role('recruiter')
      or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    )
  );

drop policy if exists "Recruiters delete own audit attachments" on storage.objects;
create policy "Recruiters delete own audit attachments"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (
      public.app_has_role('recruiter')
      or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    )
  );