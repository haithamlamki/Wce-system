// ============================================================================
//  Release Log (reference `/release-log`): what changed and when, newest
//  first, rendered from the bundled release notes.
// ============================================================================
import { useMemo } from 'react';
import { EmptyState, PageHeader } from '../components/ui';
import { useInspection } from '../state/InspectionContext';
import { parseInline, parseReleaseLog, type Block } from '../lib/releaseLog';
import notes from '../content/release-log.md?raw';

function Text({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((r, i) => (r.kind === 'b' ? <strong key={i}>{r.text}</strong>
        : r.kind === 'i' ? <em key={i}>{r.text}</em>
          : r.kind === 'code' ? <code key={i}>{r.text}</code> : <span key={i}>{r.text}</span>))}
    </>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => (b.kind === 'p'
        ? <p key={i} style={{ margin: '0 0 10px', lineHeight: 1.55 }}><Text text={b.text} /></p>
        : <ul key={i} style={{ margin: '0 0 10px', paddingLeft: 20, lineHeight: 1.55 }}>
          {b.items.map((it, j) => <li key={j} style={{ marginBottom: 4 }}><Text text={it} /></li>)}
        </ul>))}
    </>
  );
}

export default function ReleaseLogView() {
  const { can } = useInspection();
  const log = useMemo(() => parseReleaseLog(notes), []);
  if (!can('release-log:view')) {
    return <EmptyState ico="⚿" title="No Access" desc="You need the release-log:view permission." />;
  }
  return (
    <div style={{ maxWidth: 860 }}>
      <PageHeader title="Release Log" subtitle={`${log.releases.length} releases, newest first.`} />
      <div className="insp-card" style={{ marginBottom: 12 }}><Blocks blocks={log.intro} /></div>
      {log.releases.map((r) => (
        <section key={r.title} className="insp-card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>{r.title}</h3>
          <Blocks blocks={r.blocks} />
        </section>
      ))}
    </div>
  );
}
