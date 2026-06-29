// 172-component Rig 303 WCE inspection dataset — embedded offline cache /
// fallback for the AEMP equipment import (see lib/aemp.ts). Raw records live in
// rig303-equipment.json so the Node seed script (scripts/seed-equipment.mjs)
// can share them with the Supabase `equipment` table.
import type { AempAsset } from '../../types';
import data from './rig303-equipment.json';

export const RIG303_EQUIPMENT: AempAsset[] = data as AempAsset[];

export default RIG303_EQUIPMENT;
