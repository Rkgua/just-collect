import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView, type VideoPlayer, type VideoSource } from 'expo-video';
import * as Brightness from 'expo-brightness';
import { C, Icon, type IconName } from './ui';
import { duration } from '../lib/format';
import { cancelSeekAtCorner, clamp, gestureAxis, seekFromDrag } from '../lib/playerGestures';

type Props = {
  source: VideoSource;
  title: string;
  rate: number;
  onRate: (rate: number) => void;
  onEnd: () => void;
  fullscreen: boolean;
  onFullscreen: (value: boolean) => void;
  onNext?: () => void;
  onRetry?: () => void;
  shorts?: boolean;
  playerRef?: { current: VideoPlayer | null };
  style?: StyleProp<ViewStyle>;
};

function Tool({
  icon,
  label,
  onPress,
  selected,
  text,
}: {
  icon?: IconName;
  label: string;
  onPress: () => void;
  selected?: boolean;
  text?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={s.tool}
    >
      {icon && <Icon name={icon} size={21} color={selected ? C.pink : '#FFF'} />}
      {text && <Text style={[s.toolText, selected && { color: C.pink }]}>{text}</Text>}
    </Pressable>
  );
}

/** Original RN controls, inspired by Bilibili's publicly documented interaction patterns. */
export function FavoriteVideo(props: Props) {
  const {
    source,
    title,
    rate,
    onRate,
    onEnd,
    fullscreen,
    onFullscreen,
    onNext,
    onRetry,
    shorts,
    playerRef,
    style,
  } = props;
  const player = useVideoPlayer(source, (p) => {
    p.preservesPitch = true;
    p.playbackRate = rate;
    p.timeUpdateEventInterval = 0.25;
    p.staysActiveInBackground = false;
    if (AppState.currentState === 'active') p.play();
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const time = useEvent(player, 'timeUpdate', {
    currentTime: 0,
    bufferedPosition: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
  });
  const length = Number.isFinite(player.duration) ? player.duration : 0;
  const current = time?.currentTime ?? 0;
  const [controls, setControls] = useState(true);
  const [panel, setPanel] = useState(false);
  const [locked, setLocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [boost, setBoost] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [hud, setHud] = useState('');
  const dimensions = useRef({ width: 1, height: 1 });
  const barWidth = useRef(1);
  const brightness = useRef(0.5);
  const boosting = useRef(false);
  const skipTap = useRef(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);
  const gesture = useRef({
    kind: null as 'seek' | 'level' | null,
    start: 0,
    volume: 1,
    brightness: 0.5,
    x: 0,
    y: 0,
    target: 0,
    canceled: false,
    playing: false,
  });
  const latest = useRef({ ...props, player, locked, length });
  latest.current = { ...props, player, locked, length };
  const temporaryRate = Math.max(2, rate);
  function restoreBoost() {
    if (!boosting.current) return;
    boosting.current = false;
    skipTap.current = true;
    setBoost(false);
    try {
      player.playbackRate = latest.current.rate;
    } catch {
      /* player is being released */
    }
  }
  const restoreRef = useRef(restoreBoost);
  restoreRef.current = restoreBoost;
  useEffect(() => {
    player.preservesPitch = true;
    if (!boosting.current) player.playbackRate = rate;
  }, [player, rate]);
  useEffect(() => {
    if (playerRef) playerRef.current = player;
    const background = AppState.addEventListener('change', (value) => {
      if (value !== 'active') {
        restoreRef.current();
        player.pause();
      }
    });
    return () => {
      background.remove();
      if (playerRef?.current === player) playerRef.current = null;
      if (tapTimer.current) clearTimeout(tapTimer.current);
      try {
        player.pause();
      } catch {
        /* shared native player already released */
      }
    };
  }, [player, playerRef]);
  useEffect(() => {
    const end = player.addListener('playToEnd', onEnd);
    return () => end.remove();
  }, [player, onEnd]);
  useEffect(() => {
    if (!isPlaying) setControls(true);
  }, [isPlaying]);
  useEffect(() => {
    if (!controls || !isPlaying || panel || preview !== null) return;
    const timer = setTimeout(() => setControls(false), 3500);
    return () => clearTimeout(timer);
  }, [controls, isPlaying, panel, preview, fullscreen, locked]);
  useEffect(() => {
    setControls(true);
    setLocked(false);
    setPanel(false);
  }, [fullscreen]);
  useEffect(() => {
    if (!hud) return;
    const timer = setTimeout(() => setHud(''), 1800);
    return () => clearTimeout(timer);
  }, [hud]);
  useEffect(() => {
    if (Platform.OS !== 'web' && fullscreen)
      void Brightness.getBrightnessAsync()
        .then((value) => {
          brightness.current = value;
        })
        .catch(() => {});
  }, [fullscreen]);
  function togglePlaying() {
    if (player.playing) player.pause();
    else player.play();
    setControls(true);
  }
  function tap() {
    if (skipTap.current) {
      skipTap.current = false;
      return;
    }
    const now = Date.now();
    if (now - lastTap.current < 280) {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      lastTap.current = 0;
      if (!locked) togglePlaying();
      else setControls(true);
      return;
    }
    lastTap.current = now;
    tapTimer.current = setTimeout(() => {
      setControls((value) => !value);
      setPanel(false);
    }, 280);
  }
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: (event) => {
          const p = latest.current.player;
          gesture.current = {
            kind: null,
            start: p.currentTime,
            volume: p.volume,
            brightness: brightness.current,
            x: event.nativeEvent.locationX,
            y: event.nativeEvent.locationY,
            target: p.currentTime,
            canceled: false,
            playing: p.playing,
          };
          return false;
        },
        onMoveShouldSetPanResponderCapture: (_event, g) =>
          !latest.current.locked &&
          !boosting.current &&
          !!gestureAxis(g.dx, g.dy, latest.current.fullscreen),
        onPanResponderGrant: () => {
          if (tapTimer.current) clearTimeout(tapTimer.current);
          lastTap.current = 0;
          skipTap.current = true;
          setPanel(false);
        },
        onPanResponderMove: (_event, g) => {
          const data = latest.current;
          const state = gesture.current;
          state.kind ??= gestureAxis(g.dx, g.dy, data.fullscreen);
          if (state.kind === 'seek' && data.length > 0) {
            if (state.playing && data.player.playing) data.player.pause();
            state.target = seekFromDrag(state.start, g.dx, dimensions.current.width, data.length);
            state.canceled = cancelSeekAtCorner(
              state.x + g.dx,
              state.y + g.dy,
              dimensions.current.width,
            );
            setPreview(state.target);
            setHud(
              state.canceled
                ? '松手取消进度调整'
                : `${duration(state.target)} / ${duration(data.length)}`,
            );
          } else if (state.kind === 'level') {
            const delta = (-g.dy / Math.max(1, dimensions.current.height)) * 1.3;
            if (state.x >= dimensions.current.width / 2) {
              const value = clamp(state.volume + delta);
              data.player.volume = value;
              data.player.muted = false;
              setMuted(false);
              setHud(`音量 ${Math.round(value * 100)}%`);
            } else if (Platform.OS !== 'web') {
              const value = clamp(state.brightness + delta, 0.05, 1);
              brightness.current = value;
              void Brightness.setBrightnessAsync(value).catch(() => setHud('暂时无法调整亮度'));
              setHud(`亮度 ${Math.round(value * 100)}%`);
            } else setHud('手机端支持调整亮度');
          }
        },
        onPanResponderRelease: () => {
          const { player: p } = latest.current;
          const state = gesture.current;
          if (state.kind === 'seek') {
            if (!state.canceled) p.currentTime = state.target;
            if (state.playing && AppState.currentState === 'active') p.play();
          }
          setPreview(null);
          setHud('');
          setControls(true);
          skipTap.current = false;
        },
        onPanResponderTerminate: () => {
          if (
            gesture.current.kind === 'seek' &&
            gesture.current.playing &&
            AppState.currentState === 'active'
          )
            latest.current.player.play();
          setPreview(null);
          setHud('');
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );
  const bar = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !latest.current.locked,
        onMoveShouldSetPanResponder: () => !latest.current.locked,
        onPanResponderGrant: (event) => {
          gesture.current.playing = latest.current.player.playing;
          latest.current.player.pause();
          gesture.current.target =
            clamp(event.nativeEvent.locationX / barWidth.current) * latest.current.length;
          setPreview(gesture.current.target);
        },
        onPanResponderMove: (event) => {
          gesture.current.target =
            clamp(event.nativeEvent.locationX / barWidth.current) * latest.current.length;
          setPreview(gesture.current.target);
        },
        onPanResponderRelease: () => {
          latest.current.player.currentTime = gesture.current.target;
          if (gesture.current.playing && AppState.currentState === 'active')
            latest.current.player.play();
          setPreview(null);
          setControls(true);
        },
        onPanResponderTerminate: () => {
          if (gesture.current.playing && AppState.currentState === 'active')
            latest.current.player.play();
          setPreview(null);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );
  const position = preview ?? current;
  const percent = length ? clamp(position / length) * 100 : 0;
  const buffered = length ? clamp(Math.max(0, time?.bufferedPosition ?? 0) / length) * 100 : 0;
  const inset = shorts && !fullscreen ? 202 : 0;
  return (
    <View
      testID="favorite-video"
      style={[s.root, style]}
      onLayout={(e) => {
        dimensions.current = e.nativeEvent.layout;
      }}
    >
      <VideoView
        testID={shorts ? 'short-video-player' : 'favorite-video-player'}
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
        surfaceType="textureView"
        allowsPictureInPicture={false}
        pointerEvents="none"
      />
      <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
        <Pressable
          testID="video-gesture-surface"
          accessibilityLabel="视频手势区域"
          style={StyleSheet.absoluteFill}
          onPress={tap}
          delayLongPress={450}
          onLongPress={() => {
            if (locked || !player.playing) return;
            if (tapTimer.current) clearTimeout(tapTimer.current);
            boosting.current = true;
            skipTap.current = true;
            setBoost(true);
            player.preservesPitch = true;
            player.playbackRate = temporaryRate;
          }}
          onPressOut={restoreBoost}
        />
      </View>
      {status === 'loading' && (
        <View pointerEvents="none" style={s.center}>
          <ActivityIndicator color={C.pink} />
          <Text style={s.hint}>正在缓冲…</Text>
        </View>
      )}
      {status === 'error' && (
        <View pointerEvents="box-none" style={s.center}>
          <Text style={s.hint}>播放失败，可以重试或换一条收藏。</Text>
          {onRetry && <Tool icon="reload" label="重试视频播放" text="重试播放" onPress={onRetry} />}
        </View>
      )}
      {boost && (
        <View pointerEvents="none" style={s.boost}>
          <Icon name="play-forward" color={C.pink} size={16} />
          <Text style={s.toolText}>{temporaryRate}× 加速中 · 松手恢复</Text>
        </View>
      )}
      {!!hud && (
        <View pointerEvents="none" style={s.hud}>
          <Text style={s.hudText}>{hud}</Text>
        </View>
      )}
      {controls && !locked && (
        <>
          {fullscreen && (
            <View style={s.top}>
              <Tool icon="chevron-back" label="退出全屏" onPress={() => onFullscreen(false)} />
              <Text numberOfLines={1} style={s.title}>
                {title}
              </Text>
              <Text style={s.badge}>仅限收藏</Text>
            </View>
          )}
          {!isPlaying && status !== 'loading' && (
            <View pointerEvents="box-none" style={s.center}>
              <Tool
                icon="play"
                label={shorts ? '播放当前短视频' : '播放视频'}
                onPress={togglePlaying}
              />
            </View>
          )}
          <View style={[s.bottom, { bottom: inset }]}>
            {preview !== null && (
              <Text style={s.preview}>
                {duration(preview)} / {duration(length)}
              </Text>
            )}
            <View
              testID="video-progress"
              accessibilityRole="adjustable"
              accessibilityLabel={shorts ? '短视频播放进度' : '播放进度'}
              accessibilityValue={{ min: 0, max: Math.floor(length), now: Math.floor(position) }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) => {
                player.currentTime = clamp(
                  player.currentTime + (e.nativeEvent.actionName === 'increment' ? 10 : -10),
                  0,
                  length,
                );
              }}
              onLayout={(e) => {
                barWidth.current = e.nativeEvent.layout.width;
              }}
              style={s.progressTouch}
              {...bar.panHandlers}
            >
              <View pointerEvents="none" style={s.track}>
                <View style={[s.buffer, { width: `${buffered}%` }]} />
                <View style={[s.fill, { width: `${percent}%` }]} />
              </View>
              <View pointerEvents="none" style={[s.thumb, { left: `${percent}%` }]} />
            </View>
            <View style={s.row}>
              <Tool
                icon={isPlaying ? 'pause' : 'play'}
                label={
                  isPlaying
                    ? shorts
                      ? '暂停当前短视频'
                      : '暂停视频'
                    : shorts
                      ? '继续短视频播放'
                      : '继续视频播放'
                }
                onPress={togglePlaying}
              />
              {fullscreen && (
                <Tool
                  icon="play-back"
                  label="后退 10 秒"
                  onPress={() => {
                    player.currentTime = clamp(player.currentTime - 10, 0, length);
                  }}
                />
              )}
              {fullscreen && onNext && (
                <Tool
                  icon="play-skip-forward"
                  label={shorts ? '全屏下一条随机收藏' : '全屏下一个视频'}
                  onPress={onNext}
                />
              )}
              <Text style={s.clock}>
                {duration(position)} <Text style={s.total}>/ {duration(length)}</Text>
              </Text>
              <View style={{ flex: 1 }} />
              <Tool
                label="调整播放倍速"
                text={`${rate}×`}
                selected
                onPress={() => {
                  setPanel((value) => !value);
                  setControls(true);
                }}
              />
              <Tool
                icon={muted ? 'volume-mute-outline' : 'volume-high-outline'}
                label={muted ? '开启声音' : '静音'}
                onPress={() => {
                  player.muted = !player.muted;
                  setMuted(player.muted);
                }}
              />
              <Tool
                icon={fullscreen ? 'contract-outline' : 'expand-outline'}
                label={fullscreen ? '退出横屏全屏' : '横屏全屏播放'}
                onPress={() => onFullscreen(!fullscreen)}
              />
            </View>
          </View>
          {panel && (
            <View
              testID="speed-panel"
              style={[
                s.panel,
                { bottom: inset + 86 },
                !fullscreen && !shorts && { top: 8, bottom: 8, justifyContent: 'center' },
              ]}
            >
              <Text style={s.panelTitle}>播放速度</Text>
              <View style={s.rates}>
                {[0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3].map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={`设置 ${value} 倍速`}
                    accessibilityState={{ selected: value === rate }}
                    onPress={() => {
                      restoreBoost();
                      onRate(value);
                      setPanel(false);
                    }}
                    style={[s.rate, value === rate && s.activeRate]}
                  >
                    <Text style={[s.toolText, value === rate && { color: C.pink }]}>{value}×</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={s.panelHint}>长按画面临时加速，松手恢复原速</Text>
            </View>
          )}
        </>
      )}
      {fullscreen && controls && (
        <View style={s.lock}>
          <Tool
            icon={locked ? 'lock-closed' : 'lock-open-outline'}
            label={locked ? '解锁播放器' : '锁定播放器'}
            selected={locked}
            onPress={() => {
              setLocked((value) => !value);
              setPanel(false);
              setControls(true);
            }}
          />
        </View>
      )}
      {!controls && !locked && (
        <View pointerEvents="none" style={[s.thinTrack, { bottom: inset }]}>
          <View style={[s.fill, { width: `${percent}%` }]} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { backgroundColor: '#080A0F', overflow: 'hidden' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 12 },
  hint: { color: '#D5DAE5', fontSize: 12, textAlign: 'center' },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 6,
    backgroundColor: '#080A0FA6',
  },
  title: { flex: 1, color: '#FFF', fontSize: 14, marginHorizontal: 8 },
  badge: { color: '#FB7299', fontSize: 10, marginRight: 12 },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 5,
    backgroundColor: '#080A0FB8',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  tool: {
    minWidth: 38,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    flexDirection: 'row',
    gap: 6,
  },
  toolText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  clock: { color: '#FFF', fontSize: 11, marginLeft: 5 },
  total: { color: '#9FA8B8' },
  progressTouch: { height: 27, justifyContent: 'center' },
  track: { height: 3, backgroundColor: '#FFFFFF40', borderRadius: 2, overflow: 'hidden' },
  buffer: { position: 'absolute', height: 3, backgroundColor: '#FFFFFF64' },
  fill: { height: '100%', backgroundColor: '#FB7299' },
  thumb: {
    position: 'absolute',
    width: 9,
    height: 9,
    marginLeft: -4.5,
    borderRadius: 5,
    top: 9,
    backgroundColor: '#FB7299',
  },
  thinTrack: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: '#FFFFFF40' },
  preview: { color: '#FB7299', textAlign: 'center', paddingTop: 5, fontSize: 11 },
  panel: {
    position: 'absolute',
    right: 12,
    width: 264,
    maxWidth: '90%',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#171C28F5',
  },
  panelTitle: { color: '#FFF', fontSize: 13, marginBottom: 10 },
  rates: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  rate: {
    width: '23%',
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#FFFFFF0A',
  },
  activeRate: { backgroundColor: '#FB729921' },
  panelHint: { color: '#929CAF', fontSize: 9, marginTop: 10 },
  boost: {
    position: 'absolute',
    top: 52,
    alignSelf: 'center',
    padding: 10,
    backgroundColor: '#101621D9',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  hud: {
    position: 'absolute',
    alignSelf: 'center',
    top: '38%',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#101621E6',
  },
  hudText: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  lock: {
    position: 'absolute',
    left: 10,
    top: '42%',
    backgroundColor: '#101621B8',
    borderRadius: 22,
  },
});
