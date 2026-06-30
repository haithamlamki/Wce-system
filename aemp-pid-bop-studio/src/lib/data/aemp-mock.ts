// ============================================================================
//  Mock AEMP equipment payload (FR-36 integration prep).
//  Deliberately uses AEMP-style field names that DIFFER from our internal
//  AempAsset shape, so the field-map adapter (aemp.ts mapAempRecords) is
//  exercised end-to-end without a live backend. Swap for the real endpoint by
//  setting VITE_AEMP_ENDPOINT (+ VITE_AEMP_FIELDMAP) once AEMP supplies them.
// ============================================================================
import type { AempFieldMap } from '../aemp';

/** Maps the mock's foreign field names → our internal AempAsset fields. */
export const AEMP_MOCK_FIELDMAP: AempFieldMap = {
  assetId: 'id',
  tag: 'equipmentTag',
  type: 'symbolType',
  section: 'system',
  description: 'name',
  rwp: 'ratedWP',
  size: 'nominalSize',
  manufacturer: 'mfr',
  serial: 'serialNo',
  int_last: 'interimLast',
  int_due: 'interimDue',
  maj_last: 'majorLast',
  maj_due: 'majorDue',
};

/** A small AEMP-shaped sample (field names match AEMP_MOCK_FIELDMAP sources). */
export const AEMP_MOCK_RECORDS: Array<Record<string, unknown>> = [
  { id: 'AEMP-001', equipmentTag: 'ANN', symbolType: 'annular', system: 'BOP/Kill/Choke', name: 'Annular BOP', ratedWP: '10000', nominalSize: '13-5/8"', mfr: 'Cameron', serialNo: 'SN-ANN-01', interimLast: '2025-06-01', interimDue: '2026-06-01', majorLast: '2023-06-01', majorDue: '2028-06-01' },
  { id: 'AEMP-002', equipmentTag: 'RAM1', symbolType: 'dram', system: 'BOP/Kill/Choke', name: 'Double Ram BOP', ratedWP: '10000', nominalSize: '13-5/8"', mfr: 'Cameron', serialNo: 'SN-RAM-01', interimLast: '2025-03-15', interimDue: '2026-03-15', majorLast: '2023-03-15', majorDue: '2028-03-15' },
  { id: 'AEMP-003', equipmentTag: 'C1', symbolType: 'gate', system: 'Choke Manifold', name: 'Gate Valve', ratedWP: '15000', nominalSize: '3-1/16"', mfr: 'FMC', serialNo: 'SN-GV-101', interimLast: '2024-12-01', interimDue: '2025-12-01', majorLast: '2022-12-01', majorDue: '2027-12-01' },
  { id: 'AEMP-004', equipmentTag: 'PG1', symbolType: 'gauge', system: 'Instruments', name: 'Pressure Gauge', ratedWP: '15000', nominalSize: '2"', mfr: 'Ashcroft', serialNo: 'SN-PG-007', interimLast: '2025-01-20', interimDue: '2026-01-20', majorLast: '2023-01-20', majorDue: '2028-01-20' },
];
