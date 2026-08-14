// ============================================================================
//  Shared presentational primitives for the inspection module, matching the
//  reference system's page header, badge and empty-state treatments.
// ============================================================================
import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: {
  title: string; subtitle?: string; actions?: ReactNode;
}) {
  return (
    <div className="insp-pagehead">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`insp-badge ${tone}`}>{children}</span>;
}

export function EmptyState({ ico = '☰', title, desc }: { ico?: string; title: string; desc?: string }) {
  return (
    <div className="insp-empty">
      <div className="ico" aria-hidden="true">{ico}</div>
      <div className="t">{title}</div>
      {desc && <div className="d">{desc}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="insp-empty">
      <span className="insp-spinner" aria-hidden="true" />
      <div className="d">{label}</div>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="insp-section-title">{children}</h2>;
}

export function Card({ title, extra, children }: {
  title?: string; extra?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="insp-card">
      {title && (
        <h3>
          {title}
          {extra && <span style={{ marginLeft: 'auto' }}>{extra}</span>}
        </h3>
      )}
      {children}
    </section>
  );
}
