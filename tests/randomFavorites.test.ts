import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createRandomFavorites, swipeDirection } from '../src/services/randomFavorites';
import type { Folder } from '../src/types';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const folder = (id: string, count: number): Folder => ({
  id,
  title: id,
  owner: 'me',
  cover: '',
  count,
});
function page(id: string, ids: number[], hasMore = false, invalid: number[] = []) {
  return new Response(
    JSON.stringify({
      code: 0,
      data: {
        info: { id: Number(id), title: id, media_count: ids.length },
        medias: ids.map((value) => ({
          id: value,
          type: 2,
          attr: invalid.includes(value) ? 9 : 0,
          title: `video ${value}`,
        })),
        has_more: hasMore,
      },
    }),
  );
}

test('random mode samples pages beyond the first page, only from selected folders', async () => {
  const requests: string[] = [];
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input));
    const id = url.searchParams.get('media_id')!;
    const pn = Number(url.searchParams.get('pn'));
    requests.push(`${id}:${pn}`);
    assert.ok(['999', '888'].includes(id));
    assert.equal(url.searchParams.get('type'), '0');
    assert.equal(new Headers(options?.headers).get('Cookie'), 'SESSDATA=private-session');
    return page(id, [Number(id) * 10 + pn]);
  };
  const deck = createRandomFavorites(
    [folder('999', 40), folder('888', 20)],
    'private-session',
    undefined,
    () => 0,
  );
  const picked: string[] = [];
  for (let i = 0; i < 5; i++) {
    const result = await deck.next();
    if (result.video) picked.push(result.video.id);
    if (!result.hasMore) break;
  }
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked).size, 3);
  assert.ok(requests[0]!.endsWith(':2'), 'random page jobs should not always begin at page 1');
  assert.deepEqual([...requests].sort(), ['888:1', '999:1', '999:2']);
});

test('duplicates across folders and unavailable videos never enter the random feed', async () => {
  globalThis.fetch = async (input) => {
    const id = new URL(String(input)).searchParams.get('media_id')!;
    return id === '999' ? page(id, [1, 2, 3], false, [3]) : page(id, [2, 4]);
  };
  const deck = createRandomFavorites(
    [folder('999', 3), folder('888', 2)],
    '',
    undefined,
    () => 0.5,
  );
  const picked: string[] = [];
  for (let i = 0; i < 6; i++) {
    const result = await deck.next();
    if (result.video) picked.push(result.video.id);
    if (!result.hasMore) break;
  }
  assert.deepEqual(picked.sort(), ['1', '2', '4']);
  assert.equal((await deck.next()).video, null);
});

test('stale folder counts discover further pages and empty collections are requested once', async () => {
  const requests: number[] = [];
  globalThis.fetch = async (input) => {
    const pn = Number(new URL(String(input)).searchParams.get('pn'));
    requests.push(pn);
    return page('999', pn === 1 ? [] : [1], pn === 1);
  };
  const deck = createRandomFavorites([folder('999', 0)], '', undefined, () => 0.5);
  assert.equal((await deck.next()).video?.id, '1');
  assert.deepEqual(requests, [1, 2]);
});

test('failed random pages remain retryable and canceled sessions stop before fetching', async () => {
  let fail = true;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return fail ? new Response(JSON.stringify({ code: -403, data: null })) : page('999', [1]);
  };
  const deck = createRandomFavorites([folder('999', 1)], 'session');
  await assert.rejects(deck.next(), /私密收藏夹/);
  fail = false;
  assert.equal((await deck.next()).video?.id, '1');
  assert.equal(calls, 2);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    createRandomFavorites([folder('999', 1)], '', controller.signal).next(),
    /取消/,
  );
  assert.equal(calls, 2);
});

test('vertical swipes switch clips while taps and horizontal progress gestures do not', () => {
  assert.equal(swipeDirection(3, -100, -0.2), 'next');
  assert.equal(swipeDirection(3, 100, 0.2), 'previous');
  assert.equal(swipeDirection(0, -30, -0.8), 'next');
  assert.equal(swipeDirection(120, -25, -1), null);
  assert.equal(swipeDirection(0, 12, 0.1), null);
  assert.equal(swipeDirection(0, 0, 0), null);
});
