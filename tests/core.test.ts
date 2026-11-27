import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { parseFolderId, normalizeSession } from '../src/lib/folder';
import { duration } from '../src/lib/format';
import { assertAllowed, fetchFavorites, fetchParts, fetchStream } from '../src/services/bilibili';
import type { Video } from '../src/types';
import { resolveFolderId } from '../src/services/share';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const video: Video = {
  id: '123',
  bvid: 'BV123',
  folderId: '999',
  title: 'test',
  cover: '',
  author: 'UP',
  duration: 90,
  views: 1,
  available: true,
};
function mock(data: unknown, code = 0) {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ code, message: 'error', data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
}

test('accepts numeric IDs, shared text and Bilibili favorite URL formats', () => {
  assert.equal(parseFolderId(' 999 '), '999');
  assert.equal(parseFolderId('https://space.bilibili.com/123/favlist?fid=999&ftype=create'), '999');
  assert.equal(parseFolderId('分享收藏夹 https://www.bilibili.com/medialist/detail/ml999'), '999');
  assert.equal(parseFolderId('https://www.bilibili.com/list/ml999'), '999');
  assert.equal(parseFolderId('https://www.bilibili.com/medialist?media_id=999'), '999');
  assert.equal(
    parseFolderId('【周末收藏】 https://www.bilibili.com/list/ml999，来自哔哩哔哩'),
    '999',
  );
  assert.equal(parseFolderId('https://www.bilibili.com/medialist/play/ml999'), '999');
});

test('short share links resolve to a favorite without sending account cookies', async () => {
  let requested = '';
  let options: RequestInit | undefined;
  globalThis.fetch = async (url, init) => {
    requested = String(url);
    options = init;
    const response = new Response('');
    Object.defineProperty(response, 'url', { value: 'https://www.bilibili.com/list/ml999' });
    return response;
  };
  assert.equal(await resolveFolderId('【我的收藏夹】https://b23.tv/test，复制这段分享'), '999');
  assert.equal(requested, 'https://b23.tv/test');
  assert.equal(options?.credentials, 'omit');
  assert.equal(options?.headers, undefined);
});

test('short link resolution rejects video shares, external destinations and access errors', async () => {
  for (const destination of [
    'https://www.bilibili.com/video/BV123',
    'https://bilibili.com.evil.com/?fid=999',
  ]) {
    globalThis.fetch = async () => {
      const response = new Response('');
      Object.defineProperty(response, 'url', { value: destination });
      return response;
    };
    await assert.rejects(resolveFolderId('https://b23.tv/test'), /收藏夹/);
  }
  globalThis.fetch = async () => new Response('', { status: 404 });
  await assert.rejects(resolveFolderId('https://b23.tv/test'), /无法打开/);
});

test('numeric and full favorite links do not make a short-link network request', async () => {
  globalThis.fetch = async () => {
    throw new Error('unexpected request');
  };
  assert.equal(await resolveFolderId('999'), '999');
  assert.equal(await resolveFolderId('https://www.bilibili.com/list/ml999'), '999');
  await assert.rejects(resolveFolderId('https://evil.com/?fid=999'));
  await assert.rejects(resolveFolderId('https://b23.tv.evil.com/test'));
});
test('rejects video URLs, missing IDs, lookalike domains and malformed IDs', () => {
  for (const input of [
    '',
    '0',
    '-999',
    '1.5',
    'https://bilibili.com.evil.com/?fid=999',
    'https://evilbilibili.com/?fid=999',
    'https://www.bilibili.com/video/BV123',
    'https://b23.tv/abc',
    'https://space.bilibili.com/123?fid=foo',
  ])
    assert.throws(() => parseFolderId(input));
});
test('extracts only SESSDATA, rejecting cookie or header injection', () => {
  assert.equal(normalizeSession('SESSDATA=abc%2C123; bili_jct=secret'), 'abc%2C123');
  assert.equal(normalizeSession('abc,123'), 'abc,123');
  assert.equal(normalizeSession(''), '');
  assert.throws(() => normalizeSession('value\r\nCookie: secret'));
  assert.throws(() => normalizeSession('not a session'));
});
test('formats long videos without truncating hours', () => {
  assert.equal(duration(3661), '1:01:01');
  assert.equal(duration(90), '1:30');
  assert.equal(duration(-10), '0:00');
});
test('requires a valid video in the currently selected folder', () => {
  assert.doesNotThrow(() => assertAllowed(video, [video], '999'));
  assert.throws(() => assertAllowed(video, [], '999'));
  assert.throws(() => assertAllowed(video, [video], '888'));
  assert.throws(() => assertAllowed({ ...video, available: false }, [video], '999'));
  assert.throws(() => assertAllowed(video, [{ ...video, folderId: '888' }], '999'));
});
test('favorite requests stay scoped to one folder, paginate and skip non-video entries', async () => {
  let requested = '';
  let headers: HeadersInit | undefined;
  globalThis.fetch = async (url, options) => {
    requested = String(url);
    headers = options?.headers;
    return new Response(
      JSON.stringify({
        code: 0,
        data: {
          info: {
            id: 999,
            title: '我的收藏',
            cover: '//i0.hdslb.com/test.jpg',
            media_count: 50,
            upper: { name: 'me' },
          },
          medias: [
            {
              id: 123,
              bvid: 'BV123',
              type: 2,
              attr: 0,
              title: 'video',
              duration: 90,
              cover: 'http://i0.hdslb.com/cover.jpg',
              upper: { name: 'UP' },
              cnt_info: { play: 1234 },
            },
            { id: 456, type: 12, attr: 0, title: 'audio' },
            { id: 789, type: 2, attr: 9, title: 'deleted' },
          ],
          has_more: true,
        },
      }),
    );
  };
  const page = await fetchFavorites('999', 2, 'my-session', '学习');
  const url = new URL(requested);
  assert.equal(url.hostname, 'api.bilibili.com');
  assert.equal(url.searchParams.get('type'), '0');
  assert.equal(url.searchParams.get('media_id'), '999');
  assert.equal(url.searchParams.get('pn'), '2');
  assert.equal(url.searchParams.get('ps'), '20');
  assert.equal(url.searchParams.get('keyword'), '学习');
  assert.equal(new Headers(headers).get('Cookie'), 'SESSDATA=my-session');
  assert.equal(page.videos.length, 2);
  assert.equal(page.videos[0]?.folderId, '999');
  assert.equal(page.videos[0]?.cover, 'https://i0.hdslb.com/cover.jpg');
  assert.equal(page.videos[1]?.available, false);
  assert.equal(page.hasMore, true);
});
test('empty and private folders produce an empty list or a clear access error', async () => {
  mock({ info: { id: 999, title: 'empty', media_count: 0 }, medias: null, has_more: false });
  assert.deepEqual((await fetchFavorites('999')).videos, []);
  mock(null, -403);
  await assert.rejects(fetchFavorites('999'), /私密收藏夹/);
  mock(null, -101);
  await assert.rejects(fetchFavorites('999'), /登录已失效/);
});
test('does not accept a response from another favorite folder', async () => {
  mock({ info: { id: 888 }, medias: [], has_more: false });
  await assert.rejects(fetchFavorites('999'), /不一致/);
});
test('playback rejects out-of-folder videos before making a network request', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error('must not fetch');
  };
  await assert.rejects(fetchParts(video, [], '999', ''), /只能播放/);
  await assert.rejects(fetchStream(video, 1, [video], '888', ''), /只能播放/);
  assert.equal(calls, 0);
});
test('playback returns a playable source without passing account credentials to the CDN', async () => {
  mock({ durl: [{ url: 'http://cdn.bilivideo.com/video.mp4' }] });
  const result = await fetchStream(video, 1, [video], '999', 'private-session');
  assert.equal(result.uri, 'https://cdn.bilivideo.com/video.mp4');
  assert.equal(result.headers.Referer, 'https://www.bilibili.com/');
  assert.equal(result.headers.Cookie, undefined);
});
test('reports restricted and unsupported media instead of silently playing a preview', async () => {
  mock({ is_preview: 1, durl: [{ url: 'https://cdn.bilivideo.com/video.mp4' }] });
  await assert.rejects(fetchStream(video, 1, [video], '999', ''), /试看/);
  mock({ durl: [] });
  await assert.rejects(fetchStream(video, 1, [video], '999', ''), /MP4/);
  mock({ durl: [{ url: 'a' }, { url: 'b' }] });
  await assert.rejects(fetchStream(video, 1, [video], '999', ''), /多段/);
});
