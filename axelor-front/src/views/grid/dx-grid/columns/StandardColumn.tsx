import React from "react";
import type { GridView } from "@/services/client/meta.types";
import { Cell } from "@/views/grid/renderers/cell/cell";
import { DxEditCell } from "../widgets/DxEditCell";
import { DxDisplayCell } from "../widgets/DxDisplayCell";

interface StandardColumnProps {
  col: any;
  idx: number;
  view: GridView;
  viewContext: any;
  actionExecutor: any;
  onUpdate: (record: any) => Promise<any>;
  allFields: Record<string, any>;
  onCellClick?: (e: any) => void;
}

/**
 * Génère les props pour une colonne standard DevExtreme
 *
 * Gère le rendu des colonnes de données normales (fields) et des colonnes boutons (buttons)
 * - Mode affichage : Utilise le composant Cell d'Axelor
 * - Mode édition : Utilise DxEditCell avec FormWidget d'Axelor
 */
export function getStandardColumnProps({
  col,
  idx,
  view,
  viewContext,
  actionExecutor,
  onUpdate,
  allFields,
  onCellClick
}: StandardColumnProps) {
  return {
    dataField: col.dataField,
    caption: col.caption,
    width: col.width,
    minWidth: col.minWidth,
    visible: col.visible,
    alignment: col.alignment,
    allowSorting: col.allowSorting,
    allowFiltering: col.allowFiltering,
    allowGrouping: col.allowGrouping,
    allowHiding: col.allowHiding,
    allowReordering: col.allowReordering,
    allowEditing: col.allowEditing, // Utiliser la valeur calculée par useDxColumns
    dataType: col.dataType,
    groupIndex: col.groupIndex,
    showWhenGrouped: col.showWhenGrouped, // Garder la colonne visible même quand elle est groupée
    lookup: col.lookup,
    calculateCellValue: col.calculateCellValue,
    customizeText: col.customizeText,
    // Mode affichage : Utiliser FormWidget readonly via DxDisplayCell
    cellRender: !col.isButton && col.field && col.fieldMeta ? (cellData: any) => {
      const handleClick = (e: React.MouseEvent) => {
        console.log('[StandardColumn] handleClick called for dataField:', col.dataField, 'key:', cellData.key);
        if (onCellClick) {
          onCellClick({
            rowType: cellData.rowType,
            key: cellData.key,
            column: {
              dataField: col.dataField,
              allowEditing: col.allowEditing
            },
            columnIndex: cellData.columnIndex,
            component: cellData.component
          });
        }
      };

      return (
        <div onClick={handleClick} style={{ width: '100%', height: '100%' }}>
          <div style={{ pointerEvents: 'none', width: '100%', height: '100%' }}>
            <DxDisplayCell
              cellData={cellData}
              field={col.field}
              fieldMeta={col.fieldMeta}
              allFields={allFields}
              view={view}
              viewContext={viewContext}
            />
          </div>
        </div>
      );
    } : col.isButton ? (cellData: any) => {
      // Boutons : utiliser Cell avec col.button
      return (
        <Cell
          view={view}
          viewContext={viewContext}
          data={col.button}
          index={idx}
          value={cellData.value}
          rawValue={cellData.value}
          record={cellData.data}
          actionExecutor={actionExecutor}
          onUpdate={onUpdate}
        />
      );
    } : undefined,

    // Mode édition : Utiliser les widgets Axelor via DxEditCell
    editCellRender: !col.isButton && col.field && col.fieldMeta ? (cellData: any) => {
      return (
        <DxEditCell
          cellData={cellData}
          field={col.field}
          fieldMeta={col.fieldMeta}
          allFields={allFields}
          view={view}
          viewContext={viewContext}
        />
      );
    } : undefined,
  };
}
