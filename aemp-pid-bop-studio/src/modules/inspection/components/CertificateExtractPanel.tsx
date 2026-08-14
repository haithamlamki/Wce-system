// ============================================================================
//  Certificate extraction — review and confirm panel.
//
//  Reads the certificate in the browser, shows what it found beside the source
//  line it came from, and applies only what the user ticks. Three rules:
//
//   * nothing is written without an explicit Apply;
//   * due dates are never written — the 0030 trigger derives them, so the
//     certificate's stated expiry is shown only as a cross-check;
//   * approval status is untouched, so this cannot bypass the approval queue.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { readPdfPages } from '../lib/pdfText';
import {
  buildRecordPatch, extractCertificatePages, isScanned, valueOf,
} from '../lib/certificateExtract';
import type { CertField, ExtractionResult, Schedule } from '../lib/certificateExtract';
import { computeDueDate } from '../lib/compliance';
import { formatDate } from '../lib/format';
import { updateRecord } from '../lib/records';
import { frequencyLabel } from '../types';
import type { InspectionRecord } from '../types';
import { useInspection } from '../state/InspectionContext';
import { Badge, EmptyState, LoadingState } from './ui';
import Icon from './Icon';

/** Fields that can be written back, in display order. */
const APPLICABLE: { field: CertField; label: string }[] = [
  { field: 'serialNumber', label: 'Serial Number' },
  { field: 'oem', label: 'OEM' },
  { field: 'inspectionCompany', label: 'Inspection Company' },
  { field: 'partNumber', label: 'Part Number' },
  { field: 'manufactureYear', label: 'Manufacture Year' },
  { field: 'inspectionDate', label: 'Inspection Date' },
];

/** Read-only context shown for verification but never written. */
const REFERENCE_ONLY: { field: CertField; label: string }[] = [
  { field: 'certificateNumber', label: 'Certificate / Report No' },
  { field: 'equipmentDescription', label: 'Equipment Description' },
  { field: 'unit', label: 'Rig / Unit' },
  { field: 'inspectionType', label: 'Inspection Type' },
  { field: 'nextDueDate', label: 'Stated expiry' },
];

export default function CertificateExtractPanel({ record, file, onClose, onApplied }: {
  record: InspectionRecord;
  file: File;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { can } = useInspection();
  const canWrite = can('insp_data_entry');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const [results, setResults] = useState<ExtractionResult[]>([]);
  const [page, setPage] = useState(0);
  const [schedule, setSchedule] = useState<Schedule>('major');
  const [picked, setPicked] = useState<ReadonlySet<CertField>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const pages = await readPdfPages(file);
        if (!alive) return;
        if (isScanned(pages)) { setScanned(true); return; }
        const found = extractCertificatePages(pages);
        setResults(found);
        // A multi-page file is many certificates; open the one whose serial
        // matches this record rather than making the user hunt for it.
        const mine = found.findIndex(
          (r) => valueOf(r, 'serialNumber')?.toLowerCase() === record.serialNumber.toLowerCase(),
        );
        if (mine >= 0) setPage(mine);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [file, record.serialNumber]);

  const current = results[page];

  // Preselect everything the certificate offers; the user can untick, and
  // nothing is written until Apply.
  useEffect(() => {
    if (!current) return;
    const next = new Set<CertField>();
    for (const { field } of APPLICABLE) if (valueOf(current, field)) next.add(field);
    setPicked(next);
  }, [current]);

  const expectedDue = useMemo(() => {
    if (!current) return null;
    return computeDueDate(valueOf(current, 'inspectionDate'), current.inferredFrequencyMonths);
  }, [current]);

  const toggle = (f: CertField) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(f)) n.delete(f); else n.add(f);
    return n;
  });

  const apply = async () => {
    if (!current) return;
    // buildRecordPatch is the only writer, and its type cannot express a due
    // date or an approval change — see CertificatePatch.
    const patch = buildRecordPatch(current, picked, schedule);
    if (Object.keys(patch).length === 0) { setNotice('Nothing selected to apply.'); return; }

    setBusy(true);
    try {
      await updateRecord(record.id, patch);
      setNotice('Record updated. Due dates were recalculated by the database.');
      onApplied();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState label="Reading certificate…" />;

  if (scanned) {
    return (
      <div className="insp-card" style={{ marginTop: 10 }}>
        <EmptyState
          ico="⚠" title="This PDF has no text layer"
          desc="It is a scan or photograph, so the fields cannot be read without OCR. Enter the values by hand, or ask the issuer for the digital PDF."
        />
        <div className="insp-toolbar" style={{ marginBottom: 0 }}>
          <div className="grow">
            <button type="button" className="insp-btn" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  if (error || !current) {
    return (
      <div className="insp-card" style={{ marginTop: 10 }}>
        <EmptyState ico="⚠" title="Could not read this certificate"
          desc={error ?? 'No recognisable certificate fields were found in this file.'} />
        <div className="insp-toolbar" style={{ marginBottom: 0 }}>
          <div className="grow">
            <button type="button" className="insp-btn" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  // The expiry the certificate prints, compared with what the database will
  // derive. A difference is shown to the reviewer and never acted on.
  const statedExpiry = valueOf(current, 'nextDueDate');
  const expiryDiffers = !!statedExpiry && !!expectedDue && statedExpiry !== expectedDue;

  const serialOnCert = valueOf(current, 'serialNumber');
  const mismatch = serialOnCert && record.serialNumber
    && serialOnCert.toLowerCase() !== record.serialNumber.toLowerCase();

  const currentValues: Partial<Record<CertField, string | null>> = {
    serialNumber: record.serialNumber,
    oem: record.oem,
    inspectionCompany: record.inspectionCompany,
    partNumber: record.partNumber,
    manufactureYear: record.manufactureYear?.toString() ?? '',
    inspectionDate: schedule === 'major' ? record.majorDate : record.intermediateDate,
  };

  return (
    <div className="insp-card" style={{ marginTop: 10 }}>
      <div className="insp-toolbar">
        <b style={{ fontSize: 12.5 }}>Extracted from {file.name}</b>
        <div className="grow">
          <button type="button" className="insp-btn sm" onClick={onClose}>Close</button>
        </div>
      </div>

      {results.length > 1 && (
        <div className="insp-toolbar">
          <span style={{ fontSize: 12 }}>{results.length} certificates in this file — showing</span>
          <select className="insp-select" value={page} aria-label="Certificate in file"
            onChange={(e) => setPage(Number(e.target.value))}>
            {results.map((r, i) => (
              <option key={`${valueOf(r, 'certificateNumber') ?? 'cert'}-${i}`} value={i}>
                {i + 1}. {valueOf(r, 'serialNumber') ?? 'unknown serial'} — {valueOf(r, 'equipmentDescription') ?? ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/*
        Which house issued the paper, and how sure we are. Keyed off the stable
        issuer id, never off the display string. An unrecognised issuer is
        stated plainly: its values were read with generic rules only, so the
        reviewer knows to check every one of them.
      */}
      <div className="insp-card" role="status"
        style={{
          marginBottom: 10,
          fontSize: 12.5,
          borderColor: current.issuer.recognised ? undefined : 'var(--i-warning)',
        }}>
        <Icon name={current.issuer.recognised ? 'kpi-compliance' : 'kpi-overdue'} />{' '}
        {current.issuer.recognised ? (
          <>
            Issuer recognised: <b>{current.issuer.displayName}</b>{' '}
            <Badge tone={current.issuer.confidence === 'high' ? 'success' : 'warning'}>
              {current.issuer.confidence} confidence
            </Badge>
          </>
        ) : (
          <>
            <b>Unrecognised issuer.</b> Only issuer-independent rules were applied, so every
            value below is a suggestion — check each one against the certificate before applying.
          </>
        )}
        {current.issuer.evidence.length > 0 && (
          <div style={{ color: 'var(--i-muted)', fontSize: 11, marginTop: 4 }}>
            {current.issuer.evidence.join(' · ')}
          </div>
        )}
      </div>

      {mismatch && (
        <div className="insp-card" role="alert"
          style={{ marginBottom: 10, fontSize: 12.5, borderColor: 'var(--i-warning)' }}>
          <Icon name="kpi-overdue" /> This certificate is for serial <b>{serialOnCert}</b>,
          but this record is <b>{record.serialNumber}</b>. Check you have the right certificate
          before applying.
        </div>
      )}

      <div className="insp-table-wrap" style={{ marginBottom: 10 }}>
        <table className="insp-table">
          <thead>
            <tr>
              <th style={{ width: 30 }} aria-label="Apply" />
              <th>Field</th>
              <th>Value from certificate</th>
              <th>Current record</th>
              <th>Read from</th>
            </tr>
          </thead>
          <tbody>
            {APPLICABLE.map(({ field, label }) => {
              const c = current.candidates.find((x) => x.field === field);
              if (!c) return null;
              return (
                <tr key={field}>
                  <td>
                    <input type="checkbox" checked={picked.has(field)} disabled={!canWrite}
                      onChange={() => toggle(field)} aria-label={`Apply ${label}`} />
                  </td>
                  <td>{label}</td>
                  <td>
                    <b>{field === 'inspectionDate' ? formatDate(c.value) : c.value}</b>{' '}
                    <Badge tone={c.confidence === 'high' ? 'success' : 'warning'}>
                      {c.confidence}
                    </Badge>
                    {c.ambiguous && (
                      // The text supports more than one reading, so the raw
                      // form is shown for the reviewer to decide against.
                      <div style={{ color: 'var(--i-warning)', fontSize: 11, marginTop: 2 }}>
                        Ambiguous date — the certificate reads “{c.raw}”. Confirm the order
                        before applying.
                      </div>
                    )}
                  </td>
                  <td style={{ color: 'var(--i-muted)' }}>{currentValues[field] || '—'}</td>
                  <td style={{ maxWidth: 260, whiteSpace: 'normal', fontSize: 11.5, color: 'var(--i-muted)' }}>
                    {c.source}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="insp-filterrow">
        <div className="fld">
          <span>Apply the inspection date to</span>
          <select className="insp-select" value={schedule}
            aria-label="Which schedule this certificate updates"
            onChange={(e) => setSchedule(e.target.value as Schedule)}>
            <option value="major">Major inspection</option>
            <option value="intermediate">Intermediate inspection</option>
          </select>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--i-muted)', marginBottom: 10 }}>
        {current.inferredFrequencyMonths
          ? <>Frequency inferred from the certificate dates: <b>{frequencyLabel(current.inferredFrequencyMonths)}</b>.{' '}</>
          : <>No standard frequency matched the certificate dates, so frequency is left unchanged.{' '}</>}
        {expectedDue && (
          <>
            The database will recalculate the due date to <b>{formatDate(expectedDue)}</b>.{' '}
            {statedExpiry && (
              expiryDiffers ? (
                // Surfaced, never reconciled: the certificate's expiry is
                // evidence, and 0030's trigger owns the authoritative date.
                <span style={{ color: 'var(--i-warning)' }}>
                  The certificate states a different expiry,{' '}
                  <b>{formatDate(statedExpiry)}</b> — check the inspection date and frequency
                  before applying. The stated expiry is never written.
                </span>
              ) : (
                <>This matches the expiry stated on the certificate.</>
              )
            )}
          </>
        )}
      </div>

      <details style={{ marginBottom: 10 }}>
        <summary style={{ fontSize: 12, cursor: 'pointer', color: 'var(--i-muted)' }}>
          Other details read from this certificate
        </summary>
        <dl className="insp-deflist" style={{ marginTop: 8 }}>
          {REFERENCE_ONLY.map(({ field, label }) => {
            const v = valueOf(current, field);
            if (!v) return null;
            return (
              <div key={field}>
                <dt>{label}</dt>
                <dd>{field === 'nextDueDate' ? formatDate(v) : v}</dd>
              </div>
            );
          })}
        </dl>
      </details>

      {notice && (
        <div className="insp-card" style={{ marginBottom: 10, fontSize: 12.5 }} role="status">
          {notice}
        </div>
      )}

      <div className="insp-toolbar" style={{ marginBottom: 0 }}>
        <span style={{ fontSize: 11.5, color: 'var(--i-muted)' }}>
          Values are suggestions. Nothing is saved until you apply, and approval status is unchanged.
        </span>
        <div className="grow">
          <button type="button" className="insp-btn primary" disabled={!canWrite || busy}
            onClick={apply}>
            Apply {picked.size} field{picked.size === 1 ? '' : 's'} to record
          </button>
        </div>
      </div>
    </div>
  );
}
