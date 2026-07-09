// ============================================================================
//  Asset & Logistics Map — pixel-faithful port of the prototype's #view-map:
//  Leaflet map + sidebar cards (Admin Mode, Legend, Distance Calculator,
//  Trip Cost & Planning, Distance Matrix, Data Management) and the Add/Edit
//  Location modal. Points & trips persist in map_locations / planned_trips
//  (migration 0024). Distances are straight-line (haversine) — no external
//  routing service, per the approved decision; the labels say so. Admin
//  capability is the real is_privileged permission, surfaced through the
//  prototype's toggle UI.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../state/AuthContext';
import { useToast } from '../components/shell/Toast';
import { isPrivileged } from '../lib/permissions';
import { downloadJson } from '../lib/downloadJson';

interface MapPoint {
  id: string; name: string; category: 'site' | 'logistics' | 'rig' | 'hoist';
  status: 'active' | 'inactive' | 'expired'; lat: number; lng: number; notes: string | null;
}
interface Trip {
  id: string; origin_location_id: string; dest_location_id: string | null;
  dest_name: string | null; distance_km: number; cost: number; created_at: string;
}

const CAT_LABEL: Record<MapPoint['category'], string> = {
  site: 'Abraj Site', logistics: 'Logistics', rig: 'Abraj Rig', hoist: 'Abraj Hoist',
};
const COLOR = {
  site: '#d62728', logistics: '#1f77b4', rigActive: '#2ca02c', hoistActive: '#ff7f0e', inactive: '#7f7f7f',
};

function pointColor(p: MapPoint): string {
  if (p.status !== 'active') return COLOR.inactive;
  if (p.category === 'site') return COLOR.site;
  if (p.category === 'logistics') return COLOR.logistics;
  if (p.category === 'hoist') return COLOR.hoistActive;
  return COLOR.rigActive;
}

export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export default function MapView() {
  const { role } = useAuth();
  const toast = useToast();
  const admin = isPrivileged(role);
  const [adminOn, setAdminOn] = useState(false);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  // distance calc
  const [fromId, setFromId] = useState(''); const [toId, setToId] = useState('');
  const [routeResult, setRouteResult] = useState('');
  // trip planner
  const [tripFrom, setTripFrom] = useState(''); const [tripTo, setTripTo] = useState('');
  const [tcName, setTcName] = useState(''); const [tcLat, setTcLat] = useState(''); const [tcLng, setTcLng] = useState('');
  const [tripRate, setTripRate] = useState('0.45'); const [tripFee, setTripFee] = useState('25');
  const [tripOrder, setTripOrder] = useState('');
  const [orders, setOrders] = useState<Array<{ id: string; order_no: string }>>([]);
  const [tripResult, setTripResult] = useState<null | { km: number; cost: number }>(null);
  // matrix
  const [matrixFrom, setMatrixFrom] = useState('');
  const [matrix, setMatrix] = useState<Array<{ name: string; km: number }>>([]);
  // modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [fName, setFName] = useState(''); const [fCat, setFCat] = useState<MapPoint['category']>('site');
  const [fStatus, setFStatus] = useState<MapPoint['status']>('active');
  const [fLat, setFLat] = useState(''); const [fLng, setFLng] = useState(''); const [fDesc, setFDesc] = useState('');

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const openModalRef = useRef<(p?: MapPoint) => void>(() => undefined);
  const deleteRef = useRef<(id: string) => void>(() => undefined);
  const adminOnRef = useRef(false);
  adminOnRef.current = adminOn && admin;

  const load = useCallback(async () => {
    if (!supabase) return;
    const [pts, tr, ord] = await Promise.all([
      supabase.from('map_locations').select('*').order('name'),
      supabase.from('planned_trips').select('*').order('created_at', { ascending: false }).limit(15),
      supabase.from('pipe_orders').select('id, order_no').in('status', ['requested', 'approved', 'picked', 'in_transit']),
    ]);
    if (!pts.error) setPoints((pts.data ?? []) as MapPoint[]);
    if (!tr.error) setTrips((tr.data ?? []) as Trip[]);
    if (!ord.error) setOrders((ord.data ?? []) as Array<{ id: string; order_no: string }>);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const byId = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);
  const coord = (id: string): [number, number] | null => {
    const p = byId.get(id);
    return p ? [Number(p.lat), Number(p.lng)] : null;
  };

  // ---- map init + markers -----------------------------------------------------
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current).setView([21.5, 57.0], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '© OpenStreetMap contributors',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!adminOnRef.current) return;
      openModalRef.current();
      setFLat(e.latlng.lat.toFixed(6));
      setFLng(e.latlng.lng.toFixed(6));
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const p of points) {
      const marker = L.circleMarker([Number(p.lat), Number(p.lng)], {
        radius: 7, color: '#00000055', weight: 1, fillColor: pointColor(p), fillOpacity: 0.95,
      }).addTo(layer);
      const el = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = p.name;
      el.appendChild(title);
      el.appendChild(document.createElement('br'));
      el.appendChild(document.createTextNode(`${CAT_LABEL[p.category]} · ${p.status}`));
      if (p.notes) {
        el.appendChild(document.createElement('br'));
        const n = document.createElement('span');
        n.style.color = '#555';
        n.textContent = p.notes;
        el.appendChild(n);
      }
      if (adminOnRef.current) {
        el.appendChild(document.createElement('br'));
        const mk = (label: string, cls: string, fn: () => void) => {
          const b = document.createElement('button');
          b.className = `amap-popup-btn ${cls}`; b.textContent = label; b.onclick = fn;
          el.appendChild(b);
        };
        mk('Edit', 'edit', () => openModalRef.current(p));
        mk('Delete', 'delete', () => deleteRef.current(p.id));
      }
      marker.bindPopup(el);
    }
  }, [points, adminOn, admin]);

  // ---- admin CRUD ---------------------------------------------------------------
  const openModal = useCallback((p?: MapPoint) => {
    setEditId(p?.id ?? null);
    setFName(p?.name ?? '');
    setFCat(p?.category ?? 'site');
    setFStatus(p?.status ?? 'active');
    setFLat(p ? String(p.lat) : '');
    setFLng(p ? String(p.lng) : '');
    setFDesc(p?.notes ?? '');
    setModalOpen(true);
  }, []);
  openModalRef.current = openModal;

  const savePoint = async () => {
    if (!supabase) return;
    const lat = Number(fLat), lng = Number(fLng);
    if (!fName.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast('Name, latitude and longitude are required.', 'error'); return;
    }
    const row = { name: fName.trim(), category: fCat, status: fStatus, lat, lng, notes: fDesc || null };
    const { error } = editId
      ? await supabase.from('map_locations').update(row).eq('id', editId)
      : await supabase.from('map_locations').insert(row);
    if (error) { toast(`Save failed. ${error.message}`, 'error'); return; }
    toast(editId ? 'Location updated.' : 'Location added.', 'success');
    setModalOpen(false);
    await load();
  };

  const deletePoint = useCallback(async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from('map_locations').delete().eq('id', id);
    if (error) toast(`Delete failed. ${error.message}`, 'error');
    else { toast('Location deleted.', 'success'); await load(); }
  }, [load, toast]);
  deleteRef.current = (id) => { void deletePoint(id); };

  // ---- distance tools -------------------------------------------------------------
  const calcRoute = () => {
    const a = coord(fromId), b = coord(toId);
    if (!a || !b) { setRouteResult('Choose both points.'); return; }
    setRouteResult(`Straight-line distance: ${haversineKm(a, b).toFixed(1)} km (no road routing — coordinates never leave this system)`);
  };

  const tripDest = (): { name: string; c: [number, number] } | null => {
    if (tripTo === '__custom__') {
      const lat = Number(tcLat), lng = Number(tcLng);
      if (!tcName.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { name: tcName.trim(), c: [lat, lng] };
    }
    const p = byId.get(tripTo);
    return p ? { name: p.name, c: [Number(p.lat), Number(p.lng)] } : null;
  };

  const calcTrip = () => {
    const a = coord(tripFrom); const dest = tripDest();
    if (!a || !dest) { toast('Choose an origin and a destination.', 'error'); return; }
    const km = haversineKm(a, dest.c);
    const cost = km * Number(tripRate || 0) + Number(tripFee || 0);
    setTripResult({ km, cost });
  };

  const saveTrip = async () => {
    if (!supabase || !tripResult) return;
    const dest = tripDest();
    if (!dest) return;
    const { error } = await supabase.from('planned_trips').insert({
      origin_location_id: tripFrom,
      dest_location_id: tripTo === '__custom__' ? null : tripTo,
      dest_name: tripTo === '__custom__' ? dest.name : null,
      dest_lat: tripTo === '__custom__' ? dest.c[0] : null,
      dest_lng: tripTo === '__custom__' ? dest.c[1] : null,
      rate_per_km: Number(tripRate || 0), fixed_fee: Number(tripFee || 0),
      distance_km: Number(tripResult.km.toFixed(1)), cost: Number(tripResult.cost.toFixed(2)),
      order_id: tripOrder || null,
    });
    if (error) toast(`Save failed. ${error.message}`, 'error');
    else { toast('Planned trip saved.', 'success'); await load(); }
  };

  const calcMatrix = () => {
    const a = coord(matrixFrom);
    if (!a) return;
    setMatrix(points
      .filter((p) => p.id !== matrixFrom)
      .map((p) => ({ name: p.name, km: haversineKm(a, [Number(p.lat), Number(p.lng)]) }))
      .sort((x, y) => x.km - y.km));
  };

  const exportData = () => downloadJson('abraj-map-data.json', { points, trips });

  const selOptions = points.map((p) => <option key={p.id} value={p.id}>{p.name}</option>);

  return (
    <section className="view" id="view-map">
      <div className="section-head">
        <div className="section-title">Asset &amp; Logistics Map</div>
        <div className="section-sub">Oman sites, rigs, hoists &amp; logistics — editable locations</div>
      </div>

      <div className="amap-layout">
        <div className="amap-mapwrap"><div id="amap-canvas" ref={mapEl} /></div>

        <div className="amap-sidebar">
          <div className="amap-card">
            <div className="amap-toggle-wrap">
              <strong>Admin Mode</strong>
              <label className="amap-switch">
                <input id="amap-adminToggle" type="checkbox" checked={adminOn && admin} disabled={!admin}
                  onChange={(e) => setAdminOn(e.target.checked)} />
                <span className="amap-slider" />
              </label>
            </div>
            <div className="amap-note">
              {admin
                ? 'Turn on to add, edit or delete locations. Changes are saved to the shared database.'
                : 'Editing locations requires the administrator role.'}
            </div>
            {adminOn && admin && (
              <div className="amap-banner" id="amap-adminBanner">
                Admin mode active — click the map to add a location, or use the marker popups to edit/delete.
              </div>
            )}
          </div>

          <div className="amap-card">
            <h4>Legend</h4>
            <div className="amap-legend">
              <div><span className="amap-dot" style={{ background: COLOR.site }} />Abraj Site</div>
              <div><span className="amap-dot" style={{ background: COLOR.logistics }} />Logistics</div>
              <div><span className="amap-dot" style={{ background: COLOR.rigActive }} />Abraj Rig (Active)</div>
              <div><span className="amap-dot" style={{ background: COLOR.hoistActive }} />Abraj Hoist (Active)</div>
              <div><span className="amap-dot" style={{ background: COLOR.inactive }} />Rig/Hoist (Inactive/Expired)</div>
            </div>
          </div>

          <div className="amap-card">
            <h4>Distance Calculator</h4>
            <label className="amap-label">From</label>
            <select id="amap-fromSelect" className="amap-select" value={fromId} onChange={(e) => setFromId(e.target.value)}>
              <option value="">— point —</option>{selOptions}
            </select>
            <label className="amap-label">To</label>
            <select id="amap-toSelect" className="amap-select" value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">— point —</option>{selOptions}
            </select>
            <button id="amap-calcRouteBtn" className="btn sm alt" style={{ width: '100%' }} onClick={calcRoute}>
              Calculate Distance
            </button>
            {routeResult && <div id="amap-routeResult" className="amap-result" style={{ display: 'block' }}>{routeResult}</div>}
          </div>

          <div className="amap-card">
            <h4>Trip Cost &amp; Planning</h4>
            <label className="amap-label">Origin</label>
            <select id="trip-fromSelect" className="amap-select" value={tripFrom} onChange={(e) => setTripFrom(e.target.value)}>
              <option value="">— origin —</option>{selOptions}
            </select>
            <label className="amap-label">Destination</label>
            <select id="trip-toSelect" className="amap-select" value={tripTo} onChange={(e) => { setTripTo(e.target.value); setTripResult(null); }}>
              <option value="">— destination —</option>
              {selOptions}
              <option value="__custom__">+ New destination (not on map)</option>
            </select>
            {tripTo === '__custom__' && (
              <div id="trip-custom-fields">
                <input id="trip-custom-name" className="amap-input" placeholder="Destination name" value={tcName} onChange={(e) => setTcName(e.target.value)} />
                <div className="amap-row">
                  <input id="trip-custom-lat" className="amap-input" placeholder="Lat" value={tcLat} onChange={(e) => setTcLat(e.target.value)} />
                  <input id="trip-custom-lng" className="amap-input" placeholder="Lng" value={tcLng} onChange={(e) => setTcLng(e.target.value)} />
                </div>
              </div>
            )}
            <div className="amap-row">
              <div>
                <label className="amap-label">Rate (OMR/km)</label>
                <input id="trip-rate" className="amap-input" value={tripRate} onChange={(e) => setTripRate(e.target.value)} />
              </div>
              <div>
                <label className="amap-label">Fixed Dispatch Fee</label>
                <input id="trip-fee" className="amap-input" value={tripFee} onChange={(e) => setTripFee(e.target.value)} />
              </div>
            </div>
            <label className="amap-label">Link to Pipe Request (optional)</label>
            <select id="trip-order-link" className="amap-select" value={tripOrder} onChange={(e) => setTripOrder(e.target.value)}>
              <option value="">— none —</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.order_no}</option>)}
            </select>
            <button id="trip-calc-btn" className="btn sm alt" style={{ width: '100%' }} onClick={calcTrip}>Calculate Trip Cost</button>
            {tripResult && (
              <div id="trip-cost-result" className="amap-result" style={{ display: 'block' }}>
                {tripResult.km.toFixed(1)} km straight-line ·{' '}
                <span className="trip-cost-chip">OMR {tripResult.cost.toFixed(2)}</span>
              </div>
            )}
            {admin && tripResult && (
              <button id="trip-save-btn" className="btn sm" style={{ width: '100%', marginTop: 8 }} onClick={() => void saveTrip()}>
                + Save as Planned Trip (Admin)
              </button>
            )}
            <div id="trip-list" style={{ marginTop: 10 }}>
              {trips.map((t) => (
                <div key={t.id} style={{ fontSize: 10.5, color: 'var(--text-3)', padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
                  <span className="mono">{byId.get(t.origin_location_id)?.name ?? '…'} → {t.dest_location_id ? byId.get(t.dest_location_id)?.name ?? '…' : t.dest_name}</span>
                  <span className="trip-cost-chip" style={{ marginLeft: 6, marginTop: 0 }}>{Number(t.distance_km).toFixed(0)} km · OMR {Number(t.cost).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="amap-card">
            <h4>Full Distance Matrix</h4>
            <label className="amap-label">Point</label>
            <select id="amap-matrixSelect" className="amap-select" value={matrixFrom} onChange={(e) => setMatrixFrom(e.target.value)}>
              <option value="">— point —</option>{selOptions}
            </select>
            <button id="amap-matrixBtn" className="btn sm alt" style={{ width: '100%' }} onClick={calcMatrix}>
              Get Distances From This Point
            </button>
            {matrix.length > 0 && (
              <div id="amap-matrixResult" className="amap-matrix-result">
                <table>
                  <thead><tr><th>Destination</th><th>km</th></tr></thead>
                  <tbody>
                    {matrix.map((m) => (
                      <tr key={m.name}><td>{m.name}</td><td>{m.km.toFixed(1)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="amap-note">Distances are straight-line (haversine); coordinates never leave this system.</div>
          </div>

          <div className="amap-card">
            <h4>Data Management</h4>
            <button id="amap-exportBtn" className="amap-file-label" onClick={exportData}>Export Map Data (JSON)</button>
            <div className="amap-note">
              Locations and planned trips live in the shared database — every device sees the same map.
            </div>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="amap-modal-overlay" id="amap-modalOverlay" onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="amap-modal-box">
            <h3 id="amap-modalTitle">{editId ? 'Edit Location' : 'Add Location'}</h3>
            <label className="amap-label">Name</label>
            <input id="amap-fName" className="amap-input" value={fName} onChange={(e) => setFName(e.target.value)} />
            <label className="amap-label">Category</label>
            <select id="amap-fCategory" className="amap-select" value={fCat} onChange={(e) => setFCat(e.target.value as MapPoint['category'])}>
              <option value="site">Abraj Site</option>
              <option value="logistics">Logistics</option>
              <option value="rig">Abraj Rig</option>
              <option value="hoist">Abraj Hoist</option>
            </select>
            <label className="amap-label">Status</label>
            <select id="amap-fStatus" className="amap-select" value={fStatus} onChange={(e) => setFStatus(e.target.value as MapPoint['status'])}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="expired">Expired</option>
            </select>
            <div className="amap-row">
              <div>
                <label className="amap-label">Lat</label>
                <input id="amap-fLat" className="amap-input" value={fLat} onChange={(e) => setFLat(e.target.value)} />
              </div>
              <div>
                <label className="amap-label">Lng</label>
                <input id="amap-fLng" className="amap-input" value={fLng} onChange={(e) => setFLng(e.target.value)} />
              </div>
            </div>
            <label className="amap-label">Description / Field / Notes</label>
            <textarea id="amap-fDesc" className="amap-textarea" rows={3} value={fDesc} onChange={(e) => setFDesc(e.target.value)} />
            <div className="form-actions" style={{ marginTop: 4, paddingTop: 12 }}>
              <button className="btn sm" id="amap-saveBtn" onClick={() => void savePoint()}>Save</button>
              <button className="btn sm alt" id="amap-cancelBtn" onClick={() => setModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
