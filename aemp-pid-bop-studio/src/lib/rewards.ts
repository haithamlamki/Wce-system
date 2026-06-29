// ============================================================================
//  Well Control Steward rewards / gamification  (PRD §7.13, FR-49..55)
//  Points, tiers, trophy cabinet and redemption catalogue, ported from the
//  prototype. Point values are configurable (FR-50).
// ============================================================================
import type { Component, Project } from '../types';
import { statusOf } from './status';

export interface Tier {
  n: string;
  min: number;
  c: string;
}

export const TIERS: Tier[] = [
  { n: 'Bronze', min: 0, c: '#b08d57' },
  { n: 'Silver', min: 300, c: '#9aa7b3' },
  { n: 'Gold', min: 900, c: '#c9981c' },
  { n: 'Platinum', min: 1800, c: '#3fb6bf' },
  { n: 'Diamond', min: 3500, c: '#6a8bd6' },
];

/** Configurable point weights (FR-50). */
export const POINTS = {
  tag: 10, // +10 per tagged component
  dueDates: 5, // +5 per item with due dates
  inDate: 8, // +8 per in-date item
  bop: 30, // +30 for building a BOP scheme
  master: 50, // +50 for loading the master P&ID (has piping)
} as const;

export interface RewardStats {
  total: number;
  tagged: number;
  dated: number;
  ok: number;
  over: number;
  due: number;
  comp: number; // compliance ratio (in-date / tagged)
  bop: number;
  pipes: number;
  pts: number;
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  on: (s: RewardStats) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', name: 'First Tag', desc: 'Tag your first item', on: (s) => s.tagged >= 1 },
  { id: 'ten', name: 'On a Roll', desc: 'Tag 10 items', on: (s) => s.tagged >= 10 },
  { id: 'cent', name: 'Centurion', desc: 'Track 100+ items', on: (s) => s.total >= 100 },
  { id: 'piped', name: 'Master Layout', desc: 'Load the full master P&ID', on: (s) => s.pipes > 0 },
  { id: 'full', name: 'Fully Tagged', desc: 'Every item tagged', on: (s) => s.total > 0 && s.tagged === s.total },
  { id: 'dated', name: 'On the Calendar', desc: 'Add due dates to 20 items', on: (s) => s.dated >= 20 },
  { id: 'stack', name: 'Stack Builder', desc: 'Build a BOP scheme', on: (s) => s.bop > 0 },
  { id: 'clear', name: 'All Clear', desc: 'No overdue equipment', on: (s) => s.tagged > 0 && s.over === 0 },
  { id: 'comp', name: 'Compliance Pro', desc: '90%+ in date', on: (s) => s.tagged > 0 && s.comp >= 0.9 },
  { id: 'perfect', name: 'Perfect Stack', desc: '100% tagged & in date', on: (s) => s.total > 0 && s.tagged === s.total && s.comp === 1 },
];

export interface RewardItem {
  id: string;
  name: string;
  cost: number;
}

export const REWARDS: RewardItem[] = [
  { id: 'shout', name: 'Toolbox-talk shout-out', cost: 150 },
  { id: 'pin', name: 'Safety Star pin', cost: 300 },
  { id: 'lunch', name: 'Crew lunch voucher', cost: 600 },
  { id: 'cap', name: 'Custom rig cap', cost: 900 },
  { id: 'off', name: 'Half-day early off', cost: 1500 },
  { id: 'champ', name: 'Safety Champion award', cost: 2500 },
];

/** Derive reward stats + points from real project state (FR-50). */
export function rewardStats(project: Project, refDate?: Date): RewardStats {
  const n: Component[] = project.nodes;
  const tagged = n.filter((x) => x.tag);
  const dated = tagged.filter((x) => x.int_due || x.maj_due);
  const ok = tagged.filter((x) => statusOf(x, refDate) === 'ok');
  const over = tagged.filter((x) => statusOf(x, refDate) === 'over');
  const due = tagged.filter((x) => statusOf(x, refDate) === 'due');
  const comp = tagged.length ? ok.length / tagged.length : 0;
  const bop = project.bop?.items?.length ?? 0;
  const pipes = project.pipes?.length ?? 0;
  const pts =
    tagged.length * POINTS.tag +
    dated.length * POINTS.dueDates +
    ok.length * POINTS.inDate +
    (bop ? POINTS.bop : 0) +
    (pipes ? POINTS.master : 0);
  return { total: n.length, tagged: tagged.length, dated: dated.length, ok: ok.length, over: over.length, due: due.length, comp, bop, pipes, pts };
}

/** Highest tier reached at a given point total. */
export function tierOf(points: number): Tier {
  let t = TIERS[0];
  for (const x of TIERS) if (points >= x.min) t = x;
  return t;
}
