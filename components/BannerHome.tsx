import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  Linking,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../services/firebase"; // Verifique o caminho do seu config

const { width } = Dimensions.get("window");

export default function BannerHome() {
  const [banners, setBanners] = useState<any[]>([]);

  useEffect(() => {
    // 📡 Sintonizando a frequência correta
    const q = query(
      collection(db, "banners_promocionais"),
      where("ativo", "==", true), // Apenas o que estiver no ar
      orderBy("createdAt", "desc"), // Mais recentes primeiro
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const listaBanners = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setBanners(listaBanners);
      },
      (error) => {
        console.error("Erro ao receber banners:", error);
      },
    );

    return () => unsub();
  }, []);

  if (banners.length === 0) return null;

  return (
    <View style={{ height: 200, marginVertical: 15 }}>
      <FlatList
        data={banners}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() =>
              item.linkDestino && Linking.openURL(item.linkDestino)
            }
          >
            <Image
              source={{ uri: item.imageUrl }}
              style={{
                width: width - 40,
                height: 180,
                borderRadius: 20,
                marginHorizontal: 20,
                backgroundColor: "#1e293b", // Cor de fundo enquanto carrega
              }}
              resizeMode="cover"
            />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
