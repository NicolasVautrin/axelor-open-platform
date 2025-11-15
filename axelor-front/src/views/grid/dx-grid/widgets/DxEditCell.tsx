import React, { useMemo, useEffect, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { selectAtom } from "jotai/utils";
import { FormWidget } from "@/views/form/builder";
import { useFieldSchema } from "./useFieldSchema";
import { useGridInstance } from "@/views/grid/builder/scope";
import type { Field, GridView } from "@/services/client/meta.types";
import type { DataRecord, DataContext } from "@/services/client/data.types";

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
    const setFormAtom = useSetAtom(formAtom);

    // Écouter les changements de la valeur dans le formAtom
    const fieldValue = useAtomValue(
      useMemo(
        () => selectAtom(formAtom, (state) => state.record[field.name]),
        [formAtom, field.name]
      )
    );

    // Utiliser des refs pour éviter la boucle infinie causée par cellData qui change de référence
    const setValueRef = useRef(cellData.setValue);
    const currentValueRef = useRef(cellData.value);

    // Garder les refs à jour
    setValueRef.current = cellData.setValue;
    currentValueRef.current = cellData.value;

    // Récupérer gridInstance via Context pour notifier DevExtreme des changements
    const gridInstance = useGridInstance();

    // Propager les changements vers DevExtreme
    useEffect(() => {
      // Mode 1: editCellRender (utilise setValue si disponible)
      if (setValueRef.current && fieldValue !== currentValueRef.current) {
        setValueRef.current(fieldValue);
        return;
      }

      // Mode 2: dataRowRender (utilise cellValue pour notifier DevExtreme)
      if (gridInstance && fieldValue !== currentValueRef.current) {
        const rowIndex = gridInstance.getRowIndexByKey(rowKey);
        if (rowIndex >= 0) {
          console.log('[DxEditCell] Notifying DevExtreme of change via cellValue()', {
            field: field.name,
            rowIndex,
            rowKey,
            oldValue: currentValueRef.current,
            newValue: fieldValue,
          });
          gridInstance.cellValue(rowIndex, field.name, fieldValue);
        }
      }
    }, [fieldValue, gridInstance, rowKey, field.name]);

    // Trigger onChange : exécuter l'action quand la valeur change
    const prevFieldValueRef = useRef(fieldValue);

    useEffect(() => {
      // Détecter le changement de valeur (pas le premier render)
      if (prevFieldValueRef.current !== undefined && prevFieldValueRef.current !== fieldValue) {
        console.log('[DxEditCell] Value changed:', {
          field: field.name,
          oldValue: prevFieldValueRef.current,
          newValue: fieldValue,
          hasOnChange: !!schema.onChange,
          onChange: schema.onChange
        });

        // Vérifier si le field a un trigger onChange
        if (schema.onChange) {
          console.log('[DxEditCell] Executing onChange trigger:', schema.onChange);
          console.log('[DxEditCell] Context (cellData.data):', cellData.data);
          console.log('[DxEditCell] formAtom record:', formAtom);

          // Exécuter l'action onChange
          actionExecutor.execute(schema.onChange, {
            context: cellData.data, // Record complet de la ligne
          }).then((actionResult) => {
            console.log('[DxEditCell] onChange action result:', actionResult);

            // Traiter la réponse de l'action
            if (actionResult) {
              // 1. Si l'action retourne des valeurs à mettre à jour (setValue)
              if (actionResult.values) {
                console.log('[DxEditCell] Updating formAtom with values:', actionResult.values);
                setFormAtom((prev) => ({
                  ...prev,
                  record: { ...prev.record, ...actionResult.values }
                }));
              }

              // 2. Les messages flash (setFlash) sont gérés automatiquement par actionExecutor

              // 3. Les erreurs (setError) sont gérées automatiquement par actionExecutor

              // 4. Les attrs (setAttrs) pour modifier readonly/hidden/etc. sont gérés par actionExecutor
            }
          }).catch((error) => {
            console.error('[DxEditCell] Error executing onChange trigger:', error);
          });
        }
      }
      prevFieldValueRef.current = fieldValue;
    }, [fieldValue, schema.onChange, actionExecutor, cellData.data, setFormAtom]);

    // 4. Rendre FormWidget avec le widget approprié
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