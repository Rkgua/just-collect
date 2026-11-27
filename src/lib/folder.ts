/** Extract a URL from the entire share message copied from Bilibili. */
export function extractShareUrl(input: string): URL | null {
  const link = input.match(/https?:\/\/[^\s<>"\u3000-\u303f\uff00-\uffef\u4e00-\u9fff]+/i)?.[0];
  if (!link) return null;
  try {
    return new URL(link.replace(/[)\]},.!;]+$/, ''));
  } catch {
    return null;
  }
}

export function isBilibiliUrl(url: URL): boolean {
  return (
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    !url.username &&
    !url.password &&
    (url.hostname === 'bilibili.com' || url.hostname.endsWith('.bilibili.com'))
  );
}

/** Only accept an actual favorite ID; a video share must never become a folder. */
export function parseFolderId(input: string): string {
  const raw = input.trim();
  if (/^[1-9]\d{0,19}$/.test(raw)) return raw;
  const url = extractShareUrl(raw);
  if (!url) throw new Error('请粘贴收藏夹分享链接，或输入纯数字收藏夹 ID。');
  if (!isBilibiliUrl(url)) throw new Error('请使用 B 站收藏夹分享链接或数字 ID。');
  const id =
    url.searchParams.get('fid') ??
    url.searchParams.get('media_id') ??
    url.pathname.match(/\/(?:medialist\/(?:detail|play)\/ml|list\/ml)(\d+)/)?.[1];
  if (!id || !/^[1-9]\d{0,19}$/.test(id)) {
    throw new Error('链接中没有收藏夹 ID，请分享整个收藏夹，而不是其中的一条视频。');
  }
  return id;
}

export function normalizeSession(input: string): string {
  const value = input.trim();
  if (!value) return '';
  const token = value.match(/(?:^|;\s*)SESSDATA=([^;\s]+)/)?.[1] ?? value;
  if (!/^[A-Za-z0-9%_,.\-~]+$/.test(token) || token.length > 1024) {
    throw new Error('SESSDATA 格式不正确，只需填写该字段的值。');
  }
  return token;
}
