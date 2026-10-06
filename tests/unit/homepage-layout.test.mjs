import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../../css/style.css', import.meta.url), 'utf8');

test('homepage puts the results status and results action before the short process note', () => {
  const statusIndex = html.search(/class="[^"]*\breporting-status\b/);
  const resultsActionIndex = html.indexOf('href="results.html"');
  const explainerIndex = html.indexOf('class="how-it-works"');

  assert.notEqual(statusIndex, -1, 'results status panel exists');
  assert.notEqual(resultsActionIndex, -1, 'results action exists');
  assert.ok(statusIndex < explainerIndex, 'status is above the explainer');
  assert.ok(resultsActionIndex < explainerIndex, 'results action is above the explainer');
  assert.match(html, /live reporting is not open yet/i, 'unavailable service is disclosed');
  assert.doesNotMatch(html, /class="steps"/, 'large multi-step explainer is removed');
});

test('homepage header uses compact spacing on desktop and mobile', () => {
  assert.ok(css.includes('.home-hero{padding:24px 0 20px'), 'desktop header uses compact spacing');
  assert.ok(css.includes('@media(max-width:640px){') && css.includes('.home-hero{padding:10px 0 18px'), 'mobile header has tighter spacing');
});
