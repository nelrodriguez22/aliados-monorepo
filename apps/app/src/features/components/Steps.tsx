import { tw } from "@/shared/styles/design-system";
import { Search, Handshake, Wrench, CreditCard } from "lucide-react";

const STEPS = [
  { n: 1, title: "Buscá",    desc: "Elegí el servicio que necesitás",  Icon: Search    },
  { n: 2, title: "Match",    desc: "Encontrá el mejor aliado",          Icon: Handshake },
  { n: 3, title: "Trabajá",  desc: "Coordiná y ejecutá el trabajo",     Icon: Wrench    },
  { n: 4, title: "Pagá",     desc: "Pagos simples y seguros",            Icon: CreditCard },
];

export function Steps() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
      {STEPS.map(({ n, title, desc, Icon }) => (
        <div key={n} className="group flex flex-col items-center text-center">

          {/* Número con ring */}
          <div className="relative mb-5">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl
              bg-brand-600 dark:bg-dark-brand text-white
              transition-all duration-200
              group-hover:scale-105 group-hover:shadow-[0_8px_24px_rgba(var(--color-brand-600)/0.25)]`}>
              <Icon className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <span className={`absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center
              rounded-full bg-white dark:bg-dark-surface border-2 border-slate-200 dark:border-dark-border
              text-[10px] font-bold ${tw.text.primary}`}>
              {n}
            </span>
          </div>

          <h3 className={`mb-1.5 text-base font-semibold transition-colors ${tw.text.primary}
            group-hover:text-brand-600 dark:group-hover:text-dark-brand`}>
            {title}
          </h3>
          <p className={`text-sm leading-relaxed ${tw.text.secondary}`}>{desc}</p>
        </div>
      ))}
    </section>
  );
}
