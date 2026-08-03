import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import {
  deleteUser,
  EmailAuthProvider as FirebaseEmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
} from "firebase/auth";
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeInUp,
  ZoomIn,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../../services/firebase";

export default function PerfilScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = auth.currentUser;

  // --- ESTADOS DO PERFIL PESSOAL ---
  const [modalSairVisivel, setModalSairVisivel] = useState(false);
  const [modalExcluirVisivel, setModalExcluirVisivel] = useState(false);
  const [senhaExcluir, setSenhaExcluir] = useState("");
  const [excluindoConta, setExcluindoConta] = useState(false);
  const [mostrarSenhaExcluir, setMostrarSenhaExcluir] = useState(false);
  const [fotoPerfil, setFotoPerfil] = useState<string | null>(null);
  const [nomeUsuario, setNomeUsuario] = useState("");
  const [modalNomeVisivel, setModalNomeVisivel] = useState(false);
  const [inputNome, setInputNome] = useState("");
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [isComandante, setIsComandante] = useState(false);
  const [isTripulante, setIsTripulante] = useState(false);
  const [tipoUsuario, setTipoUsuario] = useState("passageiro");
  const [barcoPerfilNome, setBarcoPerfilNome] = useState("");
  const [barcoPerfilCnpj, setBarcoPerfilCnpj] = useState("");
  const [emailTripulante, setEmailTripulante] = useState("");
  const [listaTripulacao, setListaTripulacao] = useState<any[]>([]);
  const [buscandoEmail, setBuscandoEmail] = useState(false);
  const [uploadingFotoPerfil, setUploadingFotoPerfil] = useState(false);
  const [vendasAtivas, setVendasAtivas] = useState<boolean>(false);
  const [pilotoMarketplace, setPilotoMarketplace] = useState(false);

  // --- ESTADOS DO MARKETING DO BARCO ---
  const [modalMarketingVisivel, setModalMarketingVisivel] = useState(false);
  const [meuBarcoId, setMeuBarcoId] = useState<string | null>(null);
  const [descricaoBarco, setDescricaoBarco] = useState("");
  const [fotosBarco, setFotosBarco] = useState<string[]>([]);
  const [uploadingFotoBarco, setUploadingFotoBarco] = useState(false);
  const [whatsappBarco, setWhatsappBarco] = useState("");
  const [cnpjBarco, setCnpjBarco] = useState("");
  const [informacoesPassageiroAtivo, setInformacoesPassageiroAtivo] =
    useState(false);
  const [whatsappInformacoes, setWhatsappInformacoes] = useState("");
  const [telefoneInformacoes, setTelefoneInformacoes] = useState("");
  const [textoInformacoes, setTextoInformacoes] = useState("");
  const [instagramBarco, setInstagramBarco] = useState("");
  const [facebookBarco, setFacebookBarco] = useState("");
  const [siteBarco, setSiteBarco] = useState("");
  const [comodidades, setComodidades] = useState({
    ar: false,
    lanchonete: false,
    wifi: false,
    suites: false,
    redario: false,
    petFriendly: false,
    tomadas: false,
    bar: false,
    encomendas: false,
    transporte: false,
    mudanca: false,
    cargas: false,
  });

  const [escalas, setEscalas] = useState({
    manaus: false,
    itacoatiara: false,
    parintins: false,
    juruti: false,
    obidos: false,
    santarem: false,
  });

  const [salvandoMarketing, setSalvandoMarketing] = useState(false);
  const editandoMarketing = useRef(false);
  const jaCarregouMarketing = useRef(false);

  // --- ESTADOS DA CENTRAL ADMIN ---
  const [modalAdminBarcoVisivel, setModalAdminBarcoVisivel] = useState(false);
  const [adminNomeBarco, setAdminNomeBarco] = useState("");
  const [adminUidDono, setAdminUidDono] = useState("");
  const [adminCnpjBarco, setAdminCnpjBarco] = useState("");
  const [criandoBarcoAdmin, setCriandoBarcoAdmin] = useState(false);

  // --- ESTADOS ENGENHARIA DE ROTA ---
  const [modalEngenhariaVisivel, setModalEngenhariaVisivel] = useState(false);
  const [gravandoRota, setGravandoRota] = useState(false);
  const [pontosCapturados, setPontosCapturados] = useState(0);
  const [listaCoordenadasAtual, setListaCoordenadasAtual] = useState<any[]>([]);

  // --- ESTADOS ROTA MESTRA ---
  const [modalRotaMestraVisivel, setModalRotaMestraVisivel] = useState(false);
  const [nomeRotaMestra, setNomeRotaMestra] = useState("");
  const [salvandoRotaMestra, setSalvandoRotaMestra] = useState(false);

  const [aviso, setAviso] = useState({
    visivel: false,
    titulo: "",
    mensagem: "",
    tipo: "erro" as "erro" | "sucesso" | "aviso",
  });
  const [modalTripulacaoVisivel, setModalTripulacaoVisivel] = useState(false);

  const triggerHaptic = (
    style: "light" | "medium" | "heavy" | "success" = "light",
  ) => {
    if (Platform.OS === "web") return;
    if (style === "success") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      const impacto =
        {
          light: Haptics.ImpactFeedbackStyle.Light,
          medium: Haptics.ImpactFeedbackStyle.Medium,
          heavy: Haptics.ImpactFeedbackStyle.Heavy,
        }[style] || Haptics.ImpactFeedbackStyle.Light;
      Haptics.impactAsync(impacto);
    }
  };

  const exibirAviso = (
    titulo: string,
    mensagem: string,
    tipo: "erro" | "sucesso" | "aviso" = "erro",
  ) => {
    setAviso({ visivel: true, titulo, mensagem, tipo });
  };

  useEffect(() => {
    const unsubConfig = onSnapshot(
      doc(db, "configuracoes", "modulo_vendas"),
      (snapshot) => {
        if (snapshot.exists()) setVendasAtivas(!!snapshot.data().ativo);
      },
    );
    return () => unsubConfig();
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setPilotoMarketplace(false);
      return;
    }
    getDoc(doc(db, "usuarios", user.uid))
      .then((snapshot) =>
        setPilotoMarketplace(
          snapshot.exists() &&
            snapshot.data().pilotoMarketplace === true,
        ),
      )
      .catch(() => setPilotoMarketplace(false));
  }, [user?.uid]);

  useEffect(() => {
    let unsubBarcos = () => {};
    let unsubBarcoVinculado = () => {};

    const preencherDadosBarco = (barcoId: string, dadosBarco: any) => {
      const idNormalizado = String(barcoId || "").toUpperCase();

      setMeuBarcoId(idNormalizado);
      setBarcoPerfilNome(dadosBarco?.nome || idNormalizado);
      setBarcoPerfilCnpj(dadosBarco?.cnpj || "");

      if (
        !modalMarketingVisivel &&
        !editandoMarketing.current &&
        !jaCarregouMarketing.current
      ) {
        setDescricaoBarco(dadosBarco.descricao || "");
        setFotosBarco(dadosBarco.fotos || []);
        setWhatsappBarco(dadosBarco.whatsapp || "");
        setCnpjBarco(dadosBarco.cnpj || "");
        setInformacoesPassageiroAtivo(
          dadosBarco.informacoesPassageiroAtivo === true,
        );
        setWhatsappInformacoes(
          dadosBarco.whatsappInformacoes ||
            dadosBarco.whatsappBarcoInformacoes ||
            dadosBarco.whatsapp ||
            "",
        );
        setTelefoneInformacoes(
          dadosBarco.telefoneInformacoes ||
            dadosBarco.telefoneBarcoInformacoes ||
            "",
        );
        setTextoInformacoes(
          dadosBarco.textoInformacoes || dadosBarco.mensagemInformacoes || "",
        );
        setInstagramBarco(dadosBarco.instagramBarco || "");
        setFacebookBarco(dadosBarco.facebookBarco || "");
        setSiteBarco(dadosBarco.siteBarco || "");

        if (dadosBarco.comodidades) {
          setComodidades((prev) => ({
            ...prev,
            ...dadosBarco.comodidades,
          }));
        }

        if (dadosBarco.escalas) {
          setEscalas((prev) => ({ ...prev, ...dadosBarco.escalas }));
        }

        jaCarregouMarketing.current = true;
      }

      setPontosCapturados(dadosBarco.rota?.length || 0);
      setListaCoordenadasAtual(dadosBarco.rota || []);
    };

    const carregarDadosUsuario = async () => {
      if (!user) return;

      try {
        const snap = await getDoc(doc(db, "usuarios", user.uid));
        const dados = snap.exists() ? snap.data() : {};

        if (dados.fotoPerfil) setFotoPerfil(dados.fotoPerfil);
        if (dados.nome) setNomeUsuario(dados.nome);

        const tipo = String(dados.tipo || "passageiro").toLowerCase();
        const adminPrincipal = user.email === "jandessonmoraes@gmail.com";

        setTipoUsuario(tipo);
        setIsComandante(tipo === "dono" || adminPrincipal);
        setIsTripulante(tipo === "tripulante");

        const barcoVinculado =
          dados.id_barco_vinculado ||
          dados.barcoId ||
          dados.idBarco ||
          dados.embarcacaoId ||
          "";

        if (barcoVinculado) {
          unsubBarcoVinculado = onSnapshot(
            doc(db, "embarcacoes", String(barcoVinculado).toUpperCase()),
            (barcoSnap) => {
              if (barcoSnap.exists()) {
                preencherDadosBarco(barcoSnap.id, barcoSnap.data());
              } else {
                setMeuBarcoId(String(barcoVinculado).toUpperCase());
                setBarcoPerfilNome(String(barcoVinculado).replace(/_/g, " "));
              }
            },
          );
        }
      } catch (error) {
        console.error(error);
      }
    };

    if (user) {
      carregarDadosUsuario();

      const qBarcos = query(
        collection(db, "embarcacoes"),
        where("ownerId", "==", user.uid),
      );

      unsubBarcos = onSnapshot(qBarcos, (snap) => {
        if (!snap.empty) {
          const barcoDoc =
            snap.docs.find((d) => d.id === d.id.toUpperCase()) || snap.docs[0];
          preencherDadosBarco(barcoDoc.id, barcoDoc.data());
        } else if (!meuBarcoId) {
          setMeuBarcoId(user.uid.toUpperCase());
        }
      });
    }

    return () => {
      unsubBarcos();
      unsubBarcoVinculado();
    };
  }, [user, modalMarketingVisivel]);
  useEffect(() => {
    let watchSubscription: any;
    const iniciarRastreamento = async () => {
      if (!gravandoRota) return;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        exibirAviso("Permissão", "GPS necessário.", "aviso");
        setGravandoRota(false);
        return;
      }
      watchSubscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 0 },
        async (location) => {
          if (!user || !meuBarcoId) return;
          const { latitude, longitude, speed, heading } = location.coords;
          await updateDoc(doc(db, "embarcacoes", meuBarcoId.toUpperCase()), {
            ultima_posicao: {
              latitude,
              longitude,
              velocidade: speed || 0,
              direcao: heading || 0,
            },
            rota: arrayUnion({
              latitude,
              longitude,
              timestamp: new Date().toISOString(),
            }),
          });
        },
      );
    };
    iniciarRastreamento();
    return () => {
      if (watchSubscription) watchSubscription.remove();
    };
  }, [gravandoRota, meuBarcoId]);

  useEffect(() => {
    if (isComandante && meuBarcoId) {
      const q = query(
        collection(db, "usuarios"),
        where("id_barco_vinculado", "==", meuBarcoId),
        where("tipo", "==", "tripulante"),
      );

      const unsub = onSnapshot(
        q,
        (snapshot) => {
          const membros = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setListaTripulacao(membros);
        },
        (error) => {
          console.warn(
            "Aguardando permissão do Firebase para listar tripulação.",
          );
        },
      );
      return () => unsub();
    }

    return undefined;
  }, [isComandante, meuBarcoId]);

  const finalizarRotaMestra = async () => {
    if (!nomeRotaMestra.trim())
      return exibirAviso("Campos", "Dê um nome.", "aviso");
    if (listaCoordenadasAtual.length < 2)
      return exibirAviso("Erro", "Pontos insuficientes.", "erro");
    setSalvandoRotaMestra(true);
    try {
      const idRota = nomeRotaMestra.toUpperCase().trim().replace(/\s+/g, "_");
      await setDoc(doc(db, "rotas_mestras", idRota), {
        nome: nomeRotaMestra.toUpperCase(),
        coordenadas: listaCoordenadasAtual,
        criado_por: user?.email,
        criado_em: new Date().toISOString(),
        total_pontos: listaCoordenadasAtual.length,
      });
      setModalRotaMestraVisivel(false);
      setNomeRotaMestra("");
      triggerHaptic("success");
      exibirAviso("Sucesso!", `Rota ${idRota} salva!`, "sucesso");
    } catch (e) {
      exibirAviso("Erro", "Falha ao consolidar.", "erro");
    } finally {
      setSalvandoRotaMestra(false);
    }
  };

  const finalizarCriacaoComando = async () => {
    if (!adminNomeBarco.trim() || !adminUidDono.trim()) {
      exibirAviso(
        "Campos",
        "Preencha o nome do barco e o UID do dono.",
        "aviso",
      );
      return;
    }
    try {
      setCriandoBarcoAdmin(true);
      const idLimpo = adminNomeBarco.toUpperCase().trim().replace(/\s+/g, "_");

      await setDoc(
        doc(db, "embarcacoes", idLimpo),
        {
          nome: adminNomeBarco.toUpperCase(),
          ownerId: adminUidDono.trim(),
          status: "Operacional",
          cnpj: formatarCnpj(adminCnpjBarco),
          criado_em: new Date().toISOString(),
        },
        { merge: true },
      );

      await setDoc(
        doc(db, "usuarios", adminUidDono.trim()),
        {
          nome: `Comandante ${adminNomeBarco.toUpperCase()}`,
          tipo: "dono",
          id_barco_vinculado: idLimpo,
          barcoNome: adminNomeBarco.toUpperCase(),
          barcoCnpj: formatarCnpj(adminCnpjBarco),
        },
        { merge: true },
      );

      setModalAdminBarcoVisivel(false);
      setAdminNomeBarco("");
      setAdminUidDono("");
      setAdminCnpjBarco("");
      exibirAviso("Sucesso!", "Comando entregue com sucesso.", "sucesso");
    } catch (e) {
      console.log("ERRO NO FIREBASE:", e);
      exibirAviso("Erro", "Falha ao registrar no sistema.", "erro");
    } finally {
      setCriandoBarcoAdmin(false);
    }
  };

  const limparTrilhaTeste = async () => {
    if (!meuBarcoId) return;
    triggerHaptic("medium");
    try {
      await updateDoc(doc(db, "embarcacoes", meuBarcoId.toUpperCase()), {
        rota: [],
      });
      exibirAviso("Limpeza", "Apagada.", "sucesso");
    } catch (e) {
      console.log(e);
    }
  };

  const uriToBlob = async (uri: string): Promise<Blob> => {
    const response = await fetch(uri);
    return await response.blob();
  };

  const alterarFoto = async () => {
    triggerHaptic();
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted)
      return exibirAviso("Aviso", "Permissão necessária.", "aviso");
    try {
      let resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });
      if (!resultado.canceled && resultado.assets[0].uri) {
        setUploadingFotoPerfil(true);
        const blob = await uriToBlob(resultado.assets[0].uri);
        const storage = getStorage();
        const nomeFicheiro = `perfil_${user?.uid}_${Date.now()}.jpg`;
        const imageRef = ref(storage, `fotos_perfil/${nomeFicheiro}`);
        await uploadBytes(imageRef, blob);
        const downloadURL = await getDownloadURL(imageRef);
        setFotoPerfil(downloadURL);
        if (user)
          await setDoc(
            doc(db, "usuarios", user.uid),
            { fotoPerfil: downloadURL },
            { merge: true },
          );
      }
    } catch (error) {
      console.error(error);
    } finally {
      setUploadingFotoPerfil(false);
    }
  };

  const adicionarFotoBarco = async () => {
    if (fotosBarco.length >= 5) {
      exibirAviso(
        "Limite Atingido",
        "Você já adicionou o limite de 5 fotos.",
        "aviso",
      );
      return;
    }

    triggerHaptic();
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      return exibirAviso(
        "Aviso",
        "Permissão necessária para acessar a galeria.",
        "aviso",
      );
    }

    try {
      let resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [16, 9], // Mantém o aspecto horizontal padrão da vitrine
        quality: 0.6,
      });

      if (!resultado.canceled && resultado.assets[0].uri) {
        setUploadingFotoBarco(true);
        const blob = await uriToBlob(resultado.assets[0].uri);
        const storage = getStorage();
        const nomeFicheiro = `barco_${meuBarcoId || user?.uid}_${Date.now()}.jpg`;
        const imageRef = ref(storage, `fotos_embarcacoes/${nomeFicheiro}`);

        await uploadBytes(imageRef, blob);
        const downloadURL = await getDownloadURL(imageRef);

        // Adiciona a nova foto mantendo as anteriores
        setFotosBarco((antigas) => [...antigas, downloadURL]);
        triggerHaptic("success");
      }
    } catch (error) {
      console.error(error);
      exibirAviso("Erro", "Não foi possível enviar a foto.", "erro");
    } finally {
      setUploadingFotoBarco(false);
    }
  };

  const salvarNovoNome = async () => {
    if (!inputNome.trim() || !user) return;
    setSalvandoNome(true);
    try {
      await setDoc(
        doc(db, "usuarios", user.uid),
        { nome: inputNome },
        { merge: true },
      );
      setNomeUsuario(inputNome);
      setModalNomeVisivel(false);
      triggerHaptic("medium");
    } catch (error) {
      console.error(error);
    } finally {
      setSalvandoNome(false);
    }
  };

  const confirmarLogout = async () => {
    setModalSairVisivel(false);
    triggerHaptic("heavy");
    await signOut(auth);
    router.replace("/login");
  };

  const limparNumeroContato = (valor: string) => {
    return String(valor || "").replace(/\D/g, "");
  };

  const formatarWhatsappContato = (valor: string) => {
    const limpo = limparNumeroContato(valor);

    if (!limpo) return "";

    if (limpo.length <= 2) return `(${limpo}`;

    if (limpo.length <= 7) {
      return `(${limpo.slice(0, 2)}) ${limpo.slice(2)}`;
    }

    if (limpo.length <= 11) {
      return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7, 11)}`;
    }

    return `+${limpo.slice(0, 2)} (${limpo.slice(2, 4)}) ${limpo.slice(4, 9)}-${limpo.slice(9, 13)}`;
  };

  const formatarCnpj = (valor: string) => {
    const limpo = String(valor || "")
      .replace(/\D/g, "")
      .slice(0, 14);

    if (!limpo) return "";

    if (limpo.length <= 2) return limpo;
    if (limpo.length <= 5) return `${limpo.slice(0, 2)}.${limpo.slice(2)}`;
    if (limpo.length <= 8) {
      return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5)}`;
    }
    if (limpo.length <= 12) {
      return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8)}`;
    }

    return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8, 12)}-${limpo.slice(12, 14)}`;
  };

  const rotuloTipoUsuario = () => {
    if (isComandante) return "Gestor da embarcação";
    if (isTripulante) return "Tripulante vinculado";
    return "Passageiro";
  };

  const normalizarLinkSocial = (
    valor: string,
    tipo: "instagram" | "facebook" | "site",
  ) => {
    const texto = String(valor || "").trim();

    if (!texto) return "";

    if (texto.startsWith("http://") || texto.startsWith("https://")) {
      return texto;
    }

    if (tipo === "instagram") {
      const usuario = texto.replace("@", "").replace(/^instagram\.com\//i, "");
      return usuario ? `https://instagram.com/${usuario}` : "";
    }

    if (tipo === "facebook") {
      const usuario = texto.replace("@", "").replace(/^facebook\.com\//i, "");
      return usuario ? `https://facebook.com/${usuario}` : "";
    }

    return `https://${texto}`;
  };

  const temContatoInformacoes = () => {
    return (
      limparNumeroContato(whatsappInformacoes).length >= 10 ||
      limparNumeroContato(telefoneInformacoes).length >= 10
    );
  };

  const salvarMarketingBarco = async () => {
    if (!meuBarcoId || !user)
      return exibirAviso("Erro", "ID não localizado.", "erro");

    if (informacoesPassageiroAtivo && !temContatoInformacoes()) {
      exibirAviso(
        "Contato obrigatório",
        "Para mostrar o botão de solicitar informações, informe pelo menos um WhatsApp ou telefone válido.",
        "aviso",
      );
      return;
    }

    setSalvandoMarketing(true);
    try {
      const cnpjFormatado = formatarCnpj(cnpjBarco);

      await setDoc(
        doc(db, "embarcacoes", meuBarcoId.toUpperCase().trim()),
        {
          ownerId: user.uid,
          descricao: descricaoBarco,
          fotos: fotosBarco,
          whatsapp: whatsappBarco,
          cnpj: cnpjFormatado,
          comodidades,
          escalas,
          marketingAtivo: true,
          informacoesPassageiroAtivo:
            informacoesPassageiroAtivo && temContatoInformacoes(),
          whatsappInformacoes: formatarWhatsappContato(whatsappInformacoes),
          telefoneInformacoes: formatarWhatsappContato(telefoneInformacoes),
          emailInformacoes: "",
          textoInformacoes:
            textoInformacoes.trim() ||
            "Olá, gostaria de mais informações sobre horários, disponibilidade e serviços da embarcação.",
          instagramBarco: normalizarLinkSocial(instagramBarco, "instagram"),
          facebookBarco: normalizarLinkSocial(facebookBarco, "facebook"),
          siteBarco: normalizarLinkSocial(siteBarco, "site"),
          informacoesPassageiroAtualizadoEm: new Date().toISOString(),
        },
        { merge: true },
      );
      await setDoc(
        doc(db, "usuarios", user.uid),
        {
          tipo: isComandante ? "dono" : tipoUsuario,
          id_barco_vinculado: meuBarcoId.toUpperCase().trim(),
          barcoNome: barcoPerfilNome || meuBarcoId.toUpperCase().trim(),
          barcoCnpj: cnpjFormatado,
        },
        { merge: true },
      );

      setBarcoPerfilCnpj(cnpjFormatado);
      jaCarregouMarketing.current = false;
      editandoMarketing.current = false;
      setModalMarketingVisivel(false);
      triggerHaptic("success");
      exibirAviso("Sucesso!", "Atualizado!", "sucesso");
    } catch (error) {
      exibirAviso("Erro", "Falha.", "erro");
    } finally {
      setSalvandoMarketing(false);
    }
  };

  const toggleComodidade = (c: keyof typeof comodidades) => {
    triggerHaptic();
    setComodidades((p) => ({ ...p, [c]: !p[c] }));
  };

  const adicionarTripulante = async () => {
    if (!emailTripulante.trim()) return;
    if (!meuBarcoId) {
      exibirAviso(
        "Aviso",
        "Identificação do barco ainda carregando...",
        "aviso",
      );
      return;
    }
    setBuscandoEmail(true);
    triggerHaptic();
    try {
      const q = query(
        collection(db, "usuarios"),
        where("email", "==", emailTripulante.trim().toLowerCase()),
      );
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        exibirAviso(
          "Não encontrado",
          "Este e-mail não possui conta no app.",
          "erro",
        );
      } else {
        const userDoc = querySnapshot.docs[0];
        await updateDoc(doc(db, "usuarios", userDoc.id), {
          tipo: "tripulante",
          id_barco_vinculado: meuBarcoId,
          barcoNome: barcoPerfilNome || meuBarcoId,
          barcoCnpj: barcoPerfilCnpj || cnpjBarco || "",
          autorizadoPor: user?.uid,
          dataVinculo: new Date().toISOString(),
        });
        setEmailTripulante("");
        exibirAviso(
          "Sucesso!",
          "Tripulante vinculado à embarcação!",
          "sucesso",
        );
      }
    } catch (e) {
      exibirAviso("Falha", "Erro ao conectar com o servidor.", "erro");
    } finally {
      setBuscandoEmail(false);
    }
  };

  const removerTripulante = async (uid: string) => {
    triggerHaptic("heavy");
    try {
      await updateDoc(doc(db, "usuarios", uid), {
        tipo: "passageiro",
        id_barco_vinculado: null,
        barcoNome: "",
        barcoCnpj: "",
      });
      exibirAviso("Removido", "Vínculo revogado.", "aviso");
    } catch (e) {
      exibirAviso("Erro", "Falha.", "erro");
    }
  };

  const COMODIDADES_LISTA = [
    { id: "wifi", label: "Wi-Fi", icon: "wifi-outline" },
    { id: "ar", label: "Ar Cond.", icon: "snow-outline" },
    { id: "suites", label: "Suítes", icon: "bed-outline" },
    { id: "lanchonete", label: "Lanchonete", icon: "restaurant-outline" },
    { id: "redario", label: "Redário", icon: "map-outline" },
    { id: "petFriendly", label: "Pets", icon: "paw-outline" },
    { id: "tomadas", label: "Tomadas", icon: "battery-charging-outline" },
    { id: "bar", label: "Bar/Som", icon: "beer-outline" },
  ];

  const LOGISTICA_LISTA = [
    { id: "encomendas", label: "Encomendas", icon: "cube-outline" },
    { id: "transporte", label: "Veículos", icon: "car-sport-outline" },
    { id: "mudanca", label: "Mudanças", icon: "archive-outline" },
    { id: "cargas", label: "Cargas", icon: "layers-outline" },
  ];

  const excluirContaDefinitivo = async () => {
    const usuarioAtual = auth.currentUser;

    if (!usuarioAtual || !usuarioAtual.email) {
      exibirAviso(
        "Sessão expirada",
        "Faça login novamente para excluir sua conta.",
        "aviso",
      );
      return;
    }

    if (!senhaExcluir.trim()) {
      exibirAviso(
        "Senha obrigatória",
        "Digite sua senha para confirmar a exclusão da conta.",
        "aviso",
      );
      return;
    }

    try {
      setExcluindoConta(true);

      const credencial = FirebaseEmailAuthProvider.credential(
        usuarioAtual.email,
        senhaExcluir.trim(),
      );

      await reauthenticateWithCredential(usuarioAtual, credencial);

      await deleteDoc(doc(db, "usuarios", usuarioAtual.uid));

      await deleteUser(usuarioAtual);

      setModalExcluirVisivel(false);
      setSenhaExcluir("");
      setMostrarSenhaExcluir(false);

      triggerHaptic("success");

      router.replace("/login");
    } catch (error: any) {
      console.log("Erro ao excluir conta:", error);
      console.log("Código do erro:", error?.code);
      console.log("Mensagem do erro:", error?.message);

      if (
        error?.code === "auth/wrong-password" ||
        error?.code === "auth/invalid-credential"
      ) {
        exibirAviso(
          "Senha incorreta",
          "A senha informada está incorreta. Verifique e tente novamente.",
          "erro",
        );
        return;
      }

      if (error?.code === "auth/requires-recent-login") {
        exibirAviso(
          "Confirmação necessária",
          "Por segurança, faça login novamente e tente excluir a conta.",
          "aviso",
        );
        return;
      }

      if (error?.code === "permission-denied") {
        exibirAviso(
          "Permissão negada",
          "Não foi possível excluir seus dados. Verifique as regras do Firebase.",
          "erro",
        );
        return;
      }

      exibirAviso(
        "Erro ao excluir",
        `Código: ${error?.code || "sem código"}\nMensagem: ${
          error?.message || "sem mensagem"
        }`,
        "erro",
      );
    } finally {
      setExcluindoConta(false);
    }
  };

  return (
    <View style={styles.container}>
      <Modal animationType="fade" transparent visible={aviso.visivel}>
        <View style={styles.modalOverlayCenter}>
          <Animated.View
            entering={ZoomIn.duration(200)}
            style={styles.alertCard}
          >
            <Ionicons
              name={
                aviso.tipo === "sucesso"
                  ? "checkmark-circle"
                  : aviso.tipo === "aviso"
                    ? "warning"
                    : "alert-circle"
              }
              size={60}
              color={
                aviso.tipo === "sucesso"
                  ? "#10b981"
                  : aviso.tipo === "aviso"
                    ? "#f59e0b"
                    : "#ef4444"
              }
            />
            <Text style={styles.alertTitle}>{aviso.titulo}</Text>
            <Text style={styles.alertText}>{aviso.mensagem}</Text>
            <TouchableOpacity
              style={[
                styles.alertBtn,
                {
                  backgroundColor:
                    aviso.tipo === "sucesso"
                      ? "#10b981"
                      : aviso.tipo === "aviso"
                        ? "#f59e0b"
                        : "#ef4444",
                },
              ]}
              onPress={() => setAviso({ ...aviso, visivel: false })}
            >
              <Text style={styles.alertBtnText}>ENTENDIDO</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <Animated.View
          entering={FadeInDown.duration(300)}
          style={styles.header}
        >
          <TouchableOpacity
            onPress={alterarFoto}
            disabled={uploadingFotoPerfil}
          >
            <View style={styles.avatarContainer}>
              {fotoPerfil ? (
                <Image
                  source={{ uri: fotoPerfil }}
                  style={styles.avatarImage}
                />
              ) : (
                <Ionicons name="person" size={40} color="#334155" />
              )}
              {uploadingFotoPerfil && (
                <View style={[StyleSheet.absoluteFill, styles.loadingOverlay]}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.nameContainer}
            onPress={() => {
              triggerHaptic();
              setInputNome(nomeUsuario || "Usuário");
              setModalNomeVisivel(true);
            }}
          >
            <Text style={styles.userName}>{nomeUsuario || "Definir Nome"}</Text>
            <Ionicons name="pencil" size={16} color="#38bdf8" />
          </TouchableOpacity>
          <View
            style={[
              styles.roleBadge,
              {
                backgroundColor:
                  isComandante || isTripulante
                    ? "rgba(56, 189, 248, 0.2)"
                    : "rgba(100, 116, 139, 0.2)",
              },
            ]}
          >
            <Ionicons
              name={isComandante ? "boat" : isTripulante ? "medal" : "person"}
              size={12}
              color={isComandante || isTripulante ? "#38bdf8" : "#94a3b8"}
            />
            <Text
              style={[
                styles.roleText,
                { color: isComandante || isTripulante ? "#38bdf8" : "#94a3b8" },
              ]}
            >
              {isComandante
                ? "GESTOR DA EMBARCAÇÃO"
                : isTripulante
                  ? "TRIPULAÇÃO"
                  : "PASSAGEIRO"}
            </Text>
          </View>

          {(isComandante || isTripulante) && (
            <View style={styles.vinculoBarcoCard}>
              <View style={styles.vinculoBarcoIcone}>
                <Ionicons name="boat-outline" size={22} color="#38bdf8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.vinculoBarcoLabel}>
                  {rotuloTipoUsuario()}
                </Text>
                <Text style={styles.vinculoBarcoNome}>
                  {barcoPerfilNome || meuBarcoId || "Embarcação vinculada"}
                </Text>
                {!!barcoPerfilCnpj && (
                  <Text style={styles.vinculoBarcoCnpj}>
                    CNPJ: {barcoPerfilCnpj}
                  </Text>
                )}
              </View>
            </View>
          )}
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(300)} style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isComandante
              ? "MINHA EMBARCAÇÃO"
              : isTripulante
                ? "CONTA DA TRIPULAÇÃO"
                : "MINHA CONTA"}
          </Text>
          {!isComandante && (vendasAtivas || pilotoMarketplace) && (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                triggerHaptic();
                router.push("/historico");
              }}
            >
              <View style={styles.iconBox}>
                <Ionicons name="ticket-outline" size={22} color="#38bdf8" />
              </View>
              <Text style={styles.menuText}>Meus Bilhetes</Text>
              <Ionicons name="chevron-forward" size={20} color="#334155" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              triggerHaptic();
              router.push("/dados-passageiro");
            }}
          >
            <View style={styles.iconBox}>
              <Ionicons
                name="person-circle-outline"
                size={22}
                color="#38bdf8"
              />
            </View>
            <Text style={styles.menuText}>Dados da Conta</Text>
            <Ionicons name="chevron-forward" size={20} color="#334155" />
          </TouchableOpacity>
        </Animated.View>

        {(isComandante || isTripulante) && (
          <Animated.View
            entering={FadeInUp.duration(300)}
            style={styles.section}
          >
            <Text style={styles.sectionTitle}>MINHA EMBARCAÇÃO</Text>
            {[
              {
                label: "Dados e divulgação da embarcação",
                icon: "megaphone-outline",
                action: () => {
                  editandoMarketing.current = false;
                  setModalMarketingVisivel(true);
                },
              },
              {
                label: "Painel operacional",
                icon: "pie-chart-outline",
                action: () => router.push("/dashboard"),
              },
              {
                label: "Validar Bilhete",
                icon: "qr-code-outline",
                action: () => router.push("/validador"),
              },
              {
                label: "Equipe da embarcação",
                icon: "people-outline",
                action: () => setModalTripulacaoVisivel(true),
              },
              {
                label: "Engenharia de Rota (Simulador)",
                icon: "navigate-circle-outline",
                action: () => setModalEngenhariaVisivel(true),
              },
              {
                label: "Relatórios e manifesto",
                icon: "stats-chart-outline",
                action: () => router.push("/relatorio-vendas"),
              },
            ]
              .filter((item) => {
                if (isTripulante && !isComandante) {
                  return (
                    item.label === "Validar Bilhete" ||
                    item.label === "Relatórios e manifesto"
                  );
                }
                return (
                  item.label !== "Engenharia de Rota (Simulador)" ||
                  auth.currentUser?.email === "jandessonmoraes@gmail.com"
                );
              })
              .map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.menuItem}
                  onPress={() => {
                    triggerHaptic();
                    item.action();
                  }}
                >
                  <View style={styles.iconBox}>
                    <Ionicons
                      name={item.icon as any}
                      size={22}
                      color="#38bdf8"
                    />
                  </View>
                  <Text style={styles.menuText}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#334155" />
                </TouchableOpacity>
              ))}
          </Animated.View>
        )}

        {auth.currentUser?.email === "jandessonmoraes@gmail.com" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ADMIN CADÊ MEU BARCO</Text>
            <TouchableOpacity
              style={styles.adminBtn}
              onPress={() => setModalAdminBarcoVisivel(true)}
            >
              <Ionicons name="add-circle-outline" size={24} color="#38bdf8" />
              <Text style={styles.adminBtnText}>CRIAR COMANDO COMPLETO</Text>
            </TouchableOpacity>
          </View>
        )}

        <Animated.View entering={FadeInUp.duration(300)} style={styles.section}>
          <Text style={styles.sectionTitle}>APLICATIVO</Text>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() =>
              Linking.openURL(
                "https://sites.google.com/view/privacidade-cadeomeubarco/in%C3%ADcio",
              )
            }
          >
            <View style={styles.iconBox}>
              <Ionicons
                name="shield-checkmark-outline"
                size={22}
                color="#38bdf8"
              />
            </View>
            <Text style={styles.menuText}>Política de Privacidade</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => Linking.openURL("https://wa.me/5592991903278")}
          >
            <View style={styles.iconBox}>
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={22}
                color="#38bdf8"
              />
            </View>
            <Text style={styles.menuText}>Suporte Técnico</Text>
            <Ionicons name="chevron-forward" size={20} color="#334155" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={() => setModalSairVisivel(true)}
          >
            <Ionicons name="log-out-outline" size={25} color="#64748b" />
            <Text style={styles.logoutText}>Desembarcar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ marginTop: 20, alignSelf: "center" }}
            onPress={() => setModalExcluirVisivel(true)}
          >
            <Text style={styles.deleteText}>Excluir Conta</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      {/* MODAL GESTÃO DE TRIPULAÇÃO */}
      <Modal animationType="slide" transparent visible={modalTripulacaoVisivel}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentGrande}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitleGrande}>Equipe da embarcação</Text>
              <TouchableOpacity
                onPress={() => setModalTripulacaoVisivel(false)}
              >
                <Ionicons name="close-circle" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.subLabel}>
                Digite o e-mail do tripulante para vinculá-lo à embarcação.
              </Text>
              <View style={styles.testCard}>
                <Text style={styles.labelInput}>E-MAIL DO TRIPULANTE</Text>
                <View style={styles.addTripulanteBox}>
                  <TextInput
                    style={styles.inputTripulante}
                    placeholder="exemplo@email.com"
                    placeholderTextColor="#64748b"
                    value={emailTripulante}
                    onChangeText={setEmailTripulante}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={styles.btnIconAdd}
                    onPress={adicionarTripulante}
                    disabled={buscandoEmail}
                  >
                    {buscandoEmail ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="person-add" size={20} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={[styles.labelInput, { marginTop: 20 }]}>
                TRIPULANTES ATIVOS
              </Text>
              {listaTripulacao.length === 0 ? (
                <Text
                  style={{
                    color: "#64748b",
                    textAlign: "center",
                    marginTop: 20,
                  }}
                >
                  Nenhum tripulante vinculado.
                </Text>
              ) : (
                listaTripulacao.map((membro) => (
                  <View key={membro.id} style={styles.tripulanteCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tripulanteNome}>
                        {membro.nome || "Tripulante"}
                      </Text>
                      <Text style={styles.tripulanteEmail}>{membro.email}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => removerTripulante(membro.id)}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color="#ef4444"
                      />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL MARKETING (COM A ÁREA DE ÍCONES DE VOLTA) */}
      <Modal animationType="slide" transparent visible={modalMarketingVisivel}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentGrande}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitleGrande}>
                Dados e divulgação da embarcação
              </Text>
              <TouchableOpacity
                onPress={() => {
                  editandoMarketing.current = false;
                  setModalMarketingVisivel(false);
                }}
              >
                <Ionicons name="close-circle" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              <Text style={styles.labelInput}>
                Galeria ({fotosBarco.length}/5)
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.fotosScroll}
              >
                {/* 🟢 BOTÃO DE UPLOAD (SÓ APARECE SE TIVER MENOS DE 5 FOTOS) */}
                {fotosBarco.length < 5 && (
                  <TouchableOpacity
                    style={styles.btnUpload}
                    onPress={adicionarFotoBarco}
                    disabled={uploadingFotoBarco}
                  >
                    {uploadingFotoBarco ? (
                      <ActivityIndicator size="small" color="#38bdf8" />
                    ) : (
                      <>
                        <Ionicons
                          name="cloud-upload-outline"
                          size={24}
                          color="#38bdf8"
                        />
                        <Text style={styles.btnUploadText}>ADICIONAR</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                {/* EXIBIÇÃO DAS FOTOS JÁ CADASTRADAS */}
                {fotosBarco.map((f, i) => (
                  <View key={i} style={styles.fotoWrapper}>
                    <Image source={{ uri: f }} style={styles.fotoPreview} />
                    <TouchableOpacity
                      style={styles.btnRemoveFoto}
                      onPress={() => {
                        triggerHaptic("heavy");
                        const nf = [...fotosBarco];
                        nf.splice(i, 1);
                        setFotosBarco(nf);
                      }}
                    >
                      <Ionicons name="trash" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
              <Text style={styles.labelInput}>Descrição do Barco</Text>
              <TextInput
                style={styles.textArea}
                value={descricaoBarco}
                onChangeText={setDescricaoBarco}
                multiline
                maxLength={300}
                placeholder="Descreva seu barco para os passageiros..."
                placeholderTextColor="#64748b"
              />

              <Text style={styles.labelInput}>CNPJ DA EMBARCAÇÃO</Text>
              <TextInput
                style={styles.inputInfo}
                value={cnpjBarco}
                onChangeText={(valor) => setCnpjBarco(formatarCnpj(valor))}
                keyboardType="number-pad"
                placeholder="00.000.000/0000-00"
                placeholderTextColor="#64748b"
              />
              <Text style={styles.infoPassageiroAjuda}>
                Esse CNPJ será usado no manifesto e nos relatórios da
                embarcação.
              </Text>

              <Text style={styles.labelInput}>REDES SOCIAIS E SITE</Text>
              <View style={styles.redesSociaisCard}>
                <Text style={styles.infoPassageiroTexto}>
                  Opcional. Se preencher, os ícones aparecem nos detalhes da
                  embarcação para o passageiro acessar.
                </Text>

                <View style={styles.inputSocialLinha}>
                  <Ionicons name="logo-instagram" size={20} color="#e879f9" />
                  <TextInput
                    style={styles.inputSocial}
                    value={instagramBarco}
                    onChangeText={setInstagramBarco}
                    autoCapitalize="none"
                    placeholder="@nomedobarco ou link do Instagram"
                    placeholderTextColor="#64748b"
                  />
                </View>

                <View style={styles.inputSocialLinha}>
                  <Ionicons name="logo-facebook" size={20} color="#60a5fa" />
                  <TextInput
                    style={styles.inputSocial}
                    value={facebookBarco}
                    onChangeText={setFacebookBarco}
                    autoCapitalize="none"
                    placeholder="facebook.com/nomedobarco"
                    placeholderTextColor="#64748b"
                  />
                </View>

                <View style={styles.inputSocialLinha}>
                  <Ionicons name="globe-outline" size={20} color="#38bdf8" />
                  <TextInput
                    style={styles.inputSocial}
                    value={siteBarco}
                    onChangeText={setSiteBarco}
                    autoCapitalize="none"
                    keyboardType="url"
                    placeholder="www.site.com.br"
                    placeholderTextColor="#64748b"
                  />
                </View>
              </View>

              {/* 🟢 SEÇÃO DE COMODIDADES (RESTORED) */}
              <Text style={styles.labelInput}>COMODIDADES A BORDO</Text>
              <View style={styles.gridComodidades}>
                {COMODIDADES_LISTA.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.btnComodidade,
                      comodidades[c.id as keyof typeof comodidades] &&
                        styles.btnComodidadeAtivo,
                    ]}
                    onPress={() => toggleComodidade(c.id as any)}
                  >
                    <Ionicons
                      name={c.icon as any}
                      size={16}
                      color={
                        comodidades[c.id as keyof typeof comodidades]
                          ? "#0f172a"
                          : "#38bdf8"
                      }
                    />
                    <Text
                      style={[
                        styles.txtComodidade,
                        comodidades[c.id as keyof typeof comodidades] &&
                          styles.txtComodidadeAtivo,
                      ]}
                    >
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 🟢 SEÇÃO DE LOGÍSTICA (RESTORED) */}
              <Text style={styles.labelInput}>SERVIÇOS DE LOGÍSTICA</Text>
              <View style={styles.gridComodidades}>
                {LOGISTICA_LISTA.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.btnComodidade,
                      comodidades[c.id as keyof typeof comodidades] && {
                        backgroundColor: "#f59e0b",
                        borderColor: "#f59e0b",
                      },
                    ]}
                    onPress={() => toggleComodidade(c.id as any)}
                  >
                    <Ionicons
                      name={c.icon as any}
                      size={16}
                      color={
                        comodidades[c.id as keyof typeof comodidades]
                          ? "#0f172a"
                          : "#f59e0b"
                      }
                    />
                    <Text
                      style={[
                        styles.txtComodidade,
                        comodidades[c.id as keyof typeof comodidades] &&
                          styles.txtComodidadeAtivo,
                      ]}
                    >
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.btnSalvarMark}
                onPress={salvarMarketingBarco}
                disabled={salvandoMarketing}
              >
                {salvandoMarketing ? (
                  <ActivityIndicator color="#0f172a" />
                ) : (
                  <Text style={styles.btnSalvarMarkTxt}>
                    SALVAR DADOS DA EMBARCAÇÃO
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* DEMAIS MODAIS */}
      <Modal animationType="slide" transparent visible={modalEngenhariaVisivel}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentGrande}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitleGrande}>Engenharia de Rota</Text>
              <TouchableOpacity
                onPress={() => setModalEngenhariaVisivel(false)}
              >
                <Ionicons name="close-circle" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={styles.subLabel}>
                Grave percursos reais e consolide-os.
              </Text>
              <View style={styles.testCard}>
                <View style={styles.rowBetween}>
                  <View>
                    <Text style={styles.testTitle}>Gravar Trajeto</Text>
                    <Text style={styles.testSub}>
                      {pontosCapturados} pontos
                    </Text>
                  </View>
                  <Switch
                    value={gravandoRota}
                    onValueChange={setGravandoRota}
                  />
                </View>
                <TouchableOpacity
                  style={styles.btnReset}
                  onPress={limparTrilhaTeste}
                >
                  <Text style={styles.btnResetText}>LIMPAR</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={modalRotaMestraVisivel}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nomear Rota Oficial</Text>
            <TextInput
              style={styles.modalInput}
              value={nomeRotaMestra}
              onChangeText={setNomeRotaMestra}
            />
            <TouchableOpacity
              style={styles.btnConfirm}
              onPress={finalizarRotaMestra}
            >
              <Text style={styles.btnConfirmText}>SALVAR ROTA</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={modalAdminBarcoVisivel}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalCardAdmin}>
            <View style={styles.modalHeader}>
              <Ionicons name="boat" size={24} color="#38bdf8" />
              <Text style={styles.modalTitleAdmin}>Nova Embarcação</Text>
            </View>

            <Text style={styles.modalSubLabel}>Nome para rastreamento:</Text>
            <TextInput
              style={styles.modalInputAdmin}
              placeholder="Ex: JESUS ME DEU"
              placeholderTextColor="#64748b"
              value={adminNomeBarco}
              onChangeText={setAdminNomeBarco}
              autoCapitalize="characters"
            />

            <Text style={styles.modalSubLabel}>CNPJ da embarcação:</Text>
            <TextInput
              style={styles.modalInputAdmin}
              placeholder="00.000.000/0000-00"
              placeholderTextColor="#64748b"
              value={adminCnpjBarco}
              onChangeText={(valor) => setAdminCnpjBarco(formatarCnpj(valor))}
              keyboardType="number-pad"
            />

            <Text style={styles.modalSubLabel}>UID do Dono (Firebase):</Text>
            <TextInput
              style={styles.modalInputAdmin}
              placeholder="Cole o UID do Comandante"
              placeholderTextColor="#64748b"
              value={adminUidDono}
              onChangeText={setAdminUidDono}
              autoCapitalize="none"
            />

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.btnCancelAdmin]}
                onPress={() => {
                  setModalAdminBarcoVisivel(false);
                  setAdminNomeBarco("");
                  setAdminUidDono("");
                  setAdminCnpjBarco("");
                }}
              >
                <Text style={styles.btnCancelTextAdmin}>CANCELAR</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, styles.btnConfirmAdmin]}
                onPress={finalizarCriacaoComando}
                disabled={criandoBarcoAdmin}
              >
                {criandoBarcoAdmin ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnConfirmTextAdmin}>CRIAR</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={modalNomeVisivel}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Editar Nome</Text>
            <TextInput
              style={styles.modalInput}
              value={inputNome}
              onChangeText={setInputNome}
            />
            <TouchableOpacity
              style={styles.btnConfirm}
              onPress={salvarNovoNome}
            >
              <Text style={styles.btnConfirmText}>SALVAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={modalSairVisivel}>
        <View style={styles.modalOverlayCenter}>
          <Animated.View entering={ZoomIn} style={styles.modalCard}>
            <View style={styles.iconContainerLogout}>
              <Ionicons name="log-out-outline" size={32} color="#ef4444" />
            </View>
            <Text style={styles.modalTitle}>Desembarcar?</Text>
            <Text style={styles.modalSubtitle}>
              Tem certeza que deseja sair da sua conta e encerrar a sessão
              atual?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={() => setModalSairVisivel(false)}
              >
                <Text style={styles.btnCancelText}>CANCELAR</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.btnConfirmLogout,
                  { backgroundColor: "#ef4444" },
                ]}
                onPress={confirmarLogout}
              >
                <Text style={styles.btnConfirmText}>SAIR AGORA</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={modalExcluirVisivel}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalCard}>
            <Ionicons name="sad-outline" size={60} color="#ef4444" />

            <Text style={styles.modalTitle}>Excluir Conta?</Text>

            <Text style={styles.modalSubtitle}>
              Essa ação removerá sua conta do app Cadê Meu Barco. Para
              confirmar, digite sua senha.
            </Text>

            <View style={styles.inputSenhaWrapper}>
              <TextInput
                style={styles.inputSenhaExcluir}
                value={senhaExcluir}
                onChangeText={setSenhaExcluir}
                placeholder="Digite sua senha"
                placeholderTextColor="#64748b"
                secureTextEntry={!mostrarSenhaExcluir}
                autoCapitalize="none"
              />

              <TouchableOpacity
                onPress={() => setMostrarSenhaExcluir((prev) => !prev)}
                style={styles.btnOlhoSenha}
              >
                <Ionicons
                  name={mostrarSenhaExcluir ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color="#94a3b8"
                />
              </TouchableOpacity>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={() => {
                  setModalExcluirVisivel(false);
                  setSenhaExcluir("");
                }}
                disabled={excluindoConta}
              >
                <Text style={styles.btnCancelText}>NÃO</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.btnConfirmLogout,
                  { backgroundColor: "#ef4444" },
                ]}
                onPress={excluirContaDefinitivo}
                disabled={excluindoConta}
              >
                {excluindoConta ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnConfirmText}>APAGAR</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#020617" },
  header: {
    alignItems: "center",
    paddingVertical: 40,
    backgroundColor: "#0f172a",
    borderBottomLeftRadius: 35,
    borderBottomRightRadius: 35,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(56, 189, 248, 0.1)",
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(56, 189, 248, 0.05)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#38bdf8",
    position: "relative",
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: "#38bdf8",
  },
  loadingOverlay: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  nameContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    marginTop: 10,
  },
  userName: { color: "#fff", fontSize: 22, fontWeight: "bold" },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 2,
  },
  roleText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  vinculoBarcoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.18)",
    borderRadius: 18,
    padding: 14,
    marginTop: 16,
    marginHorizontal: 22,
    width: "88%",
  },
  vinculoBarcoIcone: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(56, 189, 248, 0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  vinculoBarcoLabel: {
    color: "#38bdf8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  vinculoBarcoNome: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 2,
  },
  vinculoBarcoCnpj: {
    color: "#94a3b8",
    fontSize: 11,
    marginTop: 3,
    fontWeight: "700",
  },
  section: { marginTop: 25, paddingHorizontal: 20 },
  sectionTitle: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 12,
    marginLeft: 5,
    letterSpacing: 1,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172a",
    padding: 15,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
    backgroundColor: "rgba(56, 189, 248, 0.05)",
  },
  menuText: { flex: 1, color: "#f8fafc", fontSize: 15, fontWeight: "500" },
  deleteText: {
    color: "#ef4444",
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 10,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 40,
  },
  logoutText: { color: "#64748b", fontWeight: "bold", fontSize: 16 },
  alertCard: {
    backgroundColor: "#0f172a",
    width: "100%",
    borderRadius: 25,
    padding: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  alertTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    marginTop: 15,
  },
  alertText: {
    color: "#94a3b8",
    fontSize: 15,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 22,
  },
  alertBtn: {
    width: "100%",
    padding: 15,
    borderRadius: 15,
    marginTop: 25,
    alignItems: "center",
  },
  alertBtnText: { color: "#fff", fontWeight: "bold" },
  subLabel: {
    color: "#64748b",
    fontSize: 12,
    marginBottom: 15,
    textAlign: "center",
  },
  modalInput: {
    backgroundColor: "#1e293b",
    color: "#fff",
    width: "100%",
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 15,
  },
  btnConfirm: {
    backgroundColor: "#38bdf8",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    minWidth: 120,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.9)",
    justifyContent: "flex-end",
  },
  modalContentGrande: {
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 25,
    height: "90%",
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  modalTitleGrande: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  labelInput: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: "bold",
    marginTop: 15,
    marginBottom: 10,
    letterSpacing: 1,
  },
  textArea: {
    backgroundColor: "#1e293b",
    color: "#fff",
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: 10,
  },
  fotosScroll: { flexDirection: "row", marginBottom: 5 },
  fotoWrapper: { position: "relative", marginRight: 10 },
  fotoPreview: {
    width: 130,
    height: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  btnUploadText: {
    color: "#38bdf8",
    fontSize: 10,
    fontWeight: "bold",
    marginTop: 8,
  },
  btnRemoveFoto: {
    position: "absolute",
    top: 5,
    right: 5,
    backgroundColor: "rgba(239, 68, 68, 0.9)",
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  infoPassageiroCard: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.18)",
    padding: 15,
    marginBottom: 15,
  },
  infoPassageiroTitulo: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  infoPassageiroTexto: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  subLabelInfo: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 6,
    marginTop: 10,
  },
  inputInfo: {
    backgroundColor: "#020617",
    color: "#fff",
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    fontSize: 14,
  },
  textAreaInfo: {
    backgroundColor: "#020617",
    color: "#fff",
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    fontSize: 14,
    minHeight: 78,
    textAlignVertical: "top",
  },
  infoPassageiroAjuda: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 10,
  },
  redesSociaisCard: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.14)",
    padding: 15,
    marginBottom: 15,
  },
  inputSocialLinha: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#020617",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 12,
    marginTop: 10,
  },
  inputSocial: {
    flex: 1,
    color: "#fff",
    paddingVertical: 12,
    fontSize: 13,
  },
  gridComodidades: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  btnComodidade: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 6,
  },
  btnComodidadeAtivo: { backgroundColor: "#38bdf8", borderColor: "#38bdf8" },
  txtComodidade: { color: "#64748b", fontSize: 11, fontWeight: "bold" },
  txtComodidadeAtivo: { color: "#0f172a" },
  btnSalvarMark: {
    backgroundColor: "#38bdf8",
    padding: 18,
    borderRadius: 15,
    marginBottom: 50,
    marginTop: 30,
    alignItems: "center",
  },
  btnSalvarMarkTxt: {
    color: "#0f172a",
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 1,
  },
  adminBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(56, 189, 248, 0.05)",
    padding: 21,
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#38bdf8",
    gap: 10,
  },
  adminBtnText: {
    color: "#38bdf8",
    fontWeight: "bold",
    fontSize: 13,
    letterSpacing: 0.5,
  },
  testCard: {
    backgroundColor: "#0f172a",
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
    marginBottom: 10,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  testTitle: { color: "#fff", fontSize: 14, fontWeight: "bold" },
  testSub: { color: "#64748b", fontSize: 12, marginTop: 2 },
  btnReset: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 15,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.15)",
  },
  btnResetText: {
    color: "#ef4444",
    fontSize: 11,
    fontWeight: "bold",
  },
  addTripulanteBox: { flexDirection: "row", gap: 10, marginBottom: 15 },
  inputTripulante: {
    flex: 1,
    backgroundColor: "#1e293b",
    color: "#fff",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  btnIconAdd: {
    backgroundColor: "#38bdf8",
    width: 50,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
  },
  tripulanteCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172a",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  tripulanteNome: { color: "#fff", fontSize: 13, fontWeight: "bold" },
  modalCardAdmin: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
    padding: 25,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.2)",
  },
  modalTitleAdmin: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  modalSubLabel: {
    color: "#94a3b8",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 10,
    marginTop: 15,
  },
  modalInputAdmin: {
    backgroundColor: "#0f172a",
    color: "#fff",
    borderRadius: 16,
    padding: 18,
    fontSize: 16,
    fontWeight: "bold",
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 10,
    textAlign: "center",
  },
  modalButtonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 15,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnConfirmAdmin: {
    backgroundColor: "#38bdf8",
  },
  btnCancelAdmin: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#334155",
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#0f172a",
    width: "100%",
    borderRadius: 28,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  iconContainerLogout: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  modalSubtitle: {
    color: "#94a3b8",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 30,
    paddingHorizontal: 10,
  },
  modalButtons: {
    flexDirection: "row",
    width: "100%",
    gap: 12,
  },
  btnConfirmLogout: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  btnConfirmText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    // paddingHorizontal: 16,
  },
  btnCancelText: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "800",
    paddingHorizontal: 20,
  },
  // --- ESTILOS QUE ESTAVAM FALTANDO ---

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between", // Garante que o título e o 'X' fiquem nas pontas
    marginBottom: 20,
    width: "100%",
  },

  modalTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },

  btnConfirmTextAdmin: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  btnCancelTextAdmin: {
    color: "#94a3b8", // Cinza azulado para parecer secundário
    fontWeight: "bold",
    fontSize: 14,
    textTransform: "uppercase",
  },

  tripulanteEmail: {
    color: "#64748b", // Texto menor e mais discreto para o e-mail
    fontSize: 12,
    marginTop: 2,
  },
  btnCancel: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: "#1e293b", // Slate 800 - cor neutra para não competir com o botão principal
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)", // Borda sutil para dar profundidade
  },
  btnUpload: {
    width: 120,
    height: 80,
    backgroundColor: "rgba(56, 189, 248, 0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.3)",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  inputSenhaWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 15,
  },

  inputSenhaExcluir: {
    flex: 1,
    color: "#fff",
    padding: 15,
    fontSize: 15,
  },

  btnOlhoSenha: {
    width: 50,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
  },
});
