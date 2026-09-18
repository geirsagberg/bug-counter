drop table if exists public.local_imports;

alter table public.bug_registrations
drop column if exists imported_source_id;
