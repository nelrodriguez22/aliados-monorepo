import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Bot, Bug, CheckCircle, ChevronDown, CircleHelp, Send, X } from "lucide-react";
import { apiClient } from "@/shared/lib/apiClient";

// ── Chat ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
}

function ChatWindow({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { id: "0", role: "assistant", text: "¡Hola! ¿En qué puedo ayudarte hoy?" },
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), role: "user", text },
    ]);
    setInput("");
  };

  return (
    <div className="chat-window-enter fixed bottom-20 right-[76px] z-50 flex h-[420px] w-80 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-dark-border dark:bg-dark-surface">
      <div className="flex items-center justify-between border-b border-slate-100 bg-brand-600 px-4 py-3 dark:border-dark-border dark:bg-dark-brand">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-white" />
          <span className="text-sm font-semibold text-white">Asistente</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar chat"
          className="cursor-pointer rounded-full p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <span
              className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "rounded-br-sm bg-brand-600 text-white dark:bg-dark-brand"
                  : "rounded-bl-sm bg-slate-100 text-slate-800 dark:bg-dark-elevated dark:text-dark-text"
              }`}
            >
              {msg.text}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-100 p-3 dark:border-dark-border">
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe un mensaje..."
            className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:bg-white dark:border-dark-border dark:bg-dark-elevated dark:text-dark-text dark:placeholder:text-dark-text-secondary dark:focus:border-dark-brand dark:focus:bg-dark-elevated"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Enviar"
            className="flex h-9 w-9 cursor-pointer flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-all hover:bg-brand-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-dark-brand dark:hover:bg-dark-brand-hover"
          >
            <Send size={15} />
          </button>
        </form>
      </div>
    </div>
  );
}

// ── FAQ ─────────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: "¿Cómo solicito un servicio?",
    a: "Desde tu panel, hacé clic en una de las tarjetas de 'Servicios populares' (Electricista, Plomero, Cerrajero, Gasista, Mudanzas) o usá el buscador y hacé clic en 'Buscar'. Luego completá la dirección (podés usar el GPS), describí el problema y adjuntá fotos opcionales. Confirmá con el botón 'Solicitar servicio'.",
  },
  {
    q: "¿Cómo hago seguimiento de mi servicio?",
    a: "Tus solicitudes activas aparecen en 'Trabajos activos' del panel principal. Hacé clic en cualquiera para ver el estado en tiempo real. Las mudanzas activas se muestran en la sección 'Mudanzas activas'. Recibirás notificaciones push cuando haya novedades.",
  },
  {
    q: "¿Cuáles son los métodos de pago aceptados?",
    a: "Aceptamos tarjetas de crédito y débito (Visa, Mastercard y Amex) y cuentas bancarias. Podés agregar o eliminar métodos desde tu perfil en 'Métodos de pago'.",
  },
  {
    q: "¿Puedo cancelar una solicitud?",
    a: "Sí, podés cancelar mientras el estado sea 'Buscando proveedor'. Entrá al seguimiento del trabajo y usá la opción de cancelar; te pedirá ingresar el motivo. Una vez que el proveedor está en camino o trabajando ya no es posible cancelar.",
  },
  {
    q: "¿Cómo sé que el proveedor es confiable?",
    a: "Todos los proveedores pasan por un proceso de verificación antes de operar. Al recibir una propuesta podés ver el perfil del proveedor con su calificación promedio y reseñas de trabajos anteriores antes de aceptar.",
  },
  {
    q: "¿Cómo califico al proveedor?",
    a: "Al completarse el servicio accedés automáticamente a la pantalla de calificación con estrellas (1 a 5) y comentario opcional. También podés calificar más tarde desde 'Historial de trabajos' en tu panel, haciendo clic en los trabajos con badge 'Sin calificar'.",
  },
  {
    q: "¿Cómo activo o desactivo mi disponibilidad? (proveedores)",
    a: "En el encabezado de la app encontrarás el toggle que alterna entre 'Disponible' y 'Desconectado'. Al activarlo empezás a recibir solicitudes de trabajo. No podés desconectarte mientras tenés un trabajo en curso; el sistema te mostrará el estado 'Ocupado' automáticamente.",
  },
  {
    q: "¿Cómo contacto a soporte?",
    a: "Podés reportar un problema con el botón de bug de esta barra, o consultarnos por el asistente de chat. Para casos urgentes escribinos a soporte@aliados.com.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-slate-100 last:border-0 dark:border-dark-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-dark-elevated"
      >
        <span className="text-sm font-medium text-slate-800 dark:text-dark-text">{q}</span>
        <ChevronDown
          size={16}
          className={`mt-0.5 flex-shrink-0 text-slate-400 transition-transform duration-200 dark:text-dark-text-secondary ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <p className="px-4 pb-3 text-sm leading-relaxed text-slate-500 dark:text-dark-text-secondary">
          {a}
        </p>
      )}
    </div>
  );
}

function FaqWindow({ onClose }: { onClose: () => void }) {
  return (
    <div className="chat-window-enter fixed bottom-20 right-[76px] z-50 flex h-[480px] w-96 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-dark-border dark:bg-dark-surface">
      <div className="flex items-center justify-between border-b border-slate-100 bg-brand-600 px-4 py-3 dark:border-dark-border dark:bg-dark-brand">
        <div className="flex items-center gap-2">
          <CircleHelp size={18} className="text-white" />
          <span className="text-sm font-semibold text-white">Preguntas frecuentes</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="cursor-pointer rounded-full p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {FAQS.map((faq) => (
          <FaqItem key={faq.q} q={faq.q} a={faq.a} />
        ))}
      </div>
    </div>
  );
}

// ── Bug report ───────────────────────────────────────────────────────────────

const CATEGORIAS = [
  { value: "ui",           label: "UI / Visual" },
  { value: "funcionalidad", label: "Funcionalidad" },
  { value: "error_tecnico", label: "Error técnico" },
  { value: "otro",         label: "Otro" },
];

interface BugForm {
  categoria: string;
  titulo: string;
  descripcion: string;
}

function BugReportWindow({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<BugForm>({ categoria: "", titulo: "", descripcion: "" });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (field: keyof BugForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const valid = form.categoria && form.titulo.trim() && form.descripcion.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    try {
      await apiClient.post("/bug-reports", { ...form, url: window.location.href });
      setSent(true);
      toast.success("Reporte enviado. ¡Gracias!");
    } catch {
      toast.error("No se pudo enviar el reporte. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-dark-border dark:bg-dark-elevated dark:text-dark-text dark:placeholder:text-dark-text-secondary dark:focus:border-dark-brand dark:focus:ring-dark-brand/20";

  return (
    <div className="chat-window-enter fixed bottom-20 right-[76px] z-50 flex w-96 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-dark-border dark:bg-dark-surface">
      {/* header */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-brand-600 px-4 py-3 dark:border-dark-border dark:bg-dark-brand">
        <div className="flex items-center gap-2">
          <Bug size={18} className="text-white" />
          <span className="text-sm font-semibold text-white">Reportar un bug</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="cursor-pointer rounded-full p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>

      {/* body */}
      {sent ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <CheckCircle size={40} className="text-green-500" />
          <p className="text-sm font-semibold text-slate-800 dark:text-dark-text">
            ¡Reporte enviado!
          </p>
          <p className="text-xs leading-relaxed text-slate-500 dark:text-dark-text-secondary">
            Gracias por ayudarnos a mejorar. Revisaremos el problema a la brevedad.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 cursor-pointer rounded-full bg-brand-600 px-5 py-2 text-xs font-semibold text-white transition-all hover:bg-brand-500 active:scale-95 dark:bg-dark-brand dark:hover:bg-dark-brand-hover"
          >
            Cerrar
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
          {/* categoría */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-dark-text-secondary">
              Categoría <span className="text-red-400">*</span>
            </label>
            <select value={form.categoria} onChange={set("categoria")} className={inputCls}>
              <option value="" disabled>Seleccioná una categoría</option>
              {CATEGORIAS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* título */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-dark-text-secondary">
              Título <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.titulo}
              onChange={set("titulo")}
              placeholder="Ej: El botón de confirmar no responde"
              maxLength={120}
              className={inputCls}
            />
          </div>

          {/* descripción */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-dark-text-secondary">
              Descripción <span className="text-red-400">*</span>
            </label>
            <textarea
              value={form.descripcion}
              onChange={set("descripcion")}
              placeholder="¿Qué pasó? ¿Qué esperabas que pasara? ¿Cómo reproducirlo?"
              rows={4}
              maxLength={1000}
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* url capturada */}
          <p className="text-xs text-slate-400 dark:text-dark-text-secondary">
            Se adjuntará automáticamente la URL actual.
          </p>

          <button
            type="submit"
            disabled={!valid || loading}
            className="cursor-pointer rounded-full bg-brand-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-dark-brand dark:hover:bg-dark-brand-hover"
          >
            {loading ? "Enviando..." : "Enviar reporte"}
          </button>
        </form>
      )}
    </div>
  );
}

// ── Floating bar ─────────────────────────────────────────────────────────────

export function FloatingActions() {
  const [chatOpen, setChatOpen] = useState(false);
  const [faqOpen,  setFaqOpen]  = useState(false);
  const [bugOpen,  setBugOpen]  = useState(false);

  const toggleChat = () => { setChatOpen((v) => !v); setFaqOpen(false);  setBugOpen(false); };
  const toggleFaq  = () => { setFaqOpen((v) => !v);  setChatOpen(false); setBugOpen(false); };
  const toggleBug  = () => { setBugOpen((v) => !v);  setChatOpen(false); setFaqOpen(false); };

  const buttons = [
    {
      icon: <CircleHelp size={19} />,
      label: "Preguntas frecuentes",
      onClick: toggleFaq,
      active: faqOpen,
    },
    {
      icon: <Bug size={19} />,
      label: "Reportar un bug",
      onClick: toggleBug,
      active: bugOpen,
    },
    {
      icon: <Bot size={19} />,
      label: "Chatbot",
      onClick: toggleChat,
      active: chatOpen,
    },
  ];

  return (
    <>
      {faqOpen  && <FaqWindow       onClose={() => setFaqOpen(false)}  />}
      {bugOpen  && <BugReportWindow onClose={() => setBugOpen(false)}  />}
      {chatOpen && <ChatWindow      onClose={() => setChatOpen(false)} />}

      {/* outer: clips the beam to the rounded shape */}
      <div className="fixed bottom-20 right-4 z-50 overflow-hidden rounded-2xl p-[2px] shadow-xl">
        {/* beam: solo se anima el ángulo del gradiente vía @property, sin rotar ningún elemento */}
        <div
          className="border-beam pointer-events-none absolute inset-0"
          style={{
            background:
              "conic-gradient(from var(--beam-angle) at 50% 50%, transparent 0%, transparent 75%, rgba(10,100,144,0.2) 83%, #0a6490 88%, rgba(10,100,144,0.15) 93%, transparent 100%)",
          }}
        />
        {/* content sits on top of the beam */}
        <div className="relative flex flex-col gap-0.5 rounded-[14px] bg-white/90 p-2 backdrop-blur-sm dark:bg-dark-surface/95">
          {buttons.map(({ icon, label, onClick, active }) => (
            <div key={label} className="group relative flex items-center justify-end">
              <span className="pointer-events-none absolute right-12 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 dark:bg-dark-elevated dark:text-dark-text dark:border dark:border-dark-border-strong">
                {label}
              </span>
              <button
                type="button"
                onClick={onClick}
                aria-label={label}
                className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl transition-all duration-150 active:scale-95 ${
                  active
                    ? "bg-brand-600 text-white dark:bg-dark-brand"
                    : "text-slate-500 hover:bg-slate-100 hover:text-brand-600 dark:text-dark-text-secondary dark:hover:bg-dark-elevated dark:hover:text-dark-brand"
                }`}
              >
                {icon}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
