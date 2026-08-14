// ============================================================================
//  Inspection module — shared types & display constants. DB enum values are
//  snake_case; labels reproduce the source system's wording exactly.
// ============================================================================

export type InspCategory =
  | 'well_control' | 'hoisting' | 'circulation' | 'drilling'
  | 'rotary' | 'power' | 'others';

export const CATEGORY_ORDER: InspCategory[] =
  ['well_control', 'hoisting', 'circulation', 'drilling', 'rotary', 'power', 'others'];

export const CATEGORY_LABELS: Record<InspCategory, string> = {
  well_control: 'Well Control Equipment',
  hoisting: 'Hoisting System',
  circulation: 'Circulation System',
  drilling: 'Drilling Equipment',
  rotary: 'Rotary System',
  power: 'Power System',
  others: 'Others',
};

export type WorkingStatus =
  | 'in_use' | 'never_been_used' | 'not_applicable' | 'defected' | 'scrapped';

export const WORKING_STATUS_LABELS: Record<WorkingStatus, string> = {
  in_use: 'In Use',
  never_been_used: 'Never Been Used',
  not_applicable: 'Not Applicable',
  defected: 'Defected',
  scrapped: 'Scrapped',
};

export type ApproveStatus = 'pending_approval' | 'approved' | 'rejected';

export const APPROVE_STATUS_LABELS: Record<ApproveStatus, string> = {
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
};

export const INTERMEDIATE_FREQUENCIES = [6, 12, 24, 36, 48, 60] as const;
export const MAJOR_FREQUENCIES = [6, 12, 24, 36, 48, 60, 120, 144] as const;

/** 6 → "6 Months", 12 → "1 Year", 24 → "2 Year" … (source system wording). */
export function frequencyLabel(months: number): string {
  return months < 12 ? `${months} Months` : `${months / 12} Year`;
}

export interface EquipmentType {
  id: string; category: InspCategory; name: string; description: string;
  specFields: string[]; active: boolean;
}
export interface EquipmentPart {
  id: string; typeId: string; name: string; description: string; position: number;
}
export interface PartComponent {
  id: string; partId: string; name: string; description: string; position: number;
}
export interface Company { id: string; name: string }
export interface InspUnit { id: string; name: string; unitType: 'rig' | 'hoist' | 'other' }

export interface InspectionRecord {
  id: string;
  typeId: string; partId: string | null; componentId: string | null;
  unitId: string; companyId: string | null;
  componentDescription: string; oem: string; inspectionCompany: string;
  serialNumber: string; partNumber: string;
  workingStatus: WorkingStatus; manufactureYear: number | null;
  intermediateDate: string | null; intermediateFreqMonths: number | null;
  intermediateDueDate: string | null;
  majorDate: string | null; majorFreqMonths: number | null;
  majorDueDate: string | null;
  remarks: string; specs: Record<string, string>;
  approveStatus: ApproveStatus; approverId: string | null; rejectReason: string | null;
  // joined labels from insp_records_expanded
  category: InspCategory; typeName: string; specFields: string[];
  partName: string | null; componentName: string | null;
  unitName: string; companyName: string | null;
  /** Audit columns carried by insp_records_expanded (`select r.*`). */
  createdAt?: string | null; createdBy?: string | null;
}

export type FileKind =
  | 'oem_certificate' | 'user_manual' | 'spare_parts_manual' | 'drawing'
  | 'inspection_certificate' | 'major_inspection_certificate' | 'other';

export const FILE_KIND_LABELS: Record<FileKind, string> = {
  oem_certificate: 'OEM Certificate',
  user_manual: 'User Manual',
  spare_parts_manual: 'Spare Parts Manual',
  drawing: 'Drawing',
  inspection_certificate: 'Inspection Certificate',
  major_inspection_certificate: 'Major Inspection Certificate',
  other: 'Other',
};

/** Kinds that may carry an expiry date (certificates). */
export const CERTIFICATE_KINDS: FileKind[] =
  ['oem_certificate', 'inspection_certificate', 'major_inspection_certificate'];

export interface InspFile {
  id: string; recordId: string; kind: FileKind; storagePath: string;
  fileName: string; fileSize: number; expiryDate: string | null; createdAt: string;
}
