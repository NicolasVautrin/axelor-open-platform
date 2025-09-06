import {useMemo, useCallback, useRef, useEffect, useState} from 'react';
import { GridView, Field } from '@/services/client/meta.types';
import { DataRecord } from '@/services/client/data.types';
import { DxAdapter } from '../adapters/DxAdapter';
import {GridState} from "@axelor/ui/grid";

interface UseDxGridProps {
  view: GridView;
  records: DataRecord[];
  fields: Record<string, Field>;
  state?: GridState;
  setState?: (updater: (draft: GridState) => void) => void;
  onRowClick?: (e: any) => void;
  onSave?: (record: DataRecord) => Promise<DataRecord | null>;
  searchAtom?: any;
}

export function useDxGrid(props: UseDxGridProps) {

  const {
    view,
    records,
    fields,
    state,
    setState,
    onRowClick,
    onSave,
    searchAtom,
  } = props;
  
  const dxDataSource = useMemo(() => {
      return DxAdapter.convertDataSource(records);
    },
    [records]
  );
  
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

  // Gestionnaire de sélection qui utilise setState
  const handleSelectionChanged = useCallback((e: any) => {
    const selectedRows = e.selectedRowsData || [];

    if (setState) {
      setState(draft => {
        draft.selectedRows = selectedRows
          .map((row: any) => records.findIndex(r => r.id === row.id))
          .filter((index: number) => index >= 0);
      });
    }
  }, [setState, records]);

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