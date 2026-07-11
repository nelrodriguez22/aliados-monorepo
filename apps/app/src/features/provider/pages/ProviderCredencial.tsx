import { useNavigate } from "react-router-dom";
import { useStore } from "@/shared/store/useStore";
import { ROUTES } from "@/shared/constants/routes";
import { CredencialProveedor } from "@/features/provider/components/CredencialProveedor";

// Página de la credencial del proveedor (accesible desde el menú de usuario).
// Reutiliza el componente CredencialProveedor a pantalla completa; cerrar vuelve
// al dashboard.
export function ProviderCredencial() {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);

  return (
    <CredencialProveedor
      open
      onClose={() => navigate(ROUTES.PROVIDER.DASHBOARD)}
      nombre={user?.name ?? ''}
      oficio={user?.oficio?.nombre}
      fotoPerfil={user?.fotoPerfil}
      codigo={user?.codigo}
    />
  );
}
