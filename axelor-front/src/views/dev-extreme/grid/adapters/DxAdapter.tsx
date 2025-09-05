import { GridView, Field } from '@/services/client/meta.types';
import { DataRecord } from '@/services/client/data.types';
import format from "@/utils/format";
import { DxColumnConfig, DxDataSourceConfig,DxCellInfo } from '../types/DxGridTypes';

export class DxAdapter {

  static convertColumns(view: GridView, fields: Record<string, Field>): DxColumnConfig[] {
    if (!view.items?.length) {
      return [];
    }

    return view.items
      .filter(item => item.name && !item.hidden) // Filtrer les colonnes valides
      .map((item, index): DxColumnConfig => {
        const field = fields[item.name!];

        return {
          // Propriétés obligatoires
          dataField: item.name!, // Assertion car filtré au-dessus
          caption: item.title || field?.title || item.name || `Column ${index + 1}`,
          dataType: this.getDxDataType(field),

          // Propriétés optionnelles avec types corrects
          width: item.width ? this.parseWidth(item.width) : undefined,
          visible: true, // Déjà filtré par !item.hidden
          allowSorting: this.isColumnSortable(item, field),
          allowFiltering: this.isColumnFilterable(item, field),
          allowEditing: this.isColumnEditable(item, field),

          // Formatage avec type correct
          customizeText: (cellInfo: DxCellInfo) =>
            this.formatCellValue(cellInfo.value, field),

          // Propriétés par défaut pour DevExpress
          allowResizing: true,
          allowReordering: true,

          // Référence Axelor pour debug/intégration
          axelorField: field,
          axelorWidget: item.widget,
          axelorAttrs: item.widgetAttrs,
        } satisfies DxColumnConfig; // Vérification de type à la compilation
      }) || [];
  }

// Méthodes helper avec types corrects
  private static parseWidth(width: string): number | undefined {
    const parsed = parseInt(width, 10);
    return isNaN(parsed) ? undefined : Math.max(50, parsed);
  }

  private static isColumnSortable(item: any, field?: Field): boolean {
    if (item.sortable !== undefined) {
      return Boolean(item.sortable);
    }

    if (field) {
      const nonSortableTypes = ['BINARY', 'TEXT', 'JSON'];
      return !nonSortableTypes.includes(field.type);
    }

    return true;
  }

  private static isColumnFilterable(item: any, field?: Field): boolean {
    if (item.filterable !== undefined) {
      return Boolean(item.filterable);
    }

    if (field) {
      const nonFilterableTypes = ['BINARY', 'PASSWORD'];
      return !nonFilterableTypes.includes(field.type);
    }

    return true;
  }

  private static getDisplayValue(value: any, field?: Field): string {
    if (!value || typeof value !== 'object') {
      return String(value || '');
    }

    // ✅ Utiliser targetName des métadonnées Axelor !
    const displayField = field?.targetName || 'name';
    return value[displayField] || String(value.id || '');
  }

  private static isColumnEditable(item: any, field?: Field): boolean {
    return !(item.readonly === true || field?.readonly === true);
  }

  private static formatCellValue(value: any, field?: Field): string {
    try {
      if (value === null || value === undefined) {
        return '';
      }

      // ✅ Gestion des objets complexes (relations)
      if (value && typeof value === 'object' && field?.targetName) {
        return value[field.targetName] || String(value.id || '');
      }

      // Formatage basique par type
      switch (field?.type) {
        case 'DECIMAL':
          return typeof value === 'number'
            ? value.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })
            : String(value);

        case 'INTEGER':
        case 'LONG':
          return typeof value === 'number'
            ? value.toLocaleString()
            : String(value);

        case 'DATE':
          return value instanceof Date
            ? value.toLocaleDateString()
            : new Date(value).toLocaleDateString();

        case 'DATETIME':
          return value instanceof Date
            ? value.toLocaleString()
            : new Date(value).toLocaleString();

        case 'BOOLEAN':
          return value ? 'Yes' : 'No';

        default:
          return String(value);
      }
    } catch (error) {
      console.warn('Error formatting cell value:', error);
      return String(value || '');
    }
  }

  private static getDxDataType(field?: Field): DxColumnConfig['dataType'] {
    if (!field) return 'string';

    switch (field.type) {
      case 'INTEGER':
      case 'LONG':
      case 'DECIMAL':
        return 'number';
      case 'BOOLEAN':
        return 'boolean';
      case 'DATE':
      case 'DATETIME':
        return 'date';
      case 'ONE_TO_MANY':
      case 'MANY_TO_ONE':
      case 'MANY_TO_MANY':
        return 'object';
      default:
        return 'string';
    }
  }


  static convertDataSource(records: DataRecord[]) {
    return records || [];
  }

  static createInitialState(view: GridView) {
    return {
      selectedRowKeys: [],
      focusedRowKey: null,
      // ... autres états
    };
  }

  private static formatCellValue(value: any, field?: Field): string {
    // Utiliser les formatters Axelor existants
    return format(value, { props: field });
  }
}