import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { VideoSource } from 'expo-video';
import { StatusBar } from 'expo-status-bar';
import { C, Icon, IconButton } from './ui';
import { errorMessage } from '../lib/format';
import { fetchParts, fetchStream } from '../services/bilibili';
import { FavoriteVideo } from './FavoriteVideo';
import { PlayerLayer } from './PlayerLayer';
import { usePlayerFullscreen } from '../hooks/usePlayerFullscreen';
import type { Preferences, Video, VideoPart } from '../types';

export function Player({
  initialVideo,
  videos,
  folderId,
  folderTitle,
  session,
  preferences,
  onPreferences,
  hasMore,
  loadMore,
  onClose,
}: {
  initialVideo: Video;
  videos: Video[];
  folderId: string;
  folderTitle: string;
  session: string;
  preferences: Preferences;
  onPreferences: (p: Preferences) => void;
  hasMore: boolean;
  loadMore: () => Promise<Video[]>;
  onClose: () => void;
}) {
  const { fullscreen, changeFullscreen, orientationError } = usePlayerFullscreen();
  const viewport = useWindowDimensions();
  const [height, setHeight] = useState(viewport.height);
  const [video, setVideo] = useState(initialVideo);
  const [parts, setParts] = useState<VideoPart[]>([]);
  const [partIndex, setPartIndex] = useState(0);
  const [source, setSource] = useState<VideoSource | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const [advancing, setAdvancing] = useState(false);
  const allowed = useRef(videos);
  allowed.current = videos;
  const mounted = useRef(true);
  const navigating = useRef(false);
  const activeRequest = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeRequest.current++;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setParts([]);
    setPartIndex(0);
    setSource(null);
    setError('');
    setMessage('');
    fetchParts(video, allowed.current, folderId, session, controller.signal)
      .then((p) => {
        if (!controller.signal.aborted) setParts(p);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [video.id, folderId, session, revision]);

  const part = parts[partIndex];
  useEffect(() => {
    if (!part) return;
    const controller = new AbortController();
    setSource(null);
    setError('');
    fetchStream(video, part.cid, allowed.current, folderId, session, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setSource(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [video.id, part?.cid, folderId, session, revision]);

  function select(next: Video) {
    if (!next.available || navigating.current || next.id === video.id) return;
    activeRequest.current++;
    setSource(null);
    setParts([]);
    setPartIndex(0);
    setError('');
    setMessage('');
    setVideo(next);
  }

  async function advance(direction: 1 | -1) {
    if (navigating.current) return;
    navigating.current = true;
    setAdvancing(true);
    setMessage('');
    const requestId = ++activeRequest.current;
    try {
      let queue = allowed.current.filter((v) => v.available);
      let index = queue.findIndex((v) => v.id === video.id);
      if (direction === 1 && index === queue.length - 1 && hasMore) {
        const loaded = await loadMore();
        if (!mounted.current || requestId !== activeRequest.current) return;
        queue = loaded.filter((v) => v.available);
        index = queue.findIndex((v) => v.id === video.id);
      }
      const candidates = queue.filter((v) => v.id !== video.id);
      const next =
        preferences.shuffle && direction === 1
          ? candidates[Math.floor(Math.random() * candidates.length)]
          : queue[index + direction];
      if (next) {
        setSource(null);
        setParts([]);
        setPartIndex(0);
        setVideo(next);
      } else
        setMessage(
          direction === 1
            ? hasMore
              ? '本页没有可播视频，请在列表中继续加载。'
              : '这个收藏夹已经看完啦，休息一下吧。'
            : '已经是第一条视频了。',
        );
    } catch (e) {
      if (mounted.current) setMessage(errorMessage(e));
    } finally {
      navigating.current = false;
      if (mounted.current) setAdvancing(false);
    }
  }

  function ended() {
    if (!preferences.autoNext) {
      setMessage('播放结束，自动连播已关闭。');
      return;
    }
    if (partIndex < parts.length - 1) {
      setSource(null);
      setPartIndex((i) => i + 1);
    } else void advance(1);
  }

  return (
    <PlayerLayer onBack={() => (fullscreen ? changeFullscreen(false) : onClose())}>
      <SafeAreaView
        style={s.root}
        edges={fullscreen ? ['left', 'right', 'bottom'] : ['top', 'left', 'right', 'bottom']}
      >
        <StatusBar style="light" hidden={fullscreen} />
        <View style={{ flex: 1 }} onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
          <View style={[s.header, fullscreen && { display: 'none' }]}>
            <IconButton name="chevron-down" label="关闭播放器" onPress={onClose} dark />
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>正在播放 · 仅限当前收藏夹</Text>
              <Text numberOfLines={1} style={s.folder}>
                {folderTitle}
              </Text>
            </View>
            <Icon name="shield-checkmark-outline" color={C.pink} size={22} />
          </View>
          <ScrollView
            scrollEnabled={!fullscreen}
            contentContainerStyle={[s.body, fullscreen && { maxWidth: '100%', height }]}
          >
            {source ? (
              <FavoriteVideo
                key={`${video.id}:${part?.cid}:${revision}`}
                source={source}
                onEnd={ended}
                title={video.title}
                fullscreen={fullscreen}
                onFullscreen={changeFullscreen}
                onNext={() => void advance(1)}
                onRetry={() => {
                  setSource(null);
                  setRevision((value) => value + 1);
                }}
                style={fullscreen ? { width: '100%', height } : s.screen}
                rate={preferences.playbackRate ?? 1}
                onRate={(playbackRate) => onPreferences({ ...preferences, playbackRate })}
              />
            ) : (
              <View style={[s.screen, fullscreen && { height, aspectRatio: undefined }]}>
                <View style={s.screenMessage}>
                  {error ? (
                    <Icon name="cloud-offline-outline" color={C.pink} size={36} />
                  ) : (
                    <ActivityIndicator color={C.pink} size="large" />
                  )}
                  <Text style={s.hint}>{error || '正在获取 B 站视频…'}</Text>
                </View>
              </View>
            )}
            <View style={[s.details, fullscreen && { display: 'none' }]}>
              {orientationError ? <Text style={s.message}>{orientationError}</Text> : null}
              <View style={s.pill}>
                <View style={s.dot} />
                <Text style={s.pillText}>来自你选择的收藏夹</Text>
              </View>
              <Text style={s.title}>{video.title}</Text>
              <Text style={s.author}>
                UP 主 · {video.author}
                {parts.length > 1 ? `  /  P${partIndex + 1} ${part?.part ?? ''}` : ''}
              </Text>
              <View style={s.controls}>
                <IconButton
                  name="play-skip-back"
                  label="上一个视频"
                  dark
                  onPress={() => void advance(-1)}
                  disabled={advancing}
                />
                <Pressable
                  accessibilityRole="button"
                  style={s.reload}
                  onPress={() => {
                    setSource(null);
                    setRevision((v) => v + 1);
                  }}
                >
                  <Icon name="reload" size={16} color="#CBD0DC" />
                  <Text style={{ color: '#CBD0DC', fontSize: 13 }}>重新加载</Text>
                </Pressable>
                <IconButton
                  name="play-skip-forward"
                  label="下一个视频"
                  dark
                  onPress={() => void advance(1)}
                  disabled={advancing}
                />
              </View>
              {message ? (
                <Text accessibilityRole="alert" style={s.message}>
                  {message}
                </Text>
              ) : null}
              <View style={s.toggle}>
                <View style={s.inline}>
                  <Icon name="repeat" color="#A0A8BA" size={20} />
                  <Text style={s.toggleText}>自动连播</Text>
                </View>
                <Switch
                  accessibilityLabel="自动连播"
                  value={preferences.autoNext}
                  onValueChange={(autoNext) => onPreferences({ ...preferences, autoNext })}
                  trackColor={{ false: '#363D4C', true: C.pink }}
                  thumbColor="#FFF"
                />
              </View>
              {parts.length > 1 && (
                <>
                  <Text style={s.sectionTitle}>视频分 P · {parts.length}</Text>
                  <View style={s.parts}>
                    {parts.map((p, index) => (
                      <Pressable
                        accessibilityRole="button"
                        key={p.cid}
                        onPress={() => {
                          if (index === partIndex) return;
                          setSource(null);
                          setPartIndex(index);
                        }}
                        style={[s.part, index === partIndex && s.activePart]}
                      >
                        <Text
                          numberOfLines={2}
                          style={[s.partText, index === partIndex && { color: C.pink }]}
                        >
                          P{p.page} {p.part}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
              <View style={s.queueHeader}>
                <Text style={s.sectionTitle}>收藏夹播放列表</Text>
                <Text style={s.queueCount}>{videos.length} 条已载入</Text>
              </View>
              {videos.map((item, index) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`播放 ${item.title}`}
                  disabled={!item.available || advancing}
                  key={item.id}
                  onPress={() => select(item)}
                  style={[
                    s.queueItem,
                    item.id === video.id && { backgroundColor: '#F36A9112' },
                    !item.available && { opacity: 0.35 },
                  ]}
                >
                  <Text style={[s.queueIndex, item.id === video.id && { color: C.pink }]}>
                    {item.id === video.id ? '▸' : String(index + 1).padStart(2, '0')}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      numberOfLines={2}
                      style={[s.queueTitle, item.id === video.id && { color: C.pink }]}
                    >
                      {item.title}
                    </Text>
                    <Text style={s.queueAuthor}>{item.available ? item.author : '视频已失效'}</Text>
                  </View>
                </Pressable>
              ))}
              {hasMore && (
                <Pressable
                  accessibilityRole="button"
                  disabled={advancing}
                  onPress={async () => {
                    try {
                      await loadMore();
                    } catch (e) {
                      setMessage(errorMessage(e));
                    }
                  }}
                  style={s.loadMore}
                >
                  <Text style={{ color: C.pink }}>加载更多收藏</Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </PlayerLayer>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#171A22' },
  header: {
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
  },
  eyebrow: { color: '#858DA0', fontSize: 10, letterSpacing: 1, marginBottom: 5 },
  folder: { color: '#F2F4FA', fontSize: 14, fontWeight: '600' },
  body: { width: '100%', maxWidth: 960, alignSelf: 'center' },
  screen: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#080A0F' },
  screenMessage: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 14,
    backgroundColor: '#080A0FDD',
  },
  hint: { color: '#CDD2DD', fontSize: 13, lineHeight: 22, textAlign: 'center' },
  smallHint: { color: '#7F899E', fontSize: 10, textAlign: 'center' },
  details: { padding: 24 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.pink },
  pillText: { color: C.pink, fontSize: 11 },
  title: { color: '#F1F3F9', fontSize: 21, fontWeight: '700', lineHeight: 31 },
  author: { color: '#848DA1', fontSize: 12, marginTop: 12, lineHeight: 21 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 26,
    marginVertical: 24,
  },
  reload: { flexDirection: 'row', gap: 7, padding: 12, alignItems: 'center' },
  message: {
    color: '#E5B5C4',
    fontSize: 12,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 16,
  },
  toggle: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#2B303D',
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 26,
  },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  toggleText: { color: '#C5CBDA', fontSize: 13 },
  sectionTitle: { color: '#F0F2F7', fontSize: 15, fontWeight: '600' },
  parts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 18 },
  part: { backgroundColor: '#242A36', borderRadius: 10, padding: 12, maxWidth: '100%' },
  activePart: { backgroundColor: '#F36A911C' },
  partText: { color: '#9CA5B7', fontSize: 12 },
  queueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  queueCount: { color: '#717B91', fontSize: 11 },
  queueItem: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  queueIndex: { width: 24, color: '#596478', fontSize: 13 },
  queueTitle: { color: '#C7CDDA', fontSize: 13, lineHeight: 20 },
  queueAuthor: { color: '#727E94', fontSize: 10, marginTop: 6 },
  loadMore: { padding: 20, alignItems: 'center' },
});
