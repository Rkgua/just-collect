import { fetchFavorites } from './bilibili';
import type { Folder, Video } from '../types';

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const index = Math.floor(random() * (i + 1));
    [items[i], items[index]] = [items[index]!, items[i]!];
  }
  return items;
}

export type RandomPick = { video: Video | null; hasMore: boolean; loaded: number };

/** Shuffle pages across the selected folders, then draw from a small video pool. */
export function createRandomFavorites(
  folders: readonly Folder[],
  session: string,
  signal?: AbortSignal,
  random: () => number = Math.random,
) {
  const selected = new Map(folders.map((folder) => [folder.id, folder]));
  const jobs = shuffle(
    [...selected.values()].flatMap((folder) => {
      const pages = Math.max(1, Math.ceil(Math.max(0, folder.count) / 20));
      return Array.from({ length: pages }, (_, index) => ({ id: folder.id, page: index + 1 }));
    }),
    random,
  );
  const scheduled = new Set(jobs.map((job) => `${job.id}:${job.page}`));
  const seen = new Set<string>();
  const pool: Video[] = [];
  let loading = false;

  return {
    async next(): Promise<RandomPick> {
      if (loading) throw new Error('正在加载下一条收藏，请稍候。');
      loading = true;
      try {
        if (signal?.aborted) throw new Error('请求已取消。');
        // At most two page requests per interaction; never download the full collection first.
        for (let attempt = 0; attempt < 2 && jobs.length && pool.length < 8; attempt++) {
          const job = jobs[0]!;
          const page = await fetchFavorites(job.id, job.page, session, '', signal);
          if (signal?.aborted) throw new Error('请求已取消。');
          jobs.shift();
          if (page.hasMore && !scheduled.has(`${job.id}:${job.page + 1}`)) {
            const next = { id: job.id, page: job.page + 1 };
            scheduled.add(`${next.id}:${next.page}`);
            jobs.splice(Math.floor(random() * (jobs.length + 1)), 0, next);
          }
          for (const video of page.videos) {
            if (video.available && selected.has(video.folderId) && !seen.has(video.id)) {
              seen.add(video.id);
              pool.push(video);
            }
          }
        }
        const index = Math.floor(random() * pool.length);
        const video = pool.length ? pool.splice(index, 1)[0]! : null;
        return { video, hasMore: pool.length > 0 || jobs.length > 0, loaded: seen.size };
      } finally {
        loading = false;
      }
    },
  };
}

export function swipeDirection(dx: number, dy: number, vy: number): 'next' | 'previous' | null {
  if (Math.abs(dy) < Math.abs(dx) * 1.3) return null;
  if (Math.abs(dy) < 65 && !(Math.abs(dy) >= 24 && Math.abs(vy) >= 0.65)) return null;
  return dy < 0 ? 'next' : 'previous';
}
