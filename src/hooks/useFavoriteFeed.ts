import { useCallback, useEffect, useRef, useState } from 'react';
import { createFavoriteQueue } from '../services/favoriteQueue';
import { errorMessage } from '../lib/format';
import { ALL_FOLDERS, type Folder, type Video } from '../types';

export function useFavoriteFeed(
  folderId: string | null,
  session: string,
  keyword: string,
  onFolder: (folder: Folder) => void,
  selectedFolders: Folder[],
) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const busy = useRef(false);
  const items = useRef<Video[]>([]);
  const more = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const queue = useRef<ReturnType<typeof createFavoriteQueue> | null>(null);
  const sourceIds =
    folderId === ALL_FOLDERS ? selectedFolders.map((f) => f.id).join(',') : folderId || '';

  useEffect(() => {
    const current = ++generation.current;
    const abort = new AbortController();
    abortRef.current = abort;
    queue.current = createFavoriteQueue(
      sourceIds ? sourceIds.split(',') : [],
      session,
      keyword,
      abort.signal,
    );
    busy.current = true;
    items.current = [];
    more.current = false;
    setVideos([]);
    setHasMore(false);
    setLoadingMore(false);
    setError('');
    setLoading(Boolean(sourceIds));
    if (!sourceIds) {
      busy.current = false;
      return () => abort.abort();
    }
    queue.current
      .next()
      .then((result) => {
        if (current !== generation.current || abort.signal.aborted) return;
        items.current = result.videos;
        more.current = result.hasMore;
        setVideos(result.videos);
        setHasMore(result.hasMore);
        if (!keyword) result.folders.forEach(onFolder);
      })
      .catch((e) => {
        if (!abort.signal.aborted && current === generation.current) setError(errorMessage(e));
      })
      .finally(() => {
        if (current === generation.current && !abort.signal.aborted) {
          busy.current = false;
          setLoading(false);
        }
      });
    return () => {
      abort.abort();
      generation.current++;
    };
  }, [sourceIds, session, keyword, revision, onFolder]);

  const loadMore = useCallback(async (): Promise<Video[]> => {
    if (!queue.current || busy.current || !more.current) return items.current;
    busy.current = true;
    setLoadingMore(true);
    setError('');
    const current = generation.current;
    try {
      const result = await queue.current.next();
      if (current !== generation.current) return [];
      const merged = new Map(items.current.map((v) => [v.id, v]));
      result.videos.forEach((v) => merged.set(v.id, v));
      items.current = [...merged.values()];
      more.current = result.hasMore;
      setVideos(items.current);
      setHasMore(result.hasMore);
      if (!keyword) result.folders.forEach(onFolder);
      return items.current;
    } catch (e) {
      if (current === generation.current && !abortRef.current?.signal.aborted)
        setError(errorMessage(e));
      throw e;
    } finally {
      if (current === generation.current) {
        busy.current = false;
        setLoadingMore(false);
      }
    }
  }, [keyword, onFolder]);

  return {
    videos,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    refresh: () => setRevision((v) => v + 1),
  };
}
