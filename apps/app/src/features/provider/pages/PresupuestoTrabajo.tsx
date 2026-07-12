import { useState } from "react";
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
      navigate(ROUTES.PROVIDER.DASHBOARD);
    },
    onError: () => toast.error("No se pudo enviar el presupuesto"),
  });

  const montoValido = monto !== "" && Number(monto) > 0;

  return (
    <div className={tw.pageBg}>
      <div className={tw.container}>
        <div className="mx-auto max-w-lg space-y-4">
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
            <Input
              type="number"
              placeholder="Ej: 100000"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
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
