import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { MercadoPagoConfig, Payment } from "mercadopago";
import * as nodemailer from "nodemailer";

admin.initializeApp();
const db = admin.firestore();

// 🔐 SEGREDOS DO SERVIDOR
// Estes nomes precisam existir no Firebase Secret Manager:
// MERCADOPAGO_ACCESS_TOKEN
// GMAIL_USER
// GMAIL_PASS
const MERCADOPAGO_ACCESS_TOKEN = defineSecret("MERCADOPAGO_ACCESS_TOKEN");
const GMAIL_USER = defineSecret("GMAIL_USER");
const GMAIL_PASS = defineSecret("GMAIL_PASS");

// 🛡️ Privacidade: nunca grave CPF completo no Firestore.
// A data de nascimento pode ser gravada somente para uso operacional/legal no manifesto.
function limparDocumento(valor: any) {
  return String(valor || "").replace(/\D/g, "");
}

function mascararCPF(valor: any) {
  const limpo = limparDocumento(valor);
  if (limpo.length !== 11) return "***.***.***-**";
  return `***.***.***-${limpo.slice(-2)}`;
}

function ultimos4Documento(valor: any) {
  const limpo = limparDocumento(valor);
  return limpo.length >= 4 ? limpo.slice(-4) : "";
}

function normalizarNascimentoManifesto(valor: any) {
  const texto = String(valor || "").trim();

  if (!texto) return "";

  // Aceita YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return texto;
  }

  // Aceita DD/MM/YYYY e converte para YYYY-MM-DD
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(texto)) {
    const [dia, mes, ano] = texto.split("/");
    return `${ano}-${mes}-${dia}`;
  }

  // Aceita datas ISO ou Timestamp convertido para string, quando possível
  const data = new Date(texto);
  if (!Number.isNaN(data.getTime())) {
    return data.toISOString().slice(0, 10);
  }

  return "";
}

function criarClienteMercadoPago() {
  const accessToken = MERCADOPAGO_ACCESS_TOKEN.value();

  if (!accessToken) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado.");
  }

  return new MercadoPagoConfig({
    accessToken,
    options: { timeout: 5000 },
  });
}

function criarCarteiro() {
  const gmailUser = GMAIL_USER.value();
  const gmailPass = GMAIL_PASS.value();

  if (!gmailUser || !gmailPass) {
    throw new Error("GMAIL_USER ou GMAIL_PASS não configurado.");
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });
}

export const gerarPix = onRequest(
  {
    region: "us-central1",
    cors: true,
    secrets: [MERCADOPAGO_ACCESS_TOKEN],
  },
  async (req, res) => {
    try {
      const passageiros = req.body.passageiros || [];
      const valorTotal = Number(req.body.valor) || 0;
      const comprador = passageiros[0] || {};
      const idViagem = req.body.idViagem || "";
      const compradorUid = req.body.compradorUid || "";
      const compradorCidadeResidencia =
        req.body.compradorCidadeResidencia || "";
      const compradorEstadoResidencia =
        req.body.compradorEstadoResidencia || "";
      const compradorEstadoResidenciaNome =
        req.body.compradorEstadoResidenciaNome || "";
      const compradorCidadeResidenciaCompleta =
        req.body.compradorCidadeResidenciaCompleta ||
        (compradorCidadeResidencia && compradorEstadoResidencia
          ? `${compradorCidadeResidencia} - ${compradorEstadoResidencia}`
          : "");
      const compradorCidadeResidenciaCodigoIbge =
        req.body.compradorCidadeResidenciaCodigoIbge || "";
      const compradorCidadeResidenciaFonte =
        req.body.compradorCidadeResidenciaFonte || "ibge";

      const nomeCompleto = comprador.nome
        ? String(comprador.nome).trim().split(" ")
        : ["Passageiro"];
      const primeiroNome = nomeCompleto[0];
      const sobrenome =
        nomeCompleto.length > 1 ? nomeCompleto.slice(1).join(" ") : "Almeida";

      let cpfLimpo = comprador.documento
        ? String(comprador.documento).replace(/\D/g, "")
        : "";

      // Mercado Pago exige CPF válido no pagador Pix.
      // Se o app receber CPF inválido, usamos o fallback que você já utilizava.
      if (cpfLimpo.length !== 11) cpfLimpo = "19119119100";

      const payment = new Payment(criarClienteMercadoPago());

      const requestOptions = {
        transaction_amount: valorTotal,
        description: `Passagem: ${req.body.origem} para ${req.body.destino}`,
        payment_method_id: "pix",
        payer: {
          email: req.body.email || `cliente-${Date.now()}@cadeomeubarco.com.br`,
          first_name: primeiroNome,
          last_name: sobrenome,
          identification: { type: "CPF", number: cpfLimpo },
        },
        notification_url:
          "https://us-central1-sistema-navegacao.cloudfunctions.net/notificacaoPagamento",
      };

      const respostaMP = await payment.create({
        body: requestOptions,
        requestOptions: { idempotencyKey: `PIX-${Date.now()}` },
      });

      const paymentId = String(respostaMP.id);

      const promessas = passageiros.map(async (p: any, index: number) => {
        const ticketId = `TKT-${paymentId}-${index}`;
        const documentoMascarado = mascararCPF(p.documento);
        const nascimentoManifesto = normalizarNascimentoManifesto(
          p.nascimento ||
            p.dataNascimento ||
            p.passageiroDataNascimento ||
            p.nascimentoPassageiro ||
            "",
        );

        await db
          .collection("passagens")
          .doc(ticketId)
          .set({
            ticketId,
            idViagem,
            passageiro: p.nome,
            documento: documentoMascarado,
            documentoMascarado,
            documentoFinal: ultimos4Documento(p.documento),
            nascimento: nascimentoManifesto,
            dataNascimento: nascimentoManifesto,
            passageiroDataNascimento: nascimentoManifesto,
            nascimentoInformado: !!nascimentoManifesto,
            dadosSensiveisProtegidos: true,
            barco: req.body.barco || "Embarcação",
            origem: req.body.origem,
            destino: req.body.destino,
            valor: valorTotal / passageiros.length,
            tipoVaga: req.body.tipoVaga || "REDE",
            pagamentoId: paymentId,
            dataCompra: new Date().toISOString(),
            dataViagem: req.body.dataViagem || "",
            horarioSaida: req.body.horarioSaida || "",
            compradorEmail: req.body.email || "suporte.cadeomeubarco@gmail.com",
            compradorUid,
            compradorCidadeResidencia,
            compradorEstadoResidencia,
            compradorEstadoResidenciaNome,
            compradorCidadeResidenciaCompleta,
            compradorCidadeResidenciaCodigoIbge,
            compradorCidadeResidenciaFonte,
            status: "PENDENTE",
            validado: false,
            refeicao: req.body.refeicao || false,
          });
      });

      await Promise.all(promessas);

      res.status(200).send({
        id_transacao: respostaMP.id,
        qr_code_base64:
          respostaMP.point_of_interaction?.transaction_data?.qr_code_base64,
        qr_code_copia_cola:
          respostaMP.point_of_interaction?.transaction_data?.qr_code,
      });
    } catch (error: any) {
      console.error("Erro ao gerar Pix:", error);
      res.status(500).send({ erro: "Erro no servidor." });
    }
  },
);

export const notificacaoPagamento = onRequest(
  {
    region: "us-central1",
    cors: true,
    secrets: [MERCADOPAGO_ACCESS_TOKEN, GMAIL_USER, GMAIL_PASS],
  },
  async (req, res) => {
    const paymentIdBruto = req.query.id || req.body?.data?.id;
    const paymentId = paymentIdBruto ? String(paymentIdBruto) : "";

    if ((req.query.topic || req.body.type) === "payment" && paymentId) {
      try {
        const payment = new Payment(criarClienteMercadoPago());
        const dadosPagamento = await payment.get({ id: paymentId });

        if (dadosPagamento.status === "approved") {
          const bilhetesRef = db.collection("passagens");
          const q = await bilhetesRef
            .where("pagamentoId", "==", String(paymentId))
            .get();

          if (!q.empty) {
            const promessas = q.docs.map((doc) =>
              doc.ref.update({ status: "APROVADO" }),
            );
            await Promise.all(promessas);

            const bData = q.docs[0].data();
            const emailComprador = bData.compradorEmail;

            if (emailComprador) {
              let cardsTickets = "";

              q.docs.forEach((doc) => {
                const b = doc.data();
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${b.ticketId}`;
                const idLimpo = b.ticketId.replace("TKT-", "").split("-")[0];
                const dataFormatada =
                  b.dataViagem && b.dataViagem.includes("-")
                    ? b.dataViagem.split("-").reverse().join("/")
                    : b.dataViagem;

                cardsTickets += `
                <div style="background-color: #ffffff; border-radius: 12px; margin-bottom: 12px; border: 1px solid #e2e8f0; overflow: hidden; font-family: sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                    <div style="background-color: #38bdf8; padding: 6px 15px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: #0f172a; font-weight: 800; font-size: 10px; letter-spacing: 1px;">VOUCHER DE EMBARQUE</span>
                        <span style="color: #0f172a; font-weight: 800; font-size: 10px;">#${idLimpo}</span>
                    </div>

                    <div style="padding: 12px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="width: 110px; text-align: center; vertical-align: middle; padding-right: 15px; border-right: 1px dashed #e2e8f0;">
                                    <img src="${qrUrl}" width="100" height="100" style="display: block; margin: 0 auto;" />
                                    <p style="margin: 5px 0 0 0; font-size: 8px; color: #cbd5e1; font-family: monospace;">ID: ${idLimpo}</p>
                                </td>

                                <td style="padding-left: 15px; vertical-align: top;">
                                    <h2 style="color: #0f172a; margin: 0 0 5px 0; font-size: 14px;">🛳️ ${b.barco}</h2>

                                    <div style="background-color: #f8fafc; border-radius: 6px; padding: 5px 8px; margin-bottom: 8px;">
                                        <p style="margin: 0; font-size: 11px; color: #0f172a; font-weight: bold;">
                                            ${b.origem} <span style="color: #38bdf8;">➔</span> ${b.destino}
                                        </p>
                                    </div>

                                    <table style="width: 100%;">
                                        <tr>
                                            <td style="padding-bottom: 5px;">
                                                <p style="margin: 0; color: #94a3b8; font-size: 8px; font-weight: 800;">PASSAGEIRO</p>
                                                <p style="margin: 1px 0 0 0; color: #0f172a; font-size: 11px; font-weight: bold;">${b.passageiro}</p>
                                            </td>
                                            <td style="padding-bottom: 5px; text-align: right;">
                                                <p style="margin: 0; color: #94a3b8; font-size: 8px; font-weight: 800;">VALOR</p>
                                                <p style="margin: 1px 0 0 0; color: #10b981; font-size: 11px; font-weight: bold;">R$ ${Number(b.valor).toFixed(2)}</p>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <p style="margin: 0; color: #94a3b8; font-size: 8px; font-weight: 800;">DATA</p>
                                                <p style="margin: 1px 0 0 0; color: #0f172a; font-size: 11px; font-weight: bold;">${dataFormatada}</p>
                                            </td>
                                            <td style="text-align: right;">
                                                <p style="margin: 0; color: #94a3b8; font-size: 8px; font-weight: 800;">ACOMODAÇÃO</p>
                                                <p style="margin: 1px 0 0 0; color: #0f172a; font-size: 11px; font-weight: bold;">${String(b.tipoVaga || "").toUpperCase()}</p>
                                            </td>
                                        </tr>
                                    </table>

                                    <div style="margin-top: 5px; text-align: right;">
                                        <span style="font-size: 9px; font-weight: bold; color: ${b.refeicao ? "#10b981" : "#94a3b8"};">
                                            ${b.refeicao ? "🍽️ REFEIÇÃO INCLUÍDA" : "🚫 SEM REFEIÇÃO"}
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </div>
                </div>
            `;
              });

              const gmailUser = GMAIL_USER.value();
              const carteiro = criarCarteiro();

              await carteiro.sendMail({
                from: `"Cadê Meu Barco" <${gmailUser}>`,
                to: emailComprador,
                subject: `🛳️ TUDO PRONTO! Seus bilhetes para o ${bData.barco} chegaram!`,
                html: `
               <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #f1f5f9; padding: 10px;">
                    <div style="background-color: #0f172a; padding: 12px 10px; border-radius: 16px 16px 0 0; text-align: center;">
                        <img 
                            src="https://firebasestorage.googleapis.com/v0/b/sistema-navegacao.firebasestorage.app/o/logo_barco.png?alt=media&token=f81189a3-f666-4a50-b2b2-ef2356a9959d" 
                            alt="Logo" 
                            style="width: 50px; height: 50px; border-radius: 10px; margin-bottom: 5px;"
                        />
                        <h1 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 900;">OBRIGADO!</h1>
                        <p style="color: #38bdf8; margin: 2px 0 0 0; font-size: 12px;">Embarque confirmado no ${bData.barco}.</p>
                    </div>

                    <div style="padding: 10px 0;">
                        ${cardsTickets}
                    </div>

                    <div style="background-color: #ffffff; padding: 12px; border-radius: 12px; text-align: left; border-left: 4px solid #38bdf8; margin-bottom: 15px;">
                        <p style="color: #64748b; font-size: 11px; margin: 0; line-height: 16px;">
                            • Apresente o QR Code no embarque.<br/>
                            • Chegue com antecedência.<br/>
                            • Bilhetes disponíveis no App em <b>"Meus Bilhetes"</b>.
                        </p>
                    </div>

                    <div style="text-align: center; color: #94a3b8; font-size: 10px;">
                        <p>Dúvidas? <a href="mailto:suporte.cadeomeubarco@gmail.com" style="color: #38bdf8; text-decoration: none;">suporte.cadeomeubarco@gmail.com</a></p>
                        <p style="margin-top: 5px;">© 2026 CADÊ MEU BARCO</p>
                    </div>
                </div>
            `,
              });
              console.log("⚓️ E-mail enviado com sucesso!");
            }
          }
        }
      } catch (error) {
        console.error("Erro na Notificação:", error);
      }
    }

    res.status(200).send("OK");
  },
);

// =========================================================================
// 🔔 NOTIFICAÇÃO AUTOMÁTICA DE CHEGADA NO PORTO
// Usa operacao_barcos + passagens + push_tokens.
// Importante: para notificação direcionada, cada push_token precisa ter uid/userId.
// =========================================================================

type ConfigNotificacaoChegada = {
  automaticoAtivo: boolean;
  notificarSomenteOnline: boolean;
  faixasMinutos: number[];
  tituloAutomatico: string;
  mensagemAutomatica: string;
  tituloManual: string;
  mensagemManualPadrao: string;
};

const CONFIG_NOTIFICACAO_PADRAO: ConfigNotificacaoChegada = {
  automaticoAtivo: true,
  notificarSomenteOnline: true,
  faixasMinutos: [60, 30, 15, 5],
  tituloAutomatico: "Olá, {nome}",
  mensagemAutomatica:
    "{nome}, {barco} deve chegar em {porto} em aproximadamente {tempo}.",
  tituloManual: "Olá, {nome}",
  mensagemManualPadrao:
    "{nome}, {barco} deve chegar em {porto} em aproximadamente {tempo}.",
};

function normalizarFaixasMinutos(valor: any) {
  const origem = Array.isArray(valor)
    ? valor
    : CONFIG_NOTIFICACAO_PADRAO.faixasMinutos;

  const faixas = origem
    .map((item: any) => Number(item))
    .filter((item: number) => Number.isFinite(item) && item > 0 && item <= 240)
    .map((item: number) => Math.round(item));

  return Array.from(new Set(faixas)).sort((a, b) => b - a);
}

async function buscarConfigNotificacaoChegada(): Promise<ConfigNotificacaoChegada> {
  try {
    const doc = await db
      .collection("configuracoes")
      .doc("notificacoes_chegada")
      .get();

    const dados = doc.exists ? doc.data() || {} : {};

    return {
      automaticoAtivo:
        typeof dados.automaticoAtivo === "boolean"
          ? dados.automaticoAtivo
          : CONFIG_NOTIFICACAO_PADRAO.automaticoAtivo,
      notificarSomenteOnline:
        typeof dados.notificarSomenteOnline === "boolean"
          ? dados.notificarSomenteOnline
          : CONFIG_NOTIFICACAO_PADRAO.notificarSomenteOnline,
      faixasMinutos: normalizarFaixasMinutos(dados.faixasMinutos),
      tituloAutomatico:
        String(dados.tituloAutomatico || "").trim() ||
        CONFIG_NOTIFICACAO_PADRAO.tituloAutomatico,
      mensagemAutomatica:
        String(dados.mensagemAutomatica || "").trim() ||
        CONFIG_NOTIFICACAO_PADRAO.mensagemAutomatica,
      tituloManual:
        String(dados.tituloManual || "").trim() ||
        CONFIG_NOTIFICACAO_PADRAO.tituloManual,
      mensagemManualPadrao:
        String(dados.mensagemManualPadrao || "").trim() ||
        CONFIG_NOTIFICACAO_PADRAO.mensagemManualPadrao,
    };
  } catch (error) {
    console.warn("⚠️ Usando configuração padrão de notificações.", error);
    return CONFIG_NOTIFICACAO_PADRAO;
  }
}

function faixaNotificacaoChegada(
  previsaoMinutos: any,
  faixasMinutos: number[],
) {
  const minutos = Number(previsaoMinutos);

  if (!Number.isFinite(minutos) || minutos < 0) return null;

  const faixasAsc = [...faixasMinutos].sort((a, b) => a - b);
  return faixasAsc.find((faixa) => minutos <= faixa) || null;
}

function aplicarTemplateNotificacao(
  template: string,
  operacao: any,
  passagem: any,
  nomesAtuaisPorUid: Map<string, string>,
  faixa?: number,
) {
  const nome = primeiroNomeDoPerfilOuPassagem(passagem, nomesAtuaisPorUid);
  const nomeCompleto =
    nomesAtuaisPorUid.get(String(passagem?.compradorUid || "")) ||
    obterNomePassageiro(passagem);
  const barco = operacao.nome || operacao.barcoId || "Seu barco";
  const porto = operacao.proximoPortoNome || "o próximo porto";
  const cidade = operacao.proximoPortoCidade || "";
  const tempo =
    operacao.previsaoTexto || (faixa ? `${faixa} min` : "alguns minutos");
  const distancia =
    operacao.distanciaKm !== null && operacao.distanciaKm !== undefined
      ? `${operacao.distanciaKm} km`
      : "";

  return String(template || "")
    .replace(/\{nome\}/g, nome)
    .replace(/\{nomeCompleto\}/g, nomeCompleto)
    .replace(/\{barco\}/g, barco)
    .replace(/\{porto\}/g, porto)
    .replace(/\{cidade\}/g, cidade)
    .replace(/\{tempo\}/g, tempo)
    .replace(/\{distancia\}/g, distancia)
    .trim();
}

function chaveDiaOperacao() {
  return new Date().toISOString().slice(0, 10);
}

function tokenExpoValido(token: any) {
  const texto = String(token || "");
  return (
    texto.startsWith("ExponentPushToken[") || texto.startsWith("ExpoPushToken[")
  );
}

function statusPassagemAprovada(status: any) {
  const s = String(status || "")
    .toUpperCase()
    .trim();
  return s === "APROVADO" || s === "PAGO" || s === "CONCLUIDO";
}

function passagemCombinaComOperacao(passagem: any, operacao: any) {
  const barcoPassagem = normalizarTextoOperacao(passagem.barco);
  const barcoOperacaoNome = normalizarTextoOperacao(operacao.nome);
  const barcoOperacaoId = normalizarTextoOperacao(operacao.barcoId);

  const destino = normalizarTextoOperacao(passagem.destino);
  const portoNome = normalizarTextoOperacao(operacao.proximoPortoNome);
  const portoCidade = normalizarTextoOperacao(operacao.proximoPortoCidade);

  const mesmoBarco =
    barcoPassagem === barcoOperacaoNome ||
    barcoPassagem === barcoOperacaoId ||
    barcoPassagem.includes(barcoOperacaoNome) ||
    barcoPassagem.includes(barcoOperacaoId);

  const mesmoDestino =
    destino === portoNome ||
    destino === portoCidade ||
    destino.includes(portoNome) ||
    destino.includes(portoCidade) ||
    portoNome.includes(destino) ||
    portoCidade.includes(destino);

  return mesmoBarco && mesmoDestino;
}

async function buscarPassageirosParaOperacao(operacao: any) {
  const nomesBarco = Array.from(
    new Set(
      [operacao.nome, operacao.barcoId]
        .filter(Boolean)
        .map((valor) => String(valor)),
    ),
  ).slice(0, 10);

  let docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];

  try {
    if (nomesBarco.length > 0) {
      const snap = await db
        .collection("passagens")
        .where("status", "==", "APROVADO")
        .where("barco", "in", nomesBarco)
        .get();

      docs = snap.docs;
    }
  } catch (error) {
    console.warn(
      "⚠️ Consulta otimizada de passagens falhou. Usando fallback por status.",
      error,
    );

    const snap = await db
      .collection("passagens")
      .where("status", "==", "APROVADO")
      .get();

    docs = snap.docs;
  }

  return docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((passagem: any) => {
      return (
        statusPassagemAprovada(passagem.status) &&
        passagem.compradorUid &&
        passagemCombinaComOperacao(passagem, operacao)
      );
    });
}

async function buscarTokensPorUid(uids: string[]) {
  if (uids.length === 0) return [];

  const uidSet = new Set(uids.filter(Boolean));
  const tokensSnap = await db.collection("push_tokens").get();

  const tokens = tokensSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((item: any) => {
      const uid =
        item.uid ||
        item.userId ||
        item.usuarioId ||
        item.compradorUid ||
        item.donoUid ||
        "";

      return uidSet.has(String(uid));
    })
    .map((item: any) => String(item.token || item.id))
    .filter(tokenExpoValido);

  return Array.from(new Set(tokens));
}

async function enviarPushExpo(
  tokens: string[],
  titulo: string,
  corpo: string,
  data: any,
) {
  if (tokens.length === 0) {
    return {
      enviados: 0,
      resposta: null,
    };
  }

  const mensagens = tokens.map((token) => ({
    to: token,
    sound: "default",
    title: titulo,
    body: corpo,
    data,
  }));

  const resposta = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mensagens),
  });

  const texto = await resposta.text();

  if (!resposta.ok) {
    throw new Error(`Erro Expo Push ${resposta.status}: ${texto}`);
  }

  return {
    enviados: tokens.length,
    resposta: texto,
  };
}

function obterNomePassageiro(passagem: any) {
  const possiveis = [
    passagem.nomePassageiro,
    passagem.passageiroNome,
    passagem.nome,
    passagem.nomeCliente,
    passagem.clienteNome,
    passagem.compradorNome,
    passagem.nomeComprador,
    passagem.usuarioNome,
    passagem.passengerName,
  ];

  for (const valor of possiveis) {
    const nome = String(valor || "").trim();
    if (nome) return nome;
  }

  if (Array.isArray(passagem.passageiros) && passagem.passageiros.length > 0) {
    const primeiro = passagem.passageiros[0];

    if (typeof primeiro === "string" && primeiro.trim()) {
      return primeiro.trim();
    }

    const nome =
      primeiro?.nome ||
      primeiro?.nomeCompleto ||
      primeiro?.nomePassageiro ||
      primeiro?.passageiroNome ||
      "";

    if (String(nome).trim()) {
      return String(nome).trim();
    }
  }

  return "passageiro";
}

function primeiroNomePassageiro(passagem: any) {
  const nome = obterNomePassageiro(passagem);
  return nome.split(" ").filter(Boolean)[0] || "passageiro";
}

function obterNomePerfilUsuario(usuario: any) {
  const possiveis = [
    usuario?.nome,
    usuario?.name,
    usuario?.nomeCompleto,
    usuario?.displayName,
    usuario?.perfil?.nome,
    usuario?.dadosPessoais?.nome,
  ];

  for (const valor of possiveis) {
    const nome = String(valor || "").trim();
    if (nome) return nome;
  }

  return "";
}

async function buscarNomesAtuaisPorUid(uids: string[]) {
  const mapa = new Map<string, string>();
  const unicos = Array.from(new Set(uids.filter(Boolean)));

  await Promise.all(
    unicos.map(async (uid) => {
      try {
        const doc = await db.collection("usuarios").doc(uid).get();

        if (!doc.exists) return;

        const nome = obterNomePerfilUsuario(doc.data());

        if (nome) {
          mapa.set(uid, nome);
        }
      } catch (error) {
        console.warn(
          `⚠️ Não foi possível buscar nome atual do usuário ${uid}`,
          error,
        );
      }
    }),
  );

  return mapa;
}

function primeiroNomeDoPerfilOuPassagem(
  passagem: any,
  nomesAtuaisPorUid: Map<string, string>,
) {
  const uid = String(passagem?.compradorUid || "");
  const nomeAtual = uid ? nomesAtuaisPorUid.get(uid) : "";

  if (nomeAtual) {
    return nomeAtual.split(" ").filter(Boolean)[0] || nomeAtual;
  }

  return primeiroNomePassageiro(passagem);
}

async function buscarTokensDetalhadosPorUid(uids: string[]) {
  if (uids.length === 0) return [];

  const uidSet = new Set(uids.filter(Boolean));
  const tokensSnap = await db.collection("push_tokens").get();

  const tokens = tokensSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .map((item: any) => {
      const uid =
        item.uid ||
        item.userId ||
        item.usuarioId ||
        item.compradorUid ||
        item.donoUid ||
        "";

      const token = String(item.token || item.id);

      return {
        uid: String(uid),
        token,
      };
    })
    .filter((item) => uidSet.has(item.uid) && tokenExpoValido(item.token));

  const unicos = new Map<string, { uid: string; token: string }>();

  tokens.forEach((item) => {
    unicos.set(`${item.uid}_${item.token}`, item);
  });

  return Array.from(unicos.values());
}

async function enviarPushExpoMensagens(
  mensagens: {
    to: string;
    sound: string;
    title: string;
    body: string;
    data: any;
  }[],
) {
  if (mensagens.length === 0) {
    return {
      enviados: 0,
      resposta: null,
    };
  }

  const resposta = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mensagens),
  });

  const texto = await resposta.text();

  if (!resposta.ok) {
    throw new Error(`Erro Expo Push ${resposta.status}: ${texto}`);
  }

  return {
    enviados: mensagens.length,
    resposta: texto,
  };
}

function montarMensagemChegadaPersonalizada(
  operacao: any,
  passagem: any,
  nomesAtuaisPorUid: Map<string, string>,
  config: ConfigNotificacaoChegada,
  faixa?: number,
) {
  return aplicarTemplateNotificacao(
    config.mensagemAutomatica,
    operacao,
    passagem,
    nomesAtuaisPorUid,
    faixa,
  );
}

function montarTituloChegadaPersonalizado(
  operacao: any,
  passagem: any,
  nomesAtuaisPorUid: Map<string, string>,
  config: ConfigNotificacaoChegada,
  faixa?: number,
) {
  return (
    aplicarTemplateNotificacao(
      config.tituloAutomatico,
      operacao,
      passagem,
      nomesAtuaisPorUid,
      faixa,
    ) || "Seu barco está chegando"
  );
}

function montarMensagemManualPersonalizada(
  operacao: any,
  passagem: any,
  mensagemExtra: string,
  nomesAtuaisPorUid: Map<string, string>,
  config: ConfigNotificacaoChegada,
) {
  if (mensagemExtra.trim()) {
    const nome = primeiroNomeDoPerfilOuPassagem(passagem, nomesAtuaisPorUid);
    return `${nome}, ${mensagemExtra.trim()}`;
  }

  return aplicarTemplateNotificacao(
    config.mensagemManualPadrao,
    operacao,
    passagem,
    nomesAtuaisPorUid,
  );
}

function montarTituloManualPersonalizado(
  operacao: any,
  passagem: any,
  nomesAtuaisPorUid: Map<string, string>,
  config: ConfigNotificacaoChegada,
) {
  return (
    aplicarTemplateNotificacao(
      config.tituloManual,
      operacao,
      passagem,
      nomesAtuaisPorUid,
    ) || "Atualização da sua viagem"
  );
}

export const notificarChegadaPorto = onSchedule(
  {
    region: "us-central1",
    schedule: "every 5 minutes",
    timeZone: "America/Sao_Paulo",
  },
  async () => {
    console.log("🔔 Verificando notificações de chegada no porto...");

    const configNotificacao = await buscarConfigNotificacaoChegada();

    if (!configNotificacao.automaticoAtivo) {
      console.log("🔕 Notificação automática desativada nas configurações.");
      return;
    }

    const maiorFaixa = Math.max(...configNotificacao.faixasMinutos, 60);

    const operacoesSnap = await db
      .collection("operacao_barcos")
      .where("previsaoMinutos", "<=", maiorFaixa)
      .get();

    let verificadas = 0;
    let enviadas = 0;
    let ignoradas = 0;

    for (const operacaoDoc of operacoesSnap.docs) {
      const operacao = {
        id: operacaoDoc.id,
        ...operacaoDoc.data(),
      } as any;

      const faixa = faixaNotificacaoChegada(
        operacao.previsaoMinutos,
        configNotificacao.faixasMinutos,
      );

      if (
        !faixa ||
        (configNotificacao.notificarSomenteOnline &&
          operacao.status !== "online") ||
        !operacao.proximoPortoNome
      ) {
        ignoradas += 1;
        continue;
      }

      verificadas += 1;

      const chave = [
        operacao.barcoId || operacao.id,
        operacao.proximoPortoId ||
          normalizarTextoOperacao(operacao.proximoPortoNome),
        faixa,
        chaveDiaOperacao(),
      ]
        .join("_")
        .replace(/[^\w-]/g, "_");

      const controleRef = db.collection("notificacoes_chegada").doc(chave);
      const controleDoc = await controleRef.get();

      if (controleDoc.exists) {
        ignoradas += 1;
        continue;
      }

      const passageiros = await buscarPassageirosParaOperacao(operacao);
      const compradorUids = Array.from(
        new Set(
          passageiros
            .map((p: any) => String(p.compradorUid || ""))
            .filter(Boolean),
        ),
      );

      const nomesAtuaisPorUid = await buscarNomesAtuaisPorUid(compradorUids);
      const tokensDetalhados =
        await buscarTokensDetalhadosPorUid(compradorUids);
      const tokensPorUid = new Map<string, string[]>();

      tokensDetalhados.forEach((item) => {
        const lista = tokensPorUid.get(item.uid) || [];
        lista.push(item.token);
        tokensPorUid.set(item.uid, lista);
      });

      const mensagens: {
        to: string;
        sound: string;
        title: string;
        body: string;
        data: any;
      }[] = [];

      const tokensUsados = new Set<string>();

      passageiros.forEach((passagem: any) => {
        const uid = String(passagem.compradorUid || "");
        const tokens = tokensPorUid.get(uid) || [];

        tokens.forEach((token) => {
          // Evita enviar duas notificações iguais para o mesmo token se o comprador
          // tiver mais de uma passagem no mesmo barco/porto.
          if (tokensUsados.has(token)) return;
          tokensUsados.add(token);

          mensagens.push({
            to: token,
            sound: "default",
            title: montarTituloChegadaPersonalizado(
              operacao,
              passagem,
              nomesAtuaisPorUid,
              configNotificacao,
              faixa,
            ),
            body: montarMensagemChegadaPersonalizada(
              operacao,
              passagem,
              nomesAtuaisPorUid,
              configNotificacao,
              faixa,
            ),
            data: {
              tipo: "chegada_porto",
              barcoId: operacao.barcoId || operacao.id,
              barcoNome: operacao.nome || "",
              proximoPortoNome: operacao.proximoPortoNome || "",
              proximoPortoCidade: operacao.proximoPortoCidade || "",
              previsaoMinutos: operacao.previsaoMinutos || faixa,
              previsaoTexto: operacao.previsaoTexto || `${faixa} min`,
              passagemId: passagem.id || "",
            },
          });
        });
      });

      if (mensagens.length === 0) {
        await controleRef.set({
          barcoId: operacao.barcoId || operacao.id,
          proximoPortoNome: operacao.proximoPortoNome,
          faixaMinutos: faixa,
          status: "sem_tokens",
          passageirosEncontrados: passageiros.length,
          compradorUids,
          tokensEnviados: 0,
          personalizado: true,
          automatico: true,
          configuracao: {
            faixasMinutos: configNotificacao.faixasMinutos,
            notificarSomenteOnline: configNotificacao.notificarSomenteOnline,
          },
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(
          `⚠️ Sem tokens vinculados para ${operacao.nome} / ${operacao.proximoPortoNome}. Passageiros: ${passageiros.length}`,
        );

        ignoradas += 1;
        continue;
      }

      const resultado = await enviarPushExpoMensagens(mensagens);

      await controleRef.set({
        barcoId: operacao.barcoId || operacao.id,
        barcoNome: operacao.nome || "",
        proximoPortoNome: operacao.proximoPortoNome,
        proximoPortoCidade: operacao.proximoPortoCidade || "",
        faixaMinutos: faixa,
        previsaoMinutos: operacao.previsaoMinutos || null,
        previsaoTexto: operacao.previsaoTexto || null,
        passageirosEncontrados: passageiros.length,
        compradorUids,
        tokensEnviados: resultado.enviados,
        status: "enviado",
        personalizado: true,
        automatico: true,
        configuracao: {
          faixasMinutos: configNotificacao.faixasMinutos,
          notificarSomenteOnline: configNotificacao.notificarSomenteOnline,
        },
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      enviadas += resultado.enviados;

      console.log(
        `✅ Push personalizado enviado: ${operacao.nome} → ${operacao.proximoPortoNome} (${resultado.enviados} token(s))`,
      );
    }

    console.log(
      `🔔 Notificações finalizadas. Verificadas: ${verificadas}, enviadas: ${enviadas}, ignoradas: ${ignoradas}`,
    );
  },
);

// =========================================================================
// 📣 ENVIO MANUAL DE AVISO PELO SISTEMA DE NAVEGAÇÃO
// Permite que o administrador envie aviso para passageiros do barco/porto.
// =========================================================================

const ADMIN_EMAILS_NOTIFICACOES = [
  "jandessonmoraes@gmail.com",
  "escdecastrousinagen@gmail.com",
];

function emailAdminPermitido(email: any) {
  return ADMIN_EMAILS_NOTIFICACOES.includes(String(email || "").toLowerCase());
}

export const enviarAvisoManualChegada = onRequest(
  {
    region: "us-central1",
    cors: true,
  },
  async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }

      if (req.method !== "POST") {
        res.status(405).send({ erro: "Método não permitido." });
        return;
      }

      const authorization = String(req.headers.authorization || "");
      const idToken = authorization.startsWith("Bearer ")
        ? authorization.replace("Bearer ", "").trim()
        : "";

      if (!idToken) {
        res.status(401).send({ erro: "Login obrigatório." });
        return;
      }

      const decoded = await admin.auth().verifyIdToken(idToken);
      const email = String(decoded.email || "").toLowerCase();

      if (!emailAdminPermitido(email)) {
        res.status(403).send({ erro: "Acesso não autorizado." });
        return;
      }

      const barcoId = String(req.body?.barcoId || "").trim();
      const mensagemExtra = String(req.body?.mensagemExtra || "").trim();
      const configNotificacao = await buscarConfigNotificacaoChegada();

      if (!barcoId) {
        res.status(400).send({ erro: "barcoId obrigatório." });
        return;
      }

      const operacaoDoc = await db
        .collection("operacao_barcos")
        .doc(barcoId)
        .get();

      if (!operacaoDoc.exists) {
        res.status(404).send({ erro: "Operação do barco não encontrada." });
        return;
      }

      const operacao = {
        id: operacaoDoc.id,
        ...operacaoDoc.data(),
      } as any;

      const passageiros = await buscarPassageirosParaOperacao(operacao);
      const compradorUids = Array.from(
        new Set(
          passageiros
            .map((p: any) => String(p.compradorUid || ""))
            .filter(Boolean),
        ),
      );

      const nomesAtuaisPorUid = await buscarNomesAtuaisPorUid(compradorUids);
      const tokensDetalhados =
        await buscarTokensDetalhadosPorUid(compradorUids);
      const tokensPorUid = new Map<string, string[]>();

      tokensDetalhados.forEach((item) => {
        const lista = tokensPorUid.get(item.uid) || [];
        lista.push(item.token);
        tokensPorUid.set(item.uid, lista);
      });

      const controleRef = db
        .collection("notificacoes_chegada")
        .doc(
          [
            "manual",
            operacao.barcoId || operacao.id,
            normalizarTextoOperacao(operacao.proximoPortoNome || "porto"),
            Date.now(),
          ]
            .join("_")
            .replace(/[^\w-]/g, "_"),
        );

      const mensagens: {
        to: string;
        sound: string;
        title: string;
        body: string;
        data: any;
      }[] = [];

      const tokensUsados = new Set<string>();

      passageiros.forEach((passagem: any) => {
        const uid = String(passagem.compradorUid || "");
        const tokens = tokensPorUid.get(uid) || [];

        tokens.forEach((token) => {
          if (tokensUsados.has(token)) return;
          tokensUsados.add(token);

          mensagens.push({
            to: token,
            sound: "default",
            title: montarTituloManualPersonalizado(
              operacao,
              passagem,
              nomesAtuaisPorUid,
              configNotificacao,
            ),
            body: montarMensagemManualPersonalizada(
              operacao,
              passagem,
              mensagemExtra,
              nomesAtuaisPorUid,
              configNotificacao,
            ),
            data: {
              tipo: "chegada_porto_manual",
              barcoId: operacao.barcoId || operacao.id,
              barcoNome: operacao.nome || "",
              proximoPortoNome: operacao.proximoPortoNome || "",
              proximoPortoCidade: operacao.proximoPortoCidade || "",
              previsaoMinutos: operacao.previsaoMinutos || null,
              previsaoTexto: operacao.previsaoTexto || null,
              passagemId: passagem.id || "",
            },
          });
        });
      });

      if (mensagens.length === 0) {
        await controleRef.set({
          origem: "manual",
          enviadoPorEmail: email,
          barcoId: operacao.barcoId || operacao.id,
          barcoNome: operacao.nome || "",
          proximoPortoNome: operacao.proximoPortoNome || "",
          proximoPortoCidade: operacao.proximoPortoCidade || "",
          previsaoMinutos: operacao.previsaoMinutos || null,
          previsaoTexto: operacao.previsaoTexto || null,
          passageirosEncontrados: passageiros.length,
          compradorUids,
          tokensEnviados: 0,
          status: "sem_tokens_manual",
          personalizado: true,
          configuracao: {
            tituloManual: configNotificacao.tituloManual,
            mensagemManualPadrao: configNotificacao.mensagemManualPadrao,
          },
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });

        res.status(200).send({
          ok: false,
          status: "sem_tokens",
          passageirosEncontrados: passageiros.length,
          tokensEnviados: 0,
          mensagem:
            "Passageiros encontrados, mas nenhum token vinculado ao compradorUid.",
        });
        return;
      }

      const resultado = await enviarPushExpoMensagens(mensagens);

      await controleRef.set({
        origem: "manual",
        enviadoPorEmail: email,
        barcoId: operacao.barcoId || operacao.id,
        barcoNome: operacao.nome || "",
        proximoPortoNome: operacao.proximoPortoNome || "",
        proximoPortoCidade: operacao.proximoPortoCidade || "",
        previsaoMinutos: operacao.previsaoMinutos || null,
        previsaoTexto: operacao.previsaoTexto || null,
        passageirosEncontrados: passageiros.length,
        compradorUids,
        tokensEnviados: resultado.enviados,
        status: "enviado_manual",
        personalizado: true,
        configuracao: {
          tituloManual: configNotificacao.tituloManual,
          mensagemManualPadrao: configNotificacao.mensagemManualPadrao,
        },
        mensagem: mensagemExtra || "Mensagem automática personalizada.",
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(
        `📣 Aviso manual personalizado enviado por ${email}: ${operacao.nome} → ${operacao.proximoPortoNome} (${resultado.enviados} token(s))`,
      );

      res.status(200).send({
        ok: true,
        status: "enviado",
        passageirosEncontrados: passageiros.length,
        tokensEnviados: resultado.enviados,
        personalizado: true,
      });
    } catch (error: any) {
      console.error("❌ Erro no envio manual de aviso:", error);
      res.status(500).send({
        erro: "Erro ao enviar aviso manual.",
        detalhe: error?.message || String(error),
      });
    }
  },
);

// =========================================================================
// 📣 ENVIO SEGMENTADO DE NOTIFICAÇÕES
// Permite enviar push para todos, cidade, estado ou compradores de um barco.
// Chamado pelo Sistema de Navegação na tela Notificações.
// =========================================================================

type PublicoNotificacaoSegmentada =
  | "todos"
  | "cidade"
  | "estado"
  | "comprou_barco";

function normalizarTextoSegmentado(valor: any) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function obterCidadeUsuarioSegmentado(usuario: any) {
  if (usuario?.cidadeResidenciaCompleta) {
    return String(usuario.cidadeResidenciaCompleta);
  }

  if (usuario?.cidadeResidencia && usuario?.estadoResidencia) {
    return `${usuario.cidadeResidencia} - ${usuario.estadoResidencia}`;
  }

  return String(usuario?.cidade || usuario?.cidadeUsuario || "");
}

function obterEstadoUsuarioSegmentado(usuario: any) {
  return String(
    usuario?.estadoResidencia ||
      usuario?.estado ||
      usuario?.uf ||
      usuario?.estadoUsuario ||
      "",
  );
}

function obterUidPassagemSegmentada(passagem: any) {
  return String(
    passagem?.compradorUid ||
      passagem?.usuarioId ||
      passagem?.userId ||
      passagem?.uid ||
      passagem?.clienteId ||
      "",
  ).trim();
}

function obterBarcoPassagemSegmentada(passagem: any) {
  return String(
    passagem?.barcoId ||
      passagem?.embarcacaoId ||
      passagem?.idBarco ||
      passagem?.barco ||
      passagem?.nomeBarco ||
      "",
  ).trim();
}

function passagemStatusValidoSegmentado(passagem: any) {
  const status = String(passagem?.status || "")
    .trim()
    .toUpperCase();

  if (!status) return true;

  return (
    status === "APROVADO" ||
    status === "PAGO" ||
    status === "CONCLUIDO" ||
    status === "CONFIRMADO"
  );
}

async function buscarUidsPorCidadeSegmentado(cidadeAlvo: string) {
  const cidadeRef = normalizarTextoSegmentado(cidadeAlvo);

  if (!cidadeRef) return [];

  const usuariosSnap = await db.collection("usuarios").get();

  const uids = usuariosSnap.docs
    .filter((doc) => {
      const cidade = normalizarTextoSegmentado(
        obterCidadeUsuarioSegmentado(doc.data()),
      );

      return cidade === cidadeRef;
    })
    .map((doc) => doc.id);

  return Array.from(new Set(uids));
}

async function buscarUidsPorEstadoSegmentado(estadoAlvo: string) {
  const estadoRef = normalizarTextoSegmentado(estadoAlvo);

  if (!estadoRef) return [];

  const usuariosSnap = await db.collection("usuarios").get();

  const uids = usuariosSnap.docs
    .filter((doc) => {
      const estado = normalizarTextoSegmentado(
        obterEstadoUsuarioSegmentado(doc.data()),
      );

      return estado === estadoRef;
    })
    .map((doc) => doc.id);

  return Array.from(new Set(uids));
}

async function buscarUidsCompradoresBarcoSegmentado(barcoIdAlvo: string) {
  const barcoRef = normalizarTextoSegmentado(barcoIdAlvo);

  if (!barcoRef) return [];

  const passagensSnap = await db.collection("passagens").get();

  const uids = passagensSnap.docs
    .map((doc) => doc.data())
    .filter((passagem: any) => {
      if (!passagemStatusValidoSegmentado(passagem)) return false;

      const barcoPassagem = normalizarTextoSegmentado(
        obterBarcoPassagemSegmentada(passagem),
      );

      return barcoPassagem === barcoRef;
    })
    .map(obterUidPassagemSegmentada)
    .filter(Boolean);

  return Array.from(new Set(uids));
}

async function buscarTodosTokensSegmentado() {
  const tokensSnap = await db.collection("push_tokens").get();

  const tokens = tokensSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .map((item: any) =>
      String(item.token || item.expoPushToken || item.pushToken || item.id),
    )
    .filter(tokenExpoValido);

  return Array.from(new Set(tokens));
}

export const enviarNotificacaoSegmentada = onRequest(
  {
    region: "us-central1",
    cors: true,
  },
  async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }

      if (req.method !== "POST") {
        res.status(405).send({ erro: "Método não permitido." });
        return;
      }

      const authorization = String(req.headers.authorization || "");
      const idToken = authorization.startsWith("Bearer ")
        ? authorization.replace("Bearer ", "").trim()
        : "";

      if (!idToken) {
        res.status(401).send({ erro: "Login obrigatório." });
        return;
      }

      const decoded = await admin.auth().verifyIdToken(idToken);
      const email = String(decoded.email || "").toLowerCase();

      if (!emailAdminPermitido(email)) {
        res.status(403).send({ erro: "Acesso não autorizado." });
        return;
      }

      const publicoAlvo = String(
        req.body?.publicoAlvo || "todos",
      ).trim() as PublicoNotificacaoSegmentada;
      const cidadeAlvo = String(req.body?.cidadeAlvo || "").trim();
      const estadoAlvo = String(req.body?.estadoAlvo || "").trim();
      const barcoIdAlvo = String(req.body?.barcoIdAlvo || "").trim();
      const titulo = String(req.body?.titulo || "").trim();
      const mensagem = String(req.body?.mensagem || "").trim();

      if (!titulo || !mensagem) {
        res.status(400).send({ erro: "Título e mensagem são obrigatórios." });
        return;
      }

      if (
        !["todos", "cidade", "estado", "comprou_barco"].includes(publicoAlvo)
      ) {
        res.status(400).send({ erro: "Público-alvo inválido." });
        return;
      }

      let uidsAlvo: string[] = [];
      let tokens: string[] = [];

      if (publicoAlvo === "todos") {
        tokens = await buscarTodosTokensSegmentado();
      }

      if (publicoAlvo === "cidade") {
        if (!cidadeAlvo) {
          res.status(400).send({ erro: "Cidade obrigatória." });
          return;
        }

        uidsAlvo = await buscarUidsPorCidadeSegmentado(cidadeAlvo);
        tokens = await buscarTokensPorUid(uidsAlvo);
      }

      if (publicoAlvo === "estado") {
        if (!estadoAlvo) {
          res.status(400).send({ erro: "Estado obrigatório." });
          return;
        }

        uidsAlvo = await buscarUidsPorEstadoSegmentado(estadoAlvo);
        tokens = await buscarTokensPorUid(uidsAlvo);
      }

      if (publicoAlvo === "comprou_barco") {
        if (!barcoIdAlvo) {
          res.status(400).send({ erro: "Barco obrigatório." });
          return;
        }

        uidsAlvo = await buscarUidsCompradoresBarcoSegmentado(barcoIdAlvo);
        tokens = await buscarTokensPorUid(uidsAlvo);
      }

      const controleRef = db
        .collection("notificacoes_chegada")
        .doc(
          [
            "segmentada",
            publicoAlvo,
            cidadeAlvo || estadoAlvo || barcoIdAlvo || "todos",
            Date.now(),
          ]
            .join("_")
            .replace(/[^\w-]/g, "_"),
        );

      if (tokens.length === 0) {
        await controleRef.set({
          origem: "segmentada",
          enviadoPorEmail: email,
          publicoAlvo,
          cidadeAlvo,
          estadoAlvo,
          barcoIdAlvo,
          titulo,
          mensagem,
          usuariosEncontrados:
            publicoAlvo === "todos" ? "todos" : uidsAlvo.length,
          tokensEnviados: 0,
          status: "sem_tokens_segmentado",
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });

        res.status(200).send({
          ok: false,
          status: "sem_tokens",
          usuariosEncontrados:
            publicoAlvo === "todos" ? "todos" : uidsAlvo.length,
          tokensEnviados: 0,
          mensagem: "Nenhum token encontrado para este público.",
        });
        return;
      }

      const resultado = await enviarPushExpo(tokens, titulo, mensagem, {
        tipo: "notificacao_segmentada",
        publicoAlvo,
        cidadeAlvo,
        estadoAlvo,
        barcoIdAlvo,
        origem: "sistema_navegacao",
      });

      await controleRef.set({
        origem: "segmentada",
        enviadoPorEmail: email,
        publicoAlvo,
        cidadeAlvo,
        estadoAlvo,
        barcoIdAlvo,
        titulo,
        mensagem,
        usuariosEncontrados:
          publicoAlvo === "todos" ? "todos" : uidsAlvo.length,
        tokensEncontrados: tokens.length,
        tokensEnviados: resultado.enviados,
        status: "enviado_segmentado",
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.status(200).send({
        ok: true,
        status: "enviado",
        usuariosEncontrados:
          publicoAlvo === "todos" ? "todos" : uidsAlvo.length,
        tokensEncontrados: tokens.length,
        tokensEnviados: resultado.enviados,
      });
    } catch (error: any) {
      console.error("❌ Erro no envio segmentado:", error);
      res.status(500).send({
        erro: "Erro ao enviar notificação segmentada.",
        detalhe: error?.message || String(error),
      });
    }
  },
);

// =========================================================================
// 🟢 GATILHO AUTOMÁTICO DE SAÍDA (GEOPROCESSAMENTO DE PARTE/MANOBRA/FOLGA)
// =========================================================================

function calcularDistanciaHaversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const R = 6371; // Raio da Terra em KM
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// =========================================================================
// 🛰️ CENTRAL OPERACIONAL DOS BARCOS
// Atualiza a coleção operacao_barcos com status, próximo porto e previsão.
// Esta base será usada pelo Sistema de Navegação, app passageiro e notificações.
// =========================================================================

type CoordenadaOperacao = {
  latitude: number;
  longitude: number;
};

type TerminalOperacao = {
  id: string;
  nome: string;
  cidade: string;
  coordenada: CoordenadaOperacao | null;
};

function normalizarTextoOperacao(valor: any) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/⚓/g, "")
    .replace(/_/g, " ")
    .replace(/^PORTO\s+(DE|DA|DO|DOS|DAS)?\s*/gi, "")
    .replace(/^TERMINAL\s+(DE|DA|DO|DOS|DAS)?\s*/gi, "")
    .replace(/\s*-\s*[A-Z]{2}$/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function nomesParecidosOperacao(a: any, b: any) {
  const na = normalizarTextoOperacao(a);
  const nb = normalizarTextoOperacao(b);

  if (!na || !nb) return false;

  return na === nb || na.includes(nb) || nb.includes(na);
}

function parseDataOperacao(valor: any): Date | null {
  if (!valor) return null;

  if (typeof valor?.toDate === "function") {
    const data = valor.toDate();
    return Number.isNaN(data.getTime()) ? null : data;
  }

  if (typeof valor === "number") {
    const ms = valor < 10000000000 ? valor * 1000 : valor;
    const data = new Date(ms);
    return Number.isNaN(data.getTime()) ? null : data;
  }

  const texto = String(valor || "").trim();
  if (!texto || texto.startsWith("sem_data")) return null;

  const numero = Number(texto);
  if (Number.isFinite(numero) && numero > 0) {
    const ms = numero < 10000000000 ? numero * 1000 : numero;
    const data = new Date(ms);
    return Number.isNaN(data.getTime()) ? null : data;
  }

  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? null : data;
}

function coordenadaValidaOperacao(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (lat === 0 && lng === 0) return false;

  return true;
}

function obterCoordenadaBarcoOperacao(barco: any): CoordenadaOperacao | null {
  const pos = barco?.ultima_posicao || barco?.ultimaPosicao || {};
  const latitude = Number(pos.latitude ?? pos.lat);
  const longitude = Number(pos.longitude ?? pos.lng);

  if (!coordenadaValidaOperacao(latitude, longitude)) return null;

  return { latitude, longitude };
}

function obterCoordenadaTerminalOperacao(
  terminal: any,
): CoordenadaOperacao | null {
  const c = terminal?.coordenadas || terminal?.coordenada || {};
  const latitude = Number(c.latitude ?? c.lat);
  const longitude = Number(c.longitude ?? c.lng);

  if (!coordenadaValidaOperacao(latitude, longitude)) return null;

  return { latitude, longitude };
}

function obterUltimoSinalOperacao(barco: any): Date | null {
  const valor =
    barco?.ultima_posicao?.visto_por_ultimo ||
    barco?.ultimoSinal ||
    barco?.ultima_atualizacao ||
    barco?.ultimaAtualizacao ||
    barco?.updatedAt ||
    null;

  return parseDataOperacao(valor);
}

function obterVelocidadeBarcoKmhOperacao(barco: any) {
  const velocidade = Number(barco?.ultima_posicao?.velocidade || 0);
  return Number.isFinite(velocidade) ? Math.max(0, velocidade) : 0;
}

function obterVelocidadeBaseOperacao(barco: any) {
  const velocidadeAtual = obterVelocidadeBarcoKmhOperacao(barco);
  const tipo = String(barco?.tipo || barco?.categoria || "").toLowerCase();

  if (velocidadeAtual > 2) {
    return {
      valor: velocidadeAtual,
      fonte: "instantânea",
    };
  }

  // Referência apenas para previsão operacional quando o GPS está parado/lento.
  if (tipo.includes("lancha")) {
    return {
      valor: 45,
      fonte: "referência lancha",
    };
  }

  return {
    valor: 20,
    fonte: "referência rota",
  };
}

function textoTempoOperacao(minutos: number | null) {
  if (minutos === null || !Number.isFinite(minutos) || minutos <= 0) {
    return "—";
  }

  if (minutos < 60) {
    return `${Math.round(minutos)} min`;
  }

  const horas = Math.floor(minutos / 60);
  const min = Math.round(minutos % 60);

  return min > 0 ? `${horas}h ${min}min` : `${horas}h`;
}

function obterNomesRotaOperacao(barco: any) {
  const nomes: string[] = [];

  const addRota = (rota: any) => {
    if (!rota) return;

    [rota.portoOrigem, rota.porto_origem, rota.origem].forEach((nome) => {
      if (nome) nomes.push(String(nome));
    });

    const escalas = Array.isArray(rota.escalas) ? rota.escalas : [];

    escalas.forEach((escala: any) => {
      if (typeof escala === "string") {
        nomes.push(escala);
      } else if (escala?.porto) {
        nomes.push(String(escala.porto));
      } else if (escala?.nome) {
        nomes.push(String(escala.nome));
      } else if (escala?.cidade) {
        nomes.push(String(escala.cidade));
      }
    });
  };

  addRota(barco?.rotaIda);
  addRota(barco?.rotaVolta);

  return Array.from(new Set(nomes.filter(Boolean)));
}

function buscarTerminalOperacao(
  nomePorto: string,
  terminais: TerminalOperacao[],
) {
  return (
    terminais.find(
      (terminal) =>
        nomesParecidosOperacao(terminal.nome, nomePorto) ||
        nomesParecidosOperacao(terminal.cidade, nomePorto) ||
        nomesParecidosOperacao(
          `${terminal.nome} ${terminal.cidade}`,
          nomePorto,
        ),
    ) || null
  );
}

function calcularStatusOperacao(
  barco: any,
  coordenada: CoordenadaOperacao | null,
  ultimoSinal: Date | null,
) {
  if (!coordenada) {
    return {
      status: "alerta",
      descricao: "GPS inválido",
    };
  }

  if (!ultimoSinal) {
    return {
      status: "alerta",
      descricao: "sem horário do rastreador",
    };
  }

  const diffMs = Math.abs(Date.now() - ultimoSinal.getTime());

  if (diffMs <= 2 * 60 * 1000) {
    return {
      status: "online",
      descricao: "sinal recente",
    };
  }

  if (diffMs <= 20 * 60 * 1000) {
    return {
      status: "sem_sinal",
      descricao: "sinal atrasado",
    };
  }

  return {
    status: "alerta",
    descricao: "sem sinal há mais de 20 minutos",
  };
}

function calcularProximoPortoOperacao(
  barco: any,
  coordenadaBarco: CoordenadaOperacao | null,
  terminais: TerminalOperacao[],
) {
  if (!coordenadaBarco) return null;

  const nomesRota = obterNomesRotaOperacao(barco);

  const candidatos = nomesRota
    .map((nome) => {
      const terminal = buscarTerminalOperacao(nome, terminais);

      if (!terminal || !terminal.coordenada) return null;

      const distanciaKm = calcularDistanciaHaversine(
        coordenadaBarco.latitude,
        coordenadaBarco.longitude,
        terminal.coordenada.latitude,
        terminal.coordenada.longitude,
      );

      return {
        terminal,
        distanciaKm,
      };
    })
    .filter(Boolean) as {
    terminal: TerminalOperacao;
    distanciaKm: number;
  }[];

  if (candidatos.length === 0) {
    return null;
  }

  candidatos.sort((a, b) => a.distanciaKm - b.distanciaKm);

  // Evita escolher o porto onde o barco já está encostado se houver outro na sequência.
  return candidatos.find((c) => c.distanciaKm > 0.5) || candidatos[0];
}

export const atualizarOperacaoBarcos = onSchedule(
  {
    region: "us-central1",
    schedule: "every 5 minutes",
    timeZone: "America/Sao_Paulo",
  },
  async () => {
    console.log("🛰️ Atualizando operação dos barcos...");

    const [barcosSnap, terminaisSnap] = await Promise.all([
      db.collection("embarcacoes").get(),
      db.collection("terminais").get(),
    ]);

    const terminais: TerminalOperacao[] = terminaisSnap.docs.map((doc) => {
      const dados = doc.data();

      return {
        id: doc.id,
        nome: String(dados.nome || doc.id),
        cidade: String(dados.cidade || ""),
        coordenada: obterCoordenadaTerminalOperacao(dados),
      };
    });

    let totalAtualizado = 0;
    let batch = db.batch();
    let writes = 0;

    const executarBatchSeNecessario = async (forcar = false) => {
      if (writes >= 400 || (forcar && writes > 0)) {
        await batch.commit();
        batch = db.batch();
        writes = 0;
      }
    };

    for (const barcoDoc of barcosSnap.docs) {
      const barcoId = barcoDoc.id;
      const barco = barcoDoc.data();

      const coordenada = obterCoordenadaBarcoOperacao(barco);
      const ultimoSinal = obterUltimoSinalOperacao(barco);
      const status = calcularStatusOperacao(barco, coordenada, ultimoSinal);
      const velocidadeBase = obterVelocidadeBaseOperacao(barco);
      const proximo = calcularProximoPortoOperacao(
        barco,
        coordenada,
        terminais,
      );

      let previsaoMinutos: number | null = null;
      let previsaoTexto = "—";

      if (proximo && velocidadeBase.valor > 0) {
        previsaoMinutos = Math.round(
          (proximo.distanciaKm / velocidadeBase.valor) * 60,
        );
        previsaoTexto = textoTempoOperacao(previsaoMinutos);
      }

      const operacao = {
        barcoId,
        nome: barco.nome || barcoId,
        status: status.status,
        statusDescricao: status.descricao,
        ultimaPosicao: coordenada
          ? {
              latitude: coordenada.latitude,
              longitude: coordenada.longitude,
            }
          : null,
        ultimoSinal: ultimoSinal ? ultimoSinal.toISOString() : null,
        velocidadeAtualKmh: obterVelocidadeBarcoKmhOperacao(barco),
        velocidadeBaseKmh: velocidadeBase.valor,
        fonteVelocidade: velocidadeBase.fonte,
        satelites: Number(barco?.ultima_posicao?.satelites || 0),
        direcao: Number(barco?.ultima_posicao?.direcao || 0),
        proximoPortoId: proximo?.terminal.id || null,
        proximoPortoNome: proximo?.terminal.nome || null,
        proximoPortoCidade: proximo?.terminal.cidade || null,
        proximoPortoCoordenadas: proximo?.terminal.coordenada || null,
        distanciaKm: proximo ? Number(proximo.distanciaKm.toFixed(2)) : null,
        previsaoMinutos,
        previsaoTexto,
        rotaNomes: obterNomesRotaOperacao(barco),
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      };

      const operacaoRef = db.collection("operacao_barcos").doc(barcoId);
      batch.set(operacaoRef, operacao, { merge: true });

      const embarcacaoRef = db.collection("embarcacoes").doc(barcoId);
      batch.set(
        embarcacaoRef,
        {
          operacao: {
            status: operacao.status,
            statusDescricao: operacao.statusDescricao,
            proximoPortoId: operacao.proximoPortoId,
            proximoPortoNome: operacao.proximoPortoNome,
            proximoPortoCidade: operacao.proximoPortoCidade,
            distanciaKm: operacao.distanciaKm,
            previsaoMinutos: operacao.previsaoMinutos,
            previsaoTexto: operacao.previsaoTexto,
            atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      );

      writes += 2;
      totalAtualizado += 1;

      await executarBatchSeNecessario();
    }

    await executarBatchSeNecessario(true);

    console.log(`✅ Operação atualizada para ${totalAtualizado} barco(s).`);
  },
);

export const monitorarPartidaAutomatica = onDocumentUpdated(
  {
    region: "us-central1",
    document: "frota/{barcoId}",
  },
  async (event) => {
    const dadosNovos = event.data?.after.data();
    const barcoId = event.params.barcoId;

    // Aborta se não houver telemetria válida de coordenadas geográficas
    if (
      !dadosNovos ||
      !dadosNovos.ultima_posicao ||
      !dadosNovos.ultima_posicao.latitude
    ) {
      return null;
    }

    try {
      // 🔍 TRAVA 1: Só prossegue se houver viagem ativa em embarque ou aguardando (Isola FOLGAS)
      const viagemQuery = await db
        .collection("grades_viagens")
        .where("barcoId", "==", barcoId)
        .where("status", "in", ["AGUARDANDO_SAIDA", "EM_EMBARQUE"])
        .limit(1)
        .get();

      if (viagemQuery.empty) {
        return null;
      }

      const viagemDoc = viagemQuery.docs[0];
      const dadosViagem = viagemDoc.data();

      // Ignora se a partida já tiver sido registrada
      if (dadosViagem.horario_saida) {
        return null;
      }

      const bLat = Number(dadosNovos.ultima_posicao.latitude);
      const bLng = Number(dadosNovos.ultima_posicao.longitude);
      const velocidadeNos = Number(dadosNovos.ultima_posicao.velocidade || 0);

      // Localiza o terminal geográfico de origem mapeado na viagem
      const portoOrigemNome = dadosViagem.porto_origem || "MANAUS";
      const terminalQuery = await db
        .collection("terminais")
        .where("nome", "==", String(portoOrigemNome).toUpperCase())
        .limit(1)
        .get();

      if (terminalQuery.empty) {
        console.log(
          `⚠️ Terminal de origem ${portoOrigemNome} não localizado para conferência.`,
        );
        return null;
      }

      const dadosTerminal = terminalQuery.docs[0].data();
      const pLat = Number(
        dadosTerminal.coordenadas?.lat ?? dadosTerminal.coordenadas?.latitude,
      );
      const pLng = Number(
        dadosTerminal.coordenadas?.lng ?? dadosTerminal.coordenadas?.longitude,
      );

      const distanciaDoCais = calcularDistanciaHaversine(
        bLat,
        bLng,
        pLat,
        pLng,
      );
      const velocidadeKmh = velocidadeNos * 1.852;

      console.log(
        `🛳️ Telemetria [${dadosNovos.nome}]: Cais: ${distanciaDoCais.toFixed(2)} km | Vel: ${velocidadeKmh.toFixed(1)} km/h`,
      );

      // 🧠 TRAVA 2 & 3: Distância >= 1.2km E Velocidade de cruzeiro >= 15km/h (Isola MANOBRAS de atracação)
      if (distanciaDoCais >= 1.2 && velocidadeKmh >= 15.0) {
        const horarioAtualServidor = admin.firestore.Timestamp.now();

        await db
          .collection("grades_viagens")
          .doc(viagemDoc.id)
          .update({
            status: "EM_VIAGEM",
            horario_saida: horarioAtualServidor,
            coordenadas_partida: {
              latitude: bLat,
              longitude: bLng,
            },
          });

        console.log(
          `🚨 [SUCESSO] Saída automática confirmada para ${dadosNovos.nome}. Viagem ID: ${viagemDoc.id}`,
        );
      }
    } catch (error) {
      console.error(
        "❌ Erro no processamento do motor de partida automática:",
        error,
      );
    }

    return null;
  },
);

// =========================================================================
// 🧭 ROTAS HISTÓRICAS E ROTAS OFICIAIS
// Salva a rota ao vivo do ESP32 para uso futuro no Sistema Cadê Meu Barco.
// =========================================================================

type PontoRotaSalva = {
  latitude: number;
  longitude: number;
  velocidade?: number | null;
  direcao?: number | null;
  satelites?: number | null;
  criado_em?: any;
};

function normalizarIdRota(valor: any) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function parseDataRota(valor: any): Date | null {
  if (!valor) return null;

  if (typeof valor?.toDate === "function") {
    const data = valor.toDate();
    return Number.isNaN(data.getTime()) ? null : data;
  }

  const data = new Date(String(valor));
  return Number.isNaN(data.getTime()) ? null : data;
}

function pontoRotaValido(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

function extrairPontoRota(dados: any): PontoRotaSalva | null {
  const latitude = Number(dados.latitude ?? dados.lat);
  const longitude = Number(dados.longitude ?? dados.lng);

  if (!pontoRotaValido(latitude, longitude)) return null;

  return {
    latitude,
    longitude,
    velocidade: Number.isFinite(Number(dados.velocidade))
      ? Number(dados.velocidade)
      : null,
    direcao: Number.isFinite(Number(dados.direcao))
      ? Number(dados.direcao)
      : null,
    satelites: Number.isFinite(Number(dados.satelites))
      ? Number(dados.satelites)
      : null,
    criado_em: dados.criado_em || dados.criadoEm || dados.timestamp || null,
  };
}

function ordenarPontosPorData(a: PontoRotaSalva, b: PontoRotaSalva) {
  const da = parseDataRota(a.criado_em)?.getTime() || 0;
  const dbb = parseDataRota(b.criado_em)?.getTime() || 0;
  return da - dbb;
}

function calcularDistanciaTotalRota(pontos: PontoRotaSalva[]) {
  let total = 0;

  for (let i = 1; i < pontos.length; i += 1) {
    total += calcularDistanciaHaversine(
      pontos[i - 1].latitude,
      pontos[i - 1].longitude,
      pontos[i].latitude,
      pontos[i].longitude,
    );
  }

  return total;
}

function reduzirPontosRota(pontos: PontoRotaSalva[], limite = 700) {
  if (pontos.length <= limite) return pontos;

  const reduzidos: PontoRotaSalva[] = [];
  const passo = Math.ceil(pontos.length / limite);

  for (let i = 0; i < pontos.length; i += passo) {
    reduzidos.push(pontos[i]);
  }

  const ultimo = pontos[pontos.length - 1];
  const ultimoReduzido = reduzidos[reduzidos.length - 1];

  if (
    ultimo &&
    ultimoReduzido &&
    (ultimo.latitude !== ultimoReduzido.latitude ||
      ultimo.longitude !== ultimoReduzido.longitude)
  ) {
    reduzidos.push(ultimo);
  }

  return reduzidos;
}

async function validarAdminRotas(req: any) {
  const authorization = String(req.headers.authorization || "");
  const idToken = authorization.startsWith("Bearer ")
    ? authorization.replace("Bearer ", "").trim()
    : "";

  if (!idToken) {
    throw new Error("LOGIN_OBRIGATORIO");
  }

  const decoded = await admin.auth().verifyIdToken(idToken);
  const email = String(decoded.email || "").toLowerCase();

  if (!emailAdminPermitido(email)) {
    throw new Error("ACESSO_NEGADO");
  }

  return { uid: decoded.uid, email };
}

async function buscarPontosRastreamentoDoBarco(barcoId: string) {
  const snap = await db
    .collection("rastreamento")
    .doc(barcoId)
    .collection("pontos")
    .orderBy("criado_em", "desc")
    .limit(2000)
    .get();

  return snap.docs
    .map((doc) => extrairPontoRota(doc.data()))
    .filter(Boolean)
    .filter((ponto): ponto is PontoRotaSalva => ponto !== null)
    .sort(ordenarPontosPorData) as PontoRotaSalva[];
}

function montarDadosRotaSalva({
  barcoId,
  nomeBarco,
  nome,
  origem,
  destino,
  sentido,
  pontos,
  criadoPorEmail,
}: {
  barcoId: string;
  nomeBarco: string;
  nome: string;
  origem: string;
  destino: string;
  sentido: string;
  pontos: PontoRotaSalva[];
  criadoPorEmail: string;
}) {
  const pontosReduzidos = reduzirPontosRota(pontos);
  const distanciaKm = calcularDistanciaTotalRota(pontos);
  const inicio = parseDataRota(pontos[0]?.criado_em);
  const fim = parseDataRota(pontos[pontos.length - 1]?.criado_em);
  const tempoTotalMin =
    inicio && fim
      ? Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / 60000))
      : null;

  return {
    barcoId,
    nomeBarco,
    nome: nome || `${origem || "Origem"} → ${destino || "Destino"}`,
    origem: origem || "",
    destino: destino || "",
    sentido: sentido || "ida",
    distanciaKm: Number(distanciaKm.toFixed(2)),
    tempoTotalMin,
    velocidadeMediaKmh:
      tempoTotalMin && tempoTotalMin > 0
        ? Number((distanciaKm / (tempoTotalMin / 60)).toFixed(1))
        : null,
    totalPontosOriginal: pontos.length,
    totalPontosSalvos: pontosReduzidos.length,
    pontoInicial: pontosReduzidos[0] || null,
    pontoFinal: pontosReduzidos[pontosReduzidos.length - 1] || null,
    pontos: pontosReduzidos.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      velocidade: p.velocidade ?? null,
      direcao: p.direcao ?? null,
      satelites: p.satelites ?? null,
      criado_em: p.criado_em || null,
    })),
    criadoPorEmail,
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
  };
}

export const salvarRotaAtualBarco = onRequest(
  {
    region: "us-central1",
    cors: true,
  },
  async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }

      if (req.method !== "POST") {
        res.status(405).send({ erro: "Método não permitido." });
        return;
      }

      const adminLogado = await validarAdminRotas(req);
      const barcoId = String(req.body?.barcoId || "").trim();
      const nome = String(req.body?.nome || "").trim();
      const origem = String(req.body?.origem || "").trim();
      const destino = String(req.body?.destino || "").trim();
      const sentido = String(req.body?.sentido || "ida")
        .trim()
        .toLowerCase();
      const salvarComoOficial = Boolean(req.body?.salvarComoOficial);

      if (!barcoId) {
        res.status(400).send({ erro: "barcoId obrigatório." });
        return;
      }

      const barcoDoc = await db.collection("embarcacoes").doc(barcoId).get();
      const barco = barcoDoc.exists ? barcoDoc.data() || {} : {};
      const nomeBarco = String(barco.nome || barcoId);

      const pontos = await buscarPontosRastreamentoDoBarco(barcoId);

      if (pontos.length < 2) {
        res.status(400).send({
          erro: "Ainda não existem pontos suficientes em rastreamento para salvar uma rota.",
          pontosEncontrados: pontos.length,
        });
        return;
      }

      const dadosRota = montarDadosRotaSalva({
        barcoId,
        nomeBarco,
        nome,
        origem,
        destino,
        sentido,
        pontos,
        criadoPorEmail: adminLogado.email,
      });

      const historicaRef = db.collection("rotas_historicas").doc();
      await historicaRef.set({
        ...dadosRota,
        tipo: "historica",
        oficial: false,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      let rotaOficialId: string | null = null;

      if (salvarComoOficial) {
        rotaOficialId = [
          barcoId,
          origem || "origem",
          destino || "destino",
          sentido,
        ]
          .map(normalizarIdRota)
          .filter(Boolean)
          .join("_");

        await db
          .collection("rotas_oficiais")
          .doc(rotaOficialId)
          .set(
            {
              ...dadosRota,
              tipo: "oficial",
              oficial: true,
              rotaHistoricaOrigemId: historicaRef.id,
              ativa: true,
              criadaEm: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );

        await historicaRef.set(
          {
            oficial: true,
            rotaOficialId,
          },
          { merge: true },
        );

        await db.collection("embarcacoes").doc(barcoId).set(
          {
            rotaOficialId,
            rotaOficialAtualizadaEm:
              admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }

      res.status(200).send({
        ok: true,
        rotaHistoricaId: historicaRef.id,
        rotaOficialId,
        pontosLidos: pontos.length,
        pontosSalvos: dadosRota.totalPontosSalvos,
        distanciaKm: dadosRota.distanciaKm,
        tempoTotalMin: dadosRota.tempoTotalMin,
        velocidadeMediaKmh: dadosRota.velocidadeMediaKmh,
      });
    } catch (error: any) {
      console.error("❌ Erro ao salvar rota atual:", error);

      if (error?.message === "LOGIN_OBRIGATORIO") {
        res.status(401).send({ erro: "Login obrigatório." });
        return;
      }

      if (error?.message === "ACESSO_NEGADO") {
        res.status(403).send({ erro: "Acesso não autorizado." });
        return;
      }

      res.status(500).send({
        erro: "Erro ao salvar rota atual.",
        detalhe: error?.message || String(error),
      });
    }
  },
);

export const definirRotaHistoricaComoOficial = onRequest(
  {
    region: "us-central1",
    cors: true,
  },
  async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }

      if (req.method !== "POST") {
        res.status(405).send({ erro: "Método não permitido." });
        return;
      }

      const adminLogado = await validarAdminRotas(req);
      const rotaHistoricaId = String(req.body?.rotaHistoricaId || "").trim();

      if (!rotaHistoricaId) {
        res.status(400).send({ erro: "rotaHistoricaId obrigatório." });
        return;
      }

      const historicaRef = db
        .collection("rotas_historicas")
        .doc(rotaHistoricaId);
      const historicaDoc = await historicaRef.get();

      if (!historicaDoc.exists) {
        res.status(404).send({ erro: "Rota histórica não encontrada." });
        return;
      }

      const rota = historicaDoc.data() || {};
      const rotaOficialId = [
        rota.barcoId,
        rota.origem || "origem",
        rota.destino || "destino",
        rota.sentido || "ida",
      ]
        .map(normalizarIdRota)
        .filter(Boolean)
        .join("_");

      await db
        .collection("rotas_oficiais")
        .doc(rotaOficialId)
        .set(
          {
            ...rota,
            tipo: "oficial",
            oficial: true,
            ativa: true,
            rotaHistoricaOrigemId: rotaHistoricaId,
            definidoComoOficialPorEmail: adminLogado.email,
            atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

      await historicaRef.set(
        {
          oficial: true,
          rotaOficialId,
          atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      if (rota.barcoId) {
        await db.collection("embarcacoes").doc(String(rota.barcoId)).set(
          {
            rotaOficialId,
            rotaOficialAtualizadaEm:
              admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }

      res.status(200).send({
        ok: true,
        rotaOficialId,
      });
    } catch (error: any) {
      console.error("❌ Erro ao definir rota oficial:", error);

      if (error?.message === "LOGIN_OBRIGATORIO") {
        res.status(401).send({ erro: "Login obrigatório." });
        return;
      }

      if (error?.message === "ACESSO_NEGADO") {
        res.status(403).send({ erro: "Acesso não autorizado." });
        return;
      }

      res.status(500).send({
        erro: "Erro ao definir rota oficial.",
        detalhe: error?.message || String(error),
      });
    }
  },
);

export const salvarTrechoOficialDaRota = onRequest(
  {
    region: "us-central1",
    cors: true,
  },
  async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }

      if (req.method !== "POST") {
        res.status(405).send({ erro: "Método não permitido." });
        return;
      }

      const adminLogado = await validarAdminRotas(req);

      const rotaId = String(req.body?.rotaId || "").trim();
      const colecaoOrigem = String(
        req.body?.colecaoOrigem || "rotas_historicas",
      ).trim();
      const origem = String(req.body?.origem || "").trim();
      const destino = String(req.body?.destino || "").trim();
      const nome = String(req.body?.nome || "").trim();
      const sentido = String(req.body?.sentido || "ida")
        .trim()
        .toLowerCase();
      const indiceInicio = Number(req.body?.indiceInicio ?? 0);
      const indiceFim = Number(req.body?.indiceFim ?? 0);
      const ativo = req.body?.ativo === false ? false : true;

      if (!rotaId) {
        res.status(400).send({ erro: "rotaId obrigatório." });
        return;
      }

      if (!origem || !destino) {
        res.status(400).send({ erro: "Informe origem e destino do trecho." });
        return;
      }

      if (!["rotas_historicas", "rotas_oficiais"].includes(colecaoOrigem)) {
        res.status(400).send({ erro: "colecaoOrigem inválida." });
        return;
      }

      const rotaRef = db.collection(colecaoOrigem).doc(rotaId);
      const rotaDoc = await rotaRef.get();

      if (!rotaDoc.exists) {
        res.status(404).send({ erro: "Rota de origem não encontrada." });
        return;
      }

      const rota = rotaDoc.data() || {};
      const pontosOriginais = Array.isArray(rota.pontos) ? rota.pontos : [];

      const pontos = pontosOriginais
        .map((ponto: any) => extrairPontoRota(ponto))
        .filter(Boolean)
        .filter((ponto): ponto is PontoRotaSalva => ponto !== null)
        .sort(ordenarPontosPorData) as PontoRotaSalva[];

      if (pontos.length < 2) {
        res.status(400).send({
          erro: "A rota não tem pontos suficientes para gerar um trecho.",
          pontosEncontrados: pontos.length,
        });
        return;
      }

      const inicioSeguro = Math.max(
        0,
        Math.min(Math.round(indiceInicio), pontos.length - 1),
      );

      const fimSeguro = Math.max(
        0,
        Math.min(Math.round(indiceFim), pontos.length - 1),
      );

      const inicio = Math.min(inicioSeguro, fimSeguro);
      const fim = Math.max(inicioSeguro, fimSeguro);

      const pontosTrecho = pontos.slice(inicio, fim + 1);

      if (pontosTrecho.length < 2) {
        res.status(400).send({
          erro: "Selecione um trecho com pelo menos 2 pontos.",
          pontosSelecionados: pontosTrecho.length,
        });
        return;
      }

      const trechoId = [origem, destino, sentido]
        .map(normalizarIdRota)
        .filter(Boolean)
        .join("_");

      if (!trechoId) {
        res
          .status(400)
          .send({ erro: "Não foi possível gerar o ID do trecho." });
        return;
      }

      const dadosTrecho = montarDadosRotaSalva({
        barcoId: String(rota.barcoId || ""),
        nomeBarco: String(rota.nomeBarco || rota.barcoId || "Barco de origem"),
        nome: nome || `${origem} → ${destino}`,
        origem,
        destino,
        sentido,
        pontos: pontosTrecho,
        criadoPorEmail: adminLogado.email,
      });

      const trechoRef = db.collection("trechos_oficiais").doc(trechoId);

      await trechoRef.set(
        {
          ...dadosTrecho,
          tipo: "trecho_oficial",
          ativo,
          origemNome: origem,
          destinoNome: destino,
          origemNormalizada: normalizarIdRota(origem),
          destinoNormalizado: normalizarIdRota(destino),
          trechoId,
          reutilizavel: true,
          fonte: "rota_salva",
          rotaOrigemId: rotaId,
          colecaoOrigem,
          indiceInicio: inicio,
          indiceFim: fim,
          pontosOriginaisNaRota: pontos.length,
          definidoPorEmail: adminLogado.email,
          atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      await rotaRef.set(
        {
          ultimoTrechoOficialId: trechoId,
          ultimoTrechoOficialAtualizadoEm:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      res.status(200).send({
        ok: true,
        trechoId,
        pontosSelecionados: pontosTrecho.length,
        distanciaKm: dadosTrecho.distanciaKm,
        tempoTotalMin: dadosTrecho.tempoTotalMin,
        velocidadeMediaKmh: dadosTrecho.velocidadeMediaKmh,
      });
    } catch (error: any) {
      console.error("❌ Erro ao salvar trecho oficial:", error);

      if (error?.message === "LOGIN_OBRIGATORIO") {
        res.status(401).send({ erro: "Login obrigatório." });
        return;
      }

      if (error?.message === "ACESSO_NEGADO") {
        res.status(403).send({ erro: "Acesso não autorizado." });
        return;
      }

      res.status(500).send({
        erro: "Erro ao salvar trecho oficial.",
        detalhe: error?.message || String(error),
      });
    }
  },
);

// =========================================================================
// 🧪 NOTIFICAÇÃO DE TESTE GPS POR APROXIMAÇÃO
// Somente para embarcações com modoTeste === true.
// Envia aviso para administradores quando o rastreador chegar a 200m e 100m
// dos pontos de teste criados em grades_viagens/{BARCO_ID}_ida ou _volta.
// =========================================================================

function coordenadaTesteValida(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function obterCoordenadaTesteGPS(dados: any) {
  const pos =
    dados?.ultima_posicao || dados?.ultimaPosicao || dados?.posicao || {};

  const lat = Number(pos.latitude ?? pos.lat ?? dados?.latitude ?? dados?.lat);
  const lng = Number(
    pos.longitude ?? pos.lng ?? dados?.longitude ?? dados?.lng,
  );

  if (!coordenadaTesteValida(lat, lng)) return null;

  return {
    latitude: lat,
    longitude: lng,
  };
}

function obterPontosGradeTesteGPS(grade: any) {
  const origem = grade?.portoOrigem || grade?.origem || null;
  const lista = Array.isArray(grade?.itinerario)
    ? grade.itinerario
    : Array.isArray(grade?.escalas)
      ? grade.escalas
      : [];

  const pontos = lista
    .map((item: any, index: number) => {
      const c = item?.coordenadas || item?.coordenada || {};

      const latitude = Number(item?.latitude ?? c.latitude ?? c.lat);
      const longitude = Number(item?.longitude ?? c.longitude ?? c.lng);

      if (!coordenadaTesteValida(latitude, longitude)) return null;

      return {
        id: String(
          item?.id ||
            normalizarIdRota(item?.nome || item?.porto || `ponto_${index + 1}`),
        ),
        ordem: Number(item?.ordem || index + 1),
        nome: String(
          item?.nome || item?.porto || item?.cidade || `Ponto ${index + 1}`,
        ),
        cidade: String(item?.cidade || ""),
        latitude,
        longitude,
      };
    })
    .filter(Boolean) as {
    id: string;
    ordem: number;
    nome: string;
    cidade: string;
    latitude: number;
    longitude: number;
  }[];

  return pontos.sort((a, b) => a.ordem - b.ordem);
}

async function buscarTokensAdministradoresTesteGPS() {
  const snap = await db.collection("push_tokens").get();

  const tokens = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((item: any) => {
      const email = String(
        item.email || item.userEmail || item.compradorEmail || "",
      ).toLowerCase();

      return (
        ADMIN_EMAILS_NOTIFICACOES.includes(email) ||
        item.modoTeste === true ||
        item.testeGps === true ||
        item.admin === true
      );
    })
    .map((item: any) => String(item.token || item.id))
    .filter(tokenExpoValido);

  return Array.from(new Set(tokens));
}

function faixaTesteGPS(distanciaMetros: number) {
  if (!Number.isFinite(distanciaMetros) || distanciaMetros < 0) return null;
  if (distanciaMetros <= 100) return 100;
  if (distanciaMetros <= 200) return 200;
  return null;
}

function chaveDiaTesteGPS() {
  return new Date().toISOString().slice(0, 10);
}

export const notificarAproximacaoTesteGPS = onSchedule(
  {
    region: "us-central1",
    schedule: "* * * * *",
    timeZone: "America/Sao_Paulo",
  },
  async () => {
    console.log("🧪 Verificando aproximação do Modo Teste GPS...");

    const barcosSnap = await db
      .collection("embarcacoes")
      .where("modoTeste", "==", true)
      .get();

    if (barcosSnap.empty) {
      console.log("🧪 Nenhum barco em modoTeste encontrado.");
      return;
    }

    const tokens = await buscarTokensAdministradoresTesteGPS();

    if (tokens.length === 0) {
      console.log(
        "🧪 Nenhum token de administrador/teste encontrado em push_tokens.",
      );
      return;
    }

    let avisosEnviados = 0;

    for (const barcoDoc of barcosSnap.docs) {
      const barcoId = barcoDoc.id;
      const barco = barcoDoc.data();

      const coordenada = obterCoordenadaTesteGPS(barco);

      if (!coordenada) {
        console.log(`🧪 ${barcoId}: coordenada inválida ou ausente.`);
        continue;
      }

      const sentido =
        String(barco?.sentido || "ida").toLowerCase() === "volta"
          ? "volta"
          : "ida";
      const gradeId = `${barcoId}_${sentido}`;
      const gradeDoc = await db.collection("grades_viagens").doc(gradeId).get();

      if (!gradeDoc.exists) {
        console.log(`🧪 ${barcoId}: grade ${gradeId} não encontrada.`);
        continue;
      }

      const grade = gradeDoc.data() || {};

      if (grade.modoTeste !== true) {
        console.log(`🧪 ${barcoId}: grade ${gradeId} não está em modoTeste.`);
        continue;
      }

      const pontos = obterPontosGradeTesteGPS(grade);

      if (pontos.length === 0) {
        console.log(`🧪 ${barcoId}: nenhum ponto válido na grade ${gradeId}.`);
        continue;
      }

      for (const ponto of pontos) {
        const distanciaKm = calcularDistanciaHaversine(
          coordenada.latitude,
          coordenada.longitude,
          ponto.latitude,
          ponto.longitude,
        );

        const distanciaMetros = Math.round(distanciaKm * 1000);
        const faixa = faixaTesteGPS(distanciaMetros);

        if (!faixa) continue;

        const chave = [barcoId, sentido, ponto.id, faixa, chaveDiaTesteGPS()]
          .join("_")
          .replace(/[^\w-]/g, "_");

        const controleRef = db.collection("notificacoes_teste_gps").doc(chave);
        const controleDoc = await controleRef.get();

        if (controleDoc.exists) continue;

        const titulo =
          faixa === 100 ? "Teste GPS: chegada" : "Teste GPS: aproximação";
        const corpo =
          faixa === 100
            ? `${barco.nome || barcoId} chegou perto de ${ponto.nome}. Distância: ${distanciaMetros}m.`
            : `${barco.nome || barcoId} está a ${distanciaMetros}m de ${ponto.nome}.`;

        const mensagens = tokens.map((token) => ({
          to: token,
          sound: "default",
          title: titulo,
          body: corpo,
          data: {
            tipo: "teste_gps_aproximacao",
            barcoId,
            barcoNome: barco.nome || barcoId,
            sentido,
            pontoId: ponto.id,
            pontoNome: ponto.nome,
            faixaMetros: faixa,
            distanciaMetros,
            modoTeste: true,
          },
        }));

        const resultado = await enviarPushExpoMensagens(mensagens);

        await controleRef.set({
          barcoId,
          barcoNome: barco.nome || barcoId,
          sentido,
          gradeId,
          pontoId: ponto.id,
          pontoNome: ponto.nome,
          pontoCidade: ponto.cidade || "",
          faixaMetros: faixa,
          distanciaMetros,
          tokensEnviados: resultado.enviados,
          status: "enviado",
          modoTeste: true,
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });

        avisosEnviados += resultado.enviados;

        console.log(
          `🧪 Aviso Teste GPS enviado: ${barcoId} ${sentido} → ${ponto.nome} (${distanciaMetros}m / faixa ${faixa}m)`,
        );
      }
    }

    console.log(
      `🧪 Verificação do Modo Teste GPS finalizada. Avisos enviados: ${avisosEnviados}.`,
    );
  },
);

// =========================================================================
// 🧪 NOTIFICAÇÃO DE TESTE GPS: SAÍDA DO PORTO/ORIGEM
// Dispara no momento em que embarcacoes/{barcoId} recebe nova posição.
// Somente modoTeste === true para não afetar passageiros reais.
// =========================================================================

function distanciaMetrosTesteGPS(
  origem: { latitude: number; longitude: number },
  destino: { latitude: number; longitude: number },
) {
  return Math.round(
    calcularDistanciaHaversine(
      origem.latitude,
      origem.longitude,
      destino.latitude,
      destino.longitude,
    ) * 1000,
  );
}

function obterVelocidadeKmhTesteGPS(dados: any) {
  const velocidade = Number(
    dados?.ultima_posicao?.velocidade ??
      dados?.ultimaPosicao?.velocidade ??
      dados?.velocidade ??
      0,
  );

  return Number.isFinite(velocidade) ? Math.max(0, velocidade) : 0;
}

export const notificarSaidaPortoOrigemTesteGPS = onDocumentUpdated(
  {
    region: "us-central1",
    document: "embarcacoes/{barcoId}",
  },
  async (event) => {
    try {
      const antes = event.data?.before.data() || {};
      const depois = event.data?.after.data() || {};
      const barcoId = String(event.params.barcoId || "");

      if (depois.modoTeste !== true) {
        return;
      }

      const coordenadaAntes = obterCoordenadaTesteGPS(antes);
      const coordenadaDepois = obterCoordenadaTesteGPS(depois);

      if (!coordenadaDepois) {
        console.log(
          `🧪 ${barcoId}: sem coordenada atual para verificar saída.`,
        );
        return;
      }

      const sentido =
        String(depois?.sentido || "ida").toLowerCase() === "volta"
          ? "volta"
          : "ida";

      const gradeId = `${barcoId}_${sentido}`;
      const gradeDoc = await db.collection("grades_viagens").doc(gradeId).get();

      if (!gradeDoc.exists) {
        console.log(
          `🧪 ${barcoId}: grade ${gradeId} não encontrada para saída.`,
        );
        return;
      }

      const grade = gradeDoc.data() || {};

      if (grade.modoTeste !== true) {
        console.log(`🧪 ${barcoId}: grade ${gradeId} não está em modoTeste.`);
        return;
      }

      const pontos = obterPontosGradeTesteGPS(grade);

      if (pontos.length < 2) {
        console.log(`🧪 ${barcoId}: poucos pontos para detectar saída.`);
        return;
      }

      const origem = pontos[0];
      const raioOrigemMetros = Number(
        depois?.raioChegadaMetros || grade?.raioChegadaMetros || 150,
      );

      const distanciaSaidaMetros = Math.max(200, raioOrigemMetros + 50);
      const velocidadeMinimaKmh = 5;

      const origemCoord = {
        latitude: origem.latitude,
        longitude: origem.longitude,
      };

      const distanciaAntes = coordenadaAntes
        ? distanciaMetrosTesteGPS(coordenadaAntes, origemCoord)
        : null;

      const distanciaDepois = distanciaMetrosTesteGPS(
        coordenadaDepois,
        origemCoord,
      );

      const velocidadeKmh = obterVelocidadeKmhTesteGPS(depois);

      // Para considerar saída:
      // 1. precisa estar fora do raio de saída;
      // 2. precisa estar em movimento;
      // 3. se houver posição anterior, preferimos que antes estivesse perto da origem.
      const estavaPerto =
        distanciaAntes === null || distanciaAntes <= distanciaSaidaMetros;

      const saiuDaOrigem =
        estavaPerto &&
        distanciaDepois >= distanciaSaidaMetros &&
        velocidadeKmh >= velocidadeMinimaKmh;

      if (!saiuDaOrigem) {
        return;
      }

      const chave = [
        "saida_origem",
        barcoId,
        sentido,
        origem.id,
        chaveDiaTesteGPS(),
      ]
        .join("_")
        .replace(/[^\w-]/g, "_");

      const controleRef = db.collection("notificacoes_teste_gps").doc(chave);
      const controleDoc = await controleRef.get();

      if (controleDoc.exists) {
        return;
      }

      const tokens = await buscarTokensAdministradoresTesteGPS();

      if (tokens.length === 0) {
        console.log("🧪 Saída detectada, mas sem tokens de admin/teste.");
        await controleRef.set({
          barcoId,
          barcoNome: depois.nome || barcoId,
          sentido,
          pontoOrigemId: origem.id,
          pontoOrigemNome: origem.nome,
          distanciaAntes,
          distanciaDepois,
          velocidadeKmh,
          status: "sem_tokens",
          modoTeste: true,
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });
        return;
      }

      const titulo = "Teste GPS: saída detectada";
      const corpo = `${depois.nome || barcoId} saiu de ${origem.nome}. Distância: ${distanciaDepois}m.`;

      const mensagens = tokens.map((token) => ({
        to: token,
        sound: "default",
        title: titulo,
        body: corpo,
        data: {
          tipo: "teste_gps_saida_origem",
          barcoId,
          barcoNome: depois.nome || barcoId,
          sentido,
          pontoOrigemId: origem.id,
          pontoOrigemNome: origem.nome,
          distanciaMetros: distanciaDepois,
          velocidadeKmh,
          modoTeste: true,
        },
      }));

      const resultado = await enviarPushExpoMensagens(mensagens);

      await controleRef.set({
        barcoId,
        barcoNome: depois.nome || barcoId,
        sentido,
        gradeId,
        pontoOrigemId: origem.id,
        pontoOrigemNome: origem.nome,
        distanciaAntes,
        distanciaDepois,
        velocidadeKmh,
        tokensEnviados: resultado.enviados,
        status: "enviado",
        modoTeste: true,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(
        `🧪 Saída do porto origem enviada: ${barcoId} saiu de ${origem.nome}, distância ${distanciaDepois}m.`,
      );
    } catch (error) {
      console.error(
        "❌ Erro ao notificar saída do porto origem teste GPS:",
        error,
      );
    }
  },
);

// ============================================================================
// 👥 FUNCIONÁRIOS E AUTH PROFISSIONAL
// Cria usuário no Firebase Authentication com senha temporária,
// obriga troca de senha no primeiro acesso e permite excluir o acesso.
// ============================================================================

const ADMIN_EMAILS_SISTEMA = [
  "jandessonmoraes@gmail.com",
  "escdecastrousinagen@gmail.com",
];

function aplicarCorsFuncionarios(res: any) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function normalizarEmailSistema(email: any) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function permissoesAdminSistema() {
  return {
    mapa: true,
    rotas: true,
    frota: true,
    portos: true,
    banners: true,
    rastreadores: true,
    inteligencia: true,
    notificacoes: true,
    modoTesteGps: true,
    controleGps: true,
    funcionarios: true,
  };
}

async function validarAdminSistema(req: any) {
  const authHeader = String(req.headers.authorization || "");

  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("LOGIN_OBRIGATORIO");
  }

  const idToken = authHeader.replace("Bearer ", "").trim();
  const decoded = await admin.auth().verifyIdToken(idToken);
  const email = normalizarEmailSistema(decoded.email);

  if (!ADMIN_EMAILS_SISTEMA.includes(email)) {
    throw new Error("ACESSO_NEGADO");
  }

  return {
    uid: decoded.uid,
    email,
  };
}

function tratarErroFuncionario(res: any, error: any) {
  console.error("❌ Erro Funcionários/Auth:", error);

  if (error?.message === "LOGIN_OBRIGATORIO") {
    res.status(401).send({ erro: "Login obrigatório." });
    return;
  }

  if (error?.message === "ACESSO_NEGADO") {
    res.status(403).send({
      erro: "Acesso negado. Somente administradores podem executar esta ação.",
    });
    return;
  }

  res.status(500).send({
    erro: "Erro interno ao processar funcionário.",
    detalhe: error?.message || String(error),
  });
}

export const criarFuncionarioSistema = onRequest(async (req, res) => {
  aplicarCorsFuncionarios(res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send({ erro: "Método não permitido." });
    return;
  }

  try {
    const adminLogado = await validarAdminSistema(req);

    const nome = String(req.body?.nome || "").trim();
    const email = normalizarEmailSistema(req.body?.email);
    const senhaTemporaria = String(req.body?.senhaTemporaria || "").trim();
    const tipoRecebido = String(req.body?.tipo || "funcionario").trim();
    const tipo =
      tipoRecebido === "admin" || ADMIN_EMAILS_SISTEMA.includes(email)
        ? "admin"
        : "funcionario";

    const permissoesRecebidas = req.body?.permissoes || {};
    const permissoes =
      tipo === "admin" ? permissoesAdminSistema() : permissoesRecebidas;

    if (!nome || !email) {
      res.status(400).send({ erro: "Nome e e-mail são obrigatórios." });
      return;
    }

    if (!email.includes("@")) {
      res.status(400).send({ erro: "E-mail inválido." });
      return;
    }

    if (!senhaTemporaria || senhaTemporaria.length < 6) {
      res.status(400).send({
        erro: "A senha temporária precisa ter pelo menos 6 caracteres.",
      });
      return;
    }

    let usuarioAuth: admin.auth.UserRecord;
    let criadoAgora = false;

    try {
      usuarioAuth = await admin.auth().getUserByEmail(email);

      await admin.auth().updateUser(usuarioAuth.uid, {
        displayName: nome,
        password: senhaTemporaria,
        disabled: false,
      });
    } catch (error: any) {
      if (error?.code !== "auth/user-not-found") {
        throw error;
      }

      usuarioAuth = await admin.auth().createUser({
        email,
        password: senhaTemporaria,
        displayName: nome,
        disabled: false,
        emailVerified: false,
      });

      criadoAgora = true;
    }

    await admin.auth().setCustomUserClaims(usuarioAuth.uid, {
      tipo,
      sistemaAdmin: tipo === "admin",
    });

    await db.collection("funcionarios").doc(email).set(
      {
        uid: usuarioAuth.uid,
        nome,
        email,
        tipo,
        ativo: true,
        excluido: false,
        permissoes,
        mustChangePassword: true,
        primeiroAcesso: true,
        senhaTemporariaAtualizadaEm:
          admin.firestore.FieldValue.serverTimestamp(),
        criadoPorEmail: adminLogado.email,
        atualizadoPorEmail: adminLogado.email,
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    res.status(200).send({
      ok: true,
      criadoAgora,
      uid: usuarioAuth.uid,
      email,
      mensagem: criadoAgora
        ? "Funcionário criado com senha temporária."
        : "Funcionário atualizado e senha temporária redefinida.",
    });
  } catch (error: any) {
    tratarErroFuncionario(res, error);
  }
});

export const redefinirSenhaFuncionarioSistema = onRequest(async (req, res) => {
  aplicarCorsFuncionarios(res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send({ erro: "Método não permitido." });
    return;
  }

  try {
    const adminLogado = await validarAdminSistema(req);

    const email = normalizarEmailSistema(req.body?.email);
    const senhaTemporaria = String(req.body?.senhaTemporaria || "").trim();

    if (!email || !senhaTemporaria || senhaTemporaria.length < 6) {
      res.status(400).send({
        erro: "Informe e-mail e senha temporária com pelo menos 6 caracteres.",
      });
      return;
    }

    const usuarioAuth = await admin.auth().getUserByEmail(email);

    await admin.auth().updateUser(usuarioAuth.uid, {
      password: senhaTemporaria,
      disabled: false,
    });

    await db.collection("funcionarios").doc(email).set(
      {
        uid: usuarioAuth.uid,
        email,
        ativo: true,
        excluido: false,
        mustChangePassword: true,
        primeiroAcesso: true,
        senhaTemporariaAtualizadaEm:
          admin.firestore.FieldValue.serverTimestamp(),
        atualizadoPorEmail: adminLogado.email,
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    res.status(200).send({
      ok: true,
      mensagem:
        "Senha temporária redefinida. O funcionário deverá criar uma nova senha ao entrar.",
    });
  } catch (error: any) {
    tratarErroFuncionario(res, error);
  }
});

export const excluirFuncionarioSistema = onRequest(async (req, res) => {
  aplicarCorsFuncionarios(res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send({ erro: "Método não permitido." });
    return;
  }

  try {
    const adminLogado = await validarAdminSistema(req);

    const email = normalizarEmailSistema(req.body?.email);

    if (!email) {
      res.status(400).send({ erro: "Informe o e-mail do funcionário." });
      return;
    }

    if (ADMIN_EMAILS_SISTEMA.includes(email)) {
      res.status(400).send({
        erro: "Jandesson e Elias são administradores fixos e não podem ser excluídos.",
      });
      return;
    }

    let uid = "";

    try {
      const usuarioAuth = await admin.auth().getUserByEmail(email);
      uid = usuarioAuth.uid;
      await admin.auth().deleteUser(usuarioAuth.uid);
    } catch (error: any) {
      if (error?.code !== "auth/user-not-found") {
        throw error;
      }
    }

    await db.collection("funcionarios").doc(email).set(
      {
        email,
        uid,
        ativo: false,
        excluido: true,
        excluidoPorEmail: adminLogado.email,
        excluidoEm: admin.firestore.FieldValue.serverTimestamp(),
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    res.status(200).send({
      ok: true,
      mensagem:
        "Funcionário excluído do Authentication e marcado como excluído no Firestore.",
    });
  } catch (error: any) {
    tratarErroFuncionario(res, error);
  }
});

export const limparWifiPendenteTravado = onSchedule(
  {
    region: "us-central1",
    schedule: "every 5 minutes",
    timeZone: "America/Sao_Paulo",
  },
  async () => {
    const agoraMs = Date.now();
    const LIMITE_MS = 10 * 60 * 1000; // 10 minutos

    console.log("🛟 Verificando comandos Wi-Fi pendentes travados...");

    const snapshot = await db
      .collection("embarcacoes")
      .where("rastreadorWifiPendente.aplicar", "==", true)
      .get();

    if (snapshot.empty) {
      console.log("🛟 Nenhum comando Wi-Fi pendente.");
      return;
    }

    let corrigidos = 0;

    for (const docSnap of snapshot.docs) {
      const dados = docSnap.data() || {};
      const pendente = dados.rastreadorWifiPendente || {};
      const status = dados.rastreadorWifiStatus || {};

      const criadoEm = pendente.criadoEm;
      const atualizadoEmStatus = status.atualizadoEm;

      let referenciaMs = 0;

      if (criadoEm?.toMillis) {
        referenciaMs = criadoEm.toMillis();
      } else if (atualizadoEmStatus?.toMillis) {
        referenciaMs = atualizadoEmStatus.toMillis();
      }

      // Se não tiver timestamp, também limpamos por segurança.
      const semTimestamp = referenciaMs === 0;
      const travado = semTimestamp || agoraMs - referenciaMs > LIMITE_MS;

      if (!travado) continue;

      await docSnap.ref.set(
        {
          rastreadorWifiPendente: {
            ...pendente,
            aplicar: false,
            canceladoAutomaticamente: true,
            canceladoEm: admin.firestore.FieldValue.serverTimestamp(),
          },
          rastreadorWifiStatus: {
            ...status,
            status: "cancelado_automatico",
            mensagem:
              "Comando Wi-Fi pendente foi desativado automaticamente porque ficou travado por mais de 10 minutos.",
            atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
          },
          atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      corrigidos += 1;

      console.log(
        `🛟 Wi-Fi pendente desativado automaticamente em embarcacoes/${docSnap.id}`,
      );
    }

    console.log(`🛟 Limpeza finalizada. Corrigidos: ${corrigidos}.`);
  },
);
