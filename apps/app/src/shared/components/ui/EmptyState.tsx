import type { ElementType } from "react";
import { tw } from "@/shared/styles/design-system";

interface Props {
  icon: ElementType;
  title: string;
  desc: string;
}

/** Estado vacío de una lista (sin trabajos, sin historial). Mismo aspecto en los dos dashboards. */
export function EmptyState({ icon: Icon, title, desc }: Props) {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed py-8 text-center
        border-slate-200 dark:border-dark-border"
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tw.iconBg.slate}`}>
        <Icon className={`h-5 w-5 ${tw.text.faint}`} />
      </div>
      <p className={`text-sm font-medium ${tw.text.secondary}`}>{title}</p>
      <p className={`text-xs ${tw.text.muted}`}>{desc}</p>
    </div>
  );
}
