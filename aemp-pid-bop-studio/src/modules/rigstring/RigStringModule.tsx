// ============================================================================
//  Rig String Builder — Module 3 (BHA · Pipe Tally · Ton-Mile · Daily ·
//  Rotating Hrs · Mud Pumps · Trip Sheet · Kill Sheet · Formulas).
//  The approved prototype is a self-contained single-file HTML app and is
//  kept verbatim at public/rig-string-builder.html; embedding it unmodified
//  in an iframe guarantees it stays exactly identical to the sign-off copy.
//  It is fully client-side: Save/Load work via .json downloads, CSV exports
//  and print run inside the frame. No sandbox attribute — it is first-party
//  same-origin content and needs downloads, confirm() and window.print().
// ============================================================================

export const RIG_STRING_SRC = '/rig-string-builder.html';

export default function RigStringModule() {
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <iframe
        src={RIG_STRING_SRC}
        title="Rig String Builder — BHA · Pipe Tally · Ton-Mile"
        style={{ flex: 1, width: '100%', border: 0, display: 'block' }}
      />
    </div>
  );
}
