import React, {forwardRef, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import 'devextreme/dist/css/dx.light.css';
import {
  DataGrid as DevExtremeDataGrid,
  Column as DxColumn,
  Paging as DxPaging,
  Selection as DxSelection,
  FilterRow as DxFilterRow,
  HeaderFilter as DxHeaderFilter,
  Editing as DxEditing,
  Toolbar as DxToolbar,
  Item as DxItem
} from 'devextreme-react/data-grid';

import { GridView, Field } from '@/services/client/meta.types';
import { DataRecord } from '@/services/client/data.types';
import { DxAdapter } from '../adapters/DxAdapter';
import { useDxGrid } from '../hooks/useDxGrid';

import styles from '../styles/dx-grid.module.scss';
import {SearchOptions} from "@/services/client/data.ts";
import {SearchState} from "@/views/grid/renderers/search";
import {GridSortColumn, GridState} from "@axelor/ui/grid";
import {atom, useAtomValue} from "jotai";
import {GridHandler} from "@/views/grid/builder";
import {getSortBy} from "@/views/grid/builder/utils.ts";

interface DxDataGridProps {
  view: GridView;
  records: DataRecord[];
  fields: Record<string, Field>;
  editable?: boolean;
  state?: GridState;
  setState?: (updater: (draft: GridState) => void) => void;
  onRowClick?: (e: any) => void;
  onRowDblClick?: (e: any) => void;
  onSave?: (record: DataRecord) => Promise<DataRecord | null>;
  onDelete?: (records: DataRecord[]) => Promise<void>;
  onSearch?: (options: SearchOptions) => Promise<void>;
  // ... autres props Axelor
}

export const DxDataGrid = forwardRef<HTMLDivElement, DxDataGridProps>(
  function DxDataGrid(props, ref) {

    const {
      view,
      records,
      fields,
      editable = false,
      searchAtom,
      onSearch,
      state,
      setState,
      onRowClick,
      onRowDblClick,
      onSave,
      onDelete,
      searchOptions,
      className,
    } = props;
    
    const dxGridRef = useRef<any>(null);

    const {
      dxColumns,
      dxDataSource,
      dxState,
      handleSelectionChanged,
      handleRowClick,
      handleRowUpdated,
    } = useDxGrid(props);

  const searchState = useAtomValue(searchAtom || atom({ search: {} }));
  const [sortColumns, setSortColumns] = useState<GridSortColumn[]>([]);

  // Synchroniser avec DevExtreme
  const dxFilterValue = useMemo(() =>
      DxAdapter.convertAxelorSearchToDxFilter(searchState.search, fields, view.items),
    [searchState.search, fields, view.items]
  );

  // Gestionnaire pour les changements de tri
  const handleSortingChanged = useCallback((e: any) => {
    const newSortColumns = e.component.option('sortByGroupSummaryInfo') || [];
    setSortColumns(newSortColumns);

    if (onSearch) {
      const sortBy = getSortBy(newSortColumns);
      onSearch({ sortBy, offset: 0 });
    }
  }, [onSearch]);  

  return (
    <div className={styles.dxGridContainer}>
      <DevExtremeDataGrid
        ref={(ref) => {
          dxGridRef.current = ref?.instance;
        }}
        dataSource={dxDataSource}
        keyExpr="id"
        showBorders={true}
        showRowLines={true}
        showColumnLines={true}
        rowAlternationEnabled={true}
        hoverStateEnabled={true}
        onSelectionChanged={handleSelectionChanged}
        onRowClick={handleRowClick}
        onRowDblClick={onRowDblClick}
        onRowUpdated={handleRowUpdated}
        className={styles.dxGrid}
        onInitialized={(e) => {
          console.log('⚡ DevExpress initialized!', Date.now());
        }}
        onContentReady={(e) => {
          console.log('✅ DevExpress content ready!', e.component.totalCount());
        }}
      >
        {/* Sélection */}
        <DxSelection
          mode="multiple"
          showCheckBoxesMode="always"
        />

        {/* Pagination */}
        <DxPaging
          enabled={true}
          pageSize={20}
          showPageSizeSelector={true}
          allowedPageSizes={[10, 20, 50, 100]}
        />

        {/* Filtres */}
        <DxFilterRow visible={true} />
        <DxHeaderFilter visible={true} />

        {/* Édition */}
        {editable && (
          <DxEditing
            mode="row"
            allowUpdating={true}
            allowAdding={true}
            allowDeleting={true}
          />
        )}

        {/* Colonnes */}
        {dxColumns.map(column => (
          <DxColumn key={column.dataField} {...column} />
        ))}
      </DevExtremeDataGrid>
    </div>
  );
});