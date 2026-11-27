import { useState } from 'react';
import { Linking, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button, C, Icon, Notice, Sheet } from './ui';
import { resolveFolderId } from '../services/share';
import { errorMessage } from '../lib/format';
import { fetchFavorites } from '../services/bilibili';
import type { Folder } from '../types';

export function AddFolder({
  onClose,
  onAdd,
  session,
  onAccount,
}: {
  onClose: () => void;
  onAdd: (folder: Folder) => void;
  session: string;
  onAccount: () => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [hint, setHint] = useState('');

  async function openBilibili() {
    setError('');
    setHint('');
    if (Platform.OS === 'web') {
      setHint('请在手机安装包中使用跳转功能。也可以直接粘贴收藏夹分享链接。');
      return;
    }
    setLaunching(true);
    try {
      await Linking.openURL('bilibili://main/favorite');
      setHint(
        '在 B 站打开收藏夹，点「分享 → 复制链接」，回来点「一键粘贴」。若未进入收藏页，请点「我的 → 我的收藏」。',
      );
    } catch {
      setError('未能打开 B 站，请确认已安装官方 App。你也可以手动打开 B 站复制收藏夹分享链接。');
    } finally {
      setLaunching(false);
    }
  }

  async function paste() {
    setError('');
    setPasting(true);
    try {
      const text = await Clipboard.getStringAsync();
      if (!text.trim()) {
        setHint('剪贴板里还没有链接，请先在 B 站收藏夹中「分享 → 复制链接」。');
        return;
      }
      setValue(text);
      setHint('分享内容已粘贴，点击「添加收藏夹」即可连接。');
    } catch {
      setError('无法读取剪贴板，请长按输入框，选择粘贴。');
    } finally {
      setPasting(false);
    }
  }

  async function add() {
    if (busy) return;
    setError('');
    setHint('');
    setBusy(true);
    try {
      const id = await resolveFolderId(value);
      const result = await fetchFavorites(id, 1, session);
      onAdd(result.folder);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      visible
      title="把喜欢的，放进来"
      subtitle="直接从 B 站 App 复制分享链接，不用打开网页版。"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <View style={s.launch}>
        <Button icon="person-circle-outline" onPress={onAccount} disabled={busy}>
          登录后直接选择收藏夹
        </Button>
        <Text style={s.launchCopy}>包含自己的私密收藏，不需要分享链接。</Text>
      </View>
      <View style={s.launch}>
        <Button
          secondary
          icon="open-outline"
          onPress={() => void openBilibili()}
          loading={launching}
          disabled={busy}
        >
          打开 B 站收藏
        </Button>
        <Text style={s.launchCopy}>打开收藏夹 → 分享 → 复制链接 → 返回粘贴</Text>
      </View>
      <View style={s.inputHeading}>
        <Text style={s.label}>收藏夹链接或 ID</Text>
        <Button
          secondary
          icon="clipboard-outline"
          loading={pasting}
          disabled={busy}
          onPress={() => void paste()}
        >
          一键粘贴
        </Button>
      </View>
      <TextInput
        accessibilityLabel="收藏夹链接或 ID"
        value={value}
        onChangeText={setValue}
        placeholder="粘贴 B 站分享内容（支持 b23.tv 短链接）"
        placeholderTextColor="#A5AAB8"
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        style={s.input}
        editable={!busy}
      />
      {error ? <Notice message={error} /> : null}
      {hint ? (
        <Text accessibilityRole="status" style={s.hint}>
          {hint}
        </Text>
      ) : null}
      <View style={s.guide}>
        <View style={s.guideTitle}>
          <Icon name="bulb-outline" size={19} color={C.blue} />
          <Text style={s.guideHeading}>在 B 站 App 里这样操作</Text>
        </View>
        <Text style={s.guideText}>1. 我的 → 我的收藏 → 进入想看的收藏夹</Text>
        <Text style={s.guideText}>2. 点收藏夹的分享按钮或右上角「⋯」→ 复制链接</Text>
        <Text style={s.guideText}>3. 回到这里点「一键粘贴」→ 添加收藏夹</Text>
        <Text style={s.example}>请分享整个收藏夹；可以粘贴整段分享文案。</Text>
      </View>
      <Button icon="add" onPress={add} loading={busy} disabled={!value.trim()}>
        {busy ? '正在连接收藏夹…' : '添加收藏夹'}
      </Button>
      <Text style={s.footnote}>公开收藏夹可直接连接；私密收藏夹请先在设置中登录。</Text>
    </Sheet>
  );
}

const s = StyleSheet.create({
  launch: { gap: 9, marginBottom: 22 },
  launchCopy: { color: C.muted, fontSize: 11, lineHeight: 20, textAlign: 'center' },
  inputHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  hint: { color: '#7188AE', fontSize: 12, lineHeight: 21, marginTop: 12 },
  label: { color: C.ink, fontSize: 14, fontWeight: '600', marginBottom: 12 },
  input: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    fontSize: 14,
    color: C.ink,
    lineHeight: 23,
  },
  guide: { padding: 18, backgroundColor: '#F3F6FC', borderRadius: 18, marginVertical: 24 },
  guideTitle: { flexDirection: 'row', gap: 7, alignItems: 'center', marginBottom: 12 },
  guideHeading: { fontSize: 13, fontWeight: '700', color: '#5A719D' },
  guideText: { color: '#78849C', fontSize: 12, lineHeight: 25 },
  example: { fontSize: 10, color: '#8B99B3', marginTop: 10, lineHeight: 18 },
  footnote: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 16, lineHeight: 19 },
});
