import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import { onAuthStateChanged } from "firebase/auth";
import {
    doc,
    runTransaction,
    serverTimestamp,
    Timestamp,
} from "firebase/firestore";
import { AppState, AppStateStatus, Platform } from "react-native";
import { auth, db } from "./firebase";

const FILA_METRICAS_KEY = "@cmb_fila_metricas_v2";
const TEMPO_MINIMO_SESSAO_SEGUNDOS = 2;

type EventoAbertura = {
  tipo: "abertura";
  eventoId: string;
  sessaoId: string;
  uid: string;
  data: string;
  iniciadoEmMs: number;
  plataforma: string;
  appVersion: string;
  buildVersion: string;
  modeloDispositivo: string;
  fabricante: string;
  sistemaOperacional: string;
  versaoSistema: string;
  ambiente: "desenvolvimento" | "producao";
};

type EventoEncerramento = {
  tipo: "encerramento";
  eventoId: string;
  sessaoId: string;
  uid: string;
  data: string;
  iniciadoEmMs: number;
  encerradoEmMs: number;
  duracaoSegundos: number;
};

type EventoMetrica = EventoAbertura | EventoEncerramento;

type SessaoAtual = {
  sessaoId: string;
  uid: string;
  data: string;
  iniciadoEmMs: number;
};

let sessaoAtual: SessaoAtual | null = null;
let uidAtual: string | null = null;
let processandoFila = false;
let monitoramentoAtivo = false;

function obterDataLocal(timestampMs = Date.now()) {
  const data = new Date(timestampMs);
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function obterVersaoApp() {
  return Constants.expoConfig?.version || "desconhecida";
}

function obterBuildVersion() {
  const androidVersionCode = Constants.platform?.android?.versionCode;
  const iosBuildNumber = Constants.platform?.ios?.buildNumber;

  return String(androidVersionCode || iosBuildNumber || "desconhecido");
}

function criarId(prefixo: string) {
  try {
    return `${prefixo}_${Crypto.randomUUID()}`;
  } catch {
    return `${prefixo}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 12)}`;
  }
}

function informacoesDispositivo() {
  return {
    plataforma: Platform.OS,
    appVersion: obterVersaoApp(),
    buildVersion: obterBuildVersion(),
    modeloDispositivo: Device.modelName || "desconhecido",
    fabricante: Device.manufacturer || "desconhecido",
    sistemaOperacional: Device.osName || Platform.OS,
    versaoSistema: Device.osVersion || "desconhecida",
    ambiente: (__DEV__ ? "desenvolvimento" : "producao") as
      | "desenvolvimento"
      | "producao",
  };
}

async function lerFila(): Promise<EventoMetrica[]> {
  try {
    const valor = await AsyncStorage.getItem(FILA_METRICAS_KEY);

    if (!valor) return [];

    const fila = JSON.parse(valor);

    return Array.isArray(fila) ? fila : [];
  } catch {
    return [];
  }
}

async function salvarFila(fila: EventoMetrica[]) {
  const filaLimitada = fila.slice(-200);
  await AsyncStorage.setItem(FILA_METRICAS_KEY, JSON.stringify(filaLimitada));
}

async function adicionarNaFila(evento: EventoMetrica) {
  const fila = await lerFila();

  if (fila.some((item) => item.eventoId === evento.eventoId)) {
    return;
  }

  fila.push(evento);
  await salvarFila(fila);
}

async function processarAbertura(evento: EventoAbertura) {
  const usuarioRef = doc(db, "metricas_app_usuarios", evento.uid);
  const acessoDiaRef = doc(
    db,
    "metricas_app_diarias",
    evento.data,
    "acessos_usuarios",
    evento.uid,
  );
  const sessaoRef = doc(db, "metricas_app_sessoes", evento.sessaoId);

  await runTransaction(db, async (transaction) => {
    const sessaoSnap = await transaction.get(sessaoRef);

    // Impede contagem duplicada quando a fila é reenviada.
    if (sessaoSnap.exists()) return;

    const usuarioSnap = await transaction.get(usuarioRef);
    const acessoDiaSnap = await transaction.get(acessoDiaRef);

    const usuarioAnterior = usuarioSnap.exists() ? usuarioSnap.data() : {};
    const acessoAnterior = acessoDiaSnap.exists() ? acessoDiaSnap.data() : {};

    const aberturaTimestamp = Timestamp.fromMillis(evento.iniciadoEmMs);

    transaction.set(sessaoRef, {
      sessaoId: evento.sessaoId,
      uid: evento.uid,
      data: evento.data,
      iniciadoEm: aberturaTimestamp,
      iniciadoEmMs: evento.iniciadoEmMs,
      encerradoEm: null,
      duracaoSegundos: 0,
      duracaoAplicada: false,
      plataforma: evento.plataforma,
      appVersion: evento.appVersion,
      buildVersion: evento.buildVersion,
      modeloDispositivo: evento.modeloDispositivo,
      fabricante: evento.fabricante,
      sistemaOperacional: evento.sistemaOperacional,
      versaoSistema: evento.versaoSistema,
      ambiente: evento.ambiente,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });

    transaction.set(
      usuarioRef,
      {
        uid: evento.uid,
        primeiroAcessoEm: usuarioAnterior.primeiroAcessoEm || aberturaTimestamp,
        primeiroAcessoData: usuarioAnterior.primeiroAcessoData || evento.data,
        ultimoAcessoEm: aberturaTimestamp,
        ultimoAcessoData: evento.data,
        totalAberturas: Number(usuarioAnterior.totalAberturas || 0) + 1,
        totalTempoUsoSegundos: Number(
          usuarioAnterior.totalTempoUsoSegundos || 0,
        ),
        diasAtivos:
          Number(usuarioAnterior.diasAtivos || 0) +
          (acessoDiaSnap.exists() ? 0 : 1),
        plataforma: evento.plataforma,
        appVersion: evento.appVersion,
        buildVersion: evento.buildVersion,
        modeloDispositivo: evento.modeloDispositivo,
        fabricante: evento.fabricante,
        sistemaOperacional: evento.sistemaOperacional,
        versaoSistema: evento.versaoSistema,
        ambiente: evento.ambiente,
        ultimaSessaoId: evento.sessaoId,
        atualizadoEm: serverTimestamp(),
      },
      { merge: true },
    );

    transaction.set(
      acessoDiaRef,
      {
        uid: evento.uid,
        data: evento.data,
        primeiroAcessoEm: acessoAnterior.primeiroAcessoEm || aberturaTimestamp,
        ultimoAcessoEm: aberturaTimestamp,
        aberturas: Number(acessoAnterior.aberturas || 0) + 1,
        tempoUsoSegundos: Number(acessoAnterior.tempoUsoSegundos || 0),
        plataforma: evento.plataforma,
        appVersion: evento.appVersion,
        buildVersion: evento.buildVersion,
        ambiente: evento.ambiente,
        atualizadoEm: serverTimestamp(),
      },
      { merge: true },
    );
  });
}

async function processarEncerramento(evento: EventoEncerramento) {
  const usuarioRef = doc(db, "metricas_app_usuarios", evento.uid);
  const acessoDiaRef = doc(
    db,
    "metricas_app_diarias",
    evento.data,
    "acessos_usuarios",
    evento.uid,
  );
  const sessaoRef = doc(db, "metricas_app_sessoes", evento.sessaoId);

  await runTransaction(db, async (transaction) => {
    const sessaoSnap = await transaction.get(sessaoRef);

    if (!sessaoSnap.exists()) {
      throw new Error("A sessão ainda não foi registrada.");
    }

    const sessaoAnterior = sessaoSnap.data();

    if (sessaoAnterior.duracaoAplicada === true) return;

    const usuarioSnap = await transaction.get(usuarioRef);
    const acessoDiaSnap = await transaction.get(acessoDiaRef);

    const usuarioAnterior = usuarioSnap.exists() ? usuarioSnap.data() : {};
    const acessoAnterior = acessoDiaSnap.exists() ? acessoDiaSnap.data() : {};

    const duracaoSegundos = Math.max(
      TEMPO_MINIMO_SESSAO_SEGUNDOS,
      Math.floor(evento.duracaoSegundos),
    );

    transaction.set(
      sessaoRef,
      {
        encerradoEm: Timestamp.fromMillis(evento.encerradoEmMs),
        encerradoEmMs: evento.encerradoEmMs,
        duracaoSegundos,
        duracaoAplicada: true,
        atualizadoEm: serverTimestamp(),
      },
      { merge: true },
    );

    transaction.set(
      usuarioRef,
      {
        totalTempoUsoSegundos:
          Number(usuarioAnterior.totalTempoUsoSegundos || 0) + duracaoSegundos,
        atualizadoEm: serverTimestamp(),
      },
      { merge: true },
    );

    transaction.set(
      acessoDiaRef,
      {
        tempoUsoSegundos:
          Number(acessoAnterior.tempoUsoSegundos || 0) + duracaoSegundos,
        atualizadoEm: serverTimestamp(),
      },
      { merge: true },
    );
  });
}

async function processarEvento(evento: EventoMetrica) {
  if (evento.tipo === "abertura") {
    await processarAbertura(evento);
    return;
  }

  await processarEncerramento(evento);
}

async function processarFila() {
  if (processandoFila) return;

  processandoFila = true;

  try {
    let fila = await lerFila();
    const restante: EventoMetrica[] = [];

    for (let index = 0; index < fila.length; index++) {
      const evento = fila[index];

      try {
        await processarEvento(evento);
      } catch (error) {
        console.log("⚠️ Métricas aguardando internet:", error);

        // Mantém o evento atual e todos os seguintes para nova tentativa.
        restante.push(...fila.slice(index));
        break;
      }
    }

    await salvarFila(restante);
  } finally {
    processandoFila = false;
  }
}

async function iniciarSessao(uid: string) {
  if (sessaoAtual || !uid) return;

  const iniciadoEmMs = Date.now();
  const sessaoId = criarId("sessao");

  sessaoAtual = {
    sessaoId,
    uid,
    data: obterDataLocal(iniciadoEmMs),
    iniciadoEmMs,
  };

  const evento: EventoAbertura = {
    tipo: "abertura",
    eventoId: `abrir_${sessaoId}`,
    sessaoId,
    uid,
    data: sessaoAtual.data,
    iniciadoEmMs,
    ...informacoesDispositivo(),
  };

  await adicionarNaFila(evento);
  await processarFila();
}

async function encerrarSessao() {
  if (!sessaoAtual) return;

  const sessao = sessaoAtual;
  sessaoAtual = null;

  const encerradoEmMs = Date.now();
  const duracaoSegundos = Math.max(
    0,
    Math.floor((encerradoEmMs - sessao.iniciadoEmMs) / 1000),
  );

  const evento: EventoEncerramento = {
    tipo: "encerramento",
    eventoId: `fechar_${sessao.sessaoId}`,
    sessaoId: sessao.sessaoId,
    uid: sessao.uid,
    data: sessao.data,
    iniciadoEmMs: sessao.iniciadoEmMs,
    encerradoEmMs,
    duracaoSegundos,
  };

  await adicionarNaFila(evento);
  await processarFila();
}

async function tratarMudancaAppState(proximoEstado: AppStateStatus) {
  if (proximoEstado === "active") {
    await processarFila();

    if (uidAtual) {
      await iniciarSessao(uidAtual);
    }

    return;
  }

  if (proximoEstado === "background" || proximoEstado === "inactive") {
    await encerrarSessao();
  }
}

/**
 * Inicia o monitoramento de:
 * - usuários únicos;
 * - acessos por dia;
 * - quantidade de aberturas;
 * - tempo de uso;
 * - versão do app;
 * - plataforma e dispositivo;
 * - sessões recentes.
 *
 * Retorna uma função para remover os listeners.
 */
export function iniciarMonitoramentoMetricasApp() {
  if (monitoramentoAtivo) {
    return () => undefined;
  }

  monitoramentoAtivo = true;

  const unsubscribeAuth = onAuthStateChanged(auth, async (usuario) => {
    const novoUid = usuario?.uid || null;

    if (uidAtual && uidAtual !== novoUid) {
      await encerrarSessao();
    }

    uidAtual = novoUid;

    await processarFila();

    if (uidAtual && AppState.currentState === "active") {
      await iniciarSessao(uidAtual);
    }
  });

  const subscriptionAppState = AppState.addEventListener(
    "change",
    (proximoEstado) => {
      tratarMudancaAppState(proximoEstado).catch((error) =>
        console.log("⚠️ Erro no monitoramento de métricas:", error),
      );
    },
  );

  processarFila().catch((error) =>
    console.log("⚠️ Não foi possível processar métricas pendentes:", error),
  );

  return () => {
    unsubscribeAuth();
    subscriptionAppState.remove();

    encerrarSessao().catch(() => undefined);

    uidAtual = null;
    monitoramentoAtivo = false;
  };
}
