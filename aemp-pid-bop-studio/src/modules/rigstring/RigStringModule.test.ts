import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RigStringModule, { RIG_STRING_SRC } from './RigStringModule';

describe('RigStringModule', () => {
  it('serves the prototype from the public root', () => {
    expect(RIG_STRING_SRC).toBe('/rig-string-builder.html');
  });

  it('renders a full-height iframe pointing at the verbatim asset', () => {
    const html = renderToStaticMarkup(createElement(RigStringModule));
    expect(html).toContain('<iframe');
    expect(html).toContain(`src="${RIG_STRING_SRC}"`);
    expect(html).toContain('title="Rig String Builder — BHA · Pipe Tally · Ton-Mile"');
  });
});
