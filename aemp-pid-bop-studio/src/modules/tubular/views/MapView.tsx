// ============================================================================
//  Asset & Logistics Map — bundled Leaflet (no CDN scripts; CSP untouched for
//  scripts, OSM raster tiles allowed via img-src). NO external routing: per
//  the approved decision, rig coordinates never leave our infrastructure —
//  distances are straight-line (haversine) and in-transit shipments render as
//  arcs. Unit coordinates are editable by privileged users only (units RLS).
//  Note: map tiles request only tile x/y/z from openstreetmap.org — no
//  operational coordinates are transmitted as data.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../state/AuthContext';
import { isPrivileged } from '../lib/permissions';

interface MapUnit { id: string; name: string; unit_type: 'rig' | 'hoist'; latitude: number | null; longitude: number | null }
interface TransitLeg { from_unit_id: string; to_unit_id: string; label: string }

const OMAN_CENTER: [number, number] = [21.5, 57.0];

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
  const canEdit = isPrivileged(role);
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [unitsGeo, setUnitsGeo] = useState<MapUnit[]>([]);
  const [legs, setLegs] = useState<TransitLeg[]>([]);
  const [placing, setPlacing] = useState<string>(''); // unit id being placed
  const placingRef = useRef('');
  placingRef.current = placing;
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!supabase) return;
    const [u, mv, po] = await Promise.all([
      supabase.from('units').select('id, name, unit_type, latitude, longitude').eq('active', true).order('name'),
      supabase.from('tubular_movements').select('from_unit_id, to_unit_id, quantity, status').eq('status', 'pending'),
      supabase.from('pipe_orders').select('requesting_unit_id, order_no, status').eq('status', 'in_transit'),
    ]);
    if (u.error) { setError(u.error.message); return; }
    setUnitsGeo((u.data ?? []) as MapUnit[]);
    const mLegs: TransitLeg[] = (mv.data ?? []).map((m) => ({
      from_unit_id: m.from_unit_id as string, to_unit_id: m.to_unit_id as string,
      label: `transfer ${m.quantity} jt`,
    }));
    setLegs(mLegs);
    void po; // orders lack a source unit column at order level; transit arcs come from movements
  }, []);

  useEffect(() => { void load(); }, [load]);

  // init map once
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current).setView(OMAN_CENTER, 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => {
      const unitId = placingRef.current;
      if (!unitId || !supabase) return;
      void supabase.from('units')
        .update({ latitude: e.latlng.lat, longitude: e.latlng.lng })
        .eq('id', unitId)
        .then(({ error: err }) => {
          if (err) setError(err.message);
          setPlacing('');
          void load();
        });
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [load]);

  const placed = useMemo(() => unitsGeo.filter((u) => u.latitude != null && u.longitude != null), [unitsGeo]);

  // redraw markers + arcs
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const pos = new Map(placed.map((u) => [u.id, [u.latitude as number, u.longitude as number] as [number, number]]));
    for (const u of placed) {
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${u.unit_type === 'hoist' ? '#1769b0' : '#d97706'};color:#fff;border-radius:8px;padding:2px 7px;font:700 11px monospace;white-space:nowrap;border:1px solid #0008">${u.name}</div>`,
        iconAnchor: [20, 10],
      });
      L.marker(pos.get(u.id) as [number, number], { icon }).addTo(layer);
    }
    for (const leg of legs) {
      const a = pos.get(leg.from_unit_id);
      const b = pos.get(leg.to_unit_id);
      if (!a || !b) continue;
      L.polyline([a, b], { color: '#f5a623', weight: 2, dashArray: '6 6' })
        .bindTooltip(`${leg.label} · ${haversineKm(a, b).toFixed(0)} km (straight line)`)
        .addTo(layer);
    }
  }, [placed, legs]);

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 16px', flexWrap: 'wrap' }}>
        {error && <span role="alert" style={{ color: 'var(--red)', fontSize: 12 }}>{error}</span>}
        <span style={{ color: 'var(--faint)', fontSize: 12 }}>
          {placed.length}/{unitsGeo.length} units placed · distances are straight-line; no coordinates leave this system
        </span>
        <div style={{ flex: 1 }} />
        {canEdit && (
          <>
            <select value={placing} onChange={(e) => setPlacing(e.target.value)}
              style={{ background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 7, padding: '5px 8px' }}
              aria-label="Place unit on map">
              <option value="">— set unit position —</option>
              {unitsGeo.map((u) => (
                <option key={u.id} value={u.id}>{u.name}{u.latitude == null ? ' (unplaced)' : ''}</option>
              ))}
            </select>
            {placing && <span style={{ color: 'var(--amber)', fontSize: 12, fontWeight: 600 }}>Click the map to place {unitsGeo.find((u) => u.id === placing)?.name}</span>}
          </>
        )}
      </div>
      <div ref={mapEl} style={{ flex: 1, minHeight: 0 }} />
    </div>
  );
}
