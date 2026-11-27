import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, C, Icon, Notice, Sheet } from './ui';
import { fetchMyFolders } from '../services/bilibili';
import { errorMessage } from '../lib/format';
import type { Account, Folder } from '../types';

export function AccountFolders({
  session,
  existingIds,
  onClose,
  onImport,
  onLogin,
}: {
  session: string;
  existingIds: string[];
  onClose: () => void;
  onImport: (folders: Folder[], account: Account) => void;
  onLogin: () => void;
}) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError('');
    fetchMyFolders(session, abort.signal)
      .then((result) => {
        if (abort.signal.aborted) return;
        setFolders(result.folders);
        setAccount(result.account);
        setSelected(
          new Set(result.folders.filter((f) => !existingIds.includes(f.id)).map((f) => f.id)),
        );
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [session, revision]);
  return (
    <Sheet
      visible
      title="选择自己的收藏夹"
      subtitle={
        account ? `${account.name} · 私密收藏也会列出` : '登录本人账号后直接读取，无需分享按钮。'
      }
      onClose={onClose}
    >
      {loading ? (
        <View style={s.loading}>
          <ActivityIndicator color={C.pink} />
          <Text style={s.caption}>正在读取我的收藏夹…</Text>
        </View>
      ) : error ? (
        <>
          <Notice message={error} onRetry={() => setRevision((v) => v + 1)} />
          <Button secondary onPress={onLogin}>
            重新登录 B 站
          </Button>
        </>
      ) : (
        <>
          <View style={s.actions}>
            <Text style={s.caption}>{folders.length} 个收藏夹</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setSelected(
                  new Set(selected.size === folders.length ? [] : folders.map((f) => f.id)),
                )
              }
            >
              <Text style={s.link}>{selected.size === folders.length ? '取消全选' : '全选'}</Text>
            </Pressable>
          </View>
          {folders.map((folder) => (
            <Pressable
              key={folder.id}
              accessibilityRole="checkbox"
              accessibilityLabel={folder.title}
              accessibilityState={{ checked: selected.has(folder.id) }}
              onPress={() =>
                setSelected((old) => {
                  const next = new Set(old);
                  if (next.has(folder.id)) next.delete(folder.id);
                  else next.add(folder.id);
                  return next;
                })
              }
              style={s.row}
            >
              <Icon
                name={selected.has(folder.id) ? 'checkbox' : 'square-outline'}
                color={selected.has(folder.id) ? C.pink : '#C0C7D5'}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{folder.title}</Text>
                <Text style={s.caption}>
                  {folder.private ? '私密 · 仅自己可见' : '公开'} · {folder.count} 项
                  {existingIds.includes(folder.id) ? ' · 已连接' : ''}
                </Text>
              </View>
            </Pressable>
          ))}
          {!folders.length ? <Text style={s.empty}>这个账号暂时没有创建的收藏夹。</Text> : null}
          <View style={{ marginTop: 18 }}>
            <Button
              disabled={!selected.size || !account}
              icon="checkmark"
              onPress={() => {
                if (account)
                  onImport(
                    folders.filter((f) => selected.has(f.id)),
                    account,
                  );
              }}
            >
              汇总所选收藏夹（{selected.size}）
            </Button>
          </View>
          <Text style={s.note}>
            将所选收藏夹加入本机列表，并打开「收藏汇总」。相同视频自动去重，内容按收藏夹轮流分页载入。
          </Text>
        </>
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({
  loading: { gap: 14, paddingVertical: 30, alignItems: 'center' },
  caption: { color: C.muted, fontSize: 11, marginTop: 6, lineHeight: 18 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 15,
  },
  link: { color: C.pink, fontSize: 12, padding: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 15,
    borderRadius: 14,
    backgroundColor: C.bg,
    marginBottom: 10,
  },
  name: { fontSize: 14, color: C.ink, fontWeight: '600' },
  empty: { paddingVertical: 24, textAlign: 'center', fontSize: 13, color: C.muted },
  note: { fontSize: 11, color: C.muted, lineHeight: 21, marginTop: 15 },
});
