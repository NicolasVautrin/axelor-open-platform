import { GridView, Field } from '@/services/client/meta.types';
import { DataRecord } from '@/services/client/data.types';
import format from "@/utils/format";
import { DxColumnConfig, DxDataSourceConfig,DxCellInfo } from '../types/DxGridTypes';
import {SearchState} from "@/views/grid/renderers/search";

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

  static convertAxelorSearchToDxFilter(
    searchState: Record<string, string> = {},
    fields: Record<string, Field>,
    viewItems: GridView["items"] = []
  ): any {
    if (!searchState || Object.keys(searchState).length === 0) {
      return null;
    }

    const filters: any[] = [];

    Object.entries(searchState).forEach(([fieldName, value]) => {
      if (!value || value.trim() === '') return;

      const field = fields[fieldName];
      const dxFilter = this.convertAxelorFieldSearchToDx(fieldName, value.trim(), field);
      if (dxFilter) {
        filters.push(dxFilter);
      }
    });

    if (filters.length === 0) return null;
    if (filters.length === 1) return filters[0];

    // Combiner plusieurs filtres avec AND
    return filters.reduce((acc, filter) => {
      if (!acc) return filter;
      if (Array.isArray(acc) && acc[0] === 'and') {
        return [...acc, filter];
      }
      return ['and', acc, filter];
    });
  }

  static convertDxFilterToAxelorSearch(
    dxFilter: any,
    fields: Record<string, Field>,
    viewItems: GridView["items"]
  ): SearchState {
    if (!dxFilter) return {};

    const searchState: SearchState = {};

    // Convertir récursivement les filtres DevExtreme
    const convertFilter = (filter: any): void => {
      if (Array.isArray(filter)) {
        const [fieldName, operator, value] = filter;

        if (fieldName && typeof fieldName === 'string') {
          // Convertir la valeur selon le type de champ
          const field = fields[fieldName];
          searchState[fieldName] = this.convertFilterValue(value, operator, field);
        }
      } else if (filter && typeof filter === 'object') {
        // Traiter les filtres complexes (AND, OR)
        if (filter.operator === 'and' || filter.operator === 'or') {
          filter.criteria?.forEach((subFilter: any) => {
            convertFilter(subFilter);
          });
        }
      }
    };

    convertFilter(dxFilter);
    return searchState;
  }

  /**
   * Mappe les opérateurs Axelor vers DevExtreme
   */
  private static mapAxelorOperatorToDx(axelorOp: string): string {
    const mapping: Record<string, string> = {
      '=': '=',
      '!=': '<>',
      '>': '>',
      '>=': '>=',
      '<': '<',
      '<=': '<='
    };
    return mapping[axelorOp] || 'contains';
  }

  /**
   * Détermine l'opérateur par défaut selon le type de champ
   */
  private static getDefaultOperatorForField(field?: Field): string {
    if (!field) return 'contains';

    switch (field.type) {
      case 'INTEGER':
      case 'LONG':
      case 'DECIMAL':
      case 'DATE':
      case 'DATETIME':
        return '=';
      case 'BOOLEAN':
        return '=';
      case 'ENUM':
        return '=';
      default:
        return 'contains'; // Pour STRING et autres
    }
  }

  private static convertAxelorFieldSearchToDx(
    fieldName: string,
    value: string,
    field?: Field
  ): any {
    if (!value) return null;

    // Gestion des plages (between) : format Axelor "<max<min"
    const betweenMatch = value.match(/^<(.+)<(.+)$/);
    if (betweenMatch) {
      const [, max, min] = betweenMatch;
      const convertedMin = this.convertValueByFieldType(min, field);
      const convertedMax = this.convertValueByFieldType(max, field);
      return [fieldName, 'between', [convertedMin, convertedMax]];
    }

    // Gestion des opérateurs : >=, <=, >, <, !=, =
    const operatorMatch = value.match(/^(>=|<=|>|<|!=|=)(.+)$/);
    if (operatorMatch) {
      const [, operator, val] = operatorMatch;
      const dxOperator = this.mapAxelorOperatorToDx(operator);
      const convertedValue = this.convertValueByFieldType(val, field);
      return [fieldName, dxOperator, convertedValue];
    }

    // Gestion spéciale pour les champs relationnels (many-to-one)
    if (field?.type === 'MANY_TO_ONE') {
      // Recherche sur le champ d'affichage (targetName)
      const targetField = `${fieldName}.${field.targetName || 'name'}`;
      return [targetField, 'contains', value];
    }

    // Gestion des sélections multiples avec " | "
    if (value.includes(' | ')) {
      const values = value.split(' | ').filter(v => v.trim());
      if (values.length > 1) {
        const orFilters = values.map(v => [fieldName, 'contains', v.trim()]);
        return ['or', ...orFilters];
      } else if (values.length === 1) {
        // Un seul élément après split, traiter normalement
        return [fieldName, 'contains', values[0]];
      }
    }

    // Recherche textuelle simple (LIKE/contains par défaut)
    return [fieldName, this.getDefaultOperatorForField(field), value];
  }

  private static convertValueByFieldType(value: string, field?: Field): any {
    if (!field || !value) return value;

    try {
      switch (field.type) {
        case 'INTEGER':
        case 'LONG':
          const intVal = parseInt(value, 10);
          return isNaN(intVal) ? 0 : intVal;

        case 'DECIMAL':
          const floatVal = parseFloat(value);
          return isNaN(floatVal) ? 0 : floatVal;

        case 'BOOLEAN':
          return /^(true|1|yes|y|oui)$/i.test(value);

        case 'DATE':
          // Format Axelor : YYYY-MM-DD
          if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return new Date(value + 'T00:00:00');
          }
          return new Date(value);

        case 'DATETIME':
          return new Date(value);

        case 'ENUM':
          return value; // Garder tel quel

        default:
          return value;
      }
    } catch (error) {
      console.warn(`Erreur conversion valeur "${value}" pour champ ${field.name}:`, error);
      return value;
    }
  }

  private static convertFilterValue(value: any, operator: string, field?: Field): string {
    if (!value) return '';

    // Adapter selon l'opérateur DevExtreme vers format Axelor
    switch (operator) {
      case 'contains':
        return String(value);
      case 'startswith':
        return String(value);
      case '=':
        return `=${value}`;
      case '<>':
        return `!=${value}`;
      case '<':
        return `<${value}`;
      case '<=':
        return `<=${value}`;
      case '>':
        return `>${value}`;
      case '>=':
        return `>=${value}`;
      case 'between':
        return `<${value[1]}<${value[0]}`;
      default:
        return String(value);
    }
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