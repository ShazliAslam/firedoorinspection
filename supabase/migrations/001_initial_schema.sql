-- DoorProof AI — Production Multi-Tenant PostgreSQL Schema & RLS Reference Migration
-- Execute in Supabase SQL Editor for fresh self-hosted deployments.

create extension if not exists "pgcrypto";

-- 1. Organizations
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  phone text,
  email text,
  address text,
  website text,
  logo_url text,
  primary_color text default '#1d4ed8',
  license_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Profiles (linked to auth.users)
create table if not exists public.profiles (
  id uuid primary key,
  email text not null,
  full_name text not null,
  phone text,
  job_title text,
  avatar_url text,
  active_organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 3. Clients
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  company_code text,
  contact_name text,
  contact_email text,
  contact_phone text,
  billing_address text,
  service_tier text default 'Annual Inspection',
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_clients_org on public.clients(organization_id);

-- 4. Organization Members (RBAC & Client Portal Isolation)
create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid,
  email text not null,
  full_name text,
  role text not null check (role in ('owner','admin','inspector','technician','client')),
  client_id uuid references public.clients(id) on delete set null,
  status text not null default 'active' check (status in ('active','invited','inactive')),
  notification_preferences jsonb default '{}'::jsonb,
  invited_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_org_members_org_user on public.organization_members(organization_id, user_id);

-- 5. Buildings
create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  building_code text,
  address text not null,
  city text,
  state text,
  zip text,
  building_type text,
  total_floors integer default 1,
  contact_name text,
  contact_phone text,
  contact_email text,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_buildings_org_client on public.buildings(organization_id, client_id);

-- 6. Floors or Areas
create table if not exists public.floors_or_areas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  name text not null,
  floor_number text,
  area_type text,
  notes text,
  created_at timestamptz not null default now()
);

-- 7. Fire Doors Registry
create table if not exists public.fire_doors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  floor_area_id uuid references public.floors_or_areas(id) on delete set null,
  door_code text not null,
  floor text,
  room_location text not null,
  door_reference text,
  manufacturer text,
  door_type text,
  fire_rating text,
  frame_material text,
  installation_date text,
  last_inspection_date timestamptz,
  next_inspection_due text,
  status text not null default 'Needs Inspection',
  qr_token text not null,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_fire_doors_org_bld on public.fire_doors(organization_id, building_id);

-- 8. Inspection Templates & Items
create table if not exists public.inspection_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.inspection_template_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.inspection_templates(id) on delete cascade,
  category text not null,
  label text not null,
  guidance_note text,
  sort_order integer default 0,
  required boolean not null default true
);

-- 9. Inspections & Items
create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  template_id uuid references public.inspection_templates(id) on delete set null,
  inspection_code text not null,
  title text not null,
  inspector_id uuid,
  inspector_name text,
  scheduled_date text,
  completed_at timestamptz,
  status text not null default 'Draft',
  door_ids jsonb not null default '[]'::jsonb,
  summary_notes text,
  reviewer_disclaimer_accepted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  fire_door_id uuid not null references public.fire_doors(id) on delete cascade,
  template_item_id uuid references public.inspection_template_items(id) on delete set null,
  category text not null,
  item_label text not null,
  result text not null default 'Pending',
  observation text,
  severity_suggested text,
  deficiency_created boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 10. Deficiencies
create table if not exists public.deficiencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  fire_door_id uuid not null references public.fire_doors(id) on delete cascade,
  inspection_id uuid references public.inspections(id) on delete set null,
  inspection_item_id uuid references public.inspection_items(id) on delete set null,
  deficiency_code text not null,
  category text not null,
  title text not null,
  description text not null,
  severity text not null default 'Medium',
  priority text not null default 'P2',
  status text not null default 'Open',
  assigned_technician_id uuid,
  assigned_technician_name text,
  due_date text,
  resolution_notes text,
  status_history jsonb not null default '[]'::jsonb,
  verified_by text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 11. Remediation Tasks
create table if not exists public.remediation_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  deficiency_id uuid not null references public.deficiencies(id) on delete cascade,
  fire_door_id uuid not null references public.fire_doors(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  assigned_technician_id uuid,
  assigned_technician_name text,
  due_date text,
  status text not null default 'Assigned',
  parts_needed text,
  repair_notes text,
  submitted_at timestamptz,
  verified_by_name text,
  verified_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 12. Evidence Files (Private Bucket Metadata + Immutable Flag)
create table if not exists public.evidence_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  building_id uuid references public.buildings(id) on delete set null,
  fire_door_id uuid references public.fire_doors(id) on delete set null,
  inspection_id uuid references public.inspections(id) on delete set null,
  deficiency_id uuid references public.deficiencies(id) on delete set null,
  remediation_task_id uuid references public.remediation_tasks(id) on delete set null,
  evidence_type text not null,
  immutable boolean not null default false,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  file_size integer,
  caption text,
  tags jsonb default '[]'::jsonb,
  uploaded_by_name text,
  approved_for_client boolean not null default true,
  created_at timestamptz not null default now()
);

-- 13. Reports
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  building_id uuid references public.buildings(id) on delete set null,
  fire_door_id uuid references public.fire_doors(id) on delete set null,
  inspection_id uuid references public.inspections(id) on delete set null,
  report_code text not null,
  report_type text not null,
  title text not null,
  storage_path text,
  share_token text not null,
  shared_with_client boolean not null default false,
  generated_by_name text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 14. Notifications, Audit Logs, Subscriptions
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_user_id uuid,
  recipient_email text,
  event_type text not null,
  dedupe_key text,
  title text not null,
  message text not null,
  link_path text,
  read boolean not null default false,
  email_status text not null default 'skipped_no_resend_key',
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid,
  actor_name text,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_tier text not null default 'Professional',
  status text not null default 'active',
  max_doors integer default 500,
  max_users integer default 15,
  max_storage_mb integer default 5000,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

-- Organization-Scoped Row Level Security
alter table public.organizations enable row level security;
alter table public.clients enable row level security;
alter table public.buildings enable row level security;
alter table public.fire_doors enable row level security;
alter table public.inspections enable row level security;
alter table public.deficiencies enable row level security;
alter table public.remediation_tasks enable row level security;
alter table public.evidence_files enable row level security;
alter table public.reports enable row level security;
