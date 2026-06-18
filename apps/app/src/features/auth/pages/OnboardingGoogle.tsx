import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { signOut } from "firebase/auth";
import { auth } from "@/shared/lib/firebase";
import {
  User, Briefcase, Phone, ChevronDown, MapPin, ArrowRight,
} from "lucide-react";
import icono from "@/assets/icono.png";
import { ROUTES } from "@/shared/constants/routes";
import { tw } from "@/shared/styles/design-system";
import { useOficios } from "@/shared/hooks/useOficios";
import toast from "react-hot-toast";

type UserRole = "CLIENT" | "PROVIDER";

export function OnboardingGoogle() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const firebaseUser = auth.currentUser;

  const [step, setStep] = useState<"role" | "form">("role");
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [selectedOficio, setSelectedOficio] = useState<number | null>(null);
  const [phone, setPhone] = useState("");
  const [matricula, setMatricula] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);

  const { data: oficios = [] } = useOficios({ enabled: selectedRole === "PROVIDER" });

  // Si no hay sesión Firebase (entró directo a la URL), volver al login.
  useEffect(() => {
    if (!firebaseUser) navigate(ROUTES.LOGIN, { replace: true });
  }, [firebaseUser, navigate]);

  if (!firebaseUser) return null;

  const handleSubmit = async () => {
    const fieldErrors: Record<string, string> = {};
    if (!phone.trim()) fieldErrors.phone = "El teléfono es requerido";
    if (selectedRole === "PROVIDER" && !selectedOficio) fieldErrors.oficio = "Seleccioná tu oficio";
    if (selectedRole === "PROVIDER" && !matricula.trim()) fieldErrors.matricula = "El número de matrícula es requerido";
    if (Object.keys(fieldErrors).length > 0) { setErrors(fieldErrors); return; }

    setIsPending(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          firebaseUid: firebaseUser.uid,
          email: firebaseUser.email,
          nombre: firebaseUser.displayName ?? firebaseUser.email,
          telefono: phone,
          role: selectedRole,
          oficioId: selectedOficio,
          matricula: selectedRole === "PROVIDER" ? matricula : null,
          localidad: "Rosario",
        }),
      });
      if (!res.ok) throw new Error(await res.text());

      // Re-fetch del perfil: ahora el backend devuelve 200 → useProfile setea el store.
      await queryClient.refetchQueries({ queryKey: ["auth-profile"] });
      toast.success("¡Listo! Tu cuenta está completa.");
      navigate(selectedRole === "PROVIDER" ? ROUTES.PROVIDER.DASHBOARD : ROUTES.CLIENT.DASHBOARD, { replace: true });
    } catch {
      toast.error("No se pudo completar el registro. Intentá de nuevo.");
    } finally {
      setIsPending(false);
    }
  };

  const handleCancel = async () => {
    await signOut(auth);
    navigate(ROUTES.LOGIN, { replace: true });
  };

  return (
    <section className="flex flex-1 w-full items-center justify-center bg-slate-50 dark:bg-dark-bg px-4 py-12">
      <div className="w-full max-w-sm">

        <div className="mb-8 flex flex-col items-center gap-3">
          <img src={icono} alt="Aliados" className="h-10 w-auto" />
          <div className="text-center">
            <h1 className={`text-2xl font-bold ${tw.text.primary}`}>Completá tu perfil</h1>
            <p className={`mt-1 text-sm ${tw.text.secondary}`}>
              {step === "role" ? "¿Cómo querés usar la plataforma?" : `Hola ${firebaseUser.displayName ?? ""}, faltan unos datos`}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface p-8 shadow-sm">

          {step === "role" && (
            <div className="space-y-3">
              {([
                { role: "CLIENT" as UserRole, icon: User, iconBg: tw.iconBg.brand, iconColor: "text-brand-600 dark:text-dark-brand", title: "Soy Cliente", desc: "Necesito contratar profesionales para el hogar" },
                { role: "PROVIDER" as UserRole, icon: Briefcase, iconBg: tw.iconBg.green, iconColor: "text-green-600 dark:text-green-400", title: "Soy Profesional", desc: "Quiero ofrecer mis servicios y conseguir clientes" },
              ]).map(({ role, icon: Icon, iconBg, iconColor, title, desc }) => (
                <button
                  key={role}
                  onClick={() => { setSelectedRole(role); setStep("form"); }}
                  className={`group w-full flex items-center gap-4 rounded-xl border-2 p-5 text-left transition cursor-pointer border-slate-200 dark:border-dark-border hover:border-brand-400 dark:hover:border-dark-brand hover:bg-slate-50 dark:hover:bg-dark-elevated`}
                >
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
                    <Icon className={`h-5 w-5 ${iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${tw.text.primary}`}>{title}</p>
                    <p className={`text-xs mt-0.5 ${tw.text.secondary}`}>{desc}</p>
                  </div>
                  <ArrowRight className={`h-4 w-4 shrink-0 transition ${tw.text.faint} group-hover:text-brand-500 group-hover:translate-x-0.5`} />
                </button>
              ))}

              <button onClick={handleCancel} className={`w-full text-center text-xs font-medium pt-2 cursor-pointer transition ${tw.text.brand} hover:opacity-70`}>
                Cancelar y volver al login
              </button>
            </div>
          )}

          {step === "form" && selectedRole && (
            <div className="space-y-3">
              <div className={`mb-2 flex items-center gap-3 rounded-xl p-3 ${tw.iconBg.slate}`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selectedRole === "CLIENT" ? tw.iconBg.brand : tw.iconBg.green}`}>
                  {selectedRole === "CLIENT"
                    ? <User className="h-4 w-4 text-brand-600 dark:text-dark-brand" />
                    : <Briefcase className="h-4 w-4 text-green-600 dark:text-green-400" />}
                </div>
                <p className={`flex-1 text-sm ${tw.text.secondary}`}>
                  Registrándote como{" "}
                  <span className={`font-semibold ${tw.text.primary}`}>{selectedRole === "CLIENT" ? "Cliente" : "Profesional"}</span>
                </p>
                <button onClick={() => { setStep("role"); setSelectedRole(null); setSelectedOficio(null); setErrors({}); }} className={`text-xs font-medium cursor-pointer transition ${tw.text.brand} hover:opacity-70`}>
                  Cambiar
                </button>
              </div>

              <div>
                <label className={tw.label}>Teléfono</label>
                <div className="relative">
                  <Phone className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none ${tw.text.faint}`} />
                  <input
                    type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                    placeholder="+54 9 341 123-4567"
                    className={`${tw.input} pl-10 ${errors.phone ? "border-red-300 focus:ring-red-400" : ""}`}
                  />
                </div>
                {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
              </div>

              {selectedRole === "PROVIDER" && (
                <>
                  <div>
                    <label className={tw.label}>Oficio</label>
                    <div className="relative">
                      <ChevronDown className={`absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none ${tw.text.faint}`} />
                      <select
                        value={selectedOficio ?? ""}
                        onChange={(e) => setSelectedOficio(Number(e.target.value))}
                        className={`${tw.select} ${errors.oficio ? "border-red-300" : ""}`}
                      >
                        <option value="" disabled>Seleccioná tu oficio</option>
                        {oficios.map((o) => (
                          <option key={o.id} value={o.id}>{o.nombre}</option>
                        ))}
                      </select>
                    </div>
                    {errors.oficio && <p className="mt-1 text-xs text-red-500">{errors.oficio}</p>}
                  </div>

                  <div>
                    <label className={tw.label}>Número de matrícula</label>
                    <div className="relative">
                      <Briefcase className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none ${tw.text.faint}`} />
                      <input
                        type="text" value={matricula} onChange={(e) => setMatricula(e.target.value)}
                        placeholder="Ej: 12345"
                        className={`${tw.input} pl-10 ${errors.matricula ? "border-red-300 focus:ring-red-400" : ""}`}
                      />
                    </div>
                    {errors.matricula && <p className="mt-1 text-xs text-red-500">{errors.matricula}</p>}
                  </div>
                </>
              )}

              <div>
                <label className={tw.label}>Zona de servicio</label>
                <div className="relative">
                  <MapPin className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none ${tw.text.faint}`} />
                  <input type="text" value="Rosario" readOnly className={`${tw.input} pl-10 cursor-not-allowed opacity-60 bg-slate-50 dark:bg-dark-elevated`} />
                </div>
                <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">Por el momento solo disponible en Rosario, Santa Fe.</p>
              </div>

              <button
                onClick={handleSubmit} disabled={isPending}
                className="mt-1 w-full cursor-pointer rounded-xl bg-brand-600 dark:bg-dark-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 dark:hover:bg-dark-brand-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Creando cuenta...
                  </span>
                ) : "Completar registro"}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
