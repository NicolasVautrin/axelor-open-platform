import React, { useMemo, useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { selectAtom } from "jotai/utils";
import { FormWidget } from "@/views/form/builder";
import { useFormHandlers } from "@/views/form/builder/form";
import { useFieldSchema } from "./useFieldSchema";
import { useDxEditCellCache } from "./DxEditCellContext";
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
    const cache = useDxEditCellCache();

    // 1. Créer formAtom, actionHandler, actionExecutor, recordHandler
    // via useFormHandlers() (comme FormRenderer ligne 336-343)
    // IMPORTANT : Utiliser le cache pour éviter de recréer le formAtom à chaque render
    const rowKey = cellData.key; // DevExtreme fournit la clé de la ligne
    let cachedFormAtom = cache.get(rowKey);

    const formHandlers = useFormHandlers(
      {
        view,
        fields: allFields,
        model: view.model,
      } as any,
      cellData.data, // Record de la ligne
      {
        context: viewContext,
      }
    );

    // Si pas de cache, créer et sauvegarder le formAtom
    if (!cachedFormAtom) {
      cachedFormAtom = formHandlers.formAtom;
      cache.set(rowKey, cachedFormAtom);
    }

    // Utiliser le formAtom caché (stable) au lieu de celui créé à chaque render
    const formAtom = cachedFormAtom;
    const { actionHandler, actionExecutor, recordHandler } = formHandlers;

    // 2. Convertir Field → Schema via processView() (comme Form.tsx ligne 163)
    const schema = useFieldSchema(field, fieldMeta, allFields);

    // 3. SPÉCIFICITÉ DX: Synchroniser formAtom.record[field.name] → cellData.setValue()
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

    // Propager les changements vers DevExtreme (ne dépend que de fieldValue)
    useEffect(() => {
      // Seulement si la valeur a changé (éviter les boucles infinies)
      if (fieldValue !== currentValueRef.current) {
        setValueRef.current(fieldValue);
      }
    }, [fieldValue]);

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
    return (
      prev.cellData.value === next.cellData.value &&
      prev.field === next.field &&
      prev.fieldMeta === next.fieldMeta &&
      prev.view === next.view
    );
  }
);