import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firstValueFrom } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { OperatorFeedRealtimeService } from '../dist/apps/api/src/operator-feed-realtime.js';

test('operator feed notifications stay within their channel and contain no event payload', async () => {
  const realtime = new OperatorFeedRealtimeService();
  const update = firstValueFrom(realtime.stream('channel-a').pipe(
    filter((event) => event.type === 'feed.updated'), take(1),
  ));
  realtime.publish('channel-b', 'chat');
  realtime.publish('channel-a', 'donation');
  assert.deepEqual(await update, { type: 'feed.updated', data: 'donation' });
});
