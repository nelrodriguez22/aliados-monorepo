import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { X } from 'lucide-react';
import logoConTexto from '@/assets/logocontexto.png';

interface Props {
  open: boolean;
  onClose: () => void;
  nombre: string;
  oficio: string | null | undefined;
  fotoPerfil: string | null | undefined;
  codigo: string | null | undefined;
}

// Credencial a pantalla completa para que el proveedor la muestre en la puerta.
// Alto contraste; el QR codifica el código para escaneo/comparación del cliente.
export function CredencialProveedor({ open, onClose, nombre, oficio, fotoPerfil, codigo }: Props) {
  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mi credencial"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white p-6 dark:bg-dark-bg"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar credencial"
        className="absolute right-4 top-4 rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-dark-surface"
      >
        <X className="h-6 w-6" />
      </button>

      {/* Marca arriba: es una credencial a pantalla completa, el logo la identifica. */}
      <div className="flex items-center gap-1.5">
        <img src={logoConTexto} alt="Aliados" className="h-9 w-auto" width={160} height={40} />
        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-600 dark:bg-dark-brand/15 dark:text-dark-brand">
          Pro
        </span>
      </div>

      {fotoPerfil ? (
        <img
          src={fotoPerfil}
          alt={nombre}
          className="h-24 w-24 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-100 text-2xl font-bold text-brand-600 dark:bg-dark-surface dark:text-dark-brand">
          {nombre.charAt(0).toUpperCase()}
        </div>
      )}

      <div className="text-center">
        <p className="text-xl font-bold text-slate-900 dark:text-white">{nombre}</p>
        {oficio && <p className="text-sm text-slate-500 dark:text-slate-400">{oficio}</p>}
      </div>

      {codigo ? (
        <>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              ID
            </p>
            <p className="font-mono text-4xl font-extrabold tracking-widest text-slate-900 dark:text-white">
              {codigo}
            </p>
          </div>
          <div className="rounded-lg bg-white p-3">
            <QRCodeSVG value={codigo} size={180} />
          </div>
          <p className="max-w-xs text-center text-sm text-slate-500 dark:text-slate-400">
            Mostrá este código al cliente para validar tu identidad al llegar.
          </p>
        </>
      ) : (
        <p className="text-slate-500 dark:text-slate-400">Código no disponible</p>
      )}
    </div>,
    document.body,
  );
}
