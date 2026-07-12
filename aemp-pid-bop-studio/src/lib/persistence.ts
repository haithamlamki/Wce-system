// ============================================================================
//  Persistence — save/open project as .json + browser autosave (PRD FR-58).
//  Phase-1 uses localStorage; swap restore()/autosave() for AEMP server calls
//  in production (FR-59) without changing the views.
// ============================================================================
import type { Project } from '../types';

const BASE_KEY = 'aemp_pid_studio';
const FORMAT = 1;

// Autosave is scoped per signed-in user so one admin's local draft can never be
// restored into another admin's editor on a shared browser. `scope` is the user
// id (or 'local' when offline / signed out). Legacy un-namespaced drafts (from
// before this change) are migrated on first read.
function keyFor(scope?: string): string {
  return scope ? `${BASE_KEY}:${scope}` : BASE_KEY;
}

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

/** Persist the working project to localStorage (autosave), scoped to `scope`
 *  (the signed-in user id) so drafts never bleed across users. */
export function autosave(project: Project, scope?: string): void {
  try {
    localStorage.setItem(keyFor(scope), serialize(project));
  } catch {
    /* storage full / unavailable — ignore */
  }
}

/** Restore this scope's last autosaved project, or null. Falls back to (and
 *  migrates) a legacy un-namespaced draft the first time a user loads. */
export function restore(scope?: string): Project | null {
  try {
    let text = localStorage.getItem(keyFor(scope));
    if (!text && scope) {
      // one-time migration of a pre-namespacing draft into this user's scope
      const legacy = localStorage.getItem(BASE_KEY);
      if (legacy) { localStorage.setItem(keyFor(scope), legacy); localStorage.removeItem(BASE_KEY); text = legacy; }
    }
    return text ? parse(text) : null;
  } catch {
    return null;
  }
}

/** Clear a scope's autosaved draft (called on sign-out for the leaving user). */
export function clearAutosave(scope?: string): void {
  try { localStorage.removeItem(keyFor(scope)); } catch { /* ignore */ }
}
