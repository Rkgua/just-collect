import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AddFolder } from './src/components/AddFolder';
import { Player } from './src/components/Player';
import { RandomShorts } from './src/components/RandomShorts';
import { AccountLogin } from './src/components/AccountLogin';
import { AccountFolders } from './src/components/AccountFolders';
import { Button, C, Icon, IconButton, Notice, Sheet, type IconName } from './src/components/ui';
import { useFavoriteFeed } from './src/hooks/useFavoriteFeed';
import { duration, errorMessage, views } from './src/lib/format';
import { normalizeSession } from './src/lib/folder';
import {
  DEFAULT_LIBRARY,
  readLibrary,
  readSession,
  writeLibrary,
  writeSession,
} from './src/services/storage';
import { REFERER, fetchCurrentAccount } from './src/services/bilibili';
import { clearLoginCookies } from './src/services/loginCookies';
import {
  ALL_FOLDERS,
  type Account,
  type Folder,
  type Library,
  type Preferences,
  type Video,
} from './src/types';

type Tab = 'watch' | 'folders' | 'settings';
const TABS: { id: Tab; name: string; icon: IconName; selected: IconName }[] = [
  { id: 'watch', name: '收藏视频', icon: 'play-circle-outline', selected: 'play-circle' },
  { id: 'folders', name: '收藏夹', icon: 'folder-open-outline', selected: 'folder-open' },
  { id: 'settings', name: '设置', icon: 'options-outline', selected: 'options' },
];

function Artwork() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.art}>
      <View style={s.orbit} />
      <View style={s.orbitInner} />
      <View style={s.artDot1} />
      <View style={s.artDot2} />
      <View style={s.artFolder}>
        <Icon name="folder" color="#A6B7E6" size={57} />
      </View>
      <View style={s.artTv}>
        <View style={s.antenna1} />
        <View style={s.antenna2} />
        <View style={s.tvFace}>
          <Icon name="play" color="#FFF" size={34} />
        </View>
        <View style={s.tvFeet} />
        <View style={s.tvFeet2} />
      </View>
      <View style={s.artHeart}>
        <Icon name="heart" color={C.pink} size={23} />
      </View>
      <View style={s.artStar}>
        <Icon name="sparkles" color="#D9B75B" size={22} />
      </View>
    </View>
  );
}

function Cover({ uri, style }: { uri: string; style: object }) {
  return uri ? (
    <Image
      source={{ uri, ...(Platform.OS !== 'web' ? { headers: { Referer: REFERER } } : {}) }}
      style={style}
    />
  ) : (
    <View
      style={[
        style,
        { backgroundColor: '#EEF0F7', alignItems: 'center', justifyContent: 'center' },
      ]}
    >
      <Icon name="videocam-outline" size={30} color="#B9C0D4" />
    </View>
  );
}

function AppContent() {
  const [library, setLibrary] = useState<Library>(DEFAULT_LIBRARY);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState('');
  const [account, setAccount] = useState<Account | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [choosingAccountFolders, setChoosingAccountFolders] = useState(false);
  const [tab, setTab] = useState<Tab>('watch');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Folder | null>(null);
  const [playing, setPlaying] = useState<Video | null>(null);
  const [shorts, setShorts] = useState<{
    folders: Folder[];
    scopeId: string;
    title: string;
  } | null>(null);
  const [storageError, setStorageError] = useState('');
  const [search, setSearch] = useState('');
  const [keyword, setKeyword] = useState('');
  const [sessionInput, setSessionInput] = useState('');
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [sessionNotice, setSessionNotice] = useState('');
  const [contentWidth, setContentWidth] = useState(360);
  const hydrated = useRef(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const { width } = useWindowDimensions();

  useEffect(() => {
    let live = true;
    Promise.all([readLibrary(), readSession()])
      .then(([saved, token]) => {
        if (!live) return;
        setLibrary(saved);
        setSession(token);
        hydrated.current = true;
      })
      .catch((e) => {
        if (live) setStorageError(errorMessage(e));
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!ready || !hydrated.current) return;
    saveQueue.current = saveQueue.current
      .then(() => writeLibrary(library))
      .catch(() => setStorageError('无法保存到本机，重启后更改可能丢失。请检查存储空间。'));
  }, [library, ready]);
  useEffect(() => {
    if (playing || shorts) return;
    const timer = setTimeout(() => setKeyword(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search, playing, shorts]);

  const updateFolder = useCallback(
    (folder: Folder) =>
      setLibrary((old) => {
        const saved = old.folders.find((f) => f.id === folder.id);
        if (!saved || JSON.stringify(saved) === JSON.stringify(folder)) return old;
        return {
          ...old,
          folders: old.folders.map((f) => (f.id === folder.id ? { ...f, ...folder } : f)),
        };
      }),
    [],
  );
  const aggregateFolders = library.folders.filter(
    (f) => !library.aggregateIds || library.aggregateIds.includes(f.id),
  );
  const isAggregate = library.activeId === ALL_FOLDERS;
  const data = useFavoriteFeed(
    ready ? library.activeId : null,
    session,
    keyword,
    updateFolder,
    aggregateFolders,
  );
  const activeFolder: Folder | undefined =
    isAggregate && aggregateFolders.length
      ? {
          id: ALL_FOLDERS,
          title: '收藏汇总',
          owner: `${aggregateFolders.length} 个已选收藏夹 · 自动去重`,
          count: aggregateFolders.reduce((sum, folder) => sum + folder.count, 0),
          cover: aggregateFolders.find((f) => f.cover)?.cover || '',
        }
      : library.folders.find((f) => f.id === library.activeId);
  useEffect(() => {
    const abort = new AbortController();
    if (!session) {
      setAccount(null);
      return () => abort.abort();
    }
    fetchCurrentAccount(session, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setAccount(value);
      })
      .catch(() => {
        if (!abort.signal.aborted) setAccount(null);
      });
    return () => abort.abort();
  }, [session]);
  const columns = width >= 800 ? 3 : 2;
  const cardWidth = (contentWidth - 48 - (columns - 1) * 14) / columns;
  function chooseFolder(id: string) {
    setSearch('');
    setKeyword('');
    setLibrary((old) => ({ ...old, activeId: id }));
  }
  function changePreferences(preferences: Preferences) {
    setLibrary((old) => ({ ...old, preferences }));
  }
  function addFolder(folder: Folder) {
    setLibrary((old) => ({
      ...old,
      activeId: folder.id,
      folders: old.folders.some((f) => f.id === folder.id)
        ? old.folders.map((f) => (f.id === folder.id ? { ...f, ...folder } : f))
        : [...old.folders, folder],
    }));
    setSearch('');
    setKeyword('');
    setTab('watch');
  }
  async function saveSession(clear = false) {
    setSessionError('');
    setSessionNotice('');
    setSessionBusy(true);
    try {
      const value = clear ? '' : normalizeSession(sessionInput);
      const verified = value ? await fetchCurrentAccount(value) : null;
      if (clear) await clearLoginCookies();
      await writeSession(value);
      setSession(value);
      setAccount(verified);
      if (clear)
        setLibrary((old) => {
          const folders = old.folders.filter((f) => !f.private);
          return {
            ...old,
            folders,
            activeId: folders.some((f) => f.id === old.activeId)
              ? old.activeId
              : (folders[0]?.id ?? null),
            aggregateIds: old.aggregateIds?.filter((id) => folders.some((f) => f.id === id)),
          };
        });
      setSessionInput('');
      setSessionNotice(value ? '凭证已加密保存。可返回收藏夹重试连接。' : '登录凭证已从本机删除。');
    } catch (e) {
      setSessionError(errorMessage(e));
    } finally {
      setSessionBusy(false);
    }
  }
  function startAccountImport() {
    setAdding(false);
    if (session) setChoosingAccountFolders(true);
    else setLoggingIn(true);
  }
  async function finishLogin(token: string, verified: Account) {
    await writeSession(token);
    setSession(token);
    setAccount(verified);
    setLoggingIn(false);
    setChoosingAccountFolders(true);
    setLibrary((old) => {
      const folders = old.folders.filter(
        (f) => !f.private || !f.accountId || f.accountId === verified.id,
      );
      return {
        ...old,
        folders,
        activeId: folders.some((f) => f.id === old.activeId)
          ? old.activeId
          : (folders[0]?.id ?? null),
        aggregateIds: old.aggregateIds?.filter((id) => folders.some((f) => f.id === id)),
      };
    });
  }
  function importFolders(folders: Folder[], owner: Account) {
    setLibrary((old) => {
      const merged = new Map(old.folders.map((f) => [f.id, f]));
      folders.forEach((f) => merged.set(f.id, { ...merged.get(f.id), ...f }));
      return {
        ...old,
        folders: [...merged.values()],
        aggregateIds: folders.map((f) => f.id),
        activeId: ALL_FOLDERS,
      };
    });
    setAccount(owner);
    setChoosingAccountFolders(false);
    setSearch('');
    setKeyword('');
    setTab('watch');
  }
  function showAllConnected() {
    setLibrary((old) => ({
      ...old,
      activeId: ALL_FOLDERS,
      aggregateIds: old.folders.map((f) => f.id),
    }));
    setSearch('');
    setKeyword('');
    setTab('watch');
  }
  function playAll() {
    const available = data.videos.filter((v) => v.available);
    const video = library.preferences.shuffle
      ? available[Math.floor(Math.random() * available.length)]
      : available[0];
    if (video) setPlaying(video);
  }

  if (!ready)
    return (
      <View style={s.boot}>
        <ActivityIndicator color={C.pink} />
        <Text style={s.bootText}>正在打开你的收藏…</Text>
      </View>
    );

  const watchHeader = (
    <>
      <View style={s.intro}>
        <View style={s.eyebrow}>
          <View style={s.pinkDot} />
          <Text style={s.eyebrowText}>YOUR LITTLE VIDEO SPACE</Text>
        </View>
        <Text style={s.pageTitle}>
          只看喜欢的<Text style={{ color: C.pink }}>。</Text>
        </Text>
        <Text style={s.pageSubtitle}>少一点推荐，多一点自己的选择。</Text>
      </View>
      {!activeFolder ? (
        <>
          <View style={s.welcome}>
            <Artwork />
            <View style={s.welcomeLabel}>
              <Icon name="heart-outline" size={13} color={C.pink} />
              <Text style={s.welcomeLabelText}>为你的喜欢，留一个位置</Text>
            </View>
            <Text style={s.welcomeTitle}>收藏很久的视频，{'\n'}现在就开始看吧。</Text>
            <Text style={s.welcomeCopy}>
              连接 B 站收藏夹，把「以后再看」{'\n'}变成此刻刚刚好的陪伴。
            </Text>
            <View style={s.welcomeButton}>
              <Button onPress={() => setAdding(true)} icon="add">
                添加第一个收藏夹
              </Button>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="登录并同步我的收藏"
              onPress={startAccountImport}
              style={{ padding: 14 }}
            >
              <Text style={{ color: C.pink, fontSize: 12 }}>私密收藏？登录后直接选择 →</Text>
            </Pressable>
            <Text style={s.welcomeFoot}>粘贴收藏夹链接或 ID 即可开始</Text>
          </View>
          <View style={s.sectionRow}>
            <Text style={s.sectionTitle}>一个更安静的 B 站</Text>
            <Icon name="sparkles-outline" size={17} color="#B3BACB" />
          </View>
          <View style={s.features}>
            {(
              [
                {
                  icon: 'folder-open-outline',
                  title: '只看收藏',
                  text: '内容由你亲手挑选',
                  color: '#8B9ED4',
                  bg: '#EDF1FC',
                },
                {
                  icon: 'play-skip-forward-outline',
                  title: '自然连播',
                  text: '沉浸在喜欢的内容里',
                  color: C.pink,
                  bg: C.pale,
                },
                {
                  icon: 'leaf-outline',
                  title: '保持专注',
                  text: '没有热榜和信息流',
                  color: '#83AD9A',
                  bg: '#EDF6F2',
                },
              ] as const
            ).map((item) => (
              <View style={s.feature} key={item.title}>
                <View style={[s.featureIcon, { backgroundColor: item.bg }]}>
                  <Icon name={item.icon} size={22} color={item.color} />
                </View>
                <Text style={s.featureTitle}>{item.title}</Text>
                <Text style={s.featureCopy}>{item.text}</Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chips}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="查看收藏汇总"
              accessibilityState={{ selected: isAggregate }}
              onPress={() => chooseFolder(ALL_FOLDERS)}
              style={[s.chip, isAggregate && s.selectedChip]}
            >
              <Icon name="layers-outline" size={15} color={isAggregate ? C.pink : C.muted} />
              <Text style={[s.chipText, isAggregate && { color: C.pink }]}>收藏汇总</Text>
            </Pressable>
            {library.folders.map((folder) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: folder.id === activeFolder.id }}
                key={folder.id}
                onPress={() => chooseFolder(folder.id)}
                style={[s.chip, folder.id === activeFolder.id && s.selectedChip]}
              >
                <Icon
                  name="folder-outline"
                  size={15}
                  color={folder.id === activeFolder.id ? C.pink : C.muted}
                />
                <Text
                  numberOfLines={1}
                  style={[s.chipText, folder.id === activeFolder.id && { color: C.pink }]}
                >
                  {folder.title}
                </Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="添加收藏夹"
              onPress={() => setAdding(true)}
              style={s.addChip}
            >
              <Icon name="add" size={18} color={C.muted} />
            </Pressable>
          </ScrollView>
          <View style={s.folderHero}>
            <View style={{ flex: 1 }}>
              <View style={s.heroTag}>
                <Icon name="folder-open" size={13} color={C.pink} />
                <Text style={s.heroTagText}>{isAggregate ? '已选收藏范围' : '当前收藏夹'}</Text>
              </View>
              <Text numberOfLines={2} style={s.heroTitle}>
                {activeFolder.title}
              </Text>
              <Text style={s.heroCopy}>
                {activeFolder.owner} · {activeFolder.count} 项收藏
              </Text>
              <View style={{ alignSelf: 'flex-start', marginTop: 18 }}>
                <Button
                  icon="play"
                  onPress={playAll}
                  disabled={!data.videos.some((v) => v.available)}
                >
                  {library.preferences.shuffle ? '随机播放' : '开始播放'}
                </Button>
              </View>
            </View>
            <View style={s.heroCover}>
              <Cover uri={activeFolder.cover} style={StyleSheet.absoluteFill} />
              <View style={s.heroCoverBadge}>
                <Icon name="heart" size={17} color="#FFF" />
              </View>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="进入短视频随机模式"
            onPress={() =>
              setShorts({
                folders: (isAggregate ? aggregateFolders : [activeFolder]).map((folder) => ({
                  ...folder,
                })),
                scopeId: activeFolder.id,
                title: activeFolder.title,
              })
            }
            style={s.shortsEntry}
          >
            <View style={s.shortsIcon}>
              <Icon name="shuffle" color={C.pink} size={24} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.shortsTitle}>随机刷 · 短视频模式</Text>
              <Text style={s.shortsCopy}>
                {isAggregate ? '上下滑动，只刷已选收藏夹' : '上下滑动，只刷这个收藏夹'}
              </Text>
            </View>
            <Icon name="chevron-forward" size={19} color="#C1A2B3" />
          </Pressable>
          <View style={s.searchBox}>
            <Icon name="search-outline" size={19} color={C.muted} />
            <TextInput
              accessibilityLabel="搜索当前收藏夹"
              placeholder={isAggregate ? '在已选收藏夹里找一找' : '在这个收藏夹里找一找'}
              placeholderTextColor="#A2A8B7"
              value={search}
              onChangeText={setSearch}
              style={s.searchInput}
              returnKeyType="search"
            />
            {search ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="清除搜索"
                onPress={() => setSearch('')}
                style={{ padding: 4 }}
              >
                <Icon name="close-circle" size={18} color="#ADB3C2" />
              </Pressable>
            ) : null}
          </View>
          <View style={s.sectionRow}>
            <View style={s.inline}>
              <Text style={s.sectionTitle}>{keyword ? '搜索结果' : '收藏视频'}</Text>
              <Text style={s.counter}>
                {data.videos.length}
                {data.hasMore ? '+' : ''}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                changePreferences({ ...library.preferences, shuffle: !library.preferences.shuffle })
              }
              style={s.sort}
            >
              <Icon
                name={library.preferences.shuffle ? 'shuffle' : 'list-outline'}
                size={16}
                color={library.preferences.shuffle ? C.pink : C.muted}
              />
              <Text style={[s.sortText, library.preferences.shuffle && { color: C.pink }]}>
                {library.preferences.shuffle
                  ? '随机播放'
                  : isAggregate
                    ? '分夹轮流载入'
                    : '收藏时间'}
              </Text>
            </Pressable>
          </View>
          {data.error ? (
            <Notice
              message={data.error}
              onRetry={
                data.videos.length
                  ? () => {
                      void data.loadMore().catch(() => {});
                    }
                  : data.refresh
              }
            />
          ) : null}
        </>
      )}
    </>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={s.safe}>
      <StatusBar style={playing || shorts ? 'light' : 'dark'} />
      <View
        style={s.shell}
        accessibilityElementsHidden={!!playing || !!shorts}
        importantForAccessibility={playing || shorts ? 'no-hide-descendants' : 'auto'}
        onLayout={(e) => setContentWidth(e.nativeEvent.layout.width)}
      >
        <View style={s.topbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="just-collect 首页"
            onPress={() => setTab('watch')}
            style={s.brand}
          >
            <View style={s.brandMark}>
              <Image
                source={require('./assets/logo.png')}
                style={{ width: 29, height: 29 }}
                resizeMode="contain"
              />
            </View>
            <Text style={s.brandText}>
              just-collect<Text style={s.brandPeriod}> /</Text>
            </Text>
          </Pressable>
          <View style={s.topRight}>
            <View style={s.quietBadge}>
              <View style={s.quietDot} />
              <Text style={s.quietText}>专注模式</Text>
            </View>
            <IconButton name="add" label="添加收藏夹" onPress={() => setAdding(true)} />
          </View>
        </View>
        {storageError ? (
          <View style={{ paddingHorizontal: 24 }}>
            <Notice message={storageError} />
          </View>
        ) : null}
        {tab === 'watch' && (
          <FlatList
            key={columns}
            data={activeFolder ? data.videos : []}
            extraData={cardWidth}
            numColumns={columns}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.feed}
            columnWrapperStyle={{ gap: 14 }}
            ListHeaderComponent={watchHeader}
            showsVerticalScrollIndicator={false}
            refreshing={data.loading}
            onRefresh={activeFolder ? data.refresh : undefined}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.available ? '播放' : '已失效'}：${item.title}`}
                disabled={!item.available}
                onPress={() => setPlaying(item)}
                style={({ pressed }) => [
                  s.videoCard,
                  { width: cardWidth, opacity: pressed || !item.available ? 0.55 : 1 },
                ]}
              >
                <View style={s.thumbnail}>
                  <Cover uri={item.cover} style={StyleSheet.absoluteFill} />
                  <View style={s.duration}>
                    <Text style={s.durationText}>
                      {item.available ? duration(item.duration) : '已失效'}
                    </Text>
                  </View>
                  <View style={s.cardPlay}>
                    <Icon name="play" size={12} color="#FFF" />
                  </View>
                </View>
                <Text numberOfLines={2} style={s.videoTitle}>
                  {item.title}
                </Text>
                <View style={s.videoMeta}>
                  <Text numberOfLines={1} style={s.author}>
                    {item.author}
                  </Text>
                  <View style={s.viewCount}>
                    <Icon name="play-outline" size={10} color="#A2A8B6" />
                    <Text style={s.views}>{views(item.views)}</Text>
                  </View>
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              activeFolder ? (
                <View style={s.emptyList}>
                  {data.loading ? (
                    <>
                      <ActivityIndicator color={C.pink} />
                      <Text style={s.emptyCopy}>正在翻开你的收藏…</Text>
                    </>
                  ) : !data.error ? (
                    <>
                      <Icon name="file-tray-outline" size={38} color="#BAC3D6" />
                      <Text style={s.emptyTitle}>
                        {keyword ? '这里还没有找到' : '这个收藏夹暂时没有视频'}
                      </Text>
                      <Text style={s.emptyCopy}>
                        {keyword
                          ? '试试别的关键词，搜索只在当前收藏夹内进行。'
                          : '非视频内容不会显示。你可以加载下一页或换一个收藏夹。'}
                      </Text>
                    </>
                  ) : null}
                </View>
              ) : undefined
            }
            ListFooterComponent={
              <View style={s.feedFooter}>
                {activeFolder && data.hasMore && !data.loading ? (
                  <Button
                    secondary
                    loading={data.loadingMore}
                    onPress={() => {
                      void data.loadMore().catch(() => {});
                    }}
                  >
                    再翻一些收藏
                  </Button>
                ) : activeFolder && data.videos.length > 0 ? (
                  <Text style={s.endText}>— 喜欢的都在这里了 —</Text>
                ) : null}
                <View style={s.footerSignature}>
                  <Icon name="heart-outline" size={12} color="#B8BFCE" />
                  <Text style={s.footerText}>你的时间，由你喜欢的事填满</Text>
                </View>
              </View>
            }
          />
        )}

        {tab === 'folders' && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.page}>
            <View style={s.eyebrow}>
              <View style={s.pinkDot} />
              <Text style={s.eyebrowText}>CURATED BY YOU</Text>
            </View>
            <Text style={s.pageTitle}>
              我的收藏夹<Text style={{ color: C.pink }}>。</Text>
            </Text>
            <Text style={s.pageSubtitle}>这里的每一份喜欢，都由你决定。</Text>
            <View style={{ gap: 12, marginTop: 22 }}>
              <Button icon="person-circle-outline" onPress={startAccountImport}>
                {session ? '从我的账号选择收藏夹' : '登录后读取我的收藏夹'}
              </Button>
              {library.folders.length > 0 && (
                <Button secondary icon="layers-outline" onPress={showAllConnected}>
                  汇总全部已连接收藏夹
                </Button>
              )}
            </View>
            <View style={[s.sectionRow, { marginTop: 30 }]}>
              <Text style={s.sectionTitle}>
                已连接{' '}
                <Text style={{ color: C.muted, fontSize: 14 }}>{library.folders.length}</Text>
              </Text>
              <Text style={s.sortText}>点击收藏夹即可切换</Text>
            </View>
            {library.folders.map((folder) => (
              <View style={s.folderRow} key={folder.id}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`打开收藏夹 ${folder.title}`}
                  style={s.folderRowMain}
                  onPress={() => {
                    chooseFolder(folder.id);
                    setTab('watch');
                  }}
                >
                  <Cover uri={folder.cover} style={s.folderThumb} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={s.folderRowTitle}>
                      {folder.title}
                    </Text>
                    <Text style={s.folderOwner}>
                      {folder.owner} · {folder.count} 项{folder.private ? ' · 私密' : ''}
                    </Text>
                    <View style={s.inline}>
                      {folder.id === library.activeId ? (
                        <Text style={s.currentTag}>正在看</Text>
                      ) : null}
                      <Text style={s.folderId}>ID {folder.id}</Text>
                    </View>
                  </View>
                </Pressable>
                <IconButton
                  name="ellipsis-horizontal"
                  label={`管理收藏夹 ${folder.title}`}
                  onPress={() => setRemoving(folder)}
                />
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => setAdding(true)}
              style={s.addFolderCard}
            >
              <View style={s.addCircle}>
                <Icon name="add" color={C.pink} size={25} />
              </View>
              <Text style={s.addTitle}>连接一个新的收藏夹</Text>
              <Text style={s.addCopy}>公开收藏夹链接或 ID，一键添加</Text>
            </Pressable>
            <View style={s.folderNote}>
              <Icon name="information-circle-outline" size={18} color="#A0A9BF" />
              <Text style={s.folderNoteText}>
                移除仅取消本应用的连接，不会修改 B
                站上的收藏。收藏夹中新增的视频可通过下拉刷新同步。
              </Text>
            </View>
          </ScrollView>
        )}

        {tab === 'settings' && (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.page}
          >
            <View style={s.eyebrow}>
              <View style={s.pinkDot} />
              <Text style={s.eyebrowText}>MAKE YOURSELF AT HOME</Text>
            </View>
            <Text style={s.pageTitle}>
              按你的节奏<Text style={{ color: C.pink }}>。</Text>
            </Text>
            <Text style={s.pageSubtitle}>把时间，留给真正喜欢的内容。</Text>
            <Text style={s.settingsLabel}>播放偏好</Text>
            <View style={s.settingsCard}>
              {(
                [
                  {
                    title: '自动连播',
                    copy: '播完分 P 后继续，最后播放下一条收藏',
                    icon: 'repeat-outline',
                    key: 'autoNext',
                  },
                  {
                    title: '随机播放',
                    copy: '在已载入的收藏视频中随机选择下一条',
                    icon: 'shuffle-outline',
                    key: 'shuffle',
                  },
                ] as const
              ).map((row, i) => (
                <View key={row.key} style={[s.settingRow, i > 0 && s.settingBorder]}>
                  <View style={s.settingIcon}>
                    <Icon name={row.icon} color={C.pink} size={22} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.settingTitle}>{row.title}</Text>
                    <Text style={s.settingCopy}>{row.copy}</Text>
                  </View>
                  <Switch
                    accessibilityLabel={row.title}
                    value={library.preferences[row.key]}
                    onValueChange={(value) =>
                      changePreferences({ ...library.preferences, [row.key]: value })
                    }
                    trackColor={{ false: '#E2E5ED', true: C.pink }}
                    thumbColor="#FFF"
                  />
                </View>
              ))}
            </View>
            <View style={[s.sectionRow, { marginTop: 28 }]}>
              <Text style={s.settingsSection}>B 站登录凭证</Text>
              <Text
                style={[s.loginBadge, session && { backgroundColor: '#ECF5F0', color: '#74A58E' }]}
              >
                {session ? '已在本机保存' : '未设置 · 可浏览公开收藏'}
              </Text>
            </View>
            <View style={s.loginCard}>
              <View style={s.inline}>
                <View style={s.settingIcon}>
                  <Icon name="lock-closed-outline" color={C.blue} size={22} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.settingTitle}>连接自己的私密收藏</Text>
                  <Text style={s.settingCopy}>可选，公开收藏夹无需登录</Text>
                </View>
              </View>
              <Text style={s.loginCopy}>
                在 B 站官方页面登录一次，即可选择自己的公开和私密收藏夹并汇总视频，不用找分享按钮。
              </Text>
              <View style={{ gap: 12, marginBottom: 20 }}>
                <Button icon="person-circle-outline" onPress={() => setLoggingIn(true)}>
                  {account ? `已登录：${account.name} · 重新登录` : '打开 B 站官方登录页'}
                </Button>
                {session && (
                  <Button secondary icon="folder-open-outline" onPress={startAccountImport}>
                    选择我的收藏夹
                  </Button>
                )}
              </View>
              <Text style={s.settingCopy}>已有 SESSDATA 时，也可以在下方手动导入（可选）。</Text>
              <TextInput
                accessibilityLabel="SESSDATA 登录凭证"
                value={sessionInput}
                onChangeText={setSessionInput}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!sessionBusy && Platform.OS !== 'web'}
                placeholder={session ? '输入新的 SESSDATA 可更新凭证' : '粘贴你自己账号的 SESSDATA'}
                placeholderTextColor="#A5AAB8"
                style={s.sessionInput}
              />
              {sessionError ? <Notice message={sessionError} /> : null}
              {sessionNotice ? (
                <Text accessibilityRole="alert" style={s.sessionNotice}>
                  {sessionNotice}
                </Text>
              ) : null}
              {Platform.OS === 'web' ? (
                <Text style={s.webNote}>
                  浏览器用于界面预览；B 站数据和安全登录请在 Android / iOS 应用中使用。
                </Text>
              ) : (
                <View style={{ gap: 10 }}>
                  <Button
                    secondary
                    loading={sessionBusy}
                    disabled={!sessionInput.trim()}
                    onPress={() => void saveSession()}
                    icon="shield-checkmark-outline"
                  >
                    加密保存到本机
                  </Button>
                  {session ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={sessionBusy}
                      onPress={() => void saveSession(true)}
                      style={{ alignItems: 'center', padding: 10 }}
                    >
                      <Text style={{ color: C.muted, fontSize: 12 }}>删除本机凭证</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
              <Text style={s.privacyCopy}>
                登录凭证相当于账号钥匙，请勿分享。凭证仅保存在手机安全存储中，并仅随请求发送至 B
                站接口。
              </Text>
            </View>
            <View style={s.about}>
              <View style={s.aboutLogo}>
                <Image
                  source={require('./assets/logo.png')}
                  style={{ width: 40, height: 40 }}
                  resizeMode="contain"
                />
              </View>
              <Text style={s.aboutName}>just-collect</Text>
              <Text style={s.aboutVersion}>v1.3.0 · 一个小小的专注空间</Text>
              <Text style={s.aboutCopy}>
                独立第三方客户端，与哔哩哔哩无关联。{'\n'}视频与收藏数据来自 B
                站，遵循原有访问权限。
              </Text>
            </View>
          </ScrollView>
        )}

        <SafeAreaView edges={['bottom']} style={s.navSafe}>
          <View style={s.nav}>
            {TABS.map((item) => (
              <Pressable
                accessibilityRole="tab"
                accessibilityLabel={item.name}
                accessibilityState={{ selected: tab === item.id }}
                key={item.id}
                onPress={() => setTab(item.id)}
                style={s.navItem}
              >
                <View style={[s.navIcon, tab === item.id && s.navIconActive]}>
                  <Icon
                    name={tab === item.id ? item.selected : item.icon}
                    size={23}
                    color={tab === item.id ? C.pink : '#9AA3B6'}
                  />
                </View>
                <Text style={[s.navText, tab === item.id && { color: C.pink, fontWeight: '700' }]}>
                  {item.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </SafeAreaView>
      </View>
      {adding && (
        <AddFolder
          onClose={() => setAdding(false)}
          onAdd={addFolder}
          session={session}
          onAccount={startAccountImport}
        />
      )}
      {loggingIn && <AccountLogin onClose={() => setLoggingIn(false)} onLogin={finishLogin} />}
      {choosingAccountFolders && (
        <AccountFolders
          session={session}
          existingIds={library.folders.map((f) => f.id)}
          onClose={() => setChoosingAccountFolders(false)}
          onImport={importFolders}
          onLogin={() => {
            setChoosingAccountFolders(false);
            setLoggingIn(true);
          }}
        />
      )}
      {removing && (
        <Sheet
          visible
          title="移除收藏夹连接"
          subtitle={removing.title}
          onClose={() => setRemoving(null)}
        >
          <Text style={s.removeCopy}>
            移除后，该收藏夹不再出现在应用中。B 站上的收藏内容会保留，你也可以随时重新添加。
          </Text>
          <View style={{ gap: 12 }}>
            <Button
              onPress={() => {
                const id = removing.id;
                setLibrary((old) => {
                  const folders = old.folders.filter((f) => f.id !== id);
                  return {
                    ...old,
                    folders,
                    aggregateIds: old.aggregateIds?.filter((value) => value !== id),
                    activeId: !folders.length
                      ? null
                      : old.activeId === id
                        ? (folders[0]?.id ?? null)
                        : old.activeId === ALL_FOLDERS &&
                            !folders.some(
                              (f) =>
                                f.id !== id &&
                                (!old.aggregateIds || old.aggregateIds.includes(f.id)),
                            )
                          ? (folders[0]?.id ?? null)
                          : old.activeId,
                  };
                });
                setSearch('');
                setKeyword('');
                setRemoving(null);
              }}
            >
              移除连接
            </Button>
            <Button secondary onPress={() => setRemoving(null)}>
              保留收藏夹
            </Button>
          </View>
        </Sheet>
      )}
      {playing && activeFolder && (
        <Player
          initialVideo={playing}
          videos={data.videos}
          folderId={activeFolder.id}
          folderTitle={activeFolder.title}
          session={session}
          preferences={library.preferences}
          onPreferences={changePreferences}
          hasMore={data.hasMore}
          loadMore={data.loadMore}
          onClose={() => setPlaying(null)}
        />
      )}
      {shorts && (
        <RandomShorts
          folders={shorts.folders}
          scopeId={shorts.scopeId}
          scopeTitle={shorts.title}
          session={session}
          autoNext={library.preferences.autoNext}
          rate={library.preferences.playbackRate ?? 1}
          onRate={(playbackRate) => changePreferences({ ...library.preferences, playbackRate })}
          onAutoNext={(autoNext) => changePreferences({ ...library.preferences, autoNext })}
          onClose={() => setShorts(null)}
        />
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  shell: { flex: 1, width: '100%', maxWidth: 1000, alignSelf: 'center' },
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, gap: 18 },
  bootText: { color: C.muted, fontSize: 13 },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 19,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { fontSize: 17, fontWeight: '800', color: C.ink, letterSpacing: 0 },
  brandPeriod: { color: '#CCD1DF', fontWeight: '400' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  quietBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  quietDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#9DBDAD' },
  quietText: { fontSize: 10, color: '#8D9C98' },
  feed: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 14 },
  intro: { marginBottom: 25 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  pinkDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.pink },
  eyebrowText: { fontSize: 9, letterSpacing: 1.8, color: '#9EA5B7', fontWeight: '600' },
  pageTitle: { fontSize: 30, color: C.ink, fontWeight: '800', letterSpacing: 1, lineHeight: 42 },
  pageSubtitle: { fontSize: 12, lineHeight: 22, color: C.muted, marginTop: 7 },
  welcome: {
    borderRadius: 25,
    backgroundColor: '#F0F1FA',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: '#E9EBF5',
    overflow: 'hidden',
  },
  welcomeLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFFAA',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  welcomeLabelText: { fontSize: 10, color: '#CC829A' },
  welcomeTitle: {
    textAlign: 'center',
    color: '#30354C',
    fontSize: 25,
    lineHeight: 38,
    fontWeight: '800',
    marginTop: 17,
    letterSpacing: 0.8,
  },
  welcomeCopy: {
    textAlign: 'center',
    fontSize: 12,
    color: '#949AB0',
    lineHeight: 23,
    marginTop: 12,
  },
  welcomeButton: { marginTop: 24, width: '100%', maxWidth: 265 },
  welcomeFoot: { fontSize: 10, color: '#A3A9BE', marginTop: 13 },
  art: {
    width: 260,
    height: 178,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
    marginBottom: 3,
  },
  orbit: {
    width: 177,
    height: 145,
    borderWidth: 1,
    borderColor: '#DFE2F1',
    borderRadius: 90,
    position: 'absolute',
    top: 14,
    transform: [{ rotate: '-22deg' }],
  },
  orbitInner: {
    width: 134,
    height: 134,
    backgroundColor: '#E8EAF7',
    borderRadius: 75,
    position: 'absolute',
    top: 20,
  },
  artDot1: {
    width: 6,
    height: 6,
    backgroundColor: '#B5C3E8',
    borderRadius: 4,
    position: 'absolute',
    top: 37,
    right: 48,
  },
  artDot2: {
    width: 4,
    height: 4,
    backgroundColor: '#E9A6BC',
    borderRadius: 4,
    position: 'absolute',
    bottom: 25,
    left: 65,
  },
  artFolder: { position: 'absolute', left: 28, bottom: 32, transform: [{ rotate: '-17deg' }] },
  artTv: {
    width: 106,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#F49CBA',
    borderWidth: 4,
    borderColor: '#F8B5CD',
    transform: [{ rotate: '-7deg' }],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 13,
    shadowColor: '#CF92B1',
    shadowOpacity: 0.2,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  tvFace: {
    width: 76,
    height: 49,
    backgroundColor: '#F083AA',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  antenna1: {
    position: 'absolute',
    width: 4,
    height: 18,
    backgroundColor: '#F49CBA',
    top: -17,
    left: 35,
    borderRadius: 2,
    transform: [{ rotate: '-35deg' }],
  },
  antenna2: {
    position: 'absolute',
    width: 4,
    height: 18,
    backgroundColor: '#F49CBA',
    top: -17,
    right: 31,
    borderRadius: 2,
    transform: [{ rotate: '35deg' }],
  },
  tvFeet: {
    position: 'absolute',
    width: 8,
    height: 10,
    borderRadius: 3,
    backgroundColor: '#F49CBA',
    bottom: -11,
    left: 19,
  },
  tvFeet2: {
    position: 'absolute',
    width: 8,
    height: 10,
    borderRadius: 3,
    backgroundColor: '#F49CBA',
    bottom: -11,
    right: 19,
  },
  artHeart: {
    position: 'absolute',
    right: 28,
    top: 45,
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    transform: [{ rotate: '14deg' }],
  },
  artStar: { position: 'absolute', top: 21, left: 62 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 26,
    marginBottom: 18,
    gap: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: C.ink },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  counter: {
    fontSize: 10,
    color: '#9AA3B8',
    backgroundColor: '#EBEEF5',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  features: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    paddingVertical: 22,
    borderRadius: 19,
  },
  feature: { flex: 1, alignItems: 'center', gap: 8 },
  featureIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  featureTitle: { fontSize: 12, color: '#525A70', fontWeight: '600' },
  featureCopy: { fontSize: 9, color: '#A3AABC' },
  chips: { gap: 8, paddingBottom: 20, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 12,
    backgroundColor: '#EEF0F6',
    padding: 11,
    maxWidth: 180,
  },
  selectedChip: { backgroundColor: C.pale },
  chipText: { color: C.muted, fontSize: 11, flexShrink: 1 },
  addChip: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D4DAE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderHero: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    backgroundColor: '#F0F1FA',
    borderRadius: 23,
    padding: 21,
  },
  heroTag: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  heroTagText: { color: '#CA829A', fontSize: 10 },
  heroTitle: { fontSize: 21, lineHeight: 29, fontWeight: '800', color: '#353B55', marginTop: 12 },
  heroCopy: { color: '#9099B1', fontSize: 10, marginTop: 8, lineHeight: 18 },
  heroCover: {
    width: '30%',
    maxWidth: 160,
    aspectRatio: 0.85,
    borderRadius: 17,
    overflow: 'hidden',
    transform: [{ rotate: '5deg' }],
    backgroundColor: '#E3E7F2',
  },
  heroCoverBadge: {
    position: 'absolute',
    right: 9,
    bottom: 9,
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#F36A91D9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    marginTop: 22,
    gap: 8,
    borderWidth: 1,
    borderColor: '#EEF0F5',
  },
  shortsEntry: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderRadius: 17,
    padding: 16,
    backgroundColor: '#FFF0F5',
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#F9E3EC',
  },
  shortsIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortsTitle: { fontSize: 14, fontWeight: '700', color: '#9F5873' },
  shortsCopy: { fontSize: 10, lineHeight: 18, color: '#BC90A3', marginTop: 5 },
  searchInput: { flex: 1, minHeight: 46, color: C.ink, fontSize: 12, paddingVertical: 10 },
  sort: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingVertical: 6 },
  sortText: { fontSize: 10, color: '#9DA5B7' },
  videoCard: { marginBottom: 23 },
  thumbnail: {
    width: '100%',
    aspectRatio: 1.63,
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: '#EAEDF6',
  },
  duration: {
    position: 'absolute',
    bottom: 7,
    right: 7,
    backgroundColor: '#121827AA',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  durationText: { fontSize: 9, color: '#FFF' },
  cardPlay: {
    position: 'absolute',
    bottom: 7,
    left: 7,
    width: 19,
    height: 19,
    borderRadius: 6,
    backgroundColor: '#FFFFFF30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoTitle: {
    fontSize: 12,
    lineHeight: 20,
    fontWeight: '600',
    color: '#414A61',
    marginTop: 10,
    minHeight: 40,
  },
  videoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 7,
    gap: 5,
  },
  author: { fontSize: 10, color: '#9CA5B8', flex: 1 },
  viewCount: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  views: { fontSize: 9, color: '#9CA5B8' },
  emptyList: { alignItems: 'center', justifyContent: 'center', paddingVertical: 34, gap: 14 },
  emptyTitle: { fontSize: 15, color: '#738099', fontWeight: '600' },
  emptyCopy: { textAlign: 'center', color: '#A0A8BA', fontSize: 11, lineHeight: 20 },
  feedFooter: { paddingTop: 6, paddingBottom: 12 },
  endText: { textAlign: 'center', color: '#BCC2D0', fontSize: 10, marginTop: 3 },
  footerSignature: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 27,
  },
  footerText: { fontSize: 10, color: '#B1B9CA', letterSpacing: 1 },
  page: { padding: 24, paddingTop: 16, paddingBottom: 40 },
  folderRow: {
    backgroundColor: '#FFF',
    borderRadius: 19,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  folderRowMain: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  folderThumb: { width: 70, height: 76, borderRadius: 12 },
  folderRowTitle: { fontSize: 14, fontWeight: '700', color: C.ink },
  folderOwner: { fontSize: 11, color: C.muted, marginTop: 8, marginBottom: 7 },
  folderId: { fontSize: 9, color: '#B1B9CA' },
  currentTag: {
    fontSize: 9,
    color: C.pink,
    backgroundColor: C.pale,
    padding: 3,
    paddingHorizontal: 6,
    borderRadius: 4,
    overflow: 'hidden',
  },
  addFolderCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#DADFED',
    paddingVertical: 32,
    alignItems: 'center',
    marginTop: 4,
    backgroundColor: '#FFFFFF70',
  },
  addCircle: {
    width: 45,
    height: 45,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.pale,
    marginBottom: 14,
  },
  addTitle: { color: '#767F95', fontWeight: '600', fontSize: 13 },
  addCopy: { color: '#AFB7C9', fontSize: 11, marginTop: 9 },
  folderNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    paddingHorizontal: 12,
    marginTop: 26,
  },
  folderNoteText: { flex: 1, color: '#A0A9BC', fontSize: 11, lineHeight: 21 },
  settingsLabel: { color: '#818A9E', fontSize: 12, marginTop: 28, marginBottom: 14 },
  settingsCard: { backgroundColor: '#FFF', borderRadius: 20, paddingHorizontal: 18 },
  settingRow: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 20 },
  settingBorder: { borderTopWidth: 1, borderTopColor: '#F2F3F7' },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingTitle: { fontSize: 13, fontWeight: '600', color: '#566077' },
  settingCopy: { fontSize: 10, color: '#A6AEC0', lineHeight: 18, marginTop: 5 },
  settingsSection: { color: '#818A9E', fontSize: 12 },
  loginBadge: {
    fontSize: 9,
    backgroundColor: '#ECEFF6',
    color: '#98A2B6',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    overflow: 'hidden',
  },
  loginCard: { padding: 20, backgroundColor: '#FFF', borderRadius: 20 },
  loginCopy: { color: '#949FB4', fontSize: 11, lineHeight: 22, marginTop: 17, marginBottom: 16 },
  sessionInput: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 13,
    fontSize: 12,
    color: C.ink,
    marginBottom: 14,
  },
  privacyCopy: { color: '#B0B7C8', fontSize: 10, lineHeight: 20, marginTop: 16 },
  sessionNotice: { color: '#75A08A', fontSize: 11, marginBottom: 14, lineHeight: 20 },
  webNote: {
    color: '#9D8C73',
    backgroundColor: '#FCF7ED',
    padding: 12,
    fontSize: 11,
    lineHeight: 21,
    borderRadius: 10,
  },
  about: { alignItems: 'center', paddingTop: 36 },
  aboutLogo: {
    width: 57,
    height: 57,
    borderRadius: 19,
    backgroundColor: C.pale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aboutName: { fontSize: 14, color: '#7F899F', fontWeight: '700', marginTop: 14 },
  aboutVersion: { fontSize: 10, color: '#ADB5C7', marginTop: 8 },
  aboutCopy: { fontSize: 10, color: '#B5BDCD', lineHeight: 20, textAlign: 'center', marginTop: 15 },
  navSafe: { backgroundColor: '#FFF', borderTopWidth: 1, borderColor: '#EEF0F6' },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 9,
    paddingBottom: 10,
  },
  navItem: { flex: 1, alignItems: 'center', gap: 3, minHeight: 53 },
  navIcon: {
    width: 52,
    height: 31,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIconActive: { backgroundColor: C.pale },
  navText: { fontSize: 10, color: '#9AA3B6' },
  removeCopy: { color: C.muted, fontSize: 13, lineHeight: 23, marginBottom: 24 },
});
