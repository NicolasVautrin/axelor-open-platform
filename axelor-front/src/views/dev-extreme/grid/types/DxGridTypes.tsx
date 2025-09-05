// src/views/grid/dx/types/DxGridTypes.ts
export interface DxColumnConfig {
  // Propriétés obligatoires
  dataField: string;
  caption: string;
  dataType: 'string' | 'number' | 'date' | 'boolean' | 'object';

  // TOUTES les autres propriétés doivent être optionnelles
  width?: number;
  visible?: boolean;
  allowSorting?: boolean;
  allowFiltering?: boolean;
  allowEditing?: boolean;
  allowResizing?: boolean;
  allowReordering?: boolean;
  customizeText?: (cellInfo: DxCellInfo) => string;

  // Propriétés Axelor - optionnelles
  axelorField?: any;
  axelorWidget?: string;
  axelorAttrs?: Record<string, any>;
}

export interface DxCellInfo {
  value: any;
  data?: any;
  column?: DxColumnConfig;
  // autres propriétés optionnelles
}

export interface DxDataSourceConfig {
  store: {
    type: 'array';
    data: any[];
    key: string;
  };
  paginate: boolean;
}

export interface DxGridState {
  selectedRowKeys: any[];
  focusedRowKey: any;
}