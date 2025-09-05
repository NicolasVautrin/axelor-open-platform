import {useMemo, useCallback, useRef, useEffect, useState} from 'react';
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

  const [dxDataSource, setDxDataSource] = useState<DataRecord[]>([]);

  // Mettre à jour quand records change
  useEffect(() => {
    const newDataSource = DxAdapter.convertDataSource(records);
    setDxDataSource(newDataSource);
  }, [records]);
  
  // Conversion des colonnes Axelor vers DevExpress
  const dxColumns = useMemo(() =>
      DxAdapter.convertColumns(view, fields),
    [view, fields]
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