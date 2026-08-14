-- ============================================================
-- Contratos de Flowo
-- Ejecutar UNA SOLA VEZ en Supabase:
--   Dashboard > SQL Editor > New query > pegar > Run
-- ============================================================

-- Tabla de contratos
create table if not exists public.contratos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  numero text not null,
  cliente_nombre text not null,
  cliente_telefono text,
  cliente_correo text,
  descripcion text default '',
  monto numeric,
  moneda text not null default 'USD',
  fecha_inicio text,
  fecha_fin text,
  clausulas jsonb not null default '{"formaPago":"","entrega":"","confidencialidad":"","cancelacion":"","otras":""}'::jsonb,
  firma_usuario text,
  firma_cliente text,
  nombre_firmante_cliente text,
  fecha_firma_usuario text,
  fecha_firma_cliente text,
  estado text not null default 'borrador',
  fecha_emision text not null,
  created_at timestamptz not null default now()
);

alter table public.contratos enable row level security;

-- Política de acceso (cada usuario solo ve los suyos)
drop policy if exists "contratos_propietario" on public.contratos;
create policy "contratos_propietario"
  on public.contratos
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Permisos para la app (sin esto da "permission denied")
grant all on table public.contratos to authenticated;
grant all on table public.contratos to service_role;

-- Columnas para firma en línea y vínculo con el cliente
-- (idempotente: si ya las tienes, no las duplica)
alter table public.contratos add column if not exists firma_token text;
alter table public.contratos add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
