ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS cobro_por_tareas boolean DEFAULT false;
ALTER TABLE public.tareas ADD COLUMN IF NOT EXISTS valor numeric DEFAULT 0;
ALTER TABLE public.tareas ADD COLUMN IF NOT EXISTS orden integer DEFAULT 0;
