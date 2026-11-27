import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { VideoPlayer, VideoSource } from 'expo-video';
import { Button, C, Icon, IconButton } from './ui';
import { FavoriteVideo } from './FavoriteVideo';
import { PlayerLayer } from './PlayerLayer';
import { usePlayerFullscreen } from '../hooks/usePlayerFullscreen';
import { fetchParts, fetchStream } from '../services/bilibili';
import { createRandomFavorites, swipeDirection } from '../services/randomFavorites';
import { errorMessage } from '../lib/format';
import type { Folder, Video, VideoPart } from '../types';
type PlayerRef = { current: VideoPlayer | null };

function ShortClip({
  video,
  allowed,
  folderId,
  session,
  autoNext,
  playerRef,
  onNext,
  fullscreen,
  onFullscreen,
  rate,
  onRate,
}: {
  video: Video;
  allowed: Video[];
  folderId: string;
  session: string;
  autoNext: boolean;
  playerRef: PlayerRef;
  onNext: () => void;
  fullscreen: boolean;
  onFullscreen: (value: boolean) => void;
  rate: number;
  onRate: (rate: number) => void;
}) {
  const [parts, setParts] = useState<VideoPart[]>([]);
  const [partIndex, setPartIndex] = useState(0);
  const [source, setSource] = useState<VideoSource | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;
  useEffect(() => {
    const abort = new AbortController();
    setParts([]);
    setPartIndex(0);
    setSource(null);
    setError('');
    fetchParts(video, allowedRef.current, folderId, session, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setParts(value);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(errorMessage(e));
      });
    return () => abort.abort();
  }, [video.id, folderId, session, revision]);
  const part = parts[partIndex];
  useEffect(() => {
    if (!part) return;
    const abort = new AbortController();
    setSource(null);
    setError('');
    fetchStream(video, part.cid, allowedRef.current, folderId, session, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setSource(value);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(errorMessage(e));
      });
    return () => abort.abort();
  }, [video.id, part?.cid, folderId, session, revision]);
  function ended() {
    if (!autoNext) return;
    if (partIndex < parts.length - 1) {
      setSource(null);
      setPartIndex((index) => index + 1);
    } else onNext();
  }
  return (
    <View style={StyleSheet.absoluteFill}>
      {source ? (
        <FavoriteVideo
          key={`${part?.cid}:${revision}`}
          source={source}
          title={video.title}
          shorts
          fullscreen={fullscreen}
          onFullscreen={onFullscreen}
          onNext={onNext}
          onRetry={() => {
            setSource(null);
            setRevision((value) => value + 1);
          }}
          style={StyleSheet.absoluteFill}
          onEnd={ended}
          playerRef={playerRef}
          rate={rate}
          onRate={onRate}
        />
      ) : (
        <View style={s.center}>
          {error ? (
            <Icon name="alert-circle-outline" color={C.pink} size={36} />
          ) : (
            <ActivityIndicator color={C.pink} size="large" />
          )}
          <Text style={s.hint}>{error || '正在打开这条收藏…'}</Text>
        </View>
      )}
      <View style={[s.clipTools, fullscreen && !!source && { display: 'none' }]}>
        {fullscreen && !source && (
          <IconButton
            name="chevron-back"
            label="退出全屏"
            dark
            onPress={() => onFullscreen(false)}
          />
        )}
        {parts.length > 1 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="切换短视频分P"
            style={s.textTool}
            onPress={() => {
              setSource(null);
              setPartIndex((index) => (index + 1) % parts.length);
            }}
          >
            <Icon name="albums-outline" size={16} color="#CBD2E1" />
            <Text style={s.toolText}>
              P{partIndex + 1}/{parts.length}
            </Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="重试当前短视频"
          onPress={() => {
            setSource(null);
            setRevision((value) => value + 1);
          }}
          style={s.textTool}
        >
          <Icon name="reload" size={16} color="#CBD2E1" />
          <Text style={s.toolText}>重试播放</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function RandomShorts({
  folders,
  scopeId,
  scopeTitle,
  session,
  autoNext,
  onAutoNext,
  rate,
  onRate,
  onClose,
}: {
  folders: Folder[];
  scopeId: string;
  scopeTitle: string;
  session: string;
  autoNext: boolean;
  onAutoNext: (value: boolean) => void;
  rate: number;
  onRate: (rate: number) => void;
  onClose: () => void;
}) {
  const { fullscreen, changeFullscreen, orientationError } = usePlayerFullscreen();
  const fullscreenRef = useRef(false);
  fullscreenRef.current = fullscreen;
  const [history, setHistory] = useState<Video[]>([]);
  const [position, setPosition] = useState(-1);
  const [picking, setPicking] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [toast, setToast] = useState('');
  const [round, setRound] = useState(0);
  const historyRef = useRef<Video[]>([]);
  const positionRef = useRef(-1);
  const busy = useRef(false);
  const alive = useRef(true);
  const playerRef = useRef<VideoPlayer | null>(null);
  const deck = useRef<ReturnType<typeof createRandomFavorites> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const current = history[position];

  function pause() {
    try {
      playerRef.current?.pause();
    } catch {
      /* The previous player may already have been released. */
    }
  }
  async function next() {
    if (busy.current || !alive.current) return;
    busy.current = true;
    pause();
    setPicking(true);
    setError('');
    setMessage('');
    const abort = abortRef.current;
    try {
      if (positionRef.current + 1 < historyRef.current.length) {
        positionRef.current++;
        setPosition(positionRef.current);
        return;
      }
      const result = await deck.current?.next();
      if (!result || abort?.signal.aborted || !alive.current) return;
      setHasMore(result.hasMore);
      if (result.video) {
        if (!folders.some((folder) => folder.id === result.video!.folderId))
          throw new Error('该视频不在已选收藏范围中。');
        historyRef.current = [...historyRef.current, result.video];
        positionRef.current = historyRef.current.length - 1;
        setHistory(historyRef.current);
        setPosition(positionRef.current);
      } else
        setMessage(
          result.hasMore
            ? '这批收藏暂无有效视频，再换一批试试。'
            : '这轮收藏已经刷完啦，休息一下吧。',
        );
    } catch (e) {
      if (alive.current && !abort?.signal.aborted) setError(errorMessage(e));
    } finally {
      if (alive.current && abort === abortRef.current) {
        busy.current = false;
        setPicking(false);
      }
    }
  }
  function previous() {
    if (busy.current) return;
    if (positionRef.current <= 0) {
      setToast('已经是这轮的第一条收藏。');
      return;
    }
    pause();
    setError('');
    setMessage('');
    positionRef.current--;
    setPosition(positionRef.current);
  }
  const callbacks = useRef({ next, previous });
  callbacks.current = { next, previous };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          !fullscreenRef.current &&
          Math.abs(gesture.dy) > 18 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.3,
        onPanResponderRelease: (_event, gesture) => {
          const direction = swipeDirection(gesture.dx, gesture.dy, gesture.vy);
          if (direction === 'next') void callbacks.current.next();
          if (direction === 'previous') callbacks.current.previous();
        },
      }),
    [],
  );

  useEffect(() => {
    alive.current = true;
    const abort = new AbortController();
    abortRef.current = abort;
    deck.current = createRandomFavorites(folders, session, abort.signal);
    historyRef.current = [];
    positionRef.current = -1;
    busy.current = false;
    setHistory([]);
    setPosition(-1);
    setHasMore(true);
    void callbacks.current.next();
    return () => {
      alive.current = false;
      abort.abort();
      pause();
    };
  }, [round, session]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const canPrevious = position > 0;
  const showVideo = current && !picking && !error && !message;
  return (
    <PlayerLayer onBack={() => (fullscreen ? changeFullscreen(false) : onClose())}>
      <SafeAreaView
        style={s.root}
        edges={fullscreen ? ['left', 'right', 'bottom'] : ['top', 'left', 'right', 'bottom']}
      >
        <StatusBar style="light" hidden={fullscreen} />
        <View testID="random-shorts-gesture-area" style={s.stage} {...pan.panHandlers}>
          {fullscreen && !showVideo && (
            <View style={s.top}>
              <IconButton
                name="chevron-back"
                label="退出全屏"
                dark
                onPress={() => changeFullscreen(false)}
              />
            </View>
          )}
          {showVideo ? (
            <ShortClip
              key={`${round}:${position}:${current.id}`}
              video={current}
              allowed={history}
              folderId={scopeId}
              session={session}
              autoNext={autoNext}
              rate={rate}
              onRate={onRate}
              playerRef={playerRef}
              onNext={() => void next()}
              fullscreen={fullscreen}
              onFullscreen={changeFullscreen}
            />
          ) : (
            <View style={s.center}>
              {picking ? (
                <>
                  <ActivityIndicator size="large" color={C.pink} />
                  <Text style={s.hint}>随机翻开一条收藏…</Text>
                </>
              ) : (
                <>
                  <Icon
                    name={error ? 'cloud-offline-outline' : 'sparkles-outline'}
                    color={C.pink}
                    size={40}
                  />
                  <Text accessibilityRole="alert" style={s.hint}>
                    {error || message || '这里暂时没有可播放的收藏。'}
                  </Text>
                  <View style={s.retry}>
                    <Button
                      secondary
                      onPress={() => {
                        if (!hasMore && !error) setRound((value) => value + 1);
                        else void next();
                      }}
                    >
                      {!hasMore && !error ? '重新随机一轮' : '继续随机'}
                    </Button>
                  </View>
                </>
              )}
            </View>
          )}
          <View pointerEvents="box-none" style={[s.top, fullscreen && { display: 'none' }]}>
            <IconButton
              name="chevron-down"
              label="退出短视频模式"
              dark
              onPress={() => {
                pause();
                onClose();
              }}
            />
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>随机刷 · 仅限已选收藏</Text>
              <Text numberOfLines={1} style={s.scope}>
                {scopeTitle}
              </Text>
            </View>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="短视频自动连播"
              accessibilityState={{ checked: autoNext }}
              onPress={() => onAutoNext(!autoNext)}
              style={s.auto}
            >
              <Icon name="repeat" size={20} color={autoNext ? C.pink : '#7D879C'} />
              <Text style={[s.autoText, autoNext && { color: C.pink }]}>连播</Text>
            </Pressable>
          </View>
          <View pointerEvents="box-none" style={[s.footer, fullscreen && { display: 'none' }]}>
            {orientationError ? <Text style={s.toast}>{orientationError}</Text> : null}
            {toast ? (
              <Text accessibilityRole="alert" style={s.toast}>
                {toast}
              </Text>
            ) : null}
            {showVideo && (
              <View pointerEvents="none">
                <Text style={s.badge}>只刷收藏 · 本轮第 {position + 1} 条</Text>
                <Text numberOfLines={2} style={s.title}>
                  {current.title}
                </Text>
                <Text numberOfLines={1} style={s.author}>
                  UP 主 · {current.author} /{' '}
                  {folders.find((folder) => folder.id === current.folderId)?.title}
                </Text>
              </View>
            )}
            <View style={s.navigation}>
              <IconButton
                name="chevron-up"
                label="上一条收藏短视频"
                dark
                disabled={!canPrevious || picking}
                onPress={previous}
              />
              <Text style={s.swipeHint}>上滑随机换一条 · 下滑回看</Text>
              <IconButton
                name="chevron-down"
                label="下一条随机收藏"
                dark
                disabled={picking}
                onPress={() => void next()}
              />
            </View>
          </View>
        </View>
      </SafeAreaView>
    </PlayerLayer>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#090B10' },
  stage: { flex: 1, backgroundColor: '#090B10' },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 18,
    backgroundColor: '#090B10B8',
  },
  eyebrow: { color: C.pink, fontSize: 10, marginBottom: 5 },
  scope: { color: '#D9DFEC', fontSize: 13, fontWeight: '600' },
  auto: { alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5, gap: 3 },
  autoText: { fontSize: 9, color: '#7D879C' },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  playCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#151922AA',
  },
  hint: { color: '#C3CDDF', textAlign: 'center', fontSize: 13, lineHeight: 23 },
  errorDetail: { color: '#7E8BA4', textAlign: 'center', fontSize: 10 },
  retry: { minWidth: 160 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 22,
    paddingBottom: 14,
    paddingTop: 20,
    backgroundColor: '#090B10B8',
  },
  badge: { fontSize: 10, color: C.pink, marginBottom: 10 },
  title: { fontSize: 20, fontWeight: '700', lineHeight: 29, color: '#F1F4FB' },
  author: { color: '#8F9CB2', fontSize: 11, marginTop: 10, marginBottom: 12 },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  swipeHint: { fontSize: 10, color: '#8B96AB', flex: 1, textAlign: 'center' },
  playbackTools: {
    position: 'absolute',
    bottom: 250,
    left: 22,
    right: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#090B1070',
    borderRadius: 12,
    paddingHorizontal: 8,
  },
  extraPlaybackTools: { position: 'absolute', bottom: 202, left: 22, right: 22 },
  smallTool: { paddingVertical: 12, paddingHorizontal: 6 },
  time: { color: '#A9B5C9', fontSize: 10 },
  progressTouch: { flex: 1, height: 44, justifyContent: 'center', paddingHorizontal: 4 },
  progressTrack: { height: 3, borderRadius: 3, backgroundColor: '#5B657D88', overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: C.pink },
  clipTools: { position: 'absolute', top: 91, right: 18, flexDirection: 'row', gap: 7 },
  textTool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: '#1C2230BB',
    borderRadius: 12,
  },
  toolText: { color: '#CBD2E1', fontSize: 11 },
  toast: { color: '#CFD5E3', fontSize: 11, textAlign: 'center', padding: 10 },
});
