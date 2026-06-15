'use client';

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

// Per-column responsive class hook. Modules set `meta.cellClassName` (e.g.
// 'hidden md:table-cell') to drop low-priority columns on narrow screens; the
// same class is applied to the matching <th> so header + body stay aligned.
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    cellClassName?: string;
  }
}

export function DataTable<TData, TValue>({
  data,
  columns,
  searchKey,
  searchPlaceholder = 'Rechercher…',
  toolbar,
}: {
  data: TData[];
  columns: ColumnDef<TData, TValue>[];
  searchKey?: keyof TData & string;
  searchPlaceholder?: string;
  toolbar?: React.ReactNode;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _columnId, filterValue: string) => {
      if (!searchKey) return true;
      const v = String((row.original as Record<string, unknown>)[searchKey] ?? '');
      return v.toLowerCase().includes(filterValue.toLowerCase());
    },
    initialState: { pagination: { pageSize: 10 } },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {searchKey && (
          <div className="flex h-10 w-full max-w-md items-center gap-2 rounded-full border border-line bg-surface px-4">
            <Search size={14} className="text-muted" />
            <input
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
            />
          </div>
        )}
        {toolbar}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-160 text-sm">
          <thead className="bg-sunken/60">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={`cursor-pointer select-none border-b border-line px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-faint ${
                      header.column.columnDef.meta?.cellClassName ?? ''
                    }`}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === 'asc' && ' ↑'}
                    {header.column.getIsSorted() === 'desc' && ' ↓'}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-5 py-12 text-center text-sm text-muted"
                >
                  Aucun résultat.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-line last:border-0 hover:bg-sunken/40"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={`px-5 py-4 ${cell.column.columnDef.meta?.cellClassName ?? ''}`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted">
        <div>
          {table.getFilteredRowModel().rows.length} résultats · page{' '}
          {table.getState().pagination.pageIndex + 1} /{' '}
          {table.getPageCount()}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface disabled:opacity-40"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface disabled:opacity-40"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
