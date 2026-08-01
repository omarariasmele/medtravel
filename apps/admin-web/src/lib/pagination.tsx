import { useEffect, useState } from 'react';
import { TablePagination } from '@mui/material';

const PAGE_SIZE = 30;

/**
 * Paginación de cliente uniforme para toda tabla de admin-web — pedido
 * explícito del usuario: ninguna lista debe mostrarse "interminable",
 * máximo 30 filas por página con indicador de cantidad de páginas. Fija
 * (sin selector de "filas por página"), a propósito, para que el
 * comportamiento sea idéntico en todas las pantallas.
 */
export function usePagination<T>(rows: T[]) {
  const [page, setPage] = useState(0);

  // Si la lista se achica (filtro, búsqueda) y la página actual queda
  // fuera de rango, volver a la última página válida en vez de mostrar
  // una tabla vacía.
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);

  const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return { pageRows, page, setPage, totalCount: rows.length, pageSize: PAGE_SIZE };
}

export function PaginationFooter({
  page,
  totalCount,
  onPageChange,
}: {
  page: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  if (totalCount <= PAGE_SIZE) return null;
  return (
    <TablePagination
      component="div"
      count={totalCount}
      page={page}
      onPageChange={(_e, newPage) => onPageChange(newPage)}
      rowsPerPage={PAGE_SIZE}
      rowsPerPageOptions={[PAGE_SIZE]}
      labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
    />
  );
}
