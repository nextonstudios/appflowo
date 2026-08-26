-- ============================================================
-- Flowo Teams — Tablas base de equipos
-- Ejecutar UNA SOLA VEZ en Supabase:
--   Dashboard > SQL Editor > New query > pegar > Run
--
-- Este archivo es idempotente: puedes correrlo sin romper nada.
-- Orden de ejecución: 1 de 5
-- ============================================================

-- ── 1. equipos ─────────────────────────────────────────────
create table if not exists public.equipos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text unique,
  owner_id uuid references auth.users(id) on delete set null,
  logo_url text,
  plan text not null default 'free',
  -- 'free' = sin pagar (hasta max_miembros, features basicas)
  -- 'team' = $12/mes base (5 miembros gratis)
  -- 'business' = $25/mes base (15 miembros gratis)
  plan_region text not null default 'global',
  -- 'latam' | 'eu-na' | 'global'
  max_miembros integer not null default 5,
  moneda text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.equipos is 'Equipos/areas de trabajo de Flowo Teams';

-- ── 2. equipo_miembros ─────────────────────────────────────
create table if not exists public.equipo_miembros (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rol text not null default 'miembro',
  -- 'admin' | 'miembro' | 'viewer'
  custom_role_id uuid,
  joined_at timestamptz not null default now(),
  unique(equipo_id, user_id)
);

comment on column public.equipo_miembros.rol is 'admin: control total. miembro: trabaja en el equipo. viewer: solo lectura';
comment on column public.equipo_miembros.custom_role_id is 'Referencia a equipo_roles si el rol es personalizado (plan Business)';

-- ── 3. equipo_roles (roles personalizados, plan Business) ──
create table if not exists public.equipo_roles (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  nombre text not null,
  permisos jsonb not null default '{}'::jsonb,
  color text default '#6B7280',
  created_at timestamptz not null default now()
);

comment on table public.equipo_roles is 'Roles personalizados por equipo (solo plan Business)';
comment on column public.equipo_roles.permisos is '{"crear_proyectos":true,"editar_proyectos":true,"eliminar_proyectos":false,"asignar_tareas":true,"ver_tareas_equipo":true,"crear_cotizaciones":true,"crear_contratos":true,"ver_facturas":true,"gestionar_clientes":true,"registrar_horas":true,"ver_dashboard":true,"gestionar_miembros":false,"configurar_equipo":false}';

-- ── 4. equipo_invitaciones ─────────────────────────────────
create table if not exists public.equipo_invitaciones (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id) on delete cascade,
  email text not null,
  rol text not null default 'miembro',
  -- 'admin' | 'miembro' | 'viewer'
  custom_role_id uuid,
  token text unique not null default encode(gen_random_bytes(32), 'hex'),
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.equipo_invitaciones is 'Invitaciones pendientes a equipos. El token es el secreto del enlace/email';

-- Un token solo puede usarse una vez: al aceptarse se guarda accepted_at.
-- La validacion de expiracion y uso se hace en la funcion de aceptar.

-- ── 5. tarea_asignaciones ──────────────────────────────────
create table if not exists public.tarea_asignaciones (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references public.tareas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique(tarea_id, user_id)
);

comment on table public.tarea_asignaciones is 'Asignacion multiple de tareas: varios miembros pueden trabajar la misma tarea';

-- ── 6. equipo_config ───────────────────────────────────────
create table if not exists public.equipo_config (
  equipo_id uuid primary key references public.equipos(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on column public.equipo_config.settings is '{"proyectos_privados_por_defecto":false,"feedback_visible_por_defecto":true,"timer_automatico":true,"zona_horaria":"America/Mexico_City","fraude":{"activa":true,"alerta_cada_minutos":25,"timeout_alerta_minutos":5}}';

-- ── Trigger updated_at para equipos ────────────────────────
create or replace function public._actualizar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists equipos_updated_at on public.equipos;
create trigger equipos_updated_at
  before update on public.equipos
  for each row execute function public._actualizar_updated_at();

-- ── Indices ────────────────────────────────────────────────
create index if not exists idx_equipo_miembros_equipo on public.equipo_miembros(equipo_id);
create index if not exists idx_equipo_miembros_user on public.equipo_miembros(user_id);
create index if not exists idx_equipo_roles_equipo on public.equipo_roles(equipo_id);
create index if not exists idx_equipo_invitaciones_token on public.equipo_invitaciones(token);
create index if not exists idx_equipo_invitaciones_email on public.equipo_invitaciones(email);
create index if not exists idx_tarea_asignaciones_tarea on public.tarea_asignaciones(tarea_id);
create index if not exists idx_tarea_asignaciones_user on public.tarea_asignaciones(user_id);

-- ── Permisos ───────────────────────────────────────────────
grant all on table public.equipos to authenticated;
grant all on table public.equipos to service_role;
grant all on table public.equipo_miembros to authenticated;
grant all on table public.equipo_miembros to service_role;
grant all on table public.equipo_roles to authenticated;
grant all on table public.equipo_roles to service_role;
grant all on table public.equipo_invitaciones to authenticated;
grant all on table public.equipo_invitaciones to service_role;
grant all on table public.tarea_asignaciones to authenticated;
grant all on table public.tarea_asignaciones to service_role;
grant all on table public.equipo_config to authenticated;
grant all on table public.equipo_config to service_role;
