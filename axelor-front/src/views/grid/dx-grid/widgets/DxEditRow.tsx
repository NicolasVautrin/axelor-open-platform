import React, { useRef, useEffect, useMemo } from "react";
import { ScopeProvider } from "bunshi/react";
import { ClickAwayListener } from "@axelor/ui";
import type { GridView } from "@/services/client/meta.types";
import type { DataContext, DataRecord } from "@/services/client/data.types";
import { useFormHandlers } from "@/views/form/builder/form";
import { FormScope, ActionDataHandler } from "@/views/form/builder/scope";
import { useAsyncEffect } from "@/hooks/use-async-effect";
import { DxCell } from "./DxCell";
import { calculateFixedOffsets } from "./columnFixingUtils";

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
  /** Parent formAtom for O2M context (triggers onChange/onNew with correct context) */
  parentFormAtom?: any;
  /** Callback to notify parent when formAtom is ready */
  onFormAtomReady?: (formAtom: any) => void;
  /** Instance du DevExtreme DataGrid (pour synchronisation formAtom) */
  gridInstance?: any;
  /** Index de la ligne en édition (pour synchronisation formAtom) */
  rowIndex?: number;
}

/**
 * Composant d'édition de ligne pour DevExtreme Grid.
 *
 * Utilisé par dataRowRender quand la ligne est en mode édition.
 * Retourne <tr> avec des <td> pour satisfaire DevExtreme.
 * Utilise editCellRender de colProps pour rendre les widgets Axelor.
 */
export const DxEditRow = React.memo(function DxEditRow(props: DxEditRowProps) {
  const { rowData, rowKey, columns, columnPropsMap, view, fields, viewContext, onUpdate, onClickAway, parentFormAtom, onFormAtomReady, gridInstance, rowIndex } = props;

  // ✅ SOLUTION : Mémoriser rowData initial pour éviter de recréer formAtom
  // quand rowData change (à cause des modifications de cellule)
  const initialRowDataRef = useRef<DataRecord | null>(null);
  if (!initialRowDataRef.current) {
    initialRowDataRef.current = rowData;
  }

  const { formAtom, actionExecutor, actionHandler, recordHandler } = useFormHandlers(
    {
      view,
      fields,
      model: view.model,
    } as any,
    initialRowDataRef.current, // Toujours utiliser le rowData initial
    {
      parent: parentFormAtom,  // ← AJOUTER pour que le contexte ait _parent
    }
  );

  // Ref pour la ligne <tr> pour accéder aux inputs après le rendu
  const rowRef = useRef<HTMLTableRowElement>(null);

  // Notifier le parent que le formAtom est prêt (pour accès depuis le DataSource)
  useEffect(() => {
    onFormAtomReady?.(formAtom);
  }, [formAtom, onFormAtomReady]);

  // Exécuter les triggers O2M (onNew/onChange) comme le fait FormRenderer
  // ✅ Utiliser initialRowDataRef pour éviter les re-exécutions quand rowData change
  useAsyncEffect(async () => {
    const { onNew } = view;
    const initialRecord = initialRowDataRef.current;
    const isNew = (initialRecord?.id ?? 0) < 0 && !initialRecord?._dirty;
    const onNewAction = isNew && onNew;

    console.log('[DxEditRow] onNew check:', {
      rowKey,
      recordId: initialRecord?.id,
      isDirty: initialRecord?._dirty,
      isNew,
      willExecute: !!onNewAction,
    });

    // ✅ Exécuter seulement si isNew (pattern Axelor avec flag _dirty)
    if (onNewAction) {
      // ✅ CRITIQUE: Marquer _dirty AVANT l'exécution async pour éviter les doubles exécutions
      // Cela bloque les race conditions causées par React 18 StrictMode qui monte/démonte/remonte les composants
      if (initialRecord) {
        initialRecord._dirty = true;
        console.log('[DxEditRow] Marked record as _dirty BEFORE execution:', initialRecord?.id);
      }
      console.log('[DxEditRow] Executing onNew for record:', initialRecord?.id);
      await actionExecutor.execute(onNewAction);
      console.log('[DxEditRow] onNew execution completed for record:', initialRecord?.id);
    }
  }, [view, actionExecutor, rowKey]);

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

  // Calculer les offsets pour les colonnes fixées (pour position: sticky)
  const { leftOffsets, rightOffsets } = useMemo(
    () => calculateFixedOffsets(columns),
    [columns]
  );

  // Construire le contenu de la ligne (tr) avec les cellules
  // Si onClickAway est défini, wrapper le <tr> avec ClickAwayListener
  const rowContent = onClickAway ? (
    <ClickAwayListener onClickAway={onClickAway}>
      <tr ref={rowRef} className="dx-row dx-data-row dx-row-lines">
        {columns.map((col: any, index: number) => {
          const key = col.dataField || `col_${index}`;
          const leftOffset = leftOffsets.get(col.dataField || col.name || col.caption);
          const rightOffset = rightOffsets.get(col.dataField || col.name || col.caption);

          // Colonnes sans dataField (système) → cellule vide
          if (!col.dataField) {
            return (
              <DxCell key={key} col={col} leftOffset={leftOffset} rightOffset={rightOffset}>
                {/* Cellule vide */}
              </DxCell>
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
              // ✅ Passer gridInstance et rowIndex pour synchronisation DevExtreme
              gridInstance: gridInstance,
              dxRowIndex: rowIndex,  // Utiliser dxRowIndex pour éviter conflit avec rowIndex (index colonne)
            };

            // Utiliser editCellRender en priorité, sinon cellRender (fallback)
            const renderedCell = colProps.editCellRender
              ? colProps.editCellRender(cellData)
              : colProps.cellRender(cellData);

            return (
              <DxCell key={key} col={col} leftOffset={leftOffset} rightOffset={rightOffset}>
                {renderedCell}
              </DxCell>
            );
          }

          // Sinon, afficher la valeur brute (fallback)
          return (
            <DxCell key={key} col={col} leftOffset={leftOffset} rightOffset={rightOffset}>
              {rowData[col.dataField]}
            </DxCell>
          );
        })}
      </tr>
    </ClickAwayListener>
  ) : (
    <tr ref={rowRef} className="dx-row dx-data-row dx-row-lines">
      {columns.map((col: any, index: number) => {
        const key = col.dataField || `col_${index}`;
        const leftOffset = leftOffsets.get(col.dataField || col.name || col.caption);
        const rightOffset = rightOffsets.get(col.dataField || col.name || col.caption);

        // Colonnes sans dataField (système) → cellule vide
        if (!col.dataField) {
          return (
            <DxCell key={key} col={col} leftOffset={leftOffset} rightOffset={rightOffset}>
              {/* Cellule vide */}
            </DxCell>
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
            // ✅ Passer gridInstance et rowIndex pour synchronisation DevExtreme
            gridInstance: gridInstance,
            dxRowIndex: rowIndex,  // Utiliser dxRowIndex pour éviter conflit avec rowIndex (index colonne)
          };

          // Utiliser editCellRender en priorité, sinon cellRender (fallback)
          const renderedCell = colProps.editCellRender
            ? colProps.editCellRender(cellData)
            : colProps.cellRender(cellData);

          return (
            <DxCell key={key} col={col} leftOffset={leftOffset} rightOffset={rightOffset}>
              {renderedCell}
            </DxCell>
          );
        }

        // Sinon, afficher la valeur brute (fallback)
        return (
          <DxCell key={key} col={col} leftOffset={leftOffset} rightOffset={rightOffset}>
            {rowData[col.dataField]}
          </DxCell>
        );
      })}
    </tr>
  );

  // Wrapper le contenu dans ScopeProvider pour injecter le bon actionExecutor
  // Cela permet à FormWidget d'utiliser l'actionExecutor de la grid row au lieu de celui du parent form
  return (
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
    prev.onClickAway === next.onClickAway &&
    prev.parentFormAtom === next.parentFormAtom &&
    prev.onFormAtomReady === next.onFormAtomReady
  );

  return isEqual;
});