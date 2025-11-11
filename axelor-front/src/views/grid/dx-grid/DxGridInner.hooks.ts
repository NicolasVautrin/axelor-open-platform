import { useMemo, useCallback, useRef } from "react";
import type { Field, GridView } from "@/services/client/meta.types";
import type { DataRecord } from "@/services/client/data.types";
import {
  getDxCellValue,
  formatDxCellValue,
  getEffectiveWidget,
  mapAxelorTypeToDevExtreme as mapTypeToDevExtreme,
  getGridInstance,
  isNewRecord,
} from "./dx-grid-utils";
import { convertDxFilterToAxelor } from "./dx-filter-converter";
import { dxLog } from "@/utils/dev-tools";

interface UseDxColumnsParams {
  view: GridView;
  fields: Record<string, any>;
  groupByFields: string[];
  gridStateColumns?: any[];
}

/**
 * Custom hook pour mapper les colonnes Axelor vers DevExtreme
 */
export function useDxColumns({ view, fields, groupByFields, gridStateColumns = [] }: UseDxColumnsParams) {
  return useMemo(() => {
    // Créer une map pour une recherche rapide des propriétés de colonne dans gridState
    const gridStateColumnMap = new Map();
    gridStateColumns.forEach(col => {
      if (col.name) {
        gridStateColumnMap.set(col.name, col);
      }
    });

    return (view.items || [])
      .filter((item): item is Field => "name" in item && item.name !== undefined)
      .map((field, index) => {
        // Récupérer les propriétés sauvegardées dans gridState, sinon utiliser celles de view.items
        const savedColumnState = gridStateColumnMap.get(field.name);

        // Si c'est un button field, retourner une configuration de colonne button
        if (field.widget === "button") {
          // Utiliser la largeur sauvegardée, sinon celle définie dans le XML, sinon 40 par défaut
          const buttonWidth = savedColumnState?.width ? parseInt(String(savedColumnState.width)) : (field.width ? parseInt(String(field.width)) : 40);
          return {
            isButton: true,
            button: field,
            // Utiliser dataField avec un préfixe spécial pour les buttons
            dataField: `$button_${field.name || field.title || index}`,
            caption: "", // Pas d'en-tête pour les buttons
            width: buttonWidth,
            minWidth: buttonWidth,
            maxWidth: buttonWidth,
            visible: savedColumnState?.visible !== undefined ? savedColumnState.visible : !field.hidden,
            visibleIndex: savedColumnState?.visibleIndex !== undefined ? savedColumnState.visibleIndex : index,
            allowSorting: false,
            allowFiltering: false,
            allowGrouping: false,
            allowHiding: false,
            allowReordering: true,
            alignment: "center", // Centrer le contenu
            calculateCellValue: () => true, // Retourner true pour que la colonne existe
          };
        }

        // Sinon, c'est un field normal
        // Pour les champs pointés (ex: "user.name"), prendre la partie avant le point
        const fieldName = field.name.includes('.') ? field.name.split('.')[0] : field.name;
        const fieldMeta = fields[fieldName];
        const widget = getEffectiveWidget(field, fieldMeta);
        const dataType = mapTypeToDevExtreme(widget, fieldMeta);

        // Déterminer groupIndex (préférer l'état sauvegardé, puis view.groupBy)
        let groupIndex = savedColumnState?.groupIndex !== undefined
          ? savedColumnState.groupIndex
          : groupByFields.indexOf(field.name);
        if (groupIndex < 0) groupIndex = undefined; // S'assurer que c'est undefined si non groupé

        // Pour les sélections : préparer le lookup avec toutes les valeurs possibles
        let lookup = undefined;
        if (fieldMeta?.selectionList && Array.isArray(fieldMeta.selectionList)) {
          lookup = {
            dataSource: fieldMeta.selectionList.map((item: any) => ({
              value: parseInt(item.value, 10), // Convertir en nombre
              text: item.title || item.data?.title || String(item.value),
            })),
            valueExpr: "value",
            displayExpr: "text",
          };
        }

        // Pour les colonnes normales, utiliser la largeur sauvegardée en priorité
        const columnWidth = savedColumnState?.width ? parseInt(String(savedColumnState.width)) : (field.width ? parseInt(String(field.width)) : undefined);
        const columnMinWidth = 100; // COLUMN_MIN_WIDTH par défaut comme Axelor

        const allowEditing = !field.readonly && !fieldMeta?.readonly;

        return {
          isButton: false,
          field,
          fieldMeta,
          dataField: field.name,
          caption: field.title || fieldMeta?.title || field.name,
          width: columnWidth,
          minWidth: columnMinWidth,
          visible: savedColumnState?.visible !== undefined ? savedColumnState.visible : !field.hidden,
          visibleIndex: savedColumnState?.visibleIndex !== undefined ? savedColumnState.visibleIndex : index,
          // UI de tri/filtre activée mais traitement server-side via Axelor
          allowSorting: field.sortable !== false,
          allowFiltering: true,
          // Éditable si ni field ni fieldMeta ne sont readonly
          allowEditing,
          dataType,
          widget,
          // Appliquer le groupIndex si nécessaire
          groupIndex: groupIndex,
          // Lookup pour les sélections
          lookup,
          // Fonction pour extraire la valeur (gère M2O avec targetName)
          calculateCellValue: (rowData: DataRecord) => {
            // Pour les colonnes avec lookup, retourner la valeur brute (pas la traduction)
            if (lookup) {
              return rowData[field.name];
            }
            return getDxCellValue(rowData, field, fieldMeta);
          },
          // Fonction pour formater la valeur
          customizeText: !lookup ? (cellInfo: any) => {
            if (cellInfo.value === null || cellInfo.value === undefined) {
              return "";
            }

            // Pour les M2O : la valeur est déjà formatée par calculateCellValue
            // (c'est le targetName en tant que string)
            const isM2O =
              fieldMeta?.type === "MANY_TO_ONE" ||
              fieldMeta?.type === "ONE_TO_ONE";

            if (isM2O && typeof cellInfo.value === "string") {
              return cellInfo.value;
            }

            return formatDxCellValue(cellInfo.value, field, fieldMeta, cellInfo.data);
          } : undefined,
        };
      });
  }, [view.items, fields, groupByFields, gridStateColumns]);
}

interface UseTriggerSearchParams {
  dataStore: any;
  fieldsToFetch: string[];
}

/**
 * Hook pour déclencher une recherche avec tri/filtre
 */
export function useTriggerSearch({ dataStore, fieldsToFetch }: UseTriggerSearchParams) {
  const isSearchingRef = useRef(false);

  return useCallback(async (options: {
    sortBy?: string[];
    filter?: any;
  }) => {
    if (isSearchingRef.current) {
      return;
    }

    try {
      isSearchingRef.current = true;

      const searchOptions: any = {
        ...dataStore.options,
        fields: fieldsToFetch,
      };

      // Appliquer le tri (y compris si vide pour effacer le tri)
      if (options.sortBy !== undefined) {
        searchOptions.sortBy = options.sortBy;
      }

      // Appliquer le filtre
      if (options.filter) {
        const axelorCriteria = convertDxFilterToAxelor(options.filter);
        if (axelorCriteria) {
          searchOptions.filter = {
            ...(searchOptions.filter || {}),
            ...axelorCriteria,
          };
        }
      }

      // Appeler le dataStore
      await dataStore.search(searchOptions);
    } catch (error) {
      console.error("[DxGridInner] Search error", error);
    } finally {
      isSearchingRef.current = false;
    }
  }, [dataStore, fieldsToFetch]);
}

interface UseHandleOptionChangedParams {
  setHasGrouping: React.Dispatch<React.SetStateAction<boolean>>;
  triggerSearch: (options: { sortBy?: string[]; filter?: any }) => Promise<void>;
  setGridState: (updater: (draft: any) => void) => void;
}

/**
 * Hook pour intercepter les changements d'options DevExtreme (tri, groupement, colonnes)
 */
export function useHandleOptionChanged({ setHasGrouping, triggerSearch, setGridState }: UseHandleOptionChangedParams) {
  return useCallback((e: any) => {
    // Logger TOUS les événements onOptionChanged pour debugging
    // dxLog("[useHandleOptionChanged] Event received:", {
    //   name: e.name,
    //   fullName: e.fullName,
    //   value: e.value,
    //   previousValue: e.previousValue,
    // });

    // Logger les changeTypes pour les événements columns (pour comprendre les reloads)
    // if (e.name === "columns" && e.component) {
    //   const columnsController = e.component.getController?.("columns");
    //   if (columnsController && columnsController._changeTypes) {
    //     dxLog("[useHandleOptionChanged] ⚠️ COLUMNS changeTypes:", columnsController._changeTypes);
    //   }
    // }

    // Détecter les changements de groupement
    if (e.name === "columns" && e.fullName?.includes("groupIndex")) {
      // Vérifier s'il y a des colonnes groupées
      const groupedColumns = e.component.getVisibleColumns()
        .filter((col: any) => col.groupIndex !== undefined);

      setHasGrouping(groupedColumns.length > 0);
    }

    // Détecter les changements de tri
    if (e.name === "columns" && e.fullName?.includes("sortOrder")) {
      // Récupérer les colonnes triées
      const sortedColumns = e.component.getVisibleColumns()
        .filter((col: any) => col.sortOrder)
        .sort((a: any, b: any) => (a.sortIndex || 0) - (b.sortIndex || 0));

      if (sortedColumns.length > 0) {
        const sortBy = sortedColumns.map((col: any) =>
          `${col.sortOrder === 'desc' ? '-' : ''}${col.dataField}`
        );

        // Transmettre le tri à Axelor
        triggerSearch({ sortBy });
      } else {
        // Aucun tri : effacer le tri en passant un tableau vide
        triggerSearch({ sortBy: [] });
      }
    }

    // Synchroniser l'état des colonnes DevExtreme avec gridState Axelor
    // Détecter les changements de colonnes (largeur, visibilité, ordre, groupIndex)
    if (e.name === "columns" || e.fullName?.includes("width") || e.fullName?.includes("visible") || e.fullName?.includes("visibleIndex") || e.fullName?.includes("groupIndex")) {
      const dxGridInstance = e.component;
      // getVisibleColumns() renvoie les colonnes dans leur ordre actuel et avec leur état visible
      const currentDxColumns = dxGridInstance.getVisibleColumns();

      const updatedColumns = currentDxColumns.map((dxCol: any) => {
        // Mapper les propriétés de colonne DevExtreme au format attendu par GridColumn Axelor
        // GridColumn attend width en number, pas en string
        return {
          name: dxCol.dataField,
          width: dxCol.width, // Garder en number comme attendu par GridColumn
          visible: dxCol.visible,
          computed: true, // Marquer comme "calculé" pour le système de sauvegarde Axelor
        };
      });

      setGridState((draft) => {
        const existingAxelorColumns = draft.columns || [];
        // Comparaison simplifiée pour éviter des mises à jour inutiles et des boucles infinies
        const hasChanges = updatedColumns.some((newCol: any, index: number) => {
          const oldCol = existingAxelorColumns[index];
          return !oldCol ||
                 oldCol.name !== newCol.name ||
                 oldCol.width !== newCol.width ||
                 oldCol.visible !== newCol.visible;
        });

        if (hasChanges) {
          draft.columns = updatedColumns;
        }
      });
    }
  }, [triggerSearch, setGridState, setHasGrouping]);
}

interface UseHandleEditingTabNavigationParams {
  dataGridRef: any;
}

/**
 * Hook pour gérer la navigation Tab/Shift+Tab dans une ligne en édition
 * Permet de boucler entre les colonnes éditables de la ligne courante
 */
export function useHandleEditingTabNavigation({ dataGridRef }: UseHandleEditingTabNavigationParams) {
  return useCallback((e: any) => {
    // Vérifier si c'est un événement Tab
    const isTabKey = e.event?.keyCode === 9 || e.event?.key === 'Tab';
    if (!isTabKey) return;

    dxLog("[DxGridInner] handleEditingTabNavigation - e.component available:", !!e.component);
    const gridInstance = e.component || getGridInstance(dataGridRef);
    if (!gridInstance) return;

    // Vérifier si on est en mode édition de ligne (API publique DevExtreme 25.1)
    const editRowKey = gridInstance.option('editing.editRowKey');
    if (editRowKey === undefined || editRowKey === null) {
      dxLog("[DxGridInner] No row in edit mode, ignoring Tab");
      return;
    }

    // Récupérer toutes les colonnes visibles et éditables
    const visibleColumns = e.columns || gridInstance.getVisibleColumns();
    if (!visibleColumns || !Array.isArray(visibleColumns)) {
      dxLog("[DxGridInner] No visible columns, ignoring Tab");
      return;
    }

    const editableColumns = visibleColumns.filter((col: any) =>
      col.allowEditing && col.visible && !col.dataField?.startsWith('$')
    );

    if (editableColumns.length === 0) {
      dxLog("[DxGridInner] No editable columns, ignoring Tab");
      return;
    }

    // Vérifier que prevColumnIndex est valide
    if (e.prevColumnIndex === undefined || e.prevColumnIndex === null || e.prevColumnIndex < 0 || e.prevColumnIndex >= visibleColumns.length) {
      dxLog("[DxGridInner] Invalid prevColumnIndex:", e.prevColumnIndex);
      return;
    }

    // Trouver l'index de la colonne actuelle parmi les colonnes éditables
    const currentColumn = visibleColumns[e.prevColumnIndex];
    if (!currentColumn) {
      dxLog("[DxGridInner] No current column at index:", e.prevColumnIndex);
      return;
    }

    const currentEditableIdx = editableColumns.findIndex(
      (col: any) => col.dataField === currentColumn.dataField
    );

    if (currentEditableIdx === -1) {
      dxLog("[DxGridInner] Current column is not editable:", currentColumn.dataField);
      return;
    }

    // Calculer la prochaine colonne éditable
    const isShiftPressed = e.event?.shiftKey;
    let nextEditableIdx;

    if (isShiftPressed) {
      // Shift+Tab : aller à la colonne éditable précédente
      nextEditableIdx = currentEditableIdx - 1;
      if (nextEditableIdx < 0) {
        // Boucler vers la dernière colonne éditable
        nextEditableIdx = editableColumns.length - 1;
      }
    } else {
      // Tab : aller à la colonne éditable suivante
      nextEditableIdx = currentEditableIdx + 1;
      if (nextEditableIdx >= editableColumns.length) {
        // Boucler vers la première colonne éditable
        nextEditableIdx = 0;
      }
    }

    const nextColumn = editableColumns[nextEditableIdx];

    if (!nextColumn) {
      dxLog("[DxGridInner] No next column at editableIdx:", nextEditableIdx);
      return;
    }

    if (nextColumn.visibleIndex === undefined || nextColumn.visibleIndex === null) {
      dxLog("[DxGridInner] Next column has no visibleIndex:", nextColumn.dataField);
      return;
    }

    dxLog("[DxGridInner] Tab navigation: from", currentColumn.dataField, "to", nextColumn.dataField);

    // Modifier les index pour naviguer vers la prochaine colonne éditable dans la MÊME ligne
    e.newRowIndex = e.prevRowIndex; // IMPORTANT: toujours rester dans la même ligne
    e.newColumnIndex = nextColumn.visibleIndex;
  }, [dataGridRef]);
}
