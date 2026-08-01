import { FontAwesome, Ionicons } from "@expo/vector-icons";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import Constants from "expo-constants";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Linking, LogBox, useColorScheme } from "react-native";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";
import CampanhasMobile from "../components/CampanhasMobile";
import { iniciarMonitoramentoMetricasApp } from "../services/appMetrics";
import { registrarParaNotificacoesPush } from "../services/notificationService";

LogBox.ignoreLogs([
  "expo-notifications",
  "@firebase/firestore",
  "FirebaseError: [code=unimplemented]",
]);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const unstable_settings = {
  initialRouteName: "login",
  anchor: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [splashDone, setSplashDone] = useState(false);
  const router = useRouter();

  const [loaded, error] = useFonts({
    ...FontAwesome.font,
    ...Ionicons.font,
  });

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as {
          url?: string;
        };
        const url = data?.url;

        // 🛡️ Validação de Elite: Só tenta abrir se for um link de verdade
        if (url && typeof url === "string" && url.length > 5) {
          if (url.startsWith("http") || url.startsWith("navpro://")) {
            Linking.openURL(url).catch((err) =>
              console.log("Erro ao abrir URL:", err),
            );
          } else {
            router.push(url as any);
          }
        }
      },
    );
    return () => {
      subscription.remove();
    };
  }, [router]);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    const pararMonitoramento = iniciarMonitoramentoMetricasApp();

    return () => {
      pararMonitoramento();
    };
  }, []);

  useEffect(() => {
    if (loaded) {
      if (Constants.appOwnership !== "expo") {
        registrarParaNotificacoesPush();
      } else {
        console.log("⚓ Rodando no Expo Go: Notificações Push desativadas.");
      }
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // if (!splashDone) {
  //   return <AnimatedSplash onFinish={() => setSplashDone(true)} />;
  // }

  if (!loaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <StatusBar style="light" translucent />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="checkout" options={{ headerShown: false }} />
        </Stack>
        <CampanhasMobile />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
