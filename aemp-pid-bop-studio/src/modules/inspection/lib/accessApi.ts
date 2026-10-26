// ============================================================================
//  Access administration — data access for the reference Administration
//  screens (migrations 0044 / 0045): Roles + their permission keys, Scope
//  Templates + items, per-user role / template assignments, Audit Logs and
//  App Logs. RLS enforces role:* / user:manage-access / audit:view / log:view.
// ============================================================================
import { supabase } from '../../../lib/supabase';
import { diffSets } from './permissions';

function need() {
  if (!supabase) throw new Error('Cloud not configured.');
  return supabase;
}

const friendly = (m: string) => (/insp_roles_name_key/.test(m) ? 'A role with this name already exists.'
  : /insp_scope_templates_name_key/.test(m) ? 'A scope template with this name already exists.' : m);

// ---- roles --------------------------------------------------------------------------
export interface InspRole {
  id: string;
  name: string;
  description: string;
  isSystemRole: boolean;
  permissions: string[];
  userCount: number;
}

export async function fetchRoles(): Promise<InspRole[]> {
  const sb = need();
  const [r, rp, ur] = await Promise.all([
    sb.from('insp_roles').select('id,name,description,is_system_role').order('name'),
    sb.from('insp_role_permissions').select('role_id,permission_key'),
    sb.from('insp_user_roles').select('role_id'),
  ]);
  const err = r.error ?? rp.error ?? ur.error;
  if (err) throw new Error(err.message);
  return (r.data ?? []).map((x) => ({
    id: x.id, name: x.name, description: x.description, isSystemRole: x.is_system_role,
    permissions: (rp.data ?? []).filter((p) => p.role_id === x.id).map((p) => p.permission_key as string),
    userCount: (ur.data ?? []).filter((u) => u.role_id === x.id).length,
  }));
}

/** Creates or updates a role; `permissions` is the full wanted key set (null = leave as is). */
export async function saveRole(role: { id?: string; name: string; description: string },
  permissions: string[] | null, current: string[] = []): Promise<string> {
  const sb = need();
  const row = { name: role.name.trim(), description: role.description.trim() };
  const res = role.id
    ? await sb.from('insp_roles').update(row).eq('id', role.id).select('id').single()
    : await sb.from('insp_roles').insert(row).select('id').single();
  if (res.error) throw new Error(friendly(res.error.message));
  const id = res.data.id as string;
  if (permissions) {
    const { added, removed } = diffSets(current, permissions);
    if (removed.length) {
      const { error } = await sb.from('insp_role_permissions').delete().eq('role_id', id).in('permission_key', removed);
      if (error) throw new Error(error.message);
    }
    if (added.length) {
      const { error } = await sb.from('insp_role_permissions')
        .insert(added.map((k) => ({ role_id: id, permission_key: k })));
      if (error) throw new Error(error.message);
    }
  }
  return id;
}

export async function deleteRole(id: string): Promise<void> {
  const { error } = await need().from('insp_roles').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- scope templates ------------------------------------------------------------------
export interface ScopeItem { scopeType: 'Company' | 'Unit'; refId: string }
export interface ScopeTemplate {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  items: ScopeItem[];
  userCount: number;
}

export async function fetchScopeTemplates(): Promise<ScopeTemplate[]> {
  const sb = need();
  const [t, i, u] = await Promise.all([
    sb.from('insp_scope_templates').select('id,name,description,is_active').order('name'),
    sb.from('insp_scope_template_items').select('template_id,scope_type,company_id,unit_id'),
    sb.from('insp_user_scope_templates').select('template_id'),
  ]);
  const err = t.error ?? i.error ?? u.error;
  if (err) throw new Error(err.message);
  return (t.data ?? []).map((x) => ({
    id: x.id, name: x.name, description: x.description, isActive: x.is_active,
    items: (i.data ?? []).filter((it) => it.template_id === x.id).map((it) => ({
      scopeType: it.scope_type as ScopeItem['scopeType'], refId: (it.company_id ?? it.unit_id) as string })),
    userCount: (u.data ?? []).filter((r) => r.template_id === x.id).length,
  }));
}

/** Creates or updates a template and replaces its items. */
export async function saveScopeTemplate(t: { id?: string; name: string; description: string; isActive: boolean },
  items: ScopeItem[]): Promise<string> {
  const sb = need();
  const row = { name: t.name.trim(), description: t.description.trim(), is_active: t.isActive };
  const res = t.id
    ? await sb.from('insp_scope_templates').update(row).eq('id', t.id).select('id').single()
    : await sb.from('insp_scope_templates').insert(row).select('id').single();
  if (res.error) throw new Error(friendly(res.error.message));
  const id = res.data.id as string;
  const del = await sb.from('insp_scope_template_items').delete().eq('template_id', id);
  if (del.error) throw new Error(del.error.message);
  if (items.length) {
    const { error } = await sb.from('insp_scope_template_items').insert(items.map((it) => ({
      template_id: id, scope_type: it.scopeType,
      company_id: it.scopeType === 'Company' ? it.refId : null,
      unit_id: it.scopeType === 'Unit' ? it.refId : null,
    })));
    if (error) throw new Error(error.message);
  }
  return id;
}

export async function deleteScopeTemplate(id: string): Promise<void> {
  const { error } = await need().from('insp_scope_templates').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- user assignments --------------------------------------------------------------------
export async function fetchUserAccess(userId: string): Promise<{ roleIds: string[]; templateIds: string[] }> {
  const sb = need();
  const [r, t] = await Promise.all([
    sb.from('insp_user_roles').select('role_id').eq('user_id', userId),
    sb.from('insp_user_scope_templates').select('template_id').eq('user_id', userId),
  ]);
  const err = r.error ?? t.error;
  if (err) throw new Error(err.message);
  return { roleIds: (r.data ?? []).map((x) => x.role_id as string),
    templateIds: (t.data ?? []).map((x) => x.template_id as string) };
}

async function syncLinks(table: 'insp_user_roles' | 'insp_user_scope_templates', col: 'role_id' | 'template_id',
  userId: string, current: string[], wanted: string[]): Promise<void> {
  const sb = need();
  const { added, removed } = diffSets(current, wanted);
  if (removed.length) {
    const { error } = await sb.from(table).delete().eq('user_id', userId).in(col, removed);
    if (error) throw new Error(error.message);
  }
  if (added.length) {
    const { error } = await sb.from(table).insert(added.map((v) => ({ user_id: userId, [col]: v })));
    if (error) throw new Error(error.message);
  }
}

export async function saveUserAccess(userId: string, current: { roleIds: string[]; templateIds: string[] },
  wanted: { roleIds: string[]; templateIds: string[] }): Promise<void> {
  await syncLinks('insp_user_roles', 'role_id', userId, current.roleIds, wanted.roleIds);
  await syncLinks('insp_user_scope_templates', 'template_id', userId, current.templateIds, wanted.templateIds);
}

// ---- logs -------------------------------------------------------------------------------------
export interface AuditEvent {
  id: number;
  userName: string;
  action: 'Create' | 'Update' | 'Delete';
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  changes: { column: string; oldValue: string | null; newValue: string | null }[] | null;
  createdAt: string;
}

export interface AppLog {
  id: number;
  level: 'Information' | 'Warning' | 'Error';
  message: string;
  source: string | null;
  exception: string | null;
  createdAt: string;
}

export interface LogQuery { q: string; filter: string; page: number; perPage: number }

export async function fetchAuditEvents(p: LogQuery): Promise<{ rows: AuditEvent[]; total: number }> {
  let qb = need().from('insp_audit_events')
    .select('id,user_name,action,entity_type,entity_id,entity_label,changes,created_at', { count: 'exact' });
  if (p.filter) qb = qb.eq('entity_type', p.filter);
  const q = p.q.trim().replace(/[%,()]/g, ' ');
  if (q) qb = qb.or(`user_name.ilike.%${q}%,entity_label.ilike.%${q}%,entity_id.ilike.%${q}%,action.ilike.%${q}%`);
  const from = (p.page - 1) * p.perPage;
  const { data, error, count } = await qb.order('created_at', { ascending: false }).range(from, from + p.perPage - 1);
  if (error) throw new Error(error.message);
  return {
    rows: (data ?? []).map((r) => ({ id: r.id, userName: r.user_name, action: r.action, entityType: r.entity_type,
      entityId: r.entity_id, entityLabel: r.entity_label, changes: r.changes, createdAt: r.created_at })),
    total: count ?? 0,
  };
}

export async function fetchAppLogs(p: LogQuery): Promise<{ rows: AppLog[]; total: number }> {
  let qb = need().from('insp_app_logs').select('id,level,message,source,exception,created_at', { count: 'exact' });
  if (p.filter) qb = qb.eq('level', p.filter);
  const q = p.q.trim().replace(/[%,()]/g, ' ');
  if (q) qb = qb.or(`message.ilike.%${q}%,source.ilike.%${q}%`);
  const from = (p.page - 1) * p.perPage;
  const { data, error, count } = await qb.order('created_at', { ascending: false }).range(from, from + p.perPage - 1);
  if (error) throw new Error(error.message);
  return {
    rows: (data ?? []).map((r) => ({ id: r.id, level: r.level, message: r.message, source: r.source,
      exception: r.exception, createdAt: r.created_at })),
    total: count ?? 0,
  };
}

/** Best-effort client error report (never throws). */
export async function logClientError(message: string, exception?: string): Promise<void> {
  try { await supabase?.rpc('insp_log_client_error', { p_message: message, p_exception: exception ?? null }); }
  catch { /* logging must never break the UI */ }
}
