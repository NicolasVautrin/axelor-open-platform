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
import { getDefaultStore } from "jotai";
import isEqual from "lodash/isEqual";
import { useGetErrors, showErrors } from "@/views/form/form";

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

        // Pour les colonnes normales, utiliser la largeur sauvegardée en priorité
        const columnWidth = savedColumnState?.width ? parseInt(String(savedColumnState.width)) : (field.width ? parseInt(String(field.width)) : undefined);
        const columnMinWidth = 100; // COLUMN_MIN_WIDTH par défaut comme Axelor

        const allowEditing = !field.readonly && !fieldMeta?.readonly;

        // Déterminer l'alignement selon le type de données (comme Axelor)
        const alignment = dataType === 'number' ? 'right' : 'left';

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
          // Garder la colonne visible même quand elle est groupée
          showWhenGrouped: true,
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
                 oldCol.groupIndex !== newCol.groupIndex;
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
  return useCallback((e: any) => {
    const isTabKey = e.event?.key === 'Tab' || e.event?.keyCode === 9;
    if (!isTabKey) return;

    const gridInstance = getGridInstance(dataGridRef);
    if (!gridInstance) return;

    // Vérifier si on est en mode édition
    const editRowKey = gridInstance.option('editing.editRowKey');
    if (editRowKey === undefined || editRowKey === null) return;

    // Approche DOM directe (car editCell() ne fonctionne pas avec dataRowRender)
    // Récupérer la ligne en édition via DOM
    const rowIndex = gridInstance.getRowIndexByKey(editRowKey);
    if (rowIndex < 0) return;

    const rowElement = gridInstance.getRowElement(rowIndex);
    if (!rowElement || !rowElement[0]) return;

    const editingRowDomElement = rowElement[0] as HTMLElement;

    // Trouver tous les inputs éditables dans la ligne (dans l'ordre DOM)
    const editableInputs = Array.from(
      editingRowDomElement.querySelectorAll('input:not([readonly]), select:not([disabled]), textarea:not([readonly])')
    ) as HTMLElement[];

    if (editableInputs.length === 0) return;

    // Trouver l'input actuellement focusé
    const activeElement = document.activeElement as HTMLElement;
    const currentInputIndex = editableInputs.indexOf(activeElement);

    if (currentInputIndex === -1) return;

    const isShiftPressed = e.event?.shiftKey;
    const isLastInput = !isShiftPressed && currentInputIndex === editableInputs.length - 1;
    const isFirstInput = isShiftPressed && currentInputIndex === 0;

    // Si on est sur le dernier/premier input, boucler
    if (isLastInput || isFirstInput) {
      e.event.preventDefault();
      e.event.stopPropagation();

      const nextInputIndex = isLastInput ? 0 : editableInputs.length - 1;
      const nextInput = editableInputs[nextInputIndex];

      if (nextInput) {
        // Focus sur le prochain input
        setTimeout(() => {
          nextInput.focus();
        }, 0);
      }
    }
  }, [dataGridRef]);
}

interface UseHandleEditingEnterKeyDownParams {
  dataGridRef: any;
  // Pattern Axelor : accès au formAtom et handlers pour save manuel
  editingRowFormAtomRef?: React.MutableRefObject<any>;
  initialRecordRef?: React.MutableRefObject<DataRecord | null>;
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
  initialRecordRef,
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
        editingRowFormAtomRef,
        initialRecordRef,
        localOnSave,
        localOnUpdate,
        getErrors,
        '[handleEnterKeyDown]'
      );

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
  }, [dataGridRef, isPopupOpen, editingRowFormAtomRef, initialRecordRef, localOnUpdate, localOnSave, isLocalMode]);
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
  initialRecordRef,
  localOnUpdate,
  localOnSave,
  isLocalMode
}: UseHandleEditingEnterKeyDownParams) {
  const handleTab = useHandleEditingTabKeyDown({ dataGridRef });
  const handleEnter = useHandleEditingEnterKeyDown({
    dataGridRef,
    editingRowFormAtomRef,
    initialRecordRef,
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
  dataGridRef: any;
  isRowEditingRef: React.MutableRefObject<boolean>;
  isSavingRef: React.MutableRefObject<boolean>;
  // Pattern Axelor : accès au formAtom et handlers pour save manuel
  editingRowFormAtomRef?: React.MutableRefObject<any>;
  initialRecordRef?: React.MutableRefObject<DataRecord | null>;
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
  dataGridRef,
  isRowEditingRef,
  isSavingRef,
  editingRowFormAtomRef,
  initialRecordRef,
  localOnUpdate,
  localOnSave,
  isLocalMode
}: UseHandleRowClickAwayParams) {
  const isInRowEditingContext = useInRowEditingContext();
  const getErrors = useGetErrors(); // ← Validation Axelor

  return useCallback(async (event: Event) => {
    if (!isRowEditingRef.current || isSavingRef.current) {
      return;
    }

    const gridInstance = getGridInstance(dataGridRef);
    if (!gridInstance) {
      return;
    }

    const clickedElement = event.target as HTMLElement;

    // 1. Récupérer la ligne en édition (celle qui contient les widgets de formulaire)
    const editingRowKey = gridInstance.option('editing.editRowKey');

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
      // Utiliser la fonction factorisée pour sauvegarder
      await saveEditingRowAndClose(
        gridInstance,
        isLocalMode || false,
        editingRowFormAtomRef,
        initialRecordRef,
        localOnSave,
        localOnUpdate,
        getErrors,
        '[handleRowClickAway]'
      );
    } catch (error) {
      console.error("[DxGrid] Auto-save failed:", error);
    } finally {
      isSavingRef.current = false;
    }
  }, [dataGridRef, isRowEditingRef, isSavingRef, isInRowEditingContext, editingRowFormAtomRef, initialRecordRef, localOnUpdate, localOnSave, isLocalMode]);
}

/**
 * Fonction factorisée pour sauvegarder la ligne en édition selon le pattern Axelor
 * Utilisée par handleRowClickAway ET handleKeyDown (Enter)
 */
async function saveEditingRowAndClose(
  gridInstance: any,
  isLocalMode: boolean,
  editingRowFormAtomRef: React.RefObject<any> | undefined,
  initialRecordRef: React.RefObject<DataRecord | null> | undefined,
  localOnSave: ((record: any) => Promise<any>) | undefined,
  localOnUpdate: ((record: any) => Promise<any>) | undefined,
  getErrors: ((formState?: any) => any) | undefined,
  logPrefix: string = '[saveEditingRow]'
) {
  // Pattern Axelor : Si en mode local (O2M), sauvegarder manuellement via formAtom
  if (isLocalMode && editingRowFormAtomRef?.current && initialRecordRef?.current) {
    // 1. Blur-focus l'input actif pour finaliser la valeur (comme Axelor)
    const activeElement = document.activeElement as HTMLElement;
    if (activeElement && activeElement.blur) {
      activeElement.blur();
      activeElement.focus?.();

      // ⚠️ CRITIQUE: Attendre que les handlers onBlur/onChange se terminent
      // Sans ce délai, le formState est lu AVANT que la valeur soit propagée
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // 2. Lire le formAtom pour obtenir les valeurs modifiées
    const store = getDefaultStore();
    const formState = store.get(editingRowFormAtomRef.current) as any;

    // 3. Valider les champs required AVANT de sauvegarder (pattern Axelor)
    if (getErrors) {
      const errors = getErrors(formState);
      if (errors) {
        showErrors(errors);
        // Ne pas fermer la ligne - garder le mode édition
        return;
      }
    }

    const currentRecord = formState?.record;

    // 3. Comparer avec le record original (isEqual)
    const isNew = !initialRecordRef.current.id || initialRecordRef.current.id < 0;
    const hasChanges = !isEqual(initialRecordRef.current, currentRecord);

    // 4. Si changé : appeler onUpdate/onSave directement (comme Axelor)
    if (hasChanges || isNew) {
      try {
        if (isNew && localOnSave) {
          await localOnSave(currentRecord);
        } else if (!isNew && localOnUpdate) {
          await localOnUpdate(currentRecord);
        }
      } catch (error) {
        console.error(`${logPrefix} Save failed:`, error);
      }
    }

    // 5. Toujours fermer la ligne avec cancelEditData() (pas saveEditData car on a déjà sauvé)
    await gridInstance.cancelEditData();
  } else {
    // Mode standard DevExtreme (non-O2M ou pas de formAtom)
    if (!gridInstance.hasEditData()) {
      await gridInstance.cancelEditData();
    } else {
      await gridInstance.saveEditData();
    }
  }
}
