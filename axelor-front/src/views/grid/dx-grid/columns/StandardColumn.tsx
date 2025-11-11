import React from "react";
import type { GridView } from "@/services/client/meta.types";
import { Cell } from "@/views/grid/renderers/cell/cell";

interface StandardColumnProps {
  col: any;
  idx: number;
  view: GridView;
  viewContext: any;
  actionExecutor: any;
  onUpdate: (record: any) => Promise<any>;
}

/**
 * Génère les props pour une colonne standard DevExtreme
 *
 * Gère le rendu des colonnes de données normales (fields) et des colonnes boutons (buttons)
 * Utilise le composant Cell d'Axelor pour assurer la compatibilité avec tous les widgets
 */
export function getStandardColumnProps({
  col,
  idx,
  view,
  viewContext,
  actionExecutor,
  onUpdate
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
    lookup: col.lookup,
    calculateCellValue: col.calculateCellValue,
    customizeText: col.customizeText,
    // Utiliser Cell pour TOUTES les colonnes en mode affichage (comme Axelor)
    cellRender: !col.isButton ? (cellData: any) => {
      return (
        <Cell
          view={view}
          viewContext={viewContext}
          data={col.field}
          index={idx}
          value={cellData.value}
          rawValue={cellData.value}
          record={cellData.data}
          actionExecutor={actionExecutor}
          onUpdate={onUpdate}
        />
      );
    } : (cellData: any) => {
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
    },
    // TODO: Ajouter editCellRender avec FormWidget pour être iso Axelor (comme FormRenderer)
    // Pour l'instant, DevExtreme utilisera ses éditeurs natifs
  };
}
