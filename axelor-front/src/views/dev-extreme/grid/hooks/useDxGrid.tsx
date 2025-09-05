import { useMemo, useCallback } from 'react';
import { GridView, Field } from '@/services/client/meta.types';
import { DataRecord } from '@/services/client/data.types';
import { DxAdapter } from '../adapters/DxAdapter';

interface UseDxGridProps {
  view: GridView;
  records: DataRecord[];
  fields: Record<string, Field>;
  onSelectionChanged?: (selectedRows: any[]) => void;
  onRowClick?: (e: any) => void;
  onSave?: (record: DataRecord) => Promise<DataRecord | null>;
}

export function useDxGrid({
                            view,
                            records,
                            fields,
                            onSelectionChanged,
                            onRowClick,
                            onSave,
                          }: UseDxGridProps) {

  // Conversion des colonnes Axelor vers DevExpress
  const dxColumns = useMemo(() =>
      DxAdapter.convertColumns(view, fields),
    [view, fields]
  );

  // Source de données DevExpress
  const dxDataSource = useMemo(() =>
      DxAdapter.convertDataSource(records),
    [records]
  );

  // État DevExpress
  const dxState = useMemo(() =>
      DxAdapter.createInitialState(view),
    [view]
  );

  // Gestionnaires d'événements
  const handleSelectionChanged = useCallback((e: any) => {
    const selectedRows = e.selectedRowsData;
    onSelectionChanged?.(selectedRows);
  }, [onSelectionChanged]);

  const handleRowClick = useCallback((e: any) => {
    onRowClick?.(e);
  }, [onRowClick]);

  const handleRowUpdated = useCallback(async (e: any) => {
    if (onSave && e.data) {
      await onSave(e.data);
    }
  }, [onSave]);

  return {
    dxColumns,
    dxDataSource,
    dxState,
    handleSelectionChanged,
    handleRowClick,
    handleRowUpdated,
  };
}