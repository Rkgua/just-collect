import { fetchFavorites, fetchParts, fetchStream } from '../src/services/bilibili';
import { parseFolderId } from '../src/lib/folder';

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error('用法：npm run check:api -- 收藏夹ID');
  const id = parseFolderId(input);
  const page = await fetchFavorites(id);
  console.log(`收藏夹接口成功：${page.videos.length} 个视频，hasMore=${page.hasMore}`);
  const video = page.videos.find((v) => v.available);
  if (!video) {
    console.log('第一页没有有效视频，跳过播放地址验证。');
    return;
  }
  const parts = await fetchParts(video, page.videos, id, '');
  const stream = await fetchStream(video, parts[0]!.cid, page.videos, id, '');
  const response = await fetch(stream.uri, {
    method: 'GET',
    headers: { ...stream.headers, Range: 'bytes=0-1023' },
    signal: AbortSignal.timeout(15000),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error(`CDN 请求失败：HTTP ${response.status}`);
  console.log(`播放地址验证成功：HTTP ${response.status}，${response.headers.get('content-type')}`);
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
