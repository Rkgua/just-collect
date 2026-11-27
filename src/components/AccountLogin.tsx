import { Text } from 'react-native';
import { C, Sheet } from './ui';
import type { Account } from '../types';

export type AccountLoginProps = {
  onClose: () => void;
  onLogin: (session: string, account: Account) => Promise<void>;
};

export function AccountLogin({ onClose }: AccountLoginProps) {
  return (
    <Sheet
      visible
      title="登录自己的 B 站"
      subtitle="在手机 APK 中完成官方页面登录。"
      onClose={onClose}
    >
      <Text style={{ color: C.muted, fontSize: 13, lineHeight: 24 }}>
        浏览器预览不支持登录同步，请在手机安装包中打开。登录后可以直接选择自己的公开和私密收藏夹，无需分享链接。
      </Text>
    </Sheet>
  );
}
