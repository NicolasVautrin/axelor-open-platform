import React, { useRef, useEffect } from "react";
import { ScopeProvider } from "bunshi/react";
import { ClickAwayListener } from "@axelor/ui";
import type { GridView } from "@/services/client/meta.types";
import type { DataContext, DataRecord } from "@/services/client/data.types";
import { useFormHandlers } from "@/views/form/builder/form";
import { FormScope, ActionDataHandler } from "@/views/form/builder/scope";

interface DxEditRowProps {
  /** Données de la ligne (row.data) */
  rowData: DataRecord;
  /** Clé de la ligne (row.key) */
  rowKey: any;
  /** Colonnes DevExtreme */
  columns: any[];
  /** Map des props de colonnes indexée par dataField pour lookup O(1) */
  columnPropsMap: Map<string, any>;
  /** Vue de la grille */
  view: GridView;
  /** Fields metadata */
  fields: Record<string, any>;
  /** Contexte de la vue */
  viewContext?: DataContext;
  /** Update handler */
  onUpdate?: (record: any) => Promise<any>;
  /** Handler pour clic en dehors de la ligne (auto-save) */
  onClickAway?: (event: Event) => void | Promise<void>;
}

/**
 * Composant d'édition de ligne pour DevExtreme Grid.
 *
 * Utilisé par dataRowRender quand la ligne est en mode édition.
 * Retourne <tr> avec des <td> pour satisfaire DevExtreme.
 * Utilise editCellRender de colProps pour rendre les widgets Axelor.
 */
export const DxEditRow = React.memo(function DxEditRow(props: DxEditRowProps) {
  const { rowData, rowKey, columns, columnPropsMap, view, fields, viewContext, onUpdate, onClickAway } = props;

  // ✅ SOLUTION : Mémoriser rowData initial pour éviter de recréer formAtom
  // quand rowData change (à cause des modifications de cellule)
  const initialRowDataRef = useRef(rowData);
  if (!initialRowDataRef.current) {
    initialRowDataRef.current = rowData;
  }

  console.log('[DxEditRow] Rendering row', rowKey, 'with rowData:', rowData);

  const { formAtom, actionExecutor, actionHandler, recordHandler } = useFormHandlers(
    {
      view,
      fields,
      model: view.model,
    } as any,
    initialRowDataRef.current, // Toujours utiliser le rowData initial
    {
      // Ne pas passer de context pour éviter la propagation au parent
    }
  );

  // Ref pour la ligne <tr> pour accéder aux inputs après le rendu
  const rowRef = useRef<HTMLTableRowElement>(null);

  // Fix Tab navigation : définir tabIndex={-1} sur les inputs readonly
  // pour que le browser les saute lors de la navigation Tab
  useEffect(() => {
    if (rowRef.current) {
      const readonlyInputs = rowRef.current.querySelectorAll('input[readonly]');
      readonlyInputs.forEach((input) => {
        (input as HTMLInputElement).tabIndex = -1;
      });
    }
  }, [rowKey]); // Re-run quand la ligne change

  // Construire le contenu de la ligne (tr) avec les cellules
  const rowContent = (
    <tr ref={rowRef} className="dx-row dx-data-row dx-row-lines">
      {columns.map((col: any, index: number) => {
        // Colonnes sans dataField (système) → cellule vide
        if (!col.dataField) {
          return (
            <td
              key={`col_${index}`}
              className="dx-cell"
              style={{
                width: col.width || "auto",
                minWidth: col.minWidth || "50px",
                maxWidth: col.width || "none",
                padding: "4px 8px",
                overflow: "hidden",
              }}
            />
          );
        }

        // Lookup O(1) dans la Map des props de colonnes
        const colProps = columnPropsMap.get(col.dataField);

        // Si la colonne a un editCellRender ou cellRender, l'utiliser
        // editCellRender en priorité, puis cellRender (fallback pour colonnes sans rendu spécial en édition)
        if (colProps?.editCellRender || colProps?.cellRender) {
          const cellData = {
            data: rowData,
            value: rowData?.[col.dataField],
            displayValue: rowData?.[col.dataField],
            row: { data: rowData, key: rowKey },
            column: col,
            rowIndex: index,
            key: rowKey,
            // IMPORTANT: Passer formAtom et actionExecutor via cellData
            formAtom: formAtom,
            actionExecutor: actionExecutor,
          };

          // Utiliser editCellRender en priorité, sinon cellRender (fallback)
          const renderedCell = colProps.editCellRender
            ? colProps.editCellRender(cellData)
            : colProps.cellRender(cellData);

          return (
            <td
              key={col.dataField || index}
              className="dx-cell"
              style={{
                width: col.width || "auto",
                minWidth: col.minWidth || "50px",
                maxWidth: col.width || "none",
                padding: "4px 8px",
                overflow: "hidden",
              }}
            >
              {renderedCell}
            </td>
          );
        }

        // Sinon, afficher la valeur brute (fallback)
        return (
          <td
            key={col.dataField || index}
            className="dx-cell"
            style={{
              width: col.width || "auto",
              minWidth: col.minWidth || "50px",
              maxWidth: col.width || "none",
              padding: "4px 8px",
              overflow: "hidden",
            }}
          >
            {rowData[col.dataField]}
          </td>
        );
      })}
    </tr>
  );

  // Wrapper le contenu dans ScopeProvider pour injecter le bon actionExecutor
  // Cela permet à FormWidget d'utiliser l'actionExecutor de la grid row au lieu de celui du parent form
  const wrappedContent = (
    <ScopeProvider
      scope={FormScope}
      value={{
        formAtom,
        actionExecutor,
        actionHandler,
        recordHandler,
      }}
    >
      {/* ActionDataHandler gère l'application des valeurs/attrs retournées par les actions */}
      <ActionDataHandler formAtom={formAtom} />
      {rowContent}
    </ScopeProvider>
  );

  // Si onClickAway est défini, utiliser ClickAwayListener (comme Axelor grid)
  // ClickAwayListener gère automatiquement le timing et évite de capturer le clic initial
  return onClickAway ? (
    <ClickAwayListener onClickAway={onClickAway}>
      {wrappedContent}
    </ClickAwayListener>
  ) : wrappedContent;
}, (prev, next) => {
  // Comparaison custom pour éviter re-renders inutiles
  // IMPORTANT : On ignore les changements de rowData pendant l'édition
  // car le formAtom (créé par useFormHandlers) est la source de vérité, pas rowData.
  // Cela évite de démonter/remonter le ClickAwayListener à chaque changement de valeur,
  // ce qui causait des auto-save intempestifs lors de la fermeture des dropdowns.
  const isEqual = (
    prev.rowKey === next.rowKey &&
    // prev.rowData === next.rowData &&  // ❌ IGNORÉ pendant l'édition
    prev.columns === next.columns &&
    prev.columnPropsMap === next.columnPropsMap &&
    prev.view === next.view &&
    prev.fields === next.fields &&
    prev.viewContext === next.viewContext &&
    prev.onUpdate === next.onUpdate &&
    prev.onClickAway === next.onClickAway
  );

  if (!isEqual) {
    console.log('[DxEditRow] Props changed, re-rendering:', {
      rowKey: prev.rowKey,
      rowKeyChanged: prev.rowKey !== next.rowKey,
      // rowDataChanged: prev.rowData !== next.rowData,  // IGNORÉ
      columnsChanged: prev.columns !== next.columns,
      columnPropsMapChanged: prev.columnPropsMap !== next.columnPropsMap,
      viewChanged: prev.view !== next.view,
      fieldsChanged: prev.fields !== next.fields,
      viewContextChanged: prev.viewContext !== next.viewContext,
      onUpdateChanged: prev.onUpdate !== next.onUpdate,
      onClickAwayChanged: prev.onClickAway !== next.onClickAway,
    });
  }

  return isEqual;
});