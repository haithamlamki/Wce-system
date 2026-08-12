// ============================================================================
//  Equipment Inspection — 7 category tabs (source system parity), each with
//  Data Display / Data Upload / Data Entry sub-tabs.
// ============================================================================
import { useState } from 'react';
import { CATEGORY_LABELS, CATEGORY_ORDER, type InspCategory, type InspectionRecord } from '../types';
import { useInspection } from '../state/InspectionContext';
import DataDisplayTab from './DataDisplayTab';
import DataEntryForm from './DataEntryForm';
import DataUploadView from './DataUploadView';

type SubTab = 'display' | 'upload' | 'entry';

export default function RecordsView() {
  const { can } = useInspection();
  const [category, setCategory] = useState<InspCategory>('well_control');
  const [sub, setSub] = useState<SubTab>('display');
  const [editing, setEditing] = useState<InspectionRecord | null>(null);

  const openEntry = (record: InspectionRecord | null) => { setEditing(record); setSub('entry'); };

  return (
    <div>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Equipment Inspection</h2>
      <div style={{ color: 'var(--dim)', fontSize: 12, marginBottom: 12 }}>
        Inspection records by equipment system.
      </div>

      <div className="insp-cat-tabs">
        {CATEGORY_ORDER.map((c) => (
          <button key={c} className={c === category ? 'active' : ''}
            onClick={() => { setCategory(c); setEditing(null); }}>{CATEGORY_LABELS[c]}</button>
        ))}
      </div>

      <div className="insp-subtabs">
        <button className={sub === 'display' ? 'active' : ''} onClick={() => { setEditing(null); setSub('display'); }}>Data Display</button>
        {can('insp_upload') && (
          <button className={sub === 'upload' ? 'active' : ''} onClick={() => { setEditing(null); setSub('upload'); }}>Data Upload</button>
        )}
        {can('insp_data_entry') && (
          <button className={sub === 'entry' ? 'active' : ''} onClick={() => { setEditing(null); setSub('entry'); }}>Data Entry</button>
        )}
      </div>

      {sub === 'display' && <DataDisplayTab category={category} onEdit={can('insp_data_entry') ? (r) => openEntry(r) : undefined} />}
      {sub === 'upload' && <DataUploadView category={category} onDone={() => setSub('display')} />}
      {sub === 'entry' && (
        <DataEntryForm key={editing?.id ?? 'new'} category={category} editing={editing}
          onSaved={() => { setEditing(null); setSub('display'); }} />
      )}
    </div>
  );
}
