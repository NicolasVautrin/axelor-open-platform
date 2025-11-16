import React, { useMemo } from "react";
import { Box } from "@axelor/ui";
import { Cell } from "@/views/grid/renderers/cell/cell";
import type { Field, GridView } from "@/services/client/meta.types";
import type { DataContext } from "@/services/client/data.types";
import { getWidget } from "@/views/grid/builder/utils";
import styles from "@/views/grid/grid.module.scss";

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

    // Construire le GridColumn exactement comme Axelor le fait dans builder/grid.tsx (lignes 319-330)
    // L'ordre de merge est crucial : field (serveur) puis item (XML) puis widget calculé
    const enrichedField = useMemo(() => {
      // Calculer le widget avec la même logique qu'Axelor
      const widget = getWidget(field, fieldMeta);

      // Merger dans le même ordre qu'Axelor : field (serveur) -> item (XML) -> widget calculé
      const result = {
        ...fieldMeta,  // Métadonnées du serveur en premier
        ...field,      // Props de la vue XML écrasent le serveur
        ...(widget && { widget }),  // Widget calculé en dernier
      };

      return result;
    }, [field, fieldMeta]);

    // Récupérer la rawValue (objet pour M2O, valeur brute pour les autres)
    const rawValue = useMemo(() => {
      // Pour les champs pointés (ex: "user.name"), prendre la partie avant le point
      const fieldName = field.name.includes('.') ? field.name.split('.')[0] : field.name;

      // Pour les M2O, récupérer l'objet depuis cellData.data
      const isM2O = enrichedField.serverType === 'MANY_TO_ONE' || enrichedField.serverType === 'ONE_TO_ONE';
      if (isM2O && !field.name.includes('.')) {
        return cellData.data[fieldName] || null;
      }

      // Pour les autres champs, utiliser cellData.value
      return cellData.value;
    }, [cellData.value, cellData.data, field.name, enrichedField.serverType]);

    // Formater la valeur comme Axelor le fait (grid-body-row.tsx lignes 66-68)
    const formattedValue = useMemo(() => {
      // Si c'est un champ selection, formater la valeur en cherchant dans selectionList
      if (enrichedField.widget === 'selection' && enrichedField.selectionList) {
        const selection = enrichedField.selectionList.find(
          (s: any) => String(s.value) === String(rawValue)
        );
        return selection ? selection.title : rawValue;
      }

      // Pour les M2O, la valeur affichée est cellData.value (déjà formaté par DevExtreme)
      const isM2O = enrichedField.serverType === 'MANY_TO_ONE' || enrichedField.serverType === 'ONE_TO_ONE';
      if (isM2O) {
        return cellData.value;
      }

      // Sinon retourner la valeur brute
      return rawValue;
    }, [rawValue, cellData.value, enrichedField.widget, enrichedField.selectionList, enrichedField.serverType]);

    // Construire les props GridCellProps exactement comme Axelor
    // Cell utilise (cell.tsx lignes 19-22):
    // - view, viewContext, data, value, record (GridCellProps)
    // - children, style, className, onClick (React.HTMLAttributes)
    // - actionExecutor, onUpdate (custom props)
    // - rawValue, index (GridColumnProps)
    const cellProps = {
      // GridCellProps de base
      view,
      viewContext,
      data: enrichedField as any,
      value: formattedValue,  // ✅ Valeur formatée (string)
      rawValue,  // ✅ Valeur brute (objet pour M2O, valeur simple pour les autres)
      record: cellData.data,
      index: index || 0,

      // Props additionnels
      actionExecutor,
      onUpdate,

      // CRITICAL: children comme fallback (grid-body-row.tsx ligne 130)
      // Cell ligne 70 : return children
      children: formattedValue,  // ✅ Utiliser la valeur formatée
    };

    // Détecter si c'est un champ numérique (comme grid.tsx lignes 299-305)
    // Exclure les selections et ratings même s'ils ont un serverType numérique
    const isNumeric = ["DECIMAL", "INTEGER", "LONG"].includes(enrichedField.serverType ?? "")
      && !(enrichedField.selection || enrichedField.widget === "rating");

    // Si numérique, wrapper Cell dans une Box avec la classe .number (comme GridColumn)
    if (isNumeric) {
      return (
        <Box className={styles.number} d="flex" style={{ width: "100%", height: "100%" }}>
          <Cell {...cellProps} />
        </Box>
      );
    }

    return <Cell {...cellProps} />;
  },
  // Comparaison custom pour éviter re-renders inutiles
  (prev, next) => {
    return (
      prev.cellData.value === next.cellData.value &&
      prev.cellData.data === next.cellData.data &&
      prev.field === next.field &&
      prev.fieldMeta === next.fieldMeta &&
      prev.view === next.view &&
      prev.actionExecutor === next.actionExecutor &&
      prev.onUpdate === next.onUpdate
    );
  }
);