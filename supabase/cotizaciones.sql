-- ============================================================
-- Cotizaciones de Flowo
-- Ejecutar UNA SOLA VEZ en Supabase:
--   Dashboard > SQL Editor > New query > pegar > Run
-- ============================================================

-- Tabla de cotizaciones
create table if not exists public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  numero text not null,
  cliente_nombre text not null,
  cliente_telefono text,
  cliente_correo text,
  items jsonb not null default '[]'::jsonb,
  notas text default '',
  estado text not null default 'pendiente',
  fecha_emision text not null,
  fecha_validez text,
  moneda text not null default 'USD',
  politicas jsonb not null default '{"formaPago":"","fechasEntrega":"","validez":"","otras":""}'::jsonb,
  politicas_custom text,
  created_at timestamptz not null default now()
);

alter table public.cotizaciones enable row level security;

-- Política de acceso (cada usuario solo ve las suyas)
drop policy if exists "cotizaciones_propietario" on public.cotizaciones;
create policy "cotizaciones_propietario"
  on public.cotizaciones
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Permisos para la app (IMPORTANTE: sin esto da "permission denied")
grant all on table public.cotizaciones to authenticated;
grant all on table public.cotizaciones to service_role;

-- Si ya ejecutaste una versión anterior, estas líneas agregan
-- las columnas nuevas y limpian la columna de términos que ya no se usa.
alter table public.cotizaciones
  add column if not exists politicas jsonb not null default '{"formaPago":"","fechasEntrega":"","validez":"","otras":""}'::jsonb,
  add column if not exists politicas_custom text;

alter table public.perfiles drop column if exists terminos;
