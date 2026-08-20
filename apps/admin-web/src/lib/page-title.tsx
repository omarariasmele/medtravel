import { createContext, useContext, useEffect, type ReactNode } from 'react';

/**
 * El título de cada pantalla se muestra en la barra verde superior (en
 * blanco) en vez de repetirse arriba del contenido — le da más espacio
 * vertical a las tablas/listas de cada página. AppLayout es el
 * Provider (tiene el estado + el AppBar); cada page.tsx solo llama
 * usePageTitle(...) una vez, sin renderizar ningún <Typography h4>.
 */
export const PageTitleContext = createContext<
  ((title: ReactNode) => void) | null
>(null);

export function usePageTitle(title: ReactNode): void {
  const setPageTitle = useContext(PageTitleContext);

  useEffect(() => {
    setPageTitle?.(title);
    return () => setPageTitle?.(null);
  }, [title, setPageTitle]);
}
