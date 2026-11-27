import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('random shorts swipe across selected folders, revisit history and persist autoplay', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (location.hostname !== 'favonly.test') return;
    localStorage.setItem(
      'favonly.library.v1',
      JSON.stringify({
        folders: ['999', '888', '777'].map((id) => ({
          id,
          title: `收藏夹${id}`,
          owner: 'me',
          count: 40,
          cover: '',
        })),
        activeId: '__all_folders__',
        aggregateIds: ['999', '888'],
        preferences: { autoNext: true, shuffle: false },
      }),
    );
  });
  const requests: URL[] = [];
  const played: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://api.bilibili.com/**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const id = url.searchParams.get('media_id') || '999';
    const pn = Number(url.searchParams.get('pn') || 1);
    let data: unknown;
    if (url.pathname.endsWith('/resource/list'))
      data = {
        info: { id: Number(id), title: `收藏夹${id}`, media_count: 40, upper: { name: 'me' } },
        medias: [1, 2].map((n) => ({
          id: Number(id) * 100 + pn * 10 + n,
          type: 2,
          attr: 0,
          title: `随机测试${id}-${pn}-${n}`,
          duration: 30,
          cover: '',
          upper: { name: '测试UP' },
        })),
        has_more: pn === 1,
      };
    else if (url.pathname.endsWith('/pagelist')) {
      played.push(url.searchParams.get('aid')!);
      data = [{ cid: Number(url.searchParams.get('aid')), page: 1, part: '正片', duration: 30 }];
    } else data = { durl: [] };
    await route.fulfill({
      json: { code: 0, data },
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '进入短视频随机模式' }).click();
  await expect(page.getByText('随机刷 · 仅限已选收藏')).toBeVisible();
  await expect.poll(() => played.length).toBe(1);
  const first = played[0];
  await expect(page.getByText('只刷收藏 · 本轮第 1 条')).toBeVisible();
  await expect
    .poll(async () =>
      Math.round((await page.getByTestId('random-shorts-gesture-area').boundingBox())!.y),
    )
    .toBe(0);
  const touch = await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 195, y: 540 }],
  });
  for (let y = 520; y >= 270; y -= 25) {
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 195, y }],
    });
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => played.length).toBe(2);
  expect(played[1]).not.toBe(first);
  const second = played[1];
  await page.getByRole('button', { name: '上一条收藏短视频' }).click();
  await expect.poll(() => played.at(-1)).toBe(first);
  await page.getByRole('button', { name: '下一条随机收藏' }).click();
  await expect.poll(() => played.at(-1)).toBe(second);
  await page.getByRole('switch', { name: '短视频自动连播' }).click();
  await expect(page.getByRole('switch', { name: '短视频自动连播' })).not.toBeChecked();
  await page.screenshot({ path: 'artifacts/preview-shorts-fixture.png' });
  await page.getByRole('button', { name: '退出短视频模式' }).click();
  await page.getByRole('tab', { name: '设置', exact: true }).click();
  await expect(page.getByRole('switch', { name: '自动连播', exact: true })).not.toBeChecked();
  const favoriteRequests = requests.filter((url) => url.pathname.endsWith('/resource/list'));
  expect(favoriteRequests.some((url) => url.searchParams.get('pn') === '2')).toBe(true);
  for (const url of favoriteRequests) {
    expect(['999', '888']).toContain(url.searchParams.get('media_id'));
    expect(url.searchParams.get('type')).toBe('0');
  }
  expect(errors).toEqual([]);
});

// Serve the exported app through browser routes, without a local server or network.
test.beforeEach(async ({ page }) => {
  const root = path.resolve('dist');
  await page.route('http://favonly.test/**', async (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + path.sep)) {
      await route.fulfill({ status: 403 });
      return;
    }
    const types: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.ttf': 'font/ttf',
      '.png': 'image/png',
      '.json': 'application/json',
    };
    try {
      await route.fulfill({
        body: await readFile(file),
        contentType: types[path.extname(file)] ?? 'application/octet-stream',
      });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
});

test('empty state, input validation and narrow-screen navigation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page).toHaveTitle('just-collect');
  await expect(page.getByRole('button', { name: 'just-collect 首页' })).toBeVisible();
  await expect(page.getByText('只看喜欢的')).toBeVisible();
  await page.screenshot({ path: 'artifacts/preview-home.png', fullPage: true });
  await page.getByRole('button', { name: '添加第一个收藏夹' }).click();
  await expect(page.getByRole('button', { name: '一键粘贴', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '打开 B 站收藏', exact: true }).click();
  await expect(page.getByText('请在手机安装包中使用跳转功能。', { exact: false })).toBeVisible();
  await page
    .getByRole('textbox', { name: '收藏夹链接或 ID' })
    .fill('https://www.bilibili.com/video/BV123');
  await page.getByRole('button', { name: '添加收藏夹', exact: true }).last().click();
  await expect(page.getByText('链接中没有收藏夹 ID', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'artifacts/preview-add.png', fullPage: true });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('tab', { name: '设置' }).click();
  await expect(page.getByText('按你的节奏')).toBeVisible();
  await page.getByRole('switch', { name: '自动连播', exact: true }).click();
  await expect(page.getByRole('switch', { name: '自动连播', exact: true })).not.toBeChecked();
  await page.reload();
  await page.getByRole('tab', { name: '设置' }).click();
  await expect(page.getByRole('switch', { name: '自动连播', exact: true })).not.toBeChecked();
  await page.screenshot({ path: 'artifacts/preview-settings.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('playback speed preserves pitch and survives switching videos and viewing modes', async ({
  page,
}) => {
  await playableFavorites(page);
  await page.goto('/');
  await page.getByRole('button', { name: '开始播放', exact: true }).click();
  const media = page.locator('video');
  await expect(media).toHaveCount(1);
  await page.getByRole('button', { name: '调整播放倍速' }).click();
  await page.getByRole('button', { name: '设置 2 倍速', exact: true }).click();
  await expect
    .poll(() =>
      media.evaluate((el: HTMLVideoElement) => ({
        rate: el.playbackRate,
        pitch: el.preservesPitch,
      })),
    )
    .toEqual({ rate: 2, pitch: true });
  await expect(page.getByRole('button', { name: '横屏全屏播放' })).toBeVisible();
  await page.getByRole('button', { name: '下一个视频', exact: true }).click();
  await expect(page.getByText('倍速测试456', { exact: true }).first()).toBeVisible();
  await expect.poll(() => media.evaluate((el: HTMLVideoElement) => el.playbackRate)).toBe(2);
  await page.getByRole('button', { name: '关闭播放器' }).click();
  await page.getByRole('button', { name: '进入短视频随机模式' }).click();
  await expect
    .poll(() =>
      media.evaluate((el: HTMLVideoElement) => ({
        rate: el.playbackRate,
        pitch: el.preservesPitch,
      })),
    )
    .toEqual({ rate: 2, pitch: true });
  await page.getByRole('button', { name: '调整播放倍速' }).click();
  await page.getByRole('button', { name: '设置 1.25 倍速', exact: true }).click();
  await expect.poll(() => media.evaluate((el: HTMLVideoElement) => el.playbackRate)).toBe(1.25);
  await page.getByRole('button', { name: '下一条随机收藏' }).click();
  await expect(page.getByText('只刷收藏 · 本轮第 2 条')).toBeVisible();
  await expect
    .poll(() =>
      media.evaluate((el: HTMLVideoElement) => ({
        rate: el.playbackRate,
        pitch: el.preservesPitch,
      })),
    )
    .toEqual({ rate: 1.25, pitch: true });
  await page.getByRole('button', { name: '退出短视频模式' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('favonly.library.v1')!).preferences.playbackRate,
      ),
    )
    .toBe(1.25);
});

test('account login entry explains the native flow and selected folders aggregate without duplicates', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (location.hostname !== 'favonly.test') return;
    localStorage.setItem(
      'favonly.library.v1',
      JSON.stringify({
        folders: [
          {
            id: '999',
            title: '私密学习（测试）',
            owner: 'me',
            count: 2,
            cover: '',
            private: true,
            accountId: '42',
          },
          { id: '888', title: '音乐（测试）', owner: 'me', count: 2, cover: '' },
        ],
        activeId: '__all_folders__',
        aggregateIds: ['999', '888'],
        preferences: { autoNext: true, shuffle: false },
      }),
    );
  });
  const requestedFolders: string[] = [];
  await page.route('https://api.bilibili.com/**', async (route) => {
    const url = new URL(route.request().url());
    const id = url.searchParams.get('media_id') || '999';
    if (url.pathname.endsWith('/resource/list')) requestedFolders.push(id);
    const ids = id === '999' ? [1, 2] : [2, 3];
    const data = url.pathname.endsWith('/resource/list')
      ? {
          info: {
            id: Number(id),
            title: id === '999' ? '私密学习（测试）' : '音乐（测试）',
            media_count: 2,
            upper: { name: 'me' },
          },
          medias: ids.map((n) => ({
            id: n,
            type: 2,
            attr: 0,
            title: `汇总测试视频${n}`,
            duration: 10,
            cover: '',
          })),
          has_more: false,
        }
      : url.pathname.endsWith('/pagelist')
        ? [{ cid: 3, page: 1, part: '正片', duration: 10 }]
        : { durl: [] };
    await route.fulfill({
      json: { code: 0, data },
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: '播放：汇总测试视频1', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '再翻一些收藏', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '播放：汇总测试视频3', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '播放：汇总测试视频2', exact: true })).toHaveCount(
    1,
  );
  expect(requestedFolders).toEqual(['999', '888']);
  await page.screenshot({ path: 'artifacts/preview-aggregate-fixture.png', fullPage: true });
  await page.getByRole('button', { name: '播放：汇总测试视频3', exact: true }).click();
  await expect(page.getByText('B 站未返回可播放的 MP4 地址', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '关闭播放器' }).click();
  await page.getByRole('tab', { name: '收藏夹', exact: true }).click();
  await expect(page.getByText('me · 2 项 · 私密')).toBeVisible();
  await page.getByRole('button', { name: '登录后读取我的收藏夹', exact: true }).click();
  await expect(page.getByText('在手机 APK 中完成官方页面登录。')).toBeVisible();
});

test('connect, search, paginate and remove a folder; playback stays in its queue', async ({
  page,
}) => {
  const requests: URL[] = [];
  const videos = [
    {
      id: 123,
      bvid: 'BV123',
      type: 2,
      attr: 0,
      title: '测试视频：山间的日常',
      duration: 368,
      cover: '',
      upper: { name: '测试 UP 主' },
      cnt_info: { play: 12345 },
    },
    {
      id: 456,
      bvid: 'BV456',
      type: 2,
      attr: 0,
      title: '测试视频：一起散步吧',
      duration: 720,
      cover: '',
      upper: { name: '另一位 UP 主' },
      cnt_info: { play: 4567 },
    },
    { id: 789, type: 2, attr: 9, title: '已失效的测试视频', duration: 0, cover: '' },
  ];
  await page.route('https://api.bilibili.com/**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    let data: unknown;
    if (url.pathname.endsWith('/resource/list')) {
      const more = url.searchParams.get('pn') === '2';
      const keyword = url.searchParams.get('keyword');
      data = {
        info: {
          id: 999,
          title: '周末放映室（测试）',
          cover: '',
          media_count: 4,
          upper: { name: '我自己' },
        },
        medias: keyword
          ? videos.filter((v) => v.title.includes(keyword))
          : more
            ? [{ ...videos[0], id: 111, title: '测试视频：新的一页' }]
            : videos,
        has_more: !more && !keyword,
      };
    } else if (url.pathname.endsWith('/pagelist')) {
      data = [{ cid: Number(url.searchParams.get('aid')), page: 1, part: '正片', duration: 300 }];
    } else {
      data = { durl: [] }; // Exercise the visible player error and queue without external media.
    }
    await route.fulfill({
      json: { code: 0, data },
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '添加第一个收藏夹' }).click();
  await page.getByRole('textbox', { name: '收藏夹链接或 ID' }).fill('999');
  await page.getByRole('button', { name: '添加收藏夹', exact: true }).last().click();
  await expect(
    page.getByRole('button', { name: '播放：测试视频：山间的日常', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'artifacts/preview-folder-fixture.png', fullPage: true });
  await page.getByRole('textbox', { name: '搜索当前收藏夹' }).fill('散步');
  await expect(
    page.getByRole('button', { name: '播放：测试视频：山间的日常', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: '播放：测试视频：一起散步吧', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '清除搜索' }).click();
  await expect(
    page.getByRole('button', { name: '播放：测试视频：山间的日常', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '再翻一些收藏' }).click();
  await expect(
    page.getByRole('button', { name: '播放：测试视频：新的一页', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '开始播放', exact: true }).click();
  await expect(page.getByText('正在播放 · 仅限当前收藏夹')).toBeVisible();
  await expect(page.getByText('B 站未返回可播放的 MP4 地址', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '下一个视频', exact: true }).click();
  await expect
    .poll(() =>
      requests
        .filter((url) => url.pathname.endsWith('/pagelist'))
        .at(-1)
        ?.searchParams.get('aid'),
    )
    .toBe('456');
  await page.getByRole('button', { name: '关闭播放器' }).click();
  await page.getByRole('tab', { name: '收藏夹', exact: true }).click();
  await page.getByRole('button', { name: '管理收藏夹 周末放映室（测试）' }).click();
  await page.getByRole('button', { name: '移除连接', exact: true }).click();
  await page.getByRole('tab', { name: '收藏视频', exact: true }).click();
  await expect(page.getByRole('button', { name: '添加第一个收藏夹' })).toBeVisible();
  for (const url of requests.filter((url) => url.pathname.endsWith('/resource/list'))) {
    expect(url.searchParams.get('media_id')).toBe('999');
    expect(url.searchParams.get('type')).toBe('0');
  }
  expect(requests.some((url) => url.searchParams.get('keyword') === '散步')).toBe(true);
});

test('custom player gestures, temporary speed, fullscreen controls and locking', async ({
  page,
}) => {
  await playableFavorites(page);
  await page.goto('/');
  await page.getByRole('button', { name: '开始播放', exact: true }).click();
  const media = page.locator('video');
  await expect.poll(() => media.evaluate((el: HTMLVideoElement) => el.duration)).toBe(30);
  const surface = page.getByTestId('video-gesture-surface');
  await media.evaluate((el: HTMLVideoElement) => {
    el.pause();
    el.currentTime = 3;
  });
  await surface.click({ position: { x: 180, y: 50 } });
  await expect(page.getByRole('button', { name: '调整播放倍速' })).toHaveCount(0);
  await surface.click({ position: { x: 180, y: 50 } });
  await expect(page.getByRole('button', { name: '调整播放倍速' })).toBeVisible();
  await surface.dblclick({ position: { x: 180, y: 50 }, delay: 80 });
  await expect.poll(() => media.evaluate((el: HTMLVideoElement) => el.paused)).toBe(false);
  await page.getByRole('button', { name: '调整播放倍速' }).click();
  await page.getByRole('button', { name: '设置 1.25 倍速', exact: true }).click();
  let bounds = (await surface.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 50);
  await page.mouse.down();
  await expect.poll(() => media.evaluate((el: HTMLVideoElement) => el.playbackRate)).toBe(2);
  await expect(page.getByText('2× 加速中 · 松手恢复')).toBeVisible();
  await page.mouse.up();
  await expect.poll(() => media.evaluate((el: HTMLVideoElement) => el.playbackRate)).toBe(1.25);
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('favonly.library.v1')!).preferences.playbackRate,
      ),
    )
    .toBe(1.25);
  await media.evaluate((el: HTMLVideoElement) => el.pause());
  await page.getByRole('button', { name: '横屏全屏播放' }).click();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByRole('button', { name: '锁定播放器' })).toBeVisible();
  await expect(page.getByRole('button', { name: '调整播放倍速' })).toBeVisible();
  await page.getByRole('button', { name: '锁定播放器' }).click();
  await expect(page.getByRole('button', { name: '调整播放倍速' })).toHaveCount(0);
  const lockedTime = await media.evaluate((el: HTMLVideoElement) => el.currentTime);
  bounds = (await surface.boundingBox())!;
  await page.mouse.move(bounds.x + 200, bounds.y + 130);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 480, bounds.y + 130, { steps: 12 });
  await page.mouse.up();
  expect(await media.evaluate((el: HTMLVideoElement) => el.currentTime)).toBe(lockedTime);
  await page.getByRole('button', { name: '解锁播放器' }).click();
  const progress = (await page.getByTestId('video-progress').boundingBox())!;
  await page.mouse.move(progress.x + progress.width * 0.2, progress.y + progress.height / 2);
  await page.mouse.down();
  await page.mouse.move(progress.x + progress.width * 0.7, progress.y + progress.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await expect
    .poll(() => media.evaluate((el: HTMLVideoElement) => Math.round(el.currentTime)))
    .toBe(21);
  await page.mouse.move(bounds.x + 600, bounds.y + 110);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 600, bounds.y + 240, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => media.evaluate((el: HTMLVideoElement) => el.volume)).toBeLessThan(0.9);
  await page.getByRole('button', { name: '调整播放倍速' }).click();
  await page.screenshot({ path: 'artifacts/preview-custom-player-fixture.png' });
  await page.getByRole('button', { name: '设置 2 倍速', exact: true }).click();
  await page.getByRole('button', { name: '全屏下一个视频' }).click();
  await expect(page.getByText('倍速测试456', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '锁定播放器' })).toBeVisible();
  await expect
    .poll(() =>
      media.evaluate((el: HTMLVideoElement) => ({
        rate: el.playbackRate,
        pitch: el.preservesPitch,
      })),
    )
    .toEqual({ rate: 2, pitch: true });
  await page.getByRole('button', { name: '退出全屏', exact: true }).click();
  await expect(page.getByRole('button', { name: '关闭播放器' })).toBeVisible();
});

async function playableFavorites(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'favonly.library.v1',
      JSON.stringify({
        folders: [{ id: '999', title: '播放测试', owner: 'me', count: 2, cover: '' }],
        activeId: '999',
        preferences: { autoNext: false, shuffle: false },
      }),
    );
  });
  // Locally synthesized PCM media avoids external CDN access while exercising the actual video element.
  const samples = 44100 * 30;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(44100, 24);
  wav.writeUInt32LE(88200, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    wav.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / 44100) * 1000), 44 + i * 2);
  await page.route('https://media.test/**', (route) => {
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || '');
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
    return route.fulfill({
      status: range ? 206 : 200,
      body: wav.subarray(start, end + 1),
      contentType: 'audio/wav',
      headers: {
        'access-control-allow-origin': '*',
        'accept-ranges': 'bytes',
        ...(range ? { 'content-range': `bytes ${start}-${end}/${wav.length}` } : {}),
      },
    });
  });
  await page.route('https://api.bilibili.com/**', (route) => {
    const url = new URL(route.request().url());
    const data = url.pathname.endsWith('/resource/list')
      ? {
          info: { id: 999, title: '播放测试', media_count: 2, upper: { name: 'me' } },
          medias: [123, 456].map((id) => ({
            id,
            type: 2,
            attr: 0,
            title: `倍速测试${id}`,
            duration: 30,
            cover: '',
          })),
          has_more: false,
        }
      : url.pathname.endsWith('/pagelist')
        ? [{ cid: Number(url.searchParams.get('aid')), page: 1, part: '正片', duration: 30 }]
        : { durl: [{ url: 'https://media.test/clip.wav' }] };
    return route.fulfill({
      json: { code: 0, data },
      headers: { 'access-control-allow-origin': '*' },
    });
  });
}
