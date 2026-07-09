// ============================================================================
//  User Manual — maintainable module documentation. Rewritten from the
//  prototype's manual: all references to browser local storage are gone —
//  data lives in the cloud database with per-unit authorization and a full
//  audit trail.
// ============================================================================

const h3: React.CSSProperties = { fontFamily: 'var(--disp)', margin: '20px 0 6px' };
const p: React.CSSProperties = { color: 'var(--dim)', fontSize: 13.5, lineHeight: 1.65, margin: '0 0 8px' };

export default function ManualView() {
  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '16px 24px', maxWidth: 820 }}>
      <h2 style={{ fontFamily: 'var(--disp)', margin: 0 }}>Tubular Fleet Management — User Manual</h2>
      <p style={p}>
        This module tracks the tubular fleet (drill pipe, HWDP, drill collars, pup joints) across all
        Rigs and Hoists. All data is stored centrally in the company database — nothing lives in your
        browser. What you can see and change is controlled by your account's permissions and unit
        assignments; every save is recorded with who/when and can be audited.
      </p>

      <h3 style={h3}>Dashboard</h3>
      <p style={p}>
        Live fleet KPIs computed from the current records: contract position per tubular type, class
        mix, utilization (serviceable ÷ contract), items requiring attention, and a reconciliation
        panel for legacy on-board totals that don't match their classification sum.
      </p>

      <h3 style={h3}>Data Entry (Rig/Hoist sheet)</h3>
      <p style={p}>
        The grid mirrors the monthly Excel sheet: rows grouped by category, the same 16 columns, and
        the same rules. <strong>On Board Total is computed</strong> (Premium + Class 2 + Class 3 + Scrap) and
        cannot be typed; <strong>Contractually Less</strong> shows OK or the negative shortfall of Premium +
        Class 2 against On Contract. Navigate with arrow keys / Tab / Enter, paste blocks straight
        from Excel, and press <em>Save sheet</em> to submit the whole batch at once. Removing a row archives
        it — history is never destroyed. Invalid numbers block the save; nothing is silently zeroed.
      </p>

      <h3 style={h3}>Fleet Inventory &amp; Master Register</h3>
      <p style={p}>
        Fleet Inventory aggregates by tubular type (duplicates roll up only in the view); the Master
        Register lists every record row across your visible units with filters, search, sorting and a
        hardened CSV export.
      </p>

      <h3 style={h3}>Transfers</h3>
      <p style={p}>
        A transfer first commits stock under "To Other Rig". Quantities move only when the receiving
        unit confirms receipt — then, in one transaction, premium stock leaves the source and arrives
        at the destination, and both units get an audit entry. Cancelling releases the commitment.
      </p>

      <h3 style={h3}>Pipe Orders</h3>
      <p style={p}>
        Orders progress Requested → Approved → Picked at Yard → In Transit → Delivered, each step an
        explicit action by an authorized person (no automatic progression). Approval reserves stock
        from a named source; only Premium + Class 2 is orderable. Delivery is what updates the
        receiving unit. Cancellation releases all reservations.
      </p>

      <h3 style={h3}>Contracts</h3>
      <p style={p}>
        Contracts carry required tubular lines; compliance compares serviceable stock (Premium +
        Class 2) with each line. Contracts that have been active can be archived but never deleted.
      </p>

      <h3 style={h3}>Asset Map</h3>
      <p style={p}>
        Unit locations and in-transit shipments. Distances are straight-line; operational coordinates
        are never sent to external routing services.
      </p>

      <h3 style={h3}>Workbook Import (administrators)</h3>
      <p style={p}>
        The importer reads every Rig/Hoist sheet of the monthly workbook, previews issues (unknown
        descriptions, typed on-board totals that disagree with classifications, duplicates), and
        commits in a single transaction with a per-sheet reconciliation report. A committed import can
        be rolled back until a unit receives newer field entries.
      </p>

      <h3 style={h3}>Access</h3>
      <p style={p}>
        Rig users see and enter data for their assigned unit(s) only. Fleet-wide visibility, approvals,
        order management, contracts, catalog and imports are separate permissions granted by an
        administrator. Hiding a button is not the security boundary — the database enforces every rule
        again on the server.
      </p>
    </div>
  );
}
