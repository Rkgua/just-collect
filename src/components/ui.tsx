import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';

export const C = {
  bg: '#F8F9FC',
  card: '#FFFFFF',
  ink: '#202432',
  muted: '#8C91A1',
  pink: '#F36A91',
  pale: '#FFF0F5',
  line: '#ECEEF4',
  blue: '#7795D4',
};
export type IconName = ComponentProps<typeof Ionicons>['name'];
export const Icon = ({
  name,
  size = 22,
  color = C.ink,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) => <Ionicons name={name} size={size} color={color} />;

export function IconButton({
  name,
  label,
  onPress,
  dark = false,
  disabled = false,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  dark?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.iconButton,
        dark && { backgroundColor: '#292D37' },
        { opacity: disabled ? 0.3 : pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name={name} color={dark ? '#FFF' : C.ink} />
    </Pressable>
  );
}

export function Button({
  children,
  onPress,
  secondary,
  loading,
  disabled,
  icon,
}: {
  children: ReactNode;
  onPress: () => void;
  secondary?: boolean;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={typeof children === 'string' ? children : undefined}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        { opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? C.pink : '#FFF'} />
      ) : icon ? (
        <Icon name={icon} size={19} color={secondary ? C.pink : '#FFF'} />
      ) : null}
      <Text style={[s.buttonText, secondary && { color: C.pink }]}>{children}</Text>
    </Pressable>
  );
}

export function Notice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View accessibilityRole="alert" style={s.notice}>
      <Icon name="alert-circle-outline" size={21} color="#BD6D41" />
      <View style={{ flex: 1 }}>
        <Text style={s.noticeText}>{message}</Text>
        {onRetry && (
          <Pressable accessibilityRole="button" onPress={onRetry} style={{ paddingTop: 10 }}>
            <Text style={{ color: '#A35229', fontWeight: '700' }}>重新试试 →</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={s.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel="关闭窗口"
          onPress={onClose}
        />
        <SafeAreaView edges={['bottom']} style={s.sheet}>
          <View style={s.handle} />
          <View style={s.sheetTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.sheetTitle}>{title}</Text>
              <Text style={s.sheetSubtitle}>{subtitle}</Text>
            </View>
            <IconButton name="close" label="关闭" onPress={onClose} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            {children}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#F0F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 20,
    backgroundColor: C.pink,
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: { backgroundColor: C.pale },
  buttonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  notice: {
    backgroundColor: '#FFF6ED',
    padding: 16,
    borderRadius: 16,
    gap: 10,
    flexDirection: 'row',
    marginVertical: 12,
  },
  noticeText: { color: '#965D3E', fontSize: 13, lineHeight: 21 },
  overlay: {
    flex: 1,
    backgroundColor: '#171B3355',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: 600,
    maxHeight: '92%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: C.card,
    paddingHorizontal: 24,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDE0E8',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  sheetTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 },
  sheetTitle: { fontSize: 23, fontWeight: '800', color: C.ink },
  sheetSubtitle: { fontSize: 13, color: C.muted, marginTop: 8, lineHeight: 20 },
});
