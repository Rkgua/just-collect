import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { C, IconButton } from './ui';
import { fetchCurrentAccount } from '../services/bilibili';
import { clearLoginCookies, readLoginSession } from '../services/loginCookies';
import { errorMessage } from '../lib/format';
import type { Account } from '../types';

const LOGIN_URL = 'https://passport.bilibili.com/login';

export function AccountLogin({
  onClose,
  onLogin,
}: {
  onClose: () => void;
  onLogin: (session: string, account: Account) => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const busy = useRef(false);
  const alive = useRef(true);
  const lastSession = useRef('');
  const complete = useRef(false);
  const onLoginRef = useRef(onLogin);
  onLoginRef.current = onLogin;

  async function check(force = false) {
    if (busy.current || complete.current || AppState.currentState !== 'active') return;
    busy.current = true;
    try {
      const token = await readLoginSession();
      if (!alive.current) return;
      if (!token) {
        if (force) setError('尚未检测到登录，请先在下方官方页面完成登录。');
        return;
      }
      if (!force && token === lastSession.current) return;
      lastSession.current = token;
      setChecking(true);
      const account = await fetchCurrentAccount(token);
      if (!alive.current) return;
      await onLoginRef.current(token, account);
      complete.current = true;
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    } finally {
      busy.current = false;
      if (alive.current) setChecking(false);
    }
  }

  useEffect(() => {
    alive.current = true;
    const interval = setInterval(() => {
      void check();
    }, 1800);
    return () => {
      alive.current = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.root}>
        <View style={s.header}>
          <IconButton name="close" label="关闭登录" onPress={onClose} />
          <View style={{ flex: 1 }}>
            <Text style={s.title}>登录自己的 B 站</Text>
            <Text style={s.caption}>B 站官方页面 · 登录态仅保存在本机</Text>
          </View>
        </View>
        <View style={s.tools}>
          <Pressable accessibilityRole="button" onPress={() => void check(true)} style={s.tool}>
            <Text style={s.toolText}>{checking ? '正在验证登录…' : '我已登录，检测登录状态'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={s.tool}
            onPress={async () => {
              try {
                await clearLoginCookies();
                lastSession.current = '';
                setError('');
                setRevision((v) => v + 1);
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            <Text style={s.toolText}>换个账号</Text>
          </Pressable>
        </View>
        <Text style={s.help}>
          可选短信或密码登录。成功后自动返回选择收藏夹；不用复制 Cookie，也不用把私密收藏改为公开。
        </Text>
        {error ? (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        ) : null}
        <View style={{ flex: 1 }}>
          <WebView
            key={revision}
            source={{ uri: LOGIN_URL }}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            allowFileAccess={false}
            allowFileAccessFromFileURLs={false}
            allowUniversalAccessFromFileURLs={false}
            mixedContentMode="never"
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => {
              setLoading(false);
              void check();
            }}
            onError={() => {
              setLoading(false);
              setError('登录页加载失败，请检查网络，或关闭后重试。');
            }}
            onShouldStartLoadWithRequest={(request) => {
              if (request.url === 'about:blank') return true;
              try {
                const url = new URL(request.url);
                return (
                  url.protocol === 'https:' &&
                  ['bilibili.com', 'biligame.com', 'geetest.com'].some(
                    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
                  )
                );
              } catch {
                return false;
              }
            }}
          />
          {loading && (
            <View pointerEvents="none" style={s.progress}>
              <ActivityIndicator color={C.pink} />
              <Text style={s.caption}>正在打开官方登录页…</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.card },
  header: { flexDirection: 'row', alignItems: 'center', padding: 18, gap: 12 },
  title: { color: C.ink, fontSize: 18, fontWeight: '700' },
  caption: { color: C.muted, fontSize: 11, marginTop: 6 },
  tools: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, gap: 10 },
  tool: { paddingVertical: 12 },
  toolText: { color: C.pink, fontSize: 12 },
  help: { backgroundColor: C.bg, color: C.muted, padding: 14, fontSize: 11, lineHeight: 20 },
  error: {
    color: '#A66248',
    backgroundColor: '#FFF6EF',
    padding: 14,
    fontSize: 12,
    lineHeight: 21,
  },
  progress: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: '#FFFFFFE8',
    padding: 12,
    borderRadius: 12,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
