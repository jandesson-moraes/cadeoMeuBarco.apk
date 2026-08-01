import { getAuth, onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import BannerModal from "./BannerModal";
import { db } from "../services/firebase";

type UsuarioCampanha = {
  id?: string;
  uid?: string;
  email?: string;
  cidade?: string;
  cidadeUsuario?: string;
  cidadeResidencia?: string;
  estadoResidencia?: string;
  cidadeResidenciaCompleta?: string;
};

function montarCidadeUsuario(usuario: UsuarioCampanha | null) {
  if (!usuario) return "";

  if (usuario.cidadeResidenciaCompleta) {
    return usuario.cidadeResidenciaCompleta;
  }

  if (usuario.cidadeResidencia && usuario.estadoResidencia) {
    return `${usuario.cidadeResidencia} - ${usuario.estadoResidencia}`;
  }

  return usuario.cidade || usuario.cidadeUsuario || "";
}

function extrairBarcoId(passagem: any) {
  return (
    passagem.barcoId ||
    passagem.embarcacaoId ||
    passagem.idBarco ||
    passagem.barco ||
    passagem.nomeBarco ||
    ""
  );
}

export default function CampanhasMobile() {
  const [usuario, setUsuario] = useState<UsuarioCampanha | null>(null);
  const [barcosCompradosIds, setBarcosCompradosIds] = useState<string[]>([]);
  const [userId, setUserId] = useState("");

  useEffect(() => {
    const auth = getAuth();

    let unsubscribeUsuario: (() => void) | undefined;
    let unsubscribePassagens: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubscribeUsuario) unsubscribeUsuario();
      if (unsubscribePassagens) unsubscribePassagens();

      if (!user) {
        setUsuario(null);
        setUserId("");
        setBarcosCompradosIds([]);
        return;
      }

      setUserId(user.uid);

      unsubscribeUsuario = onSnapshot(
        doc(db, "usuarios", user.uid),
        (snapshot) => {
          if (snapshot.exists()) {
            setUsuario({
              id: snapshot.id,
              uid: user.uid,
              email: user.email || "",
              ...snapshot.data(),
            } as UsuarioCampanha);
          } else {
            setUsuario({
              id: user.uid,
              uid: user.uid,
              email: user.email || "",
            });
          }
        },
        () => {
          setUsuario({
            id: user.uid,
            uid: user.uid,
            email: user.email || "",
          });
        },
      );

      const qPassagens = query(
        collection(db, "passagens"),
        where("usuarioId", "==", user.uid),
      );

      unsubscribePassagens = onSnapshot(
        qPassagens,
        (snapshot) => {
          const ids = snapshot.docs
            .map((docSnap) => extrairBarcoId(docSnap.data()))
            .filter(Boolean)
            .map(String);

          setBarcosCompradosIds(Array.from(new Set(ids)));
        },
        () => {
          setBarcosCompradosIds([]);
        },
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUsuario) unsubscribeUsuario();
      if (unsubscribePassagens) unsubscribePassagens();
    };
  }, []);

  const cidadeUsuario = useMemo(() => montarCidadeUsuario(usuario), [usuario]);

  return (
    <BannerModal
      contexto="global"
      cidadeUsuario={cidadeUsuario}
      barcosCompradosIds={barcosCompradosIds}
      userId={userId || usuario?.email || "anonimo"}
    />
  );
}
