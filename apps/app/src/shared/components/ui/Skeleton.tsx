import { tw } from '@/shared/styles/design-system';

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`${tw.skeleton} rounded-lg ${className}`} />
  );
}

export function SkeletonCard() {
  return (
    <div className={`rounded-2xl border p-5 bg-white dark:bg-dark-surface border-slate-200 dark:border-dark-border`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`h-11 w-11 shrink-0 rounded-xl ${tw.skeleton}`} />
          <div className="space-y-2">
            <div className={`h-3.5 w-32 ${tw.skeleton}`} />
            <div className={`h-3 w-48 ${tw.skeleton}`} />
          </div>
        </div>
        <div className={`h-7 w-20 rounded-full ${tw.skeleton}`} />
      </div>
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div className={`rounded-2xl border p-5 bg-white dark:bg-dark-surface border-slate-200 dark:border-dark-border`}>
        <div className="flex items-center gap-3">
          <div className={`h-12 w-12 shrink-0 rounded-xl ${tw.skeleton}`} />
          <div className="space-y-2 flex-1">
            <div className={`h-4 w-40 ${tw.skeleton}`} />
            <div className={`h-3 w-28 ${tw.skeleton}`} />
          </div>
        </div>
      </div>

      {/* Sección */}
      {[1, 2].map((s) => (
        <div key={s}>
          <div className={`mb-3 h-3 w-28 rounded-full ${tw.skeleton}`} />
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            {s === 1 && <SkeletonCard />}
          </div>
        </div>
      ))}
    </div>
  );
}
