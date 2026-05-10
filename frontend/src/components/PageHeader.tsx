import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  backTo,
  backLabel,
  compact = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  backTo?: string;
  backLabel?: string;
  compact?: boolean;
}) {
  return (
    <header className="rounded-[1.5rem] border border-stone-200 bg-white px-5 py-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)] sm:px-7 sm:py-6">
      <div
        className={`flex flex-col gap-5 lg:flex-row lg:justify-between ${compact ? 'lg:items-center' : 'lg:items-start'}`}
      >
        <div className="min-w-0">
          {backTo && (
            <Link
              to={backTo}
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500 transition hover:border-stone-300 hover:text-slate-700"
            >
              {backLabel ?? 'Back'}
            </Link>
          )}
          {eyebrow && (
            <p
              className={`${backTo ? 'mt-4' : compact ? 'mt-0.5' : 'mt-4'} text-[0.68rem] font-semibold uppercase tracking-[0.34em] text-rose-600`}
            >
              {eyebrow}
            </p>
          )}
          <h1
            className={`${compact ? 'mt-1.5' : 'mt-2'} font-serif text-[2.15rem] font-semibold leading-[1.02] tracking-tight text-slate-950 sm:text-[2.7rem]`}
          >
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
          )}
          {meta && (
            <div className={`${compact ? 'mt-3' : 'mt-4'} flex flex-wrap gap-2`}>{meta}</div>
          )}
        </div>

        {actions && (
          <div className={`flex flex-wrap gap-2 lg:justify-end ${compact ? 'lg:self-start' : ''}`}>
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
