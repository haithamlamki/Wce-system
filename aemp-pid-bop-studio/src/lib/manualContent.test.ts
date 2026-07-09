import { describe, expect, it, vi } from 'vitest';

vi.mock('./symbols', () => ({
  SYM: {
    evil: {
      name: '<script>alert(1)</script>',
      cat: 'Valves',
      custom: true,
      defaults: { size: '"><img src=x onerror=alert(1)>' },
    },
  },
  SYM_ORDER: ['Valves'],
}));

import { symbolsGuideHtml } from './manualContent';

describe('symbolsGuideHtml', () => {
  it('escapes a malicious symbol name, key and default size (no raw <script>)', () => {
    const html = symbolsGuideHtml();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
  });
});
