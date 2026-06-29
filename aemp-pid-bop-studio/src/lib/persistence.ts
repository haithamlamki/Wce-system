// ============================================================================
//  Persistence — save/open project as .json + browser autosave (PRD FR-58).
//  Phase-1 uses localStorage; swap restore()/autosave() for AEMP server calls
//  in production (FR-59) without changing the views.
// ============================================================================
import type { Project } from '../types';

const KEY = 'aemp_pid_studio';
const FORMAT = 1;

interface Envelope {
  format: number;
  savedAt: string;
  project: Project;
}

export function serialize(project: Project): string {
  const env: Envelope = { format: FORMAT, savedAt: new Date().toISOString(), project };
  return JSON.stringify(env, null, 2);
}

function parse(text: string): Project {
  const data = JSON.parse(text);
  // accept either a bare project or an envelope
  const project: Project = data?.project ?? data;
  if (!project || !Array.isArray(project.nodes)) throw new Error('Not a valid P&ID project file');
  return project;
}

/** Download the project as a .json file. */
export function saveToFile(project: Project): void {
  const blob = new Blob([serialize(project)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(project.meta.rig || 'rig').replace(/\s+/g, '_')}_pid.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Read + validate a project from a user-picked file. */
export function openFromFile(file: File): Promise<Project> {
  return file.text().then(parse);
}

/** Persist the working project to localStorage (autosave). */
export function autosave(project: Project): void {
  try {
    localStorage.setItem(KEY, serialize(project));
  } catch {
    /* storage full / unavailable — ignore */
  }
}

/** Restore the last autosaved project, or null. */
export function restore(): Project | null {
  try {
    const text = localStorage.getItem(KEY);
    return text ? parse(text) : null;
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
