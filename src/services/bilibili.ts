import {
  ALL_FOLDERS,
  type Account,
  type FavoritePage,
  type Folder,
  type Video,
  type VideoPart,
} from '../types';

const API = 'https://api.bilibili.com';
export const REFERER = 'https://www.bilibili.com/';
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function requestHeaders(session = ''): Record<string, string> {
  return {
    Accept: 'application/json',
    Referer: REFERER,
    'User-Agent': USER_AGENT,
    ...(session ? { Cookie: `SESSDATA=${session}` } : {}),
  };
}

export function secureUrl(value: string): string {
  return value.startsWith('//') ? `https:${value}` : value.replace(/^http:\/\//, 'https://');
}

export async function fetchCurrentAccount(session: string, signal?: AbortSignal): Promise<Account> {
  if (!session) throw new Error('请先登录自己的 B 站账号。');
  const data = await request<{ isLogin: boolean; mid: number; uname: string }>(
    '/x/web-interface/nav',
    {},
    session,
    signal,
  );
  if (!data.isLogin || !data.mid) throw new Error('登录已失效，请重新登录 B 站。');
  return { id: String(data.mid), name: data.uname };
}

export async function fetchMyFolders(
  session: string,
  signal?: AbortSignal,
): Promise<{ account: Account; folders: Folder[] }> {
  const account = await fetchCurrentAccount(session, signal);
  const data = await request<{
    count: number;
    list: null | Array<{
      id: number;
      title: string;
      attr: number;
      media_count: number;
      cover?: string;
    }>;
  }>('/x/v3/fav/folder/created/list-all', { up_mid: account.id, type: 2 }, session, signal);
  if (data.count > 0 && !data.list?.length)
    throw new Error('B 站没有返回收藏夹列表，请重新登录后再试。');
  return {
    account,
    folders: (data.list ?? []).map((folder) => ({
      id: String(folder.id),
      title: folder.title,
      cover: secureUrl(folder.cover || ''),
      owner: account.name,
      count: folder.media_count,
      private: Boolean(folder.attr & 1),
      accountId: account.id,
    })),
  };
}

async function request<T>(
  path: string,
  params: Record<string, string | number>,
  session: string,
  signal?: AbortSignal,
): Promise<T> {
  const timeout = new AbortController();
  const abort = () => timeout.abort();
  if (signal?.aborted) timeout.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 18000);
  try {
    const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    const response = await fetch(`${API}${path}?${query}`, {
      headers: requestHeaders(session),
      signal: timeout.signal,
    });
    if (!response.ok) throw new Error(`B 站请求失败（HTTP ${response.status}），请稍后重试。`);
    const body = (await response.json()) as { code: number; message?: string; data: T | null };
    if (body.code !== 0 || !body.data) {
      if (body.code === -101) throw new Error('登录已失效，请在设置中更新 SESSDATA。');
      if (body.code === -403 || body.code === 11003)
        throw new Error('无法访问收藏夹。私密收藏夹需要所属账号的登录凭证。');
      if (body.code === -352 || body.code === -412)
        throw new Error('B 站暂时限制了请求，请稍后再试。');
      throw new Error(`B 站返回：${body.message || '资源不可用'}（${body.code}）`);
    }
    return body.data;
  } catch (error) {
    if (timeout.signal.aborted && !signal?.aborted) throw new Error('请求超时，请检查网络后重试。');
    if (error instanceof TypeError)
      throw new Error(
        '无法连接 B 站。请检查网络；浏览器预览不支持直接访问 B 站接口，请使用 Android / iOS。',
      );
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

type FavResponse = {
  info: { id: number; title: string; cover: string; media_count: number; upper?: { name: string } };
  medias: null | Array<{
    id: number;
    bvid?: string;
    bv_id?: string;
    type: number;
    title: string;
    cover: string;
    duration: number;
    attr: number;
    upper?: { name: string };
    cnt_info?: { play: number };
  }>;
  has_more: boolean;
};

export async function fetchFavorites(
  id: string,
  page = 1,
  session = '',
  keyword = '',
  signal?: AbortSignal,
): Promise<FavoritePage> {
  const data = await request<FavResponse>(
    '/x/v3/fav/resource/list',
    {
      media_id: id,
      pn: page,
      ps: 20,
      order: 'mtime',
      type: 0,
      tid: 0,
      platform: 'web',
      keyword,
    },
    session,
    signal,
  );
  if (String(data.info.id) !== id) throw new Error('收藏夹 ID 与接口结果不一致，请重新添加。');
  return {
    folder: {
      id,
      title: data.info.title,
      cover: secureUrl(data.info.cover || ''),
      owner: data.info.upper?.name || 'B 站用户',
      count: data.info.media_count,
    },
    videos: (data.medias ?? [])
      .filter((item) => item.type === 2)
      .map((item) => ({
        id: String(item.id),
        bvid: item.bvid || item.bv_id || '',
        folderId: id,
        title: item.title,
        cover: secureUrl(item.cover || ''),
        author: item.upper?.name || '未知 UP 主',
        duration: item.duration || 0,
        views: item.cnt_info?.play || 0,
        available: item.attr === 0,
      })),
    hasMore: Boolean(data.has_more),
  };
}

export function assertAllowed(video: Video, allowed: readonly Video[], folderId: string): void {
  if (
    !video.available ||
    (folderId !== ALL_FOLDERS && video.folderId !== folderId) ||
    !allowed.some((v) => v.id === video.id && v.folderId === video.folderId && v.available)
  ) {
    throw new Error('只能播放当前指定收藏夹中有效的视频。');
  }
}

export async function fetchParts(
  video: Video,
  allowed: readonly Video[],
  folderId: string,
  session: string,
  signal?: AbortSignal,
): Promise<VideoPart[]> {
  assertAllowed(video, allowed, folderId);
  const parts = await request<VideoPart[]>(
    '/x/player/pagelist',
    { aid: video.id },
    session,
    signal,
  );
  if (!parts.length) throw new Error('视频没有可播放的分 P，可能已失效。');
  return parts;
}

export async function fetchStream(
  video: Video,
  cid: number,
  allowed: readonly Video[],
  folderId: string,
  session: string,
  signal?: AbortSignal,
): Promise<{ uri: string; headers: Record<string, string> }> {
  assertAllowed(video, allowed, folderId);
  const data = await request<{ durl?: Array<{ url: string }>; is_preview?: number }>(
    '/x/player/playurl',
    {
      avid: video.id,
      cid,
      qn: 64,
      fnval: 1,
      fnver: 0,
      platform: 'html5',
      high_quality: 1,
    },
    session,
    signal,
  );
  if (data.is_preview) throw new Error('该视频仅提供试看，需要有观看权限的账号。');
  if (!data.durl?.length)
    throw new Error('B 站未返回可播放的 MP4 地址，该视频可能有权限或格式限制。');
  if (data.durl.length !== 1) throw new Error('该视频使用多段媒体格式，当前播放器暂不支持。');
  return {
    uri: secureUrl(data.durl[0]!.url),
    headers: { Referer: REFERER, 'User-Agent': USER_AGENT },
  };
}
