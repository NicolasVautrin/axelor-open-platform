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
  saveEditingRowFormAtom,
} from "./dx-grid-utils";
import { convertDxFilterToAxelor } from "./dx-filter-converter";
import { getDefaultStore } from "jotai";
import { useGetErrors, showErrors } from "@/views/form/form";

interface UseDxColumnsParams {
  view: GridView;
  fields: Record<string, any>;
  groupByFields: string[];
  gridStateColumns?: any[];
  orderBy?: string; // ✅ FIX TRI: orderBy depuis view.orderBy pour configurer sortOrder/sortIndex
}

/**
 * Custom hook pour mapper les colonnes Axelor vers DevExtreme
 */
export function useDxColumns({ view, fields, groupByFields, gridStateColumns = [], orderBy }: UseDxColumnsParams) {
  return useMemo(() => {
    // Créer une map pour une recherche rapide des propriétés de colonne dans gridState
    const gridStateColumnMap = new Map();
    gridStateColumns.forEach(col => {
      if (col.name) {
        gridStateColumnMap.set(col.name, col);
      }
    });

    // ✅ FIX TRI: Parser orderBy pour configurer sortOrder/sortIndex sur les colonnes
    // Cela permet à DevExtreme de savoir comment trier les groupes
    const sortConfigMap = new Map<string, { sortIndex: number; sortOrder: 'asc' | 'desc' }>();
    if (orderBy) {
      orderBy.split(',').forEach((part, index) => {
        const trimmed = part.trim();
        if (trimmed) {
          const isDesc = trimmed.startsWith('-');
          const fieldName = isDesc ? trimmed.substring(1) : trimmed;
          sortConfigMap.set(fieldName, {
            sortIndex: index,
            sortOrder: isDesc ? 'desc' : 'asc',
          });
        }
      });
    }

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
        // Pour les champs pointés (ex: "user.name" ou "product.serviceType"), chercher d'abord avec le nom complet
        // puis fallback sur la première partie (comme Axelor grid.tsx:244)
        const fieldMeta = fields[field.name] || (field.name.includes('.') ? fields[field.name.split('.')[0]] : undefined);
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

        // Pour les colonnes normales, utiliser la largeur sauvegardée ou définie dans la vue
        // IMPORTANT: Toujours définir une largeur par défaut pour éviter les problèmes avec table-layout:fixed
        // quand le groupement est actif et tous les groupes sont collapsed (pas de data rows pour calculer les largeurs)
        const columnMinWidth = 100; // COLUMN_MIN_WIDTH par défaut comme Axelor
        const columnWidth = savedColumnState?.width ? parseInt(String(savedColumnState.width)) : (field.width ? parseInt(String(field.width)) : columnMinWidth);

        const allowEditing = !field.readonly && !fieldMeta?.readonly;

        // Déterminer l'alignement selon le type de données (comme Axelor)
        const alignment = dataType === 'number' ? 'right' : 'left';

        // ✅ FIX TRI: Récupérer sortOrder et sortIndex
        // Priorité: 1) gridState (tri utilisateur), 2) view.orderBy (tri initial)
        const sortConfig = sortConfigMap.get(field.name);
        // Utiliser le tri sauvegardé dans gridState s'il existe, sinon celui de view.orderBy
        const effectiveSortOrder = savedColumnState?.sortOrder ?? sortConfig?.sortOrder;
        const effectiveSortIndex = savedColumnState?.sortIndex ?? sortConfig?.sortIndex;

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
          // Alignement selon le type (nombres à droite, texte à gauche)
          alignment,
          // Appliquer le groupIndex si nécessaire
          groupIndex: groupIndex,
          // Garder la colonne visible à sa position originale quand elle est groupée
          showWhenGrouped: true,
          // Lookup pour les sélections
          lookup,
          // ✅ FIX TRI: sortOrder et sortIndex depuis gridState (utilisateur) ou view.orderBy (initial)
          // Permet de conserver le tri après reload()
          sortOrder: effectiveSortOrder,
          sortIndex: effectiveSortIndex,
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
  }, [view.items, fields, groupByFields, gridStateColumns, orderBy]);
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
      if (options.filter === null) {
        // Effacer explicitement le filtre (réinitialisation)
        // Le filtre est stocké dans dataStore.options.filter et persiste entre les recherches
        // On doit effacer à la fois searchOptions.filter ET dataStore.options.filter
        searchOptions.filter = undefined;
        if (dataStore.options?.filter) {
          dataStore.options.filter = undefined;
        }
      } else if (options.filter) {
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
  triggerSearch: (options: { sortBy?: string[]; filter?: any }) => Promise<void>;  // Gardé pour les filtres
  setGridState: (updater: (draft: any) => void) => void;
  currentSortByRef: React.MutableRefObject<string[] | undefined>;
  dxDataSource: any;
  onSyncColumnWidths?: (gridInstance: any) => void;  // Callback pour synchroniser headers→rowsview
}

/**
 * Hook pour intercepter les changements d'options DevExtreme (tri, groupement, colonnes)
 */
export function useHandleOptionChanged({ triggerSearch, setGridState, currentSortByRef, dxDataSource, onSyncColumnWidths }: UseHandleOptionChangedParams) {
  return useCallback((e: any) => {
    // FIX COLUMN RESIZE: Synchroniser les largeurs headers→rowsview après un resize
    // Quand une colonne est redimensionnée, DevExtreme met à jour les headers mais pas le rowsview
    // si on a du grouping (à cause de table-layout: fixed avec group rows)
    // Debounce pour éviter trop d'appels pendant le drag
    if (e.fullName?.includes("width") && onSyncColumnWidths) {
      // Annuler le précédent timeout s'il existe
      if ((window as any).__dxGridSyncTimeout) {
        clearTimeout((window as any).__dxGridSyncTimeout);
      }
      // Attendre 50ms après le dernier événement width avant de sync
      (window as any).__dxGridSyncTimeout = setTimeout(() => {
        onSyncColumnWidths(e.component);
      }, 50);
    }

    // Détecter les changements de groupement
    if (e.name === "columns" && e.fullName?.includes("groupIndex")) {
      // Forcer le recalcul des dimensions après le changement de groupement
      // pour que la scrollbar horizontale réapparaisse si nécessaire
      setTimeout(() => {
        e.component.updateDimensions?.();
      }, 100);
    }

    // Détecter les changements de tri
    // Debug: Filtrer les événements hover/focus qui sont trop fréquents
    if (!e.fullName?.includes('hover') && !e.fullName?.includes('focus') && !e.fullName?.includes('Hovered')) {
      console.log(`[OPTION-CHANGED] name=${e.name}, fullName=${e.fullName}, value=${e.value}`);
    }
    if (e.name === "columns" && e.fullName?.includes("sortOrder")) {
      console.log(`[SORT-CHANGE] Detected sortOrder change: ${e.fullName} = ${e.value}`);
      // Récupérer les colonnes triées (y compris les colonnes groupées - l'utilisateur peut vouloir trier par la colonne de groupement)
      const sortedColumns = e.component.getVisibleColumns()
        .filter((col: any) => col.sortOrder)
        .sort((a: any, b: any) => (a.sortIndex || 0) - (b.sortIndex || 0));

      // Dédupliquer par dataField (au cas où)
      const seenFields = new Set<string>();
      const uniqueSortBy: string[] = [];
      sortedColumns.forEach((col: any) => {
        if (col.dataField && !seenFields.has(col.dataField)) {
          seenFields.add(col.dataField);
          uniqueSortBy.push(`${col.sortOrder === 'desc' ? '-' : ''}${col.dataField}`);
        }
      });

      if (uniqueSortBy.length > 0) {
        // Mettre à jour la ref (lue par CustomStore.load()) puis recharger
        currentSortByRef.current = uniqueSortBy;
        dxDataSource?.reload();
      } else {
        // Aucun tri : effacer le tri
        currentSortByRef.current = undefined;
        dxDataSource?.reload();
      }
    }

    // Détecter les changements de filtre (y compris réinitialisation via "Réinitialiser")
    if (e.name === "columns" && e.fullName?.includes("filterValue")) {
      // Si le filtre est réinitialisé (value = null), forcer un rechargement sans filtre
      if (e.value === null || e.value === undefined || e.value === "") {
        triggerSearch({ filter: null });
      }
    }

    // Synchroniser l'état des colonnes DevExtreme avec gridState Axelor
    // Détecter les changements de colonnes (largeur, visibilité, ordre, groupIndex, sortOrder)
    if (e.name === "columns" || e.fullName?.includes("width") || e.fullName?.includes("visible") || e.fullName?.includes("visibleIndex") || e.fullName?.includes("groupIndex") || e.fullName?.includes("sortOrder") || e.fullName?.includes("sortIndex")) {
      const dxGridInstance = e.component;
      // getVisibleColumns() renvoie les colonnes dans leur ordre actuel et avec leur état visible
      const currentDxColumns = dxGridInstance.getVisibleColumns();

      const updatedColumns = currentDxColumns
        // Filtrer les colonnes système (checkbox, edit-icon, buttons) qui ne doivent pas être sauvegardées
        .filter((dxCol: any) => {
          // Ignorer les colonnes sans dataField ou avec dataField commençant par $ (système)
          return dxCol.dataField && !dxCol.dataField.startsWith('$');
        })
        .map((dxCol: any) => {
          // Mapper les propriétés de colonne DevExtreme au format attendu par GridColumn Axelor
          // GridColumn attend width en number, pas en string
          // Valider que width est un nombre valide, sinon utiliser undefined
          let width = dxCol.width;

          // Filtrer les valeurs invalides (NaN, Infinity, ou strings "NaN"/"Infinity")
          if (
            (typeof width === 'number' && (isNaN(width) || !isFinite(width))) ||
            (typeof width === 'string' && (width === 'NaN' || width === 'Infinity' || width === '-Infinity'))
          ) {
            width = undefined;
          }

          return {
            name: dxCol.dataField,
            width: width, // Garder en number comme attendu par GridColumn
            visible: dxCol.visible,
            visibleIndex: dxCol.visibleIndex, // Sauvegarder l'ordre des colonnes
            groupIndex: dxCol.groupIndex, // Sauvegarder le groupIndex pour la personnalisation
            // ✅ FIX TRI: Sauvegarder sortOrder et sortIndex pour conserver le tri après reload()
            sortOrder: dxCol.sortOrder,
            sortIndex: dxCol.sortIndex,
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
            oldCol.visible !== newCol.visible ||
            oldCol.visibleIndex !== newCol.visibleIndex ||
            oldCol.groupIndex !== newCol.groupIndex ||
            oldCol.sortOrder !== newCol.sortOrder ||
            oldCol.sortIndex !== newCol.sortIndex;
        });

        if (hasChanges) {
          draft.columns = updatedColumns;
        }
      });
    }
  }, [triggerSearch, setGridState, currentSortByRef, dxDataSource]);
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

    const gridInstance = e.component || getGridInstance(dataGridRef);
    if (!gridInstance) return;

    // Vérifier si on est en mode édition de ligne (API publique DevExtreme 25.1)
    const editRowKey = gridInstance.option('editing.editRowKey');
    if (editRowKey === undefined || editRowKey === null) return;

    // Récupérer toutes les colonnes visibles et éditables
    const visibleColumns = e.columns || gridInstance.getVisibleColumns();
    if (!visibleColumns || !Array.isArray(visibleColumns)) return;

    const editableColumns = visibleColumns.filter((col: any) =>
      col.allowEditing && col.visible && !col.dataField?.startsWith('$')
    );

    if (editableColumns.length === 0) return;

    // Vérifier que prevColumnIndex est valide
    if (e.prevColumnIndex === undefined || e.prevColumnIndex === null || e.prevColumnIndex < 0 || e.prevColumnIndex >= visibleColumns.length) return;

    // Trouver l'index de la colonne actuelle parmi les colonnes éditables
    const currentColumn = visibleColumns[e.prevColumnIndex];
    if (!currentColumn) return;

    const currentEditableIdx = editableColumns.findIndex(
      (col: any) => col.dataField === currentColumn.dataField
    );

    if (currentEditableIdx === -1) return;

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
    if (!nextColumn) return;
    if (nextColumn.visibleIndex === undefined || nextColumn.visibleIndex === null) return;

    // Modifier les index pour naviguer vers la prochaine colonne éditable dans la MÊME ligne
    e.newRowIndex = e.prevRowIndex; // IMPORTANT: toujours rester dans la même ligne
    e.newColumnIndex = nextColumn.visibleIndex;
  }, [dataGridRef]);
}

/**
 * Hook pour intercepter Tab en mode édition et forcer la boucle dans la ligne
 *
 * DevExtreme n'a pas de propriété `tabKeyDirection` (seulement `enterKeyDirection`).
 * Ce hook intercepte Tab sur la dernière/première cellule pour boucler.
 *
 * @param dataGridRef - Référence au DataGrid
 */
export function useHandleEditingTabKeyDown({ dataGridRef }: UseHandleEditingTabNavigationParams) {
  // Note: La navigation Tab est maintenant gérée par DxEditRow.handleKeyDown
  // Ce hook reste pour compatibilité mais ne fait plus rien de significatif
  return useCallback((e: any) => {
    // Tab est géré par DxEditRow.handleKeyDown directement sur le <tr>
  }, [dataGridRef]);
}

interface UseHandleEditingEnterKeyDownParams {
  dataGridRef: any;
  // Pattern Axelor : accès au formAtom et handlers pour save manuel
  editingRowFormAtomRef?: React.MutableRefObject<any>;
  // ✅ FIX DevExtreme v22: Store Jotai dédié pour éviter l'isolation de contexte des portails
  editingRowStoreRef?: React.MutableRefObject<any>;
  initialRecordRef?: React.MutableRefObject<DataRecord | null>;
  // Indique si on crée une NOUVELLE ligne (handleInitNewRow) vs édite une existante (handleEditingStart)
  isNewRowRef?: React.MutableRefObject<boolean>;
  localOnUpdate?: (record: DataRecord) => Promise<DataRecord>;
  localOnSave?: (record: DataRecord) => Promise<DataRecord>;
  isLocalMode?: boolean;
}

/**
 * Hook pour intercepter Enter en mode édition
 *
 * Comportement Axelor :
 * - Sauvegarde la ligne en cours (pattern Axelor si O2M, sinon DevExtreme standard)
 * - Si dernière ligne : ajoute automatiquement une nouvelle ligne
 * - Met le focus sur la nouvelle ligne
 *
 * Ignore l'action si un dropdown/popup est ouvert (l'utilisateur sélectionne une option).
 *
 * @param dataGridRef - Référence au DataGrid
 */
export function useHandleEditingEnterKeyDown({
                                               dataGridRef,
                                               editingRowFormAtomRef,
                                               editingRowStoreRef,  // ✅ FIX DevExtreme v22
                                               initialRecordRef,
                                               isNewRowRef,
                                               localOnUpdate,
                                               localOnSave,
                                               isLocalMode
                                             }: UseHandleEditingEnterKeyDownParams) {
  const isPopupOpen = useIsPopupOpen();
  const getErrors = useGetErrors(); // ← Validation Axelor

  return useCallback(async (e: any) => {
    const isEnterKey = e.event?.key === 'Enter' || e.event?.keyCode === 13;
    if (!isEnterKey) return;

    const gridInstance = getGridInstance(dataGridRef);
    if (!gridInstance) return;

    // Vérifier si on est en mode édition
    const editRowKey = gridInstance.option('editing.editRowKey');
    if (editRowKey === undefined || editRowKey === null) return;

    const popupOpen = isPopupOpen();
    const alreadyPrevented = e.event?.defaultPrevented;

    // CRITIQUE : Si un composant enfant (Select) a déjà appelé preventDefault(),
    // c'est qu'il gère l'événement (sélection dans dropdown) → on ne fait rien
    // Le Select Axelor appelle preventDefault() quand activeIndex !== null
    if (alreadyPrevented) {
      return;
    }

    // Backup: Ignorer l'Enter si un popup/dropdown est ouvert (au cas où preventDefault n'aurait pas été appelé)
    if (popupOpen) {
      return;
    }

    // Empêcher le comportement par défaut de DevExtreme (qui pourrait naviguer)
    e.event.preventDefault();
    e.event.stopPropagation();

    // Vérifier si on était sur la dernière ligne AVANT la sauvegarde
    const allRows = gridInstance.getVisibleRows().filter((row: any) => row.rowType === 'data');
    const editedRowIndex = allRows.findIndex((row: any) => row.key === editRowKey);
    const wasLastRow = editedRowIndex === allRows.length - 1;

    // Sauvegarder la ligne en cours (utiliser la fonction factorisée)
    try {
      await saveEditingRowAndClose(
        gridInstance,
        isLocalMode || false,
        editingRowFormAtomRef?.current,
        editingRowStoreRef?.current,
        initialRecordRef,
        isNewRowRef,
        localOnSave,
        localOnUpdate,
        getErrors
      );

      // ✅ FIX: Clear les refs AVANT de créer une nouvelle ligne
      // Sinon le nouveau DxEditRow réutilise l'ancien formAtom et hérite des données
      if (editingRowFormAtomRef) {
        editingRowFormAtomRef.current = null;
      }
      if (initialRecordRef) {
        initialRecordRef.current = null;
      }
      // Note: isNewRowRef sera remis à true par handleInitNewRow lors de addRow()

      if (wasLastRow) {
        // On était sur la dernière ligne → ajouter une nouvelle ligne
        // Utiliser le même chemin que le bouton "+" de la toolbar:
        // addRow() → onInitNewRow (définit ID négatif) → onEditingStart (stocke initialRecordRef)
        setTimeout(async () => {
          await gridInstance.addRow();

          // Focus sur la première cellule éditable de la nouvelle ligne
          setTimeout(() => {
            const newEditRowKey = gridInstance.option('editing.editRowKey');
            if (newEditRowKey === undefined || newEditRowKey === null) return;

            const newRowIndex = gridInstance.getRowIndexByKey(newEditRowKey);
            if (newRowIndex < 0) return;

            const newRowElement = gridInstance.getRowElement(newRowIndex);
            if (!newRowElement || !newRowElement[0]) return;

            const newRowDomElement = newRowElement[0] as HTMLElement;
            const firstEditableInput = newRowDomElement.querySelector('input:not([readonly]), select:not([disabled]), textarea:not([readonly])') as HTMLElement;

            if (firstEditableInput) {
              firstEditableInput.focus();
              if (firstEditableInput instanceof HTMLInputElement && firstEditableInput.type === 'text') {
                firstEditableInput.select();
              }
            }
          }, 300);
        }, 100);
      }
    } catch (error) {
      console.error('[DxGrid] Enter save failed:', error);
    }
  }, [dataGridRef, isPopupOpen, editingRowFormAtomRef, editingRowStoreRef, initialRecordRef, localOnUpdate, localOnSave, isLocalMode]);
}

/**
 * Hook router pour gérer Tab et Enter en mode édition
 *
 * Combine les hooks Tab et Enter pour une gestion centralisée
 *
 * @param dataGridRef - Référence au DataGrid
 */
export function useHandleEditingKeyDown({
                                          dataGridRef,
                                          editingRowFormAtomRef,
                                          editingRowStoreRef,  // ✅ FIX: Ajouter le store dédié
                                          initialRecordRef,
                                          isNewRowRef,
                                          localOnUpdate,
                                          localOnSave,
                                          isLocalMode
                                        }: UseHandleEditingEnterKeyDownParams) {
  const handleTab = useHandleEditingTabKeyDown({ dataGridRef });
  const handleEnter = useHandleEditingEnterKeyDown({
    dataGridRef,
    editingRowFormAtomRef,
    editingRowStoreRef,  // ✅ FIX: Passer le store dédié
    initialRecordRef,
    isNewRowRef,
    localOnUpdate,
    localOnSave,
    isLocalMode
  });

  return useCallback((e: any) => {
    handleTab(e);
    handleEnter(e);
  }, [handleTab, handleEnter]);
}

/**
 * Hook pour vérifier si l'utilisateur interagit avec un popup/dropdown dans le contexte d'édition
 * Retourne une fonction qui vérifie si un élément HTML fait partie d'un portal (MUI ou Floating UI)
 *
 * Utilisé pour ignorer les actions clavier/souris quand l'utilisateur interagit avec :
 * - Dropdowns de Select/AutoComplete
 * - Dialogs/Modals
 * - Menus contextuels
 * - Tooltips
 */
function useInRowEditingContext() {
  return useCallback((element: HTMLElement | null): boolean => {
    if (!element) return false;

    // Vérifier si l'élément est dans un portal (MUI ou Floating UI)
    // Les portals sont rendus en dehors de la hiérarchie DOM de la ligne
    // - MUI: .MuiPopover-root, .MuiPopper-root, etc.
    // - Floating UI (Axelor UI): [data-floating-ui-portal]
    // - Axelor Select/Dropdown: [role="listbox"] avec position fixed
    // - Axelor Modals/Dialogs: [class*="_modal"], [class*="_dialogRoot"]
    const portalSelectors = [
      '.MuiPopover-root',
      '.MuiPopper-root',
      '.MuiAutocomplete-popper',
      '.MuiDialog-root',
      '.MuiDrawer-root',
      '.MuiMenu-root',
      '.MuiTooltip-popper',
      '[data-floating-ui-portal]',
      '[role="listbox"]',  // Dropdowns Axelor
      '[role="menu"]',     // Menus contextuels
      '[role="dialog"]',   // Dialogs
      '[class*="_modal"]',  // Modales Axelor (CSS modules)
      '[class*="_dialogRoot"]',  // Dialog root Axelor (CSS modules)
    ].join(', ');

    return element.closest(portalSelectors) !== null;
  }, []);
}

/**
 * Hook pour vérifier si un popup/dropdown est actuellement ouvert dans le DOM
 * Retourne une fonction qui vérifie la présence d'un portal dans le document
 *
 * Utilisé pour ignorer Enter quand un dropdown est ouvert (même si l'événement vient de l'input)
 */
function useIsPopupOpen() {
  return useCallback((): boolean => {
    // Vérifier si un portal est présent dans le DOM
    const portalSelectors = [
      '.MuiPopover-root',
      '.MuiPopper-root',
      '.MuiAutocomplete-popper',
      '.MuiDialog-root',
      '.MuiDrawer-root',
      '.MuiMenu-root',
      '.MuiTooltip-popper',
      '[data-floating-ui-portal]',
    ].join(', ');

    return document.querySelector(portalSelectors) !== null;
  }, []);
}

interface UseHandleRowClickAwayParams {
  // ✅ FIX MULTI-GRID: ID unique par grille pour filtrer les clickAway events
  gridId: string;
  dataGridRef: any;
  isRowEditingRef: React.MutableRefObject<boolean>;
  isSavingRef: React.MutableRefObject<boolean>;
  // Pattern Axelor : accès au formAtom et handlers pour save manuel
  editingRowFormAtomRef?: React.MutableRefObject<any>;
  // ✅ FIX DevExtreme v22: Store Jotai dédié pour éviter l'isolation de contexte des portails
  editingRowStoreRef?: React.MutableRefObject<any>;
  initialRecordRef?: React.MutableRefObject<DataRecord | null>;
  // Indique si on crée une NOUVELLE ligne (handleInitNewRow) vs édite une existante (handleEditingStart)
  isNewRowRef?: React.MutableRefObject<boolean>;
  localOnUpdate?: (record: DataRecord) => Promise<DataRecord>;
  localOnSave?: (record: DataRecord) => Promise<DataRecord>;
  isLocalMode?: boolean;
}

/**
 * Hook pour gérer le clic en dehors de la ligne en édition (auto-save comme Axelor grid)
 *
 * Pattern Axelor :
 * 1. Blur-focus l'input actif pour finaliser la valeur
 * 2. Lire le formAtom pour obtenir les valeurs modifiées
 * 3. Comparer avec le record original (isEqual)
 * 4. Si changé : appeler onUpdate/onSave directement
 * 5. Fermer la ligne avec cancelEditData()
 *
 * Utilise la hiérarchie DOM pour détecter si le clic est dans la ligne en édition,
 * et détecte les portals (Floating UI, MUI) pour éviter de sauvegarder quand on clique sur des dropdowns.
 */
export function useHandleRowClickAway({
                                        gridId,  // ✅ FIX MULTI-GRID: ID unique pour filtrer les clickAway events
                                        dataGridRef,
                                        isRowEditingRef,
                                        isSavingRef,
                                        editingRowFormAtomRef,
                                        editingRowStoreRef,  // ✅ FIX DevExtreme v22
                                        initialRecordRef,
                                        isNewRowRef,
                                        localOnUpdate,
                                        localOnSave,
                                        isLocalMode
                                      }: UseHandleRowClickAwayParams) {
  const isInRowEditingContext = useInRowEditingContext();
  const getErrors = useGetErrors(); // ← Validation Axelor

  // ✅ FIX: Le callback reçoit maintenant store, formAtom, gridId et rowKey LOCAUX depuis DxEditRow
  // Cela évite les conflits quand plusieurs grilles O2M sont sur la même page
  // et garantit que seul le DxEditRow de la ligne en édition sauvegarde
  return useCallback(async (event: Event, localStore?: any, localFormAtom?: any, localGridId?: string, localRowKey?: any) => {
    if (!isRowEditingRef.current || isSavingRef.current) {
      return;
    }

    // ✅ FIX MULTI-GRID: Vérifier que ce handleClickAway correspond à LA grille en édition
    // Plusieurs grilles O2M reçoivent le même événement clickAway, mais seule celle
    // dont le gridId correspond doit exécuter le save
    if (localGridId && localGridId !== gridId) {
      // Ce clickAway vient d'une AUTRE grille, ignorer
      return;
    }

    const gridInstance = getGridInstance(dataGridRef);
    if (!gridInstance) {
      return;
    }

    // 1. Récupérer la ligne en édition (celle qui contient les widgets de formulaire)
    const editingRowKey = gridInstance.option('editing.editRowKey');

    // ✅ FIX ROW MISMATCH: Vérifier que ce DxEditRow correspond à LA ligne en édition
    // DevExtreme peut rendre plusieurs DxEditRow (lignes virtuelles, re-renders),
    // chacun avec son propre store. Seul celui dont rowKey === editRowKey doit sauvegarder.
    if (localRowKey !== undefined && localRowKey !== null && editingRowKey !== undefined && editingRowKey !== null) {
      if (localRowKey !== editingRowKey) {
        return;
      }
    }

    const clickedElement = event.target as HTMLElement;

    if (editingRowKey === undefined || editingRowKey === null) {
      return;
    }

    const rowIndex = gridInstance.getRowIndexByKey(editingRowKey);

    if (rowIndex < 0) {
      return;
    }

    const rowElement = gridInstance.getRowElement(rowIndex);

    if (!rowElement || !rowElement[0]) {
      return;
    }

    const editingRowDomElement = rowElement[0] as HTMLElement;

    // 2. Vérifier si le clic provient de la ligne en édition ou de ses descendants (widgets, dropdowns, etc.)
    const isInsideRow = editingRowDomElement.contains(clickedElement);

    if (isInsideRow) {
      return;
    }

    // 3. Vérifier si le clic est dans un portal (MUI ou Floating UI)
    const isInPortal = isInRowEditingContext(clickedElement);

    if (isInPortal) {
      return;
    }

    // 4. Si le clic est en dehors de la ligne en édition ET en dehors des portals, auto-save
    if (isSavingRef.current) {
      return;
    }

    isSavingRef.current = true;

    try {
      // ✅ FIX: Utiliser les valeurs LOCALES passées par DxEditRow (priorité)
      // au lieu des refs partagées qui peuvent être écrasées par d'autres grilles O2M
      await saveEditingRowAndClose(
        gridInstance,
        isLocalMode || false,
        localFormAtom || editingRowFormAtomRef?.current,
        localStore || editingRowStoreRef?.current,
        initialRecordRef,
        isNewRowRef,
        localOnSave,
        localOnUpdate,
        getErrors
      );

      // ✅ FIX: Clear les refs après save pour éviter que la prochaine ligne réutilise l'ancien formAtom
      // (cas où l'utilisateur clique en dehors puis appuie sur "+")
      if (editingRowFormAtomRef) {
        editingRowFormAtomRef.current = null;
      }
      if (initialRecordRef) {
        initialRecordRef.current = null;
      }
    } catch (error) {
      console.error("[DxGrid] Auto-save failed:", error);
    } finally {
      isSavingRef.current = false;
    }
  }, [gridId, dataGridRef, isRowEditingRef, isSavingRef, isInRowEditingContext, editingRowFormAtomRef, editingRowStoreRef, initialRecordRef, isNewRowRef, localOnUpdate, localOnSave, isLocalMode]);
}

/**
 * Fonction factorisée pour sauvegarder la ligne en édition selon le pattern Axelor
 * Utilisée par handleRowClickAway ET handleKeyDown (Enter)
 *
 * Utilise saveEditingRowFormAtom() pour factoriser la logique commune.
 *
 * @param formAtom - Le formAtom de la ligne en édition (valeur directe, pas une ref)
 * @param store - Le store Jotai dédié à cette ligne (valeur directe, pas une ref)
 * @param isNewRowRef - Indique si on crée une NOUVELLE ligne (handleInitNewRow) vs édite une existante
 */
async function saveEditingRowAndClose(
  gridInstance: any,
  isLocalMode: boolean,
  formAtom: any,  // ✅ FIX: Valeur directe au lieu de ref (évite conflits entre grilles O2M)
  store: any,  // ✅ FIX: Valeur directe au lieu de ref
  initialRecordRef: React.RefObject<DataRecord | null> | undefined,
  isNewRowRef: React.RefObject<boolean> | undefined,
  localOnSave: ((record: any) => Promise<any>) | undefined,
  localOnUpdate: ((record: any) => Promise<any>) | undefined,
  getErrors: ((formState?: any) => any) | undefined
) {
  // Utiliser formAtom pour TOUS les cas (O2M et standalone)
  // DevExtreme's saveEditData() ne fonctionne pas avec dataRowRender
  // car il ne peut pas tracker les modifications dans nos widgets custom
  if (formAtom && initialRecordRef?.current) {
    const storeToUse = store || getDefaultStore();
    await saveEditingRowFormAtom({
      gridInstance,
      formAtom,
      store: storeToUse,
      initialRecord: initialRecordRef.current,
      isNewRow: isNewRowRef?.current ?? false,
      isLocalMode,
      localOnUpdate,
      localOnSave,
      closeAfterSave: true,
      reloadAfterSave: !isLocalMode,
      getErrors,
      showErrors,
    });
  } else {
    // Fallback: Mode standard DevExtreme (pas de formAtom disponible)
    await gridInstance.saveEditData();
  }
}
