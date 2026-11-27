import { extractShareUrl, isBilibiliUrl, parseFolderId } from '../lib/folder';

/** Short links are resolved anonymously; account cookies are never sent here. */
export async function resolveFolderId(input: string): Promise<string> {
  const link = extractShareUrl(input);
  if (!link || link.hostname !== 'b23.tv') return parseFolderId(input);
  if (link.username || link.password || (link.port && link.port !== '443')) {
    throw new Error('收藏夹短链接格式不正确。');
  }
  link.protocol = 'https:';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(link.toString(), {
      credentials: 'omit',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('短链接暂时无法打开，请重新复制收藏夹分享链接。');
    const destination = new URL(response.url);
    if (!isBilibiliUrl(destination)) {
      throw new Error('短链接没有跳转到 B 站收藏夹，请检查分享内容。');
    }
    return parseFolderId(destination.toString());
  } catch (e) {
    if (controller.signal.aborted) throw new Error('解析分享链接超时，请检查网络后重试。');
    if (e instanceof TypeError)
      throw new Error('无法解析分享短链接，请检查网络后重试；浏览器仅用于界面预览。');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
