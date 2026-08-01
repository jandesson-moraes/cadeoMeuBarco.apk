type CredenciaisLoginTemporarias = {
  email: string;
  senha: string;
  criadasEmMs: number;
};

const DURACAO_CREDENCIAIS_TEMPORARIAS_MS = 15 * 60 * 1000;

let credenciaisTemporarias: CredenciaisLoginTemporarias | null = null;

export const definirCredenciaisLoginTemporarias = (
  email: string,
  senha: string,
) => {
  credenciaisTemporarias = {
    email: String(email || "").trim().toLowerCase(),
    senha: String(senha || ""),
    criadasEmMs: Date.now(),
  };
};

export const obterCredenciaisLoginTemporarias =
  (): CredenciaisLoginTemporarias | null => {
    if (!credenciaisTemporarias) return null;

    const expirou =
      Date.now() - credenciaisTemporarias.criadasEmMs >
      DURACAO_CREDENCIAIS_TEMPORARIAS_MS;

    if (expirou) {
      credenciaisTemporarias = null;
      return null;
    }

    return { ...credenciaisTemporarias };
  };

export const limparCredenciaisLoginTemporarias = () => {
  credenciaisTemporarias = null;
};
