import React, { useCallback, useMemo } from 'react';
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

interface DxDataGridProps {
  view: GridView;
  records: DataRecord[];
  fields: Record<string, Field>;
  editable?: boolean;
  onSelectionChanged?: (selectedRows: any[]) => void;
  onRowClick?: (e: any) => void;
  onRowDblClick?: (e: any) => void;
  onSave?: (record: DataRecord) => Promise<DataRecord | null>;
  onDelete?: (records: DataRecord[]) => Promise<void>;
  // ... autres props Axelor
}

export function DxDataGrid({
                             view,
                             records,
                             fields,
                             editable = false,
                             onSelectionChanged,
                             onRowClick,
                             onRowDblClick,
                             onSave,
                             onDelete,
                           }: DxDataGridProps) {

  const {
    dxColumns,
    dxDataSource,
    dxState,
    handleSelectionChanged,
    handleRowClick,
    handleRowUpdated,
  } = useDxGrid({
    view,
    records,
    fields,
    onSelectionChanged,
    onRowClick,
    onSave,
  });

  console.log('🚀 DxDataGrid rendered!', { view: view.name, recordsCount: records.length });

  const dxToolbarItems = useMemo(() => [
    {
      location: 'before',
      template: 'newButton'
    },
    {
      location: 'before',
      template: 'editButton'
    },
    {
      location: 'before',
      template: 'deleteButton'
    },
    'searchPanel',
    'columnChooserButton',
  ], []);

  return (
    <div className={styles.dxGridContainer}>
      <DevExtremeDataGrid
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

        {/* Barre d'outils */}
        <DxToolbar>
          {dxToolbarItems.map((item, index) => (
            <DxItem key={index} {...item} />
          ))}
        </DxToolbar>

        {/* Colonnes */}
        {dxColumns.map(column => (
          <DxColumn key={column.dataField} {...column} />
        ))}
      </DevExtremeDataGrid>
    </div>
  );
}