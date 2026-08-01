import React, { createContext, useContext } from "react";

const AppModalContext = createContext({
  erro: async (titulo: string, mensagem: string) => {
    alert(`${titulo}\n\n${mensagem}`);
  },

  sucesso: async (titulo: string, mensagem: string) => {
    alert(`${titulo}\n\n${mensagem}`);
  },

  aviso: async (titulo: string, mensagem: string) => {
    alert(`${titulo}\n\n${mensagem}`);
  },
});

export const AppModalProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <AppModalContext.Provider
      value={{
        erro: async (titulo, mensagem) => alert(`${titulo}\n\n${mensagem}`),

        sucesso: async (titulo, mensagem) => alert(`${titulo}\n\n${mensagem}`),

        aviso: async (titulo, mensagem) => alert(`${titulo}\n\n${mensagem}`),
      }}
    >
      {children}
    </AppModalContext.Provider>
  );
};

export const useAppModal = () => useContext(AppModalContext);
