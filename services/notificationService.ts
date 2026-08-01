import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Platform } from "react-native";
import { auth, db } from "./firebase";

type UsuarioPush = {
  uid?: string;
  email?: string | null;
};

export async function registrarParaNotificacoesPush(usuario?: UsuarioPush) {
  let token: string | null = null;

  if (Platform.OS === "web") return null;

  if (!Device.isDevice) {
    console.log("⚓️ Aviso: Notificações exigem dispositivo físico.");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("⚓️ Radar: Permissão negada.");
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    console.error("❌ Erro: Project ID não encontrado. Verifique seu app.json");
    return null;
  }

  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

    const usuarioAtual = auth.currentUser;

    const uid = usuario?.uid || usuarioAtual?.uid || "";
    const email = usuario?.email || usuarioAtual?.email || "";

    console.log("⚓️ Token ancorado:", token);
    console.log("👤 UID para salvar no push token:", uid || "SEM UID");

    if (!uid) {
      console.log("⚠️ Token não salvo porque o usuário ainda não está logado.");
      return token;
    }

    await setDoc(
      doc(db, "push_tokens", token),
      {
        token,
        uid,
        email,
        plataforma: Platform.OS,
        ultimaAtualizacao: serverTimestamp(),
      },
      { merge: true },
    );

    console.log("✅ Token push salvo com UID:", uid || "sem uid");
  } catch (e) {
    console.log("⚠️ Radar: Erro ao registrar token push.", e);
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#38bdf8",
    });
  }

  return token;
}
