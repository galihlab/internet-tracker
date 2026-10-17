import { Tabs } from 'expo-router';
import FloatingTabBar from '../../components/FloatingTabBar';

/**
 * Grup tab utama: Beranda, Aplikasi, Statistik, Pengaturan.
 * `UsageProvider` dipasang di root layout supaya welcome memakai data
 * pemakaian yang sama dengan keempat tab.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: 'Beranda' }} />
      <Tabs.Screen name="aplikasi" options={{ title: 'Aplikasi' }} />
      <Tabs.Screen name="statistik" options={{ title: 'Statistik' }} />
      <Tabs.Screen name="pengaturan" options={{ title: 'Pengaturan' }} />
    </Tabs>
  );
}
