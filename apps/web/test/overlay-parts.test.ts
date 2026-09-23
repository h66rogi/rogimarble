import assert from 'node:assert/strict';
import test from 'node:test';
import { OVERLAY_PARTS, isOverlayPartId, overlayPartUrl } from '../src/domains/marble/overlay-parts.ts';

test('every overlay part has a distinct OBS URL with a recommended source size', () => {
  assert.equal(new Set(OVERLAY_PARTS.map((part) => part.id)).size, 7);
  for (const part of OVERLAY_PARTS) {
    assert.ok(part.width > 0 && part.height > 0);
    assert.equal(overlayPartUrl('https://example.test/overlay#token=secret', part.id), `https://example.test/overlay/${part.id}#token=secret`);
    assert.equal(isOverlayPartId(part.id), true);
  }
  assert.equal(isOverlayPartId('unknown'), false);
});
