// ============================================================================
//  Undo/redo history hook (F19 extraction from ProjectContext.tsx).
//  Coalesces a burst of edits (e.g. a drag) into one undo step by "sealing"
//  the current project as a new baseline ~350ms after edits settle.
//
//  Inputs:  `project` (the live project value) and `setProject`, plus
//           `onTimeTravel` — called right before an undo/redo commits a past/
//           future snapshot, so the caller can clear its own derived state
//           (here: the node selection, which shouldn't survive a jump).
//  Outputs: undo, redo, canUndo, canRedo — exactly the history surface
//           useProject() exposes; nothing else observes past/future/baseline.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from '../../types';

export interface HistoryApi {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useHistory(
  project: Project,
  setProject: React.Dispatch<React.SetStateAction<Project>>,
  onTimeTravel: () => void,
): HistoryApi {
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const baseline = useRef<Project>(project);
  const timeTravel = useRef(false);
  const sealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setHistVer] = useState(0);

  const sealNow = useCallback(() => {
    if (sealTimer.current) { clearTimeout(sealTimer.current); sealTimer.current = null; }
    if (project !== baseline.current) {
      past.current.push(baseline.current);
      if (past.current.length > 100) past.current.shift();
      future.current = [];
      baseline.current = project;
      setHistVer((v) => v + 1);
    }
  }, [project]);

  useEffect(() => {
    if (timeTravel.current) { timeTravel.current = false; baseline.current = project; return; }
    if (sealTimer.current) clearTimeout(sealTimer.current);
    sealTimer.current = setTimeout(sealNow, 350);
    return () => { if (sealTimer.current) clearTimeout(sealTimer.current); };
  }, [project, sealNow]);

  const undo = useCallback(() => {
    sealNow();
    if (!past.current.length) return;
    const prev = past.current.pop()!;
    future.current.push(baseline.current);
    baseline.current = prev;
    timeTravel.current = true;
    onTimeTravel();
    setProject(prev);
    setHistVer((v) => v + 1);
  }, [sealNow, onTimeTravel, setProject]);

  const redo = useCallback(() => {
    if (!future.current.length) return;
    const next = future.current.pop()!;
    past.current.push(baseline.current);
    baseline.current = next;
    timeTravel.current = true;
    onTimeTravel();
    setProject(next);
    setHistVer((v) => v + 1);
  }, [onTimeTravel, setProject]);

  // F15: recomputed every render (cheap) so a history seal — which bumps
  // histVer without necessarily changing `project` itself — is still picked
  // up by the value memo in ProjectContext (both are listed in its deps).
  const canUndo = past.current.length > 0 || project !== baseline.current;
  const canRedo = future.current.length > 0;

  return { undo, redo, canUndo, canRedo };
}
