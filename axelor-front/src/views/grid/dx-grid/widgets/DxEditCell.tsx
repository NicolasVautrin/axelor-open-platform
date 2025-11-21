import React, { useMemo, useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { selectAtom } from "jotai/utils";
import { FormWidget } from "@/views/form/builder";
import { useFieldSchema } from "./useFieldSchema";
import type { Field, GridView } from "@/services/client/meta.types";
import type { DataRecord, DataContext } from "@/services/client/data.types";
import type { FormState } from "@/views/form/builder/types";

interface DxEditCellProps {
  /** Données DevExtreme (row, column, value, setValue) */
  cellData: any;
  /** Définition du champ depuis la vue XML */
  field: Field;
  /** Métadonnées du champ depuis le serveur */
  fieldMeta: any;
  /** Tous les fields metadata (pour processView) */
  allFields: Record<string, any>;
  /** Vue de la grille */
  view: GridView;
  /** Contexte de la vue */
  viewContext?: DataContext;
}

/**
 * Composant d'édition de cellule pour DevExtreme Grid utilisant les widgets Axelor.
 *
 * Gère les spécificités DevExtreme :
 * 1. Crée un formAtom via useFormHandlers() (comme FormRenderer)
 * 2. Convertit Field → Schema via useFieldSchema() (utilise processView)
 * 3. Synchronise formAtom.record[field.name] → cellData.setValue()
 * 4. Rend FormWidget avec le bon widget (String, ManyToOne, etc.)
 *
 * DevExtreme gère déjà :
 * - Lifecycle (Enter/Escape/Tab/ClickOutside)
 * - Sauvegarde (CustomStore.update)
 * - Annulation (cancelEditData)
 * - Navigation (editNextCell)
 *
 * @example
 * // Dans StandardColumn.tsx editCellRender
 * <DxEditCell
 *   cellData={cellData}
 *   field={col.field}
 *   fieldMeta={col.fieldMeta}
 *   allFields={fields}
 *   view={view}
 *   viewContext={viewContext}
 * />
 */
export const DxEditCell = React.memo(
  function DxEditCell(props: DxEditCellProps) {
    const { cellData, field, fieldMeta, allFields, view, viewContext } = props;

    // Récupérer le formAtom et actionExecutor passés via cellData par DxEditRow
    const formAtom = cellData.formAtom;
    const actionExecutor = cellData.actionExecutor;
    const rowKey = cellData.key;

    // Si pas de formAtom, on ne peut pas rendre (fallback)
    if (!formAtom) {
      console.warn('[DxEditCell] No formAtom found for row:', rowKey);
      // Fallback : afficher le displayValue en lecture seule
      return <div>{cellData.displayValue || cellData.value}</div>;
    }

    // 2. Convertir Field → Schema via processView() (comme Form.tsx ligne 163)
    const schema = useFieldSchema(field, fieldMeta, allFields);

    // 3. SPÉCIFICITÉ DX: Synchroniser formAtom.record[field.name] → cellData.setValue()
    // Écouter les changements de la valeur dans le formAtom
    const fieldValue = useAtomValue(
      useMemo(
        () => selectAtom(formAtom, (state: FormState) => state.record[field.name]),
        [formAtom, field.name]
      )
    );

    // DEBUG: Logger TOUS les changements du record complet
    const fullRecord = useAtomValue(
      useMemo(
        () => selectAtom(formAtom, (state: FormState) => state.record),
        [formAtom]
      )
    );
    useEffect(() => {
      console.log('[DxEditCell] Full record changed:', {
        fieldName: field.name,
        fullRecord,
        fieldValue: fullRecord[field.name],
      });
    }, [fullRecord, field.name]);

    // Récupérer gridInstance et dxRowIndex depuis cellData
    const gridInstance = cellData.gridInstance;
    const dxRowIndex = cellData.dxRowIndex;

    // Utiliser des refs pour éviter la boucle infinie causée par cellData qui change de référence
    const currentValueRef = useRef(cellData.value);
    const gridInstanceRef = useRef(gridInstance);
    const dxRowIndexRef = useRef(dxRowIndex);

    // Garder gridInstanceRef et dxRowIndexRef à jour
    gridInstanceRef.current = gridInstance;
    dxRowIndexRef.current = dxRowIndex;

    // Propager les changements vers DevExtreme via gridInstance.cellValue()
    useEffect(() => {
      console.log('[DxEditCell] useEffect triggered:', {
        fieldName: field.name,
        fieldValue,
        currentValue: currentValueRef.current,
        areEqual: fieldValue === currentValueRef.current,
        strictEqual: fieldValue !== currentValueRef.current,
        hasGridInstance: !!gridInstanceRef.current,
        dxRowIndex: dxRowIndexRef.current,
      });

      if (gridInstanceRef.current && dxRowIndexRef.current !== undefined && fieldValue !== currentValueRef.current) {
        console.log('[DxEditCell] Propagating value change to DevExtreme:', {
          fieldName: field.name,
          oldValue: currentValueRef.current,
          newValue: fieldValue,
          dxRowIndex: dxRowIndexRef.current,
        });

        try {
          // ✅ Utiliser gridInstance.cellValue() pour mettre à jour DevExtreme
          gridInstanceRef.current.cellValue(dxRowIndexRef.current, field.name, fieldValue);
          // ✅ Mettre à jour currentValueRef APRÈS avoir propagé la valeur
          currentValueRef.current = fieldValue;
        } catch (error) {
          console.error('[DxEditCell] Error setting cell value:', error);
        }
      }
    }, [fieldValue, field.name]);

    // NOTE: Le trigger onChange est maintenant géré automatiquement par le système Axelor standard (valueAtom)
    // grâce au ScopeProvider dans DxEditRow qui injecte le bon actionExecutor.
    // Pas besoin de dupliquer le code ici !

    // Rendre FormWidget avec le widget approprié
    // FormWidget détermine automatiquement le widget via useWidget():
    // - inGridEditor ? TextEdit : Text
    // - widget override ? Selection : serverType
    // - WIDGETS[name] || WIDGETS[type]
    return (
      <FormWidget
        schema={schema}
        formAtom={formAtom}
        readonly={false}
      />
    );
  },
  // Comparaison custom pour éviter re-renders inutiles
  (prev, next) => {
    const isEqual = (
      prev.cellData.value === next.cellData.value &&
      prev.cellData.formAtom === next.cellData.formAtom &&
      prev.cellData.actionExecutor === next.cellData.actionExecutor &&
      prev.field === next.field &&
      prev.fieldMeta === next.fieldMeta &&
      prev.view === next.view
    );

    if (!isEqual) {
      console.log('[DxEditCell] Props changed, re-rendering:', {
        field: prev.field.name,
        valueChanged: prev.cellData.value !== next.cellData.value,
        formAtomChanged: prev.cellData.formAtom !== next.cellData.formAtom,
        actionExecutorChanged: prev.cellData.actionExecutor !== next.cellData.actionExecutor,
        fieldChanged: prev.field !== next.field,
        fieldMetaChanged: prev.fieldMeta !== next.fieldMeta,
        viewChanged: prev.view !== next.view,
      });
    }

    return isEqual;
  }
);