import React, { useMemo } from "react";
import { Cell } from "@/views/grid/renderers/cell/cell";
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
  /** Action executor */
  actionExecutor?: any;
  /** Index de la cellule */
  index?: number;
  /** Callback de mise à jour */
  onUpdate?: (record: any) => Promise<any>;
}

/**
 * Composant d'affichage de cellule en mode lecture pour DevExtreme Grid.
 *
 * Utilise le composant Cell d'Axelor pour l'affichage (même composant que les grilles standard).
 * Cela garantit l'alignement automatique selon le type (nombres à droite, texte à gauche, etc.)
 *
 * Cell attend un GridColumn (alias de Field) avec les propriétés nécessaires pour
 * déterminer le widget à utiliser : widget, type, serverType, selectionList, etc.
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
 *   actionExecutor={actionExecutor}
 *   index={idx}
 *   onUpdate={onUpdate}
 * />
 */
export const DxDisplayCell = React.memo(
  function DxDisplayCell(props: DxDisplayCellProps) {
    const { cellData, field, fieldMeta, view, viewContext, actionExecutor, index, onUpdate } = props;

    // Enrichir le field avec TOUTES les métadonnées nécessaires depuis fieldMeta
    // Cell (via getWidget) a besoin de: widget, type, serverType
    // Les widgets individuels ont besoin de: selectionList, target, targetName, etc.
    // IMPORTANT: Merger d'abord field puis fieldMeta pour ajouter les métadonnées sans écraser les props XML
    const enrichedField = useMemo(() => {
      const result = {
        ...field,      // Props de la vue XML en premier
        ...fieldMeta,  // Ajouter toutes les métadonnées du serveur
      };

      return result;
    }, [field, fieldMeta]);
    
    // Utiliser Cell d'Axelor pour l'affichage (comme dans les grilles Axelor standard)
    // Cell gère automatiquement l'alignement selon le type de données
    return (
      <Cell
        view={view}
        viewContext={viewContext}
        data={enrichedField as any}
        index={index || 0}
        value={cellData.value}
        rawValue={cellData.value}
        record={cellData.data}
        actionExecutor={actionExecutor}
        onUpdate={onUpdate}
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