import React, { useMemo } from "react";
import { FormWidget } from "@/views/form/builder";
import { useFormHandlers } from "@/views/form/builder/form";
import { useFieldSchema } from "./useFieldSchema";
import { useDxEditCellCache } from "./DxEditCellContext";
import type { Field, GridView } from "@/services/client/meta.types";
import type { DataContext } from "@/services/client/data.types";

interface DxDisplayCellProps {
  /** Données DevExtreme (row, column, value) */
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
 * Composant d'affichage de cellule en mode lecture pour DevExtreme Grid.
 *
 * Utilise FormWidget en readonly pour afficher les valeurs formatées comme Axelor.
 * Réutilise le même cache de formAtom que DxEditCell pour éviter les re-renders.
 *
 * @example
 * // Dans StandardColumn.tsx cellRender
 * <DxDisplayCell
 *   cellData={cellData}
 *   field={col.field}
 *   fieldMeta={col.fieldMeta}
 *   allFields={fields}
 *   view={view}
 *   viewContext={viewContext}
 * />
 */
export const DxDisplayCell = React.memo(
  function DxDisplayCell(props: DxDisplayCellProps) {
    const { cellData, field, fieldMeta, allFields, view, viewContext } = props;
    const cache = useDxEditCellCache();

    // Utiliser le même cache que DxEditCell pour réutiliser le formAtom
    const rowKey = cellData.key;
    let cachedFormAtom = cache.get(rowKey);

    const formHandlers = useFormHandlers(
      {
        view,
        fields: allFields,
        model: view.model,
      } as any,
      cellData.data,
      {
        context: viewContext,
      }
    );

    // Si pas de cache, créer et sauvegarder le formAtom
    if (!cachedFormAtom) {
      cachedFormAtom = formHandlers.formAtom;
      cache.set(rowKey, cachedFormAtom);
    }

    const formAtom = cachedFormAtom;

    // Convertir Field → Schema via processView()
    // Le schema inclut automatiquement showTitle: false pour les cellules de grille
    const schema = useFieldSchema(field, fieldMeta, allFields);

    // Rendre FormWidget en mode readonly
    return (
      <FormWidget
        schema={schema}
        formAtom={formAtom}
        readonly={true}
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