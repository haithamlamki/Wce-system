// Shared styling for the canvas's floating pipe pickers (F19 extraction from
// PidFullView.tsx) — used by both PipeTypeMenu and PipeEditMenu.
export const pipeMenuBox: React.CSSProperties = { position: 'absolute', transform: 'translate(-50%, 12px)', zIndex: 40, background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 10, boxShadow: 'var(--shadow)', padding: 6, minWidth: 190 };
export const pipeMenuHead: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--faint)', padding: '4px 8px 6px', fontWeight: 600 };
export const pipeMenuRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 9px', background: 'transparent', border: 0, borderRadius: 7, cursor: 'pointer', fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 };
