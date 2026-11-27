import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { ALL_FOLDERS, type Library } from '../types';

const KEY = 'favonly.library.v1';
const SESSION = 'favonly.session';
export const DEFAULT_LIBRARY: Library = {
  folders: [],
  activeId: null,
  preferences: { autoNext: true, shuffle: false, playbackRate: 1 },
};

export async function readLibrary(): Promise<Library> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return DEFAULT_LIBRARY;
  const value = JSON.parse(raw) as Library;
  if (
    !Array.isArray(value.folders) ||
    value.folders.some((f) => !f || typeof f.id !== 'string' || typeof f.title !== 'string')
  ) {
    throw new Error('本地收藏夹记录损坏，请清除应用数据后重试。');
  }
  return {
    folders: value.folders,
    aggregateIds: Array.isArray(value.aggregateIds)
      ? value.aggregateIds.filter((id) => value.folders.some((f) => f.id === id))
      : undefined,
    activeId:
      (value.activeId === ALL_FOLDERS && value.folders.length > 0) ||
      value.folders.some((f) => f.id === value.activeId)
        ? value.activeId
        : (value.folders[0]?.id ?? null),
    preferences: {
      autoNext: value.preferences?.autoNext ?? true,
      shuffle: value.preferences?.shuffle ?? false,
      playbackRate:
        typeof value.preferences?.playbackRate === 'number' &&
        Number.isFinite(value.preferences.playbackRate)
          ? Math.max(0.25, Math.min(3, value.preferences.playbackRate))
          : 1,
    },
  };
}

export const writeLibrary = (value: Library) => AsyncStorage.setItem(KEY, JSON.stringify(value));
export const readSession = () =>
  Platform.OS === 'web'
    ? Promise.resolve('')
    : SecureStore.getItemAsync(SESSION).then((v) => v || '');
export async function writeSession(value: string): Promise<void> {
  if (Platform.OS === 'web') throw new Error('请在 Android / iOS 应用中设置登录凭证。');
  if (value) await SecureStore.setItemAsync(SESSION, value);
  else await SecureStore.deleteItemAsync(SESSION);
}
