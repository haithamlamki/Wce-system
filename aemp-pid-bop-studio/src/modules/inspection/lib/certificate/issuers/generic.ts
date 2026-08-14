// ============================================================================
//  Generic labelling — the rules that hold regardless of who issued the paper.
//
//  Only spellings that are genuinely house-independent belong here. A slashed
//  rig label ("Rig /Unit") or a named table ("INSPECTED ITEMS DETAILS") is
//  Bureau Veritas layout, not general practice, and lives in that strategy.
//
//  This is also the UNKNOWN issuer's strategy. It runs the same generic labels
//  but caps confidence at medium: with no recognised issuer behind it, nothing
//  read from the page has been corroborated by a known layout, so no value may
//  present itself as certain. Fields the generic labels do not cover stay blank
//  rather than being guessed at.
// ============================================================================
import type { LabelSet } from '../document';
import type { IssuerStrategy } from './types';

export const GENERIC_LABELS: LabelSet = {
  certificateNumber: ['report number', 'certificate number', 'certificate no', 'cert no',
    'report no', 'job no.', 'job no'],
  serialNumber: ['serial number', 'serial no', 'serial #', 's/n', 'ser no', 'serial'],
  oem: ['manufacturer', 'maker', 'oem', 'make'],
  inspectionCompany: ['inspection company', 'test house', 'issued by', 'certifying authority'],
  customer: ['customer name', 'end user', 'customer'],
  // No bare "rig": it matches inside its own value ("Rig /Unit RIG 304") and
  // inside prose such as "Rigs 106 & 107". The slashed spellings are Bureau
  // Veritas's and live in that strategy.
  unit: ['rig number', 'rig no', 'unit number'],
  equipmentDescription: ['equipment description', 'description of equipment',
    'item description', 'description'],
  partNumber: ['part number', 'part no', 'p/n', 'model number', 'model no'],
  inspectionDate: ['date of inspection', 'date of test', 'inspection date', 'test date',
    'date of examination', 'date tested', 'examination date'],
  nextDueDate: ['date of expiry', 'next inspection date', 'next inspection due',
    'next due date', 'expiry date', 'next due', 'next test date', 'valid until',
    're-test date', 'retest date', 'next examination', 'due date'],
  inspectionType: ['inspection type', 'inspection category'],
  workingPressure: ['max working pressure', 'working pressure', 'mawp'],
  testPressure: ['hydrostatic test pressure', 'test pressure', 'tested at'],
  manufactureYear: ['year of manufacture', 'manufacture year', 'date of manufacture',
    'year built', 'mfg year'],
};

/**
 * The unknown issuer. Claims nothing — the registry falls back to it when no
 * strategy's signals reach the threshold — and never exceeds medium confidence.
 */
export const GENERIC_STRATEGY: IssuerStrategy = {
  id: 'unknown',
  displayName: 'Unrecognised issuer',
  signals: [],
  maxConfidence: 'medium',
};
