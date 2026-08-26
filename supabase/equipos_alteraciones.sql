-- ============================================================
-- Flowo Teams — Alteraciones a tablas existentes
-- Ejecutar UNA SOLA VEZ en Supabase:
--   Dashboard > SQL Editor > New query > pegar > Run
--
-- Este archivo es idempotente: puedes correrlo sin romper nada.
-- Requiere: equipos.sql ejecutado antes.
-- Orden de ejecución: 3 de 5
--
-- IMPORTANTE: user_id se conserva como el dueño/creador original.
-- En contexto individual sigue funcionando igual que siempre.
-- En contexto de equipo, equipo_id indica el equipo al que pertenece.
-- ============================================================

-- ── proyectos ──────────────────────────────────────────────
alter table public.proyectos
  add column if not exists equipo_id uuid references public.equipos(id) on delete cascade,
  add column if not exists es_privado boolean not null default false,
  add column if not exists feedback_visible boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

comment on column public.proyectos.es_privado is 'true: solo el creador y admins del equipo lo ven. false (default): todo el equipo lo ve';
comment on column public.proyectos.feedback_visible is 'Controla si el feedback/comentarios son visibles para todos los miembros asignados';
comment on column public.proyectos.created_by is 'Miembro que creo el proyecto dentro del equipo. En modo personal es igual a user_id';

create index if not exists idx_proyectos_equipo on public.proyectos(equipo_id);

-- ── clientes ───────────────────────────────────────────────
alter table public.clientes
  add column if not exists equipo_id uuid references public.equipos(id) on delete cascade;

create index if not exists idx_clientes_equipo on public.clientes(equipo_id);

-- ── cotizaciones ───────────────────────────────────────────
alter table public.cotizaciones
  add column if not exists equipo_id uuid references public.equipos(id) on delete cascade;

create index if not exists idx_cotizaciones_equipo on public.cotizaciones(equipo_id);

-- ── contratos ──────────────────────────────────────────────
alter table public.contratos
  add column if not exists equipo_id uuid references public.equipos(id) on delete cascade;

create index if not exists idx_contratos_equipo on public.contratos(equipo_id);

-- ── facturas ───────────────────────────────────────────────
alter table public.facturas
  add column if not exists equipo_id uuid references public.equipos(id) on delete cascade;

create index if not exists idx_facturas_equipo on public.facturas(equipo_id);

-- ── tareas ─────────────────────────────────────────────────
alter table public.tareas
  add column if not exists feedback_visible boolean not null default true;

-- Nota: la columna user_id de tareas sigue existiendo (quien la creo).
-- Las asignaciones multiples viven en tarea_asignaciones.

-- ── registros_tiempo ───────────────────────────────────────
alter table public.registros_tiempo
  add column if not exists equipo_id uuid references public.equipos(id) on delete cascade,
  add column if not exists horas_reales numeric,
  -- Horas descontando inactividad detectada
  add column if not exists activity_score integer,
  -- Score promedio de actividad durante el registro (0-100)
  add column if not exists alertas_enviadas integer default 0,
  add column if not exists alertas_respondidas integer default 0,
  add column if not exists pausado_por_fraude boolean default false;

create index if not exists idx_registros_tiempo_equipo on public.registros_tiempo(equipo_id);
create index if not exists idx_registros_tiempo_user_fecha on public.registros_tiempo(user_id, fecha);
