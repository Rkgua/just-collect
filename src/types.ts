export type Folder = {
  id: string;
  title: string;
  cover: string;
  owner: string;
  count: number;
  private?: boolean;
  accountId?: string;
};

export type Account = { id: string; name: string };
export const ALL_FOLDERS = '__all_folders__';

export type Video = {
  id: string;
  bvid: string;
  folderId: string;
  title: string;
  cover: string;
  author: string;
  duration: number;
  views: number;
  available: boolean;
};

export type VideoPart = { cid: number; page: number; part: string; duration: number };
export type FavoritePage = { folder: Folder; videos: Video[]; hasMore: boolean };
export type Preferences = { autoNext: boolean; shuffle: boolean; playbackRate?: number };
export type Library = {
  folders: Folder[];
  activeId: string | null;
  preferences: Preferences;
  aggregateIds?: string[];
};
