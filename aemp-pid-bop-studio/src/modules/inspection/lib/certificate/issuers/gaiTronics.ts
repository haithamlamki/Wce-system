// ============================================================================
//  GAI-Tronics — certificate of conformance (manufacturer, not a test house).
//
//  One representative document was available. Observed markers:
//
//    Certificate of Conformance
//    GAI-Tronics Job No.:            <- value on the FOLLOWING line
//    117320631 & 117291858
//    ... conformance with applicable GAI-Tronics Corporation test procedures ...
//    3030 Kutztown Road, Reading, PA 19605 USA
//    Phone: 610-777-1374 ... www.gai-tronics.com
//
//  This is a conformance statement, not an inspection: it carries no date of
//  inspection and no expiry, and the only date on the page is the signature
//  date beside "Quality Assurance Manager or Designee Date". Nothing here
//  supplies an inspection schedule, which is why the strategy adds no date
//  labels — a conformance date is not an inspection date, and inventing that
//  equivalence would put a wrong date into a compliance record.
// ============================================================================
import type { IssuerStrategy } from './types';

export const GAI_TRONICS: IssuerStrategy = {
  id: 'gai-tronics',
  displayName: 'GAI-Tronics (certificate of conformance)',
  signals: [
    { name: 'GAI-Tronics name', test: /gai-?tronics/i, weight: 'strong' },
    { name: 'GAI-Tronics domain', test: /gai-tronics\.com/i, weight: 'strong' },
    {
      name: 'Certificate of conformance wording',
      test: /certificate of conformance/i,
      weight: 'weak',
    },
  ],
  labels: {
    // Longer than the generic "job no.", so it wins the match and names itself
    // in the rule shown to the reviewer.
    certificateNumber: ['gai-tronics job no.', 'gai-tronics job no'],
  },
  // No inspection-date or expiry labels: this document type has neither.
};
