-- ============================================================
-- Verificación POST-hotfix — correr DESPUÉS del hotfix
-- (script separado a propósito: aquí el rollback es inofensivo)
-- Resultado esperado: números, SIN error 42P17
-- ============================================================

begin;
set local role authenticated;
select count(*) as prueba_tareas from public.tareas;
reset role;
rollback;

begin;
set local role authenticated;
select count(*) as prueba_asignaciones from public.tarea_asignaciones;
reset role;
rollback;

-- Confirmar que los helpers existen (debe devolver 6 filas)
select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('_asignado_a','_puede_ver_proyecto_equipo',
                  '_proyecto_en_mi_equipo','_admin_del_proyecto_equipo',
                  '_proyecto_de_tarea','_es_creador_de_tarea')
order by proname;
