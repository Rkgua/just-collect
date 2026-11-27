import { fetchFavorites } from './bilibili';
import type { Folder, Video } from '../types';

export type FavoriteBatch = { videos: Video[]; folders: Folder[]; hasMore: boolean };

/** Round-robin pagination only over the user's selected folders. */
export function createFavoriteQueue(
  folderIds: readonly string[],
  session: string,
  keyword: string,
  signal?: AbortSignal,
) {
  const pending = [...new Set(folderIds)].map((id) => ({ id, page: 1 }));
  const seen = new Map<string, Video>();
  return {
    async next(): Promise<FavoriteBatch> {
      const folders: Folder[] = [];
      const videos: Video[] = [];
      for (let attempt = 0; attempt < 3 && pending.length && !videos.length; attempt++) {
        const cursor = pending[0]!;
        const result = await fetchFavorites(cursor.id, cursor.page, session, keyword, signal);
        if (signal?.aborted) throw new Error('请求已取消。');
        pending.shift();
        if (result.hasMore) pending.push({ id: cursor.id, page: cursor.page + 1 });
        folders.push(result.folder);
        for (const video of result.videos) {
          const previous = seen.get(video.id);
          if (!previous || (!previous.available && video.available)) {
            seen.set(video.id, video);
            videos.push(video);
          }
        }
      }
      return { videos, folders, hasMore: pending.length > 0 };
    },
  };
}
