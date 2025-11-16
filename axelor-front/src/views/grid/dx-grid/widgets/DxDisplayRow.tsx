import React, { useMemo } from "react";
import { Cell } from "@/views/grid/renderers/cell/cell";
import { DxDisplayCell } from "./DxDisplayCell";
import type { GridView } from "@/services/client/meta.types";
import { getDxCellValue, getGridInstance } from "../dx-grid-utils";
import { DxCell } from "./DxCell";
import { calculateFixedOffsets } from "./columnFixingUtils";

interface DxDisplayRowProps {
  /** Données de la ligne (rowInfo.row) */
  row: any;
  /** Colonnes DevExtreme (rowInfo.columns) */
  columns: any[];
  /** Map des props de colonnes indexée par dataField pour lookup O(1) */
  columnPropsMap: Map<string, any>;
  /** Vue de la grille */
  view: GridView;
  /** Fields metadata */
  fields: Record<string, any>;
  /** View context */
  viewContext?: any;
  /** Action executor */
  actionExecutor?: any;
  /** Update handler */
  onUpdate?: (record: any) => Promise<any>;
  /** Cell click handler (pour gérer l'édition) */
  onCellClick?: (e: any) => void;
  /** DataGrid ref (pour construire l'objet event) */
  dataGridRef?: React.RefObject<any>;
}

/**
 * Composant d'affichage de ligne pour DevExtreme Grid.
 *
 * Utilisé par dataRowComponent quand la ligne n'est pas en mode édition.
 * Retourne <tr> avec des <td> pour satisfaire DevExtreme.
 */
export const DxDisplayRow = React.memo(function DxDisplayRow(props: DxDisplayRowProps) {
  const { row, columns, columnPropsMap, view, fields, viewContext, actionExecutor, onUpdate, onCellClick, dataGridRef } = props;

  // Helper pour créer le handler de clic pour une cellule
  const createCellClickHandler = (col: any, columnIndex: number) => {
    if (!onCellClick || !dataGridRef) return undefined;

    return (e: React.MouseEvent) => {
      // Récupérer l'instance du grid
      const gridInstance = getGridInstance(dataGridRef);

      // Construire l'objet event comme DevExtreme le fait pour onCellClick
      const cellClickEvent = {
        rowType: 'data',
        key: row.key,
        data: row.data,
        column: col,
        columnIndex: columnIndex,
        component: gridInstance,
        event: e.nativeEvent,
      };

      // Appeler le handler
      onCellClick(cellClickEvent);
    };
  };

  // Calculer les offsets pour les colonnes fixées (pour position: sticky)
  const { leftOffsets, rightOffsets } = useMemo(
    () => calculateFixedOffsets(columns),
    [columns]
  );

  return (
    <tr className="dx-row dx-data-row dx-row-lines">
      {columns.map((col: any, index: number) => {
        const key = col.dataField || `col_${index}`;
        const leftOffset = leftOffsets.get(col.dataField || col.name || col.caption);
        const rightOffset = rightOffsets.get(col.dataField || col.name || col.caption);

        // Lookup O(1) dans la Map des props de colonnes
        const colProps = col.dataField ? columnPropsMap.get(col.dataField) : undefined;

        // Colonnes sans dataField (système) → cellule vide
        if (!col.dataField) {
          return (
            <DxCell key={key} col={col} leftOffset={leftOffset} rightOffset={rightOffset}>
              {/* Cellule vide */}
            </DxCell>
          );
        }

        // Si la colonne a un cellRender MAIS PAS de field/fieldMeta (cas des colonnes $$select et $$edit)
        // appeler le cellRender avec les données de la cellule
        if (colProps?.cellRender && !colProps?.field && !colProps?.fieldMeta) {
          const cellData = {
            data: row.data,
            value: row.data?.[col.dataField],
            displayValue: row.data?.[col.dataField],
            row: row,
            column: col,
            rowIndex: index,
          };

          const renderedCell = colProps.cellRender(cellData);

          return (
            <DxCell key={key} col={col} leftOffset={leftOffset} rightOffset={rightOffset}>
              {renderedCell}
            </DxCell>
          );
        }

        // Extraire la valeur d'affichage avec getDxCellValue (gère M2O, collections, etc.)
        // C'est exactement ce que fait calculateCellValue dans useDxColumns
        const displayValue = colProps?.field && colProps?.fieldMeta
          ? getDxCellValue(row.data, colProps.field, colProps.fieldMeta)
          : row.data?.[col.dataField];

        // Construire cellData comme DevExtreme le fait
        const cellData = {
          data: row.data,
          value: displayValue,  // Utiliser la valeur formatée
          displayValue: displayValue,
        };

        // CAS 1 : Bouton → utiliser Cell avec col.button (comme StandardColumn.tsx ligne 69-83)
        if (colProps?.isButton && colProps.button) {
          return (
            <DxCell key={key} col={col} leftOffset={leftOffset} rightOffset={rightOffset}>
              <Cell
                view={view}
                viewContext={viewContext}
                data={colProps.button}
                index={index}
                value={cellData.value}
                rawValue={cellData.value}
                record={cellData.data}
                actionExecutor={actionExecutor}
                onUpdate={onUpdate}
              />
            </DxCell>
          );
        }

        // CAS 2 : Colonne de données normale → utiliser DxDisplayCell (comme StandardColumn.tsx ligne 55-68)
        if (colProps?.field && colProps?.fieldMeta) {
          const clickHandler = createCellClickHandler(col, index);

          return (
            <DxCell
              key={key}
              col={col}
              leftOffset={leftOffset}
              rightOffset={rightOffset}
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                cursor: col.allowEditing ? "pointer" : "default",
              }}
            >
              <div onClick={clickHandler}>
                <DxDisplayCell
                  cellData={cellData}
                  field={colProps.field}
                  fieldMeta={colProps.fieldMeta}
                  allFields={fields}
                  view={view}
                  viewContext={viewContext}
                  actionExecutor={actionExecutor}
                  index={index}
                  onUpdate={onUpdate}
                />
              </div>
            </DxCell>
          );
        }

        // CAS 3 : Colonne sans metadata → cellule vide (comme StandardColumn.tsx ligne 84 : undefined)
        return (
          <DxCell key={key} col={col} leftOffset={leftOffset} rightOffset={rightOffset}>
            {/* Cellule vide */}
          </DxCell>
        );
      })}
    </tr>
  );
}, (prev, next) => {
  // Comparaison custom pour éviter re-renders inutiles
  return (
    prev.row === next.row &&
    prev.columns === next.columns &&
    prev.columnPropsMap === next.columnPropsMap &&
    prev.view === next.view &&
    prev.fields === next.fields &&
    prev.viewContext === next.viewContext &&
    prev.actionExecutor === next.actionExecutor &&
    prev.onUpdate === next.onUpdate &&
    prev.onCellClick === next.onCellClick &&
    prev.dataGridRef === next.dataGridRef
  );
});