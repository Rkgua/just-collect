import { Platform } from 'react-native';

export async function readLoginSession(): Promise<string> {
  const { default: cookies } = await import('@preeternal/react-native-cookie-manager');
  const options = Platform.OS === 'ios' ? { iosCookieStore: 'webKit' as const } : undefined;
  const values = await cookies.get('https://www.bilibili.com/', options);
  return values.SESSDATA?.value || '';
}

export async function clearLoginCookies(): Promise<void> {
  const { default: cookies } = await import('@preeternal/react-native-cookie-manager');
  await cookies.clearAllStores();
}
