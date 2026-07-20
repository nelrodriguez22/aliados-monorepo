import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card } from "@/shared/components/ui/Card";
import { Button } from "@/shared/components/ui/Button";
import { Input } from "@/shared/components/ui/Input";
import { tw } from "@/shared/styles/design-system";
import { ROUTES } from "@/shared/constants/routes";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/apiClient";
import { useTrabajo } from "@/shared/hooks/useTrabajo";
import toast from "react-hot-toast";

export function PresupuestoTrabajo() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: trabajo } = useTrabajo<any>(id);

  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");

  // Solo se puede presupuestar mientras el trabajo está EN_CURSO. Si ya se envió
  // (PRESUPUESTADO o posterior), no debe poder volver a verse este formulario:
  // avisamos y redirigimos al dashboard reemplazando el historial.
  const yaPresupuestado = trabajo != null && trabajo.estado !== "EN_CURSO";
  useEffect(() => {
    if (yaPresupuestado) {
      toast("Ya enviaste este presupuesto");
      navigate(ROUTES.PROVIDER.DASHBOARD, { replace: true });
    }
  }, [yaPresupuestado, navigate]);

  const enviarMutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/api/trabajos/${id}/presupuestar`, {
        montoPresupuesto: Number(monto),
        notaResumen: nota.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trabajo", id] });
      queryClient.invalidateQueries({ queryKey: ["trabajo-activo"] });
      toast.success("Presupuesto enviado al cliente");
      navigate(ROUTES.PROVIDER.DASHBOARD, { replace: true });
    },
    onError: (err: any) => {
      // El backend rechaza re-presupuestar porque el estado ya no es EN_CURSO.
      if (typeof err?.message === "string" && err.message.includes("no está en curso")) {
        toast("Ya enviaste este presupuesto");
        navigate(ROUTES.PROVIDER.DASHBOARD, { replace: true });
        return;
      }
      toast.error("No se pudo enviar el presupuesto");
    },
  });

  const montoValido = monto !== "" && Number(monto) > 0;

  // Mientras redirige (ya presupuestado) no mostramos el formulario para no
  // dejar que se re-envíe ni que "parpadee" antes de navegar.
  if (yaPresupuestado) return null;

  return (
    <div className={tw.pageBg}>
      <div className={tw.container}>
        <div className="mx-auto max-w-lg space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => navigate(ROUTES.PROVIDER.ACTIVE_JOB(id!))}>← Volver</Button>
          </div>

          <h1 className={`text-xl font-bold ${tw.text.primary}`}>Presupuesto del trabajo</h1>

          <Card>
            <div className="space-y-1 text-sm">
              <p className={tw.text.secondary}>Oficio: <span className={tw.text.primary}>{trabajo?.oficio?.nombre}</span></p>
              <p className={tw.text.secondary}>Pedido: <span className={tw.text.primary}>{trabajo?.descripcion}</span></p>
              <p className={tw.text.secondary}>
                Tarifa de visita: <span className={tw.text.primary}>${trabajo?.tarifaVisita?.toLocaleString("es-AR") || "15.000"}</span>
              </p>
            </div>
          </Card>

          <Card>
            <label className={tw.label}>Monto del trabajo</label>
            {/* `monto` guarda solo los dígitos; se muestra con $ y separador de miles (es-AR). */}
            <Input
              type="text"
              inputMode="numeric"
              placeholder="$100.000"
              value={monto === "" ? "$" : `$${Number(monto).toLocaleString("es-AR")}`}
              onChange={(e) => setMonto(e.target.value.replace(/\D/g, ""))}
              required
            />
            <label className={`${tw.label} mt-4`}>Nota (opcional)</label>
            <textarea
              className={tw.textarea}
              rows={3}
              placeholder="Detalle de lo que harías"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </Card>

          <Button
            onClick={() => enviarMutation.mutate()}
            disabled={!montoValido || enviarMutation.isPending}
            fullWidth
          >
            {enviarMutation.isPending ? "Enviando..." : "Enviar presupuesto"}
          </Button>
        </div>
      </div>
    </div>
  );
}
