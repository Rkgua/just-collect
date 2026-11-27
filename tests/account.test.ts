import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { fetchCurrentAccount, fetchMyFolders, assertAllowed } from '../src/services/bilibili';
import { createFavoriteQueue } from '../src/services/favoriteQueue';
import { ALL_FOLDERS, type Video } from '../src/types';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const success = (data: unknown) => new Response(JSON.stringify({ code: 0, data }));

test('own-account folder sync derives the UID from verified login and includes private folders', async () => {
  const urls: URL[] = [];
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input));
    urls.push(url);
    assert.equal(new Headers(options?.headers).get('Cookie'), 'SESSDATA=own-session');
    if (url.pathname.endsWith('/nav')) return success({ isLogin: true, mid: 42, uname: '我自己' });
    assert.equal(url.searchParams.get('up_mid'), '42');
    return success({
      count: 2,
      list: [
        { id: 999, title: '私密学习', attr: 3, media_count: 25 },
        { id: 888, title: '公开音乐', attr: 2, media_count: 10 },
      ],
    });
  };
  const result = await fetchMyFolders('own-session');
  assert.equal(result.account.id, '42');
  assert.equal(result.folders.length, 2);
  assert.equal(result.folders[0]?.private, true);
  assert.equal(result.folders[0]?.accountId, '42');
  assert.equal(result.folders[1]?.private, false);
  assert.equal(urls.length, 2);
});

test('sync does not enumerate folders when the session is missing or invalid', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return success({ isLogin: false, mid: 0 });
  };
  await assert.rejects(fetchMyFolders(''), /登录/);
  assert.equal(calls, 0);
  await assert.rejects(fetchMyFolders('expired'), /登录已失效/);
  assert.equal(calls, 1);
});

test('null folder payload is not treated as a successful empty library', async () => {
  globalThis.fetch = async (url) =>
    String(url).includes('/nav')
      ? success({ isLogin: true, mid: 42, uname: 'me' })
      : success({ count: 5, list: null });
  await assert.rejects(fetchMyFolders('token'), /没有返回收藏夹列表/);
});

test('account verification rejects a refused response', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ code: -101, data: null }));
  await assert.rejects(fetchCurrentAccount('expired'), /登录已失效/);
});

test('aggregate queue round-robins only chosen folders and deduplicates videos across pages', async () => {
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const id = url.searchParams.get('media_id')!;
    const page = Number(url.searchParams.get('pn'));
    requests.push(`${id}:${page}`);
    assert.ok(['999', '888'].includes(id));
    assert.equal(url.searchParams.get('type'), '0');
    const ids = id === '999' ? (page === 1 ? [1, 2] : [4]) : [2, 3];
    return success({
      info: { id: Number(id), title: id, media_count: 4 },
      medias: ids.map((n) => ({ id: n, type: 2, attr: 0, title: `video${n}` })),
      has_more: id === '999' && page === 1,
    });
  };
  const queue = createFavoriteQueue(['999', '888', '999'], 'token', '学习');
  const first = await queue.next();
  const second = await queue.next();
  const third = await queue.next();
  assert.deepEqual(
    first.videos.map((v) => v.id),
    ['1', '2'],
  );
  assert.deepEqual(
    second.videos.map((v) => v.id),
    ['3'],
  );
  assert.deepEqual(
    third.videos.map((v) => v.id),
    ['4'],
  );
  assert.deepEqual(requests, ['999:1', '888:1', '999:2']);
  assert.equal(third.hasMore, false);
  assert.deepEqual((await queue.next()).videos, []);
});

test('a failed folder page remains retryable rather than silently disappearing', async () => {
  let fail = true;
  const pages: string[] = [];
  globalThis.fetch = async (input) => {
    pages.push(new URL(String(input)).searchParams.get('pn')!);
    if (fail) return new Response(JSON.stringify({ code: -403, data: null }));
    return success({
      info: { id: 999, title: 'private', media_count: 0 },
      medias: [],
      has_more: false,
    });
  };
  const queue = createFavoriteQueue(['999'], 'token', '');
  await assert.rejects(queue.next(), /私密收藏夹/);
  fail = false;
  assert.equal((await queue.next()).hasMore, false);
  assert.deepEqual(pages, ['1', '1']);
});

test('aggregate playback retains source-folder membership checks', () => {
  const video: Video = {
    id: '1',
    bvid: '',
    title: 'test',
    folderId: '999',
    cover: '',
    author: '',
    duration: 0,
    views: 0,
    available: true,
  };
  assert.doesNotThrow(() => assertAllowed(video, [video], ALL_FOLDERS));
  assert.throws(() => assertAllowed({ ...video, folderId: '888' }, [video], ALL_FOLDERS));
  assert.throws(() => assertAllowed(video, [], ALL_FOLDERS));
});
