import { useEffect } from "react";
import { supabase } from "../lib/supabase";
import { esFirmaReciente } from "../lib/firmaReciente";
import type { ContratoClienteInfo } from "../lib/clientesContrato";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

const contratosNotificados = new Set<string>();

export function useNotificaciones(
  userId: string | null,
  onContratoFirmado?: (c: ContratoClienteInfo) => void
) {
  useEffect(() => {
    if (!userId) return;

    async function verificarPermiso() {
      let permiso = await isPermissionGranted();
      if (!permiso) {
        const resultado = await requestPermission();
        permiso = resultado === "granted";
      }
      return permiso;
    }

    verificarPermiso();

    const canalMensajes = supabase
      .channel("portal_mensajes_cliente")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "portal_mensajes",
          filter: "autor=eq.cliente",
        },
        async (payload) => {
          const permiso = await isPermissionGranted();
          if (!permiso) return;

          const msg = payload.new as {
            proyecto_id: string;
            contenido: string;
            tipo: string;
          };

          const { data } = await supabase
            .from("proyectos")
            .select("nombre, cliente_id, clientes(nombre)")
            .eq("id", msg.proyecto_id)
            .single();

          const proyecto = data?.nombre ?? "un proyecto";
          const cliente = (data?.clientes as { nombre: string } | null)?.nombre ?? "El cliente";

          let title = "";
          let body = "";

          if (msg.tipo === "aprobacion") {
            title = "Tarea aprobada";
            body = cliente + " aprobó una tarea en " + proyecto;
          } else if (msg.tipo === "feedback") {
            title = "Nuevo feedback";
            body = cliente + " dejó feedback en " + proyecto;
          } else {
            title = "Nuevo mensaje";
            body = cliente + " envió un mensaje en " + proyecto;
          }

          sendNotification({ title, body });
        }
      )
      .subscribe();

    const canalTareas = supabase
      .channel("tareas_aprobadas_cliente")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tareas",
          filter: "aprobada_cliente=eq.true",
        },
        async (payload) => {
          const permiso = await isPermissionGranted();
          if (!permiso) return;

          const tarea = payload.new as {
            nombre: string;
            proyecto_id: string;
          };

          const { data } = await supabase
            .from("proyectos")
            .select("nombre, cliente_id, clientes(nombre)")
            .eq("id", tarea.proyecto_id)
            .single();

          const proyecto = data?.nombre ?? "un proyecto";
          const cliente = (data?.clientes as { nombre: string } | null)?.nombre ?? "El cliente";

          sendNotification({
            title: "Tarea aprobada",
            body: cliente + " aprobó \"" + tarea.nombre + "\" en " + proyecto,
          });
        }
      )
      .subscribe();

    const canalContratos = supabase
      .channel("contratos_firmados_cliente")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "contratos",
          filter: "estado=eq.firmado",
        },
        async (payload) => {
          const nuevo = payload.new as Record<string, any>;
          if (!nuevo || typeof nuevo.firma_cliente !== "string" || !nuevo.firma_cliente) return;
          if (esFirmaReciente(nuevo.id)) return;
          if (contratosNotificados.has(nuevo.id)) return;
          contratosNotificados.add(nuevo.id);

          const permiso = await isPermissionGranted();
          if (permiso) {
            sendNotification({
              title: "Contrato firmado",
              body: (nuevo.cliente_nombre || "El cliente") + " firmó el contrato " + (nuevo.numero || ""),
            });
          }

          onContratoFirmado?.({
            id: nuevo.id,
            numero: nuevo.numero || "",
            cliente_nombre: nuevo.cliente_nombre || "",
            cliente_telefono: nuevo.cliente_telefono || null,
            cliente_correo: nuevo.cliente_correo || null,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalMensajes);
      supabase.removeChannel(canalTareas);
      supabase.removeChannel(canalContratos);
    };
  }, [userId, onContratoFirmado]);
}