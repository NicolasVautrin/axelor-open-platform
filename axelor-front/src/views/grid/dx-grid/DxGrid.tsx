import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from "react";
import { Box, Input } from "@axelor/ui";
import { GridRow, GridState, getRows } from "@axelor/ui/grid";
import { atom, useAtom, useSetAtom, useAtomValue } from "jotai";
import DataGrid, {
  Column,
  ColumnFixing,
  Editing,
  Export,
  FilterRow,
  Grouping,
  GroupPanel,
  HeaderFilter,
  MasterDetail,
  Paging,
  Scrolling,
  SearchPanel,
  Sorting,
  StateStoring,
  Summary,
  Toolbar,
  Item as ToolbarItem,
} from "devextreme-react/data-grid";
import { DataGrid as DxDataGrid } from "devextreme-react/data-grid";
import { locale, loadMessages } from "devextreme/localization";
import frMessages from "devextreme/localization/messages/fr.json";

import { ViewProps } from "@/views/types";
import { SearchOptions } from "@/services/client/data";
import { GridView, Field } from "@/services/client/meta.types";
import { dxLog } from "@/utils/dev-tools";
import { getStandardColumnProps } from "./widgets/StandardColumn";
import { getEditColumnProps } from "./widgets/EditColumn";
import { getSelectColumnProps, SelectAllHeader } from "./widgets/SelectColumn";
import { rowSelectionAtomFamily, clearAllSelectionsAtom, toggleRowSelectionAtom } from "./selectionAtoms";
import { DataRecord } from "@/services/client/data.types";
import { i18n } from "@/services/client/i18n";
import { Icon } from "@/components/icon";
import { MaterialIcon } from "@axelor/ui/icons/material-icon";
import { useHilites } from "@/hooks/use-parser";
import { createEvalContext } from "@/hooks/use-parser/context";
import { parseExpression } from "@/hooks/use-parser/utils";
import { useViewAction } from "@/view-containers/views/scope";
import { useActionExecutor, useFormScope } from "@/views/form/builder/scope";
import { createFormAtom } from "@/views/form/builder/atoms";
import { legacyClassNames } from "@/styles/legacy";
import { GridContext } from "../builder/scope";
import { toKebabCase } from "@/utils/names";
import {
  getDxCellValue,
  formatDxCellValue,
  getEffectiveWidget,
  mapAxelorTypeToDevExtreme as mapTypeToDevExtreme,
  getFieldsToFetch,
  getGridInstance,
  getCellElementWorkaround,
  nextId,
  isNewRecord,
} from "./dx-grid-utils";
import { useDxColumns, useTriggerSearch, useHandleOptionChanged, useHandleEditingTabNavigation, useHandleEditingKeyDown, useHandleRowClickAway } from "./DxGrid.hooks";
import { createDxDataSource } from "./createDxDataSource";
import { createLocalDxDataSource } from "./createLocalDxDataSource";
import { convertDxFilterToAxelor } from "./dx-filter-converter";
import { enableDxGridDebug } from "./dx-grid-debug";
import { useDxRow } from "./widgets/DxRow";
import { useGridState } from "../builder/utils";
import { useCustomizePopup } from "../builder/customize";

// Import des styles DevExtreme
import "devextreme/dist/css/dx.light.css";
import "./dx-grid.css";

// Constantes pour éviter les changements de référence tout en restant mutables
const REMOTE_OPERATIONS = {
  sorting: true,
  grouping: false, // Grouping côté client (comme Axelor) car le serveur retourne des données plates
  filtering: true,
  paging: true, // DevExtreme envoie les paramètres de pagination au CustomStore
};

const KEYBOARD_NAVIGATION = {
  enabled: true,
  editOnKeyPress: false,
};

interface DxGridInnerProps extends ViewProps<GridView> {
  onSearch?: (options?: SearchOptions) => Promise<any>;
  searchOptions?: Partial<SearchOptions>;
  onEdit?: (record: DataRecord, readonly?: boolean) => void;
  state: GridState;
  setState: (updater: (draft: GridState) => void) => void;
  readonly?: boolean; // Prop readonly depuis le formulaire parent (comme Grid Axelor standard)

  // Props pour le mode local (OneToMany/panel-related)
  records?: DataRecord[]; // Si fourni, utilise le mode local au lieu de dataStore.search()
  onUpdate?: (record: DataRecord) => Promise<DataRecord>; // Handler pour édition inline (onO2MUpdate)
  onSave?: (record: DataRecord) => Promise<DataRecord>; // Handler pour nouveaux records (onO2MSave)
  onDelete?: (records: DataRecord[]) => Promise<void>; // Handler pour suppression
  onDiscard?: (record: DataRecord) => void; // Handler pour annuler édition
}

export interface DxGridHandle {
  onAdd: () => void;
}

/**
 * Composant DevExtreme Grid pour Axelor
 *
 * Activé quand la vue XML contient css="dx-grid"
 *
 * Supporte tous les modes Axelor :
 * - Grid normale
 * - Expandable (avec MasterDetail)
 * - Tree-grid (avec MasterDetail récursif)
 */
const DxGridInner = forwardRef<DxGridHandle, DxGridInnerProps>(function DxGridInner(props, ref) {
  const {
    meta,
    dataStore,
    onSearch,
    searchOptions,
    onEdit,
    state,
    setState,
    readonly, // readonly depuis le formulaire parent (comme Grid Axelor standard)
    // Props mode local (OneToMany)
    records: localRecords,
    onUpdate: localOnUpdate,
    onSave: localOnSave,
    onDelete: localOnDelete,
    onDiscard: localOnDiscard,
  } = props;
  const view = meta.view;
  const fields = meta.fields || {};
  const { context } = useViewAction();

  // Détecter le mode local (OneToMany) vs distant (grid normale)
  const isLocalMode = localRecords !== undefined;

  // En mode local (O2M), récupérer le formAtom du parent pour les triggers
  // IMPORTANT: useFormScope() doit être appelé inconditionnellement (règles des hooks)
  const parentScope = useFormScope();

  // ✅ OPTIMISATION: Stabiliser parentFormAtom avec useRef pour éviter les re-renders
  // parentScope change de référence à chaque render du parent, même si formAtom est identique
  const parentFormAtomRef = useRef<any>(undefined);
  const currentParentFormAtom = isLocalMode ? parentScope?.formAtom : undefined;

  // Mettre à jour la ref seulement si la référence de formAtom a vraiment changé
  if (parentFormAtomRef.current !== currentParentFormAtom) {
    parentFormAtomRef.current = currentParentFormAtom;
  }

  const parentFormAtom = parentFormAtomRef.current;

  // Calculer editable tôt pour utilisation dans handleCellClick
  const editable = view.editable !== false;

  // Ref pour accéder à l'instance DevExtreme DataGrid
  const dataGridRef = useRef<React.ElementRef<typeof DxDataGrid>>(null);

  // Mutex pour éviter la double sauvegarde (handleCellClick + handleFocusedRowChanged)
  const isSavingRef = useRef(false);

  // Ref pour stocker le formAtom de la ligne en édition (pour récupérer les valeurs lors du save)
  const editingRowFormAtomRef = useRef<any>(null);

  // Ref pour stocker le record initial de la ligne en édition (pour comparaison avec isEqual)
  const initialRecordRef = useRef<DataRecord | null>(null);

  // Callback pour que DxEditRow notifie son formAtom
  const onEditRowFormAtomReady = useCallback((formAtom: any) => {
    editingRowFormAtomRef.current = formAtom;
  }, []);

  // OPTIMISATION ANTI-FLICKERING avec atomFamily :
  // Chaque ligne a son propre atom, seules les lignes dont l'état change re-rendent
  // IMPORTANT : Ne PAS lire selectedRowsListAtom ici car cela cause un re-render à chaque changement de sélection
  // Les actions (export, delete) liront l'atom directement au moment de l'action
  const toggleRowSelection = useSetAtom(toggleRowSelectionAtom);
  const setClearAllSelections = useSetAtom(clearAllSelectionsAtom);

  // FormAtom pour l'exécuteur d'actions
  const formAtom = useMemo(
    () =>
      createFormAtom({
        meta: meta as any,
        record: {},
      }),
    [meta],
  );

  // Context pour l'exécuteur d'actions
  const getContext = useCallback(() => context || {}, [context]);

  // Exécuteur d'actions pour les button fields
  const actionExecutor = useActionExecutor(view, {
    formAtom,
    getContext,
    onRefresh: onSearch,
  });

  // Fonction onUpdate pour les widgets (pour l'instant vide, sera utilisé pour l'édition)
  const onUpdate = useCallback((record: DataRecord) => {
    // TODO: Implémenter la mise à jour des records si besoin
    return Promise.resolve(record);
  }, []);

  // Charger les traductions françaises DevExtreme
  useEffect(() => {
    loadMessages(frMessages);
    locale("fr");
  }, []);

  // Synchroniser records avec state.rows pour compatibilité avec grid Axelor
  const recordsRef = useRef(isLocalMode ? localRecords : dataStore.records);
  const rowsRef = useRef<GridRow[]>([]);

  // Mode local (OneToMany) : Synchroniser localRecords avec state.rows
  useEffect(() => {
    if (isLocalMode && localRecords) {
      const gridRows = getRows({
        rows: rowsRef.current,
        columns: [],
        records: localRecords,
        orderBy: null,
        groupBy: null,
      });
      rowsRef.current = gridRows;

      setState((draft) => {
        draft.rows = gridRows;
      });
    }
  }, [isLocalMode, localRecords, setState]);

  // Mode distant : Écouter les changements du dataStore
  useEffect(() => {
    if (isLocalMode) return; // Skip en mode local

    // Initialisation au montage
    const initialRows = getRows({
      rows: rowsRef.current,
      columns: [],
      records: dataStore.records,
      orderBy: null,
      groupBy: null,
    });
    rowsRef.current = initialRows;

    setState((draft) => {
      draft.rows = initialRows;
    });

    // Puis écouter les changements
    return dataStore.subscribe((ds) => {
      if (recordsRef.current !== ds.records) {
        recordsRef.current = ds.records;
        const gridRows = getRows({
          rows: rowsRef.current,
          columns: [],
          records: ds.records,
          orderBy: null,
          groupBy: null,
        });
        rowsRef.current = gridRows;

        setState((draft) => {
          draft.rows = gridRows;
        });
      }
    });
  }, [isLocalMode, dataStore, setState]);

  // Hook pour gérer les hilites au niveau de la ligne (row-level)
  const getHilites = useHilites(view.hilites);

  // Préparer la map des hilites par champ (pour handleCellPrepared)
  const fieldHilitesMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    (view.items || []).forEach((item: any) => {
      if (item.name && item.hilites) {
        map[item.name] = item.hilites;
      }
    });
    return map;
  }, [view.items]);

  // État de la grille pour le Column Chooser Axelor et DevExtreme
  // On utilise un seul état au lieu de deux (state et gridState séparés)
  const [gridState, setGridState, gridStateAtom] = useGridState({
    view,
    columns: [],
    rows: [],
  });

  // Créer un atom dérivé qui nettoie automatiquement les largeurs invalides (NaN, Infinity)
  // Cet atom sera utilisé par le dialog de personnalisation pour éviter d'envoyer des NaN au serveur
  const cleanedGridStateAtom = useMemo(
    () =>
      atom((get) => {
        const state = get(gridStateAtom);
        if (!state.columns || state.columns.length === 0) {
          return state;
        }

        // Nettoyer les largeurs invalides
        const cleanedColumns = state.columns.map((col: any) => {
          if (col.width !== undefined) {
            const widthStr = String(col.width);
            const parsedWidth = parseInt(widthStr);

            if (
              widthStr === 'NaN' ||
              widthStr === 'Infinity' ||
              widthStr === '-Infinity' ||
              isNaN(parsedWidth) ||
              !isFinite(parsedWidth)
            ) {
              const { width, ...rest } = col;
              return rest;
            }
          }
          return col;
        });

        return {
          ...state,
          columns: cleanedColumns,
        };
      }),
    [gridStateAtom],
  );

  // Column Chooser Axelor - utilise l'atom nettoyé
  const onColumnCustomize = useCustomizePopup({
    view,
    stateAtom: cleanedGridStateAtom as any,
  });

  // Construire la liste des champs à fetcher (inclut les targetName pour les M2O ET les champs des hilites)
  const fieldsToFetch = useMemo(() => {
    const fieldNames: string[] = [];

    (view.items || [])
      .filter((item): item is Field => "name" in item && item.name !== undefined)
      .forEach((field) => {
        // Pour les champs pointés (ex: "user.name"), prendre la partie avant le point pour les métadonnées
        const fieldName = field.name.includes('.') ? field.name.split('.')[0] : field.name;
        const fieldMeta = fields[fieldName];

        // Toujours ajouter le champ lui-même (qu'il soit pointé ou non)
        fieldNames.push(field.name);

        // Pour les M2O non-pointés : ajouter field.targetName
        const isM2O =
          fieldMeta?.type === "MANY_TO_ONE" ||
          fieldMeta?.type === "ONE_TO_ONE";

        if (isM2O && !field.name.includes('.') && fieldMeta?.targetName && fieldMeta.targetName !== "id") {
          fieldNames.push(`${field.name}.${fieldMeta.targetName}`);
        }

        // Pour les M2O avec colorField
        if (isM2O && !field.name.includes('.') && (fieldMeta as any)?.colorField) {
          fieldNames.push(`${field.name}.${(fieldMeta as any).colorField}`);
        }
      });

    return fieldNames;
  }, [view.items, view.hilites, fields]);

  // Déclencher la recherche initiale au montage
  useEffect(() => {
    if (onSearch && dataStore.records.length === 0) {
      onSearch({ fields: fieldsToFetch });
    }
  }, [onSearch, dataStore, fieldsToFetch]);

  // Déclencher la recherche quand searchOptions change (pagination)
  useEffect(() => {
    if (onSearch && searchOptions) {
      onSearch({ ...searchOptions, fields: fieldsToFetch });
    }
  }, [searchOptions, onSearch, fieldsToFetch]);

  // Analyser le mode de la grille
  const widget = toKebabCase(view.widget ?? "");
  const isExpandable = widget === "expandable";
  const isTreeGrid = widget === "tree-grid" && view.treeField;
  const needsMasterDetail = isExpandable || isTreeGrid;

  // Parser les champs de regroupement (peut être une liste séparée par des virgules)
  const groupByFields = useMemo(() => {
    if (!view.groupBy) return [];
    return view.groupBy.split(',').map(f => f.trim());
  }, [view.groupBy]);

  // Mapper les colonnes Axelor vers DevExtreme (fields ET buttons dans l'ordre de la vue)
  const columns = useDxColumns({
    view,
    fields,
    groupByFields,
    gridStateColumns: gridState.columns,
  });

  // Créer le DataSource DevExtreme (mode distant ou local)
  // Mode distant: wrappe dataStore pour appeler search() sur le serveur
  // Mode local: utilise l'array localRecords directement (OneToMany)
  const dxDataSource = useMemo(() => {
    // Options de synchronisation de sélection (identiques pour local et remote)
    const selectionSync = {
      setState,
      getRows: () => rowsRef.current,
    };

    if (isLocalMode) {
      return createLocalDxDataSource(
        localRecords || [],
        {
          onUpdate: localOnUpdate,
          onSave: localOnSave,
          onDelete: localOnDelete,
        },
        selectionSync,
        editingRowFormAtomRef  // ✅ Passer la ref pour lire les valeurs du formAtom
      );
    } else {
      return createDxDataSource(dataStore, fieldsToFetch, selectionSync);
    }
  }, [isLocalMode, localRecords, localOnUpdate, localOnSave, localOnDelete, dataStore, fieldsToFetch, setState]);

  // Rafraîchir le DataSource quand les records changent
  useEffect(() => {
    console.log('[DxGrid] Records changed, reloading dataSource:', {
      isLocalMode,
      recordsCount: isLocalMode ? localRecords?.length : dataStore.records?.length,
      dataStoreRecords: dataStore.records,
    });
    const gridInstance = getGridInstance(dataGridRef);
    if (gridInstance && dxDataSource) {
      dxDataSource.reload();
    }
  }, [isLocalMode, localRecords, dataStore.records, dxDataSource]);

  // Gestion de la sélection - Par défaut les checkboxes sont activées sauf si selector="none"
  const selectionMode = view.selector === "none" ? "none" : "multiple";

  // État pour savoir si des colonnes sont groupées
  const [hasGrouping, setHasGrouping] = useState<boolean>(groupByFields.length > 0);

  // Ref pour tracker si une ligne est en édition (pour sauvegarde auto sur clic externe)
  // On utilise un ref au lieu d'un state pour éviter de recréer handleDocumentClick
  const isRowEditingRef = useRef<boolean>(false);

  // Hook pour accéder au contexte de la ligne en édition (formAtom partagé)
  // DÉSACTIVÉ: ancien système avec useDxEditRow()
  // const { editRowState, setEditRowState } = useDxEditRow();

  // Fonction pour déclencher une recherche avec tri/filtre
  const triggerSearch = useTriggerSearch({ dataStore, fieldsToFetch });

  // Intercepter les changements de tri et de groupement
  const handleOptionChanged = useHandleOptionChanged({ setHasGrouping, triggerSearch, setGridState });

  // Personnaliser le menu contextuel des colonnes
  const handleContextMenuPreparing = useCallback((e: any) => {
    if (e.target === "header" && onColumnCustomize) {
      // Ajouter un séparateur
      e.items.push({
        disabled: true,
        template: () => null,
      });

      // Ajouter l'item "Personnaliser..."
      e.items.push({
        text: i18n.get("Customize..."),
        onItemClick: () => {
          onColumnCustomize({ title: i18n.get("Customize...") });
        },
      });
    }
  }, [onColumnCustomize]);

  // Appliquer les hilites (coloration des lignes)
  const handleRowPrepared = useCallback((e: any) => {
    if (e.rowType === "data" && e.data) {
      const record = e.data;
      const matchedHilites = getHilites({ ...context, ...record });

      if (matchedHilites && matchedHilites.length > 0) {
        const hilite = matchedHilites[0];

        // Utiliser legacyClassNames comme dans la grid Axelor normale
        if (hilite.css) {
          const resolvedClasses = legacyClassNames(hilite.css);
          resolvedClasses.split(' ').forEach((cls: string) => {
            if (cls) e.rowElement.classList.add(cls);
          });

          // Supprimer la classe d'alternance si c'est une hilite background
          if (hilite.css.includes('hilite-') && !hilite.css.includes('-text')) {
            e.rowElement.classList.remove('dx-row-alt');
          }
        }
      }
    }
  }, [getHilites, context]);

  // Appliquer les hilites au niveau des cellules (field-level)
  const handleCellPrepared = useCallback((e: any) => {
    if (e.rowType === "data" && e.data && e.column.dataField) {
      const record = e.data;
      const fieldName = e.column.dataField;

      // Vérifier si ce champ a des hilites
      const fieldHilites = fieldHilitesMap[fieldName];

      if (fieldHilites && Array.isArray(fieldHilites)) {
        // Évaluer les conditions des hilites
        const evalContext = createEvalContext({ ...context, ...record });
        const matchedHilites = fieldHilites.filter((hilite: any) =>
          parseExpression(hilite.condition ?? "")(evalContext)
        );

        if (matchedHilites && matchedHilites.length > 0) {
          const hilite = matchedHilites[0];

          // Utiliser legacyClassNames comme dans la grid Axelor normale
          if (hilite.css) {
            const resolvedClasses = legacyClassNames(hilite.css);
            resolvedClasses.split(' ').forEach((cls: string) => {
              if (cls) e.cellElement.classList.add(cls);
            });
          }
        }
      }
    }
  }, [fieldHilitesMap, context]);

  // Gérer l'annulation des modifications d'une ligne
  const handleRevert = useCallback((e: any, key: any) => {
    e.event?.stopPropagation();
    const gridInstance = getGridInstance(dataGridRef);
    gridInstance?.cancelEditData();
  }, []);

  // Gérer le toggle de sélection d'une ligne
  const handleToggleSelection = useCallback((rowKey: any) => {
    // OPTIMISATION ANTI-FLICKERING avec atomFamily :
    // Toggle l'état de sélection de cette ligne via l'atom dédié
    // Seul l'atom de cette ligne sera mis à jour, évitant le re-render des autres lignes
    toggleRowSelection(rowKey);
  }, [toggleRowSelection]);

  /**
   * Sauvegarder les données d'édition si la grille a des modifications (dirty).
   * Utilise un mutex pour éviter les doubles sauvegardes.
   * Ferme automatiquement la ligne en édition après la sauvegarde.
   *
   * @returns true si sauvegarde réussie, false si pas de données ou échec
   */
  const saveEditDataIfDirty = useCallback(async () => {
    if (isSavingRef.current) {
      return false;
    }

    const gridInstance = getGridInstance(dataGridRef);
    if (!gridInstance) {
      return false;
    }

    isSavingRef.current = true;

    if (!gridInstance.hasEditData()) {
      isSavingRef.current = false;
      return false;
    }

    try {
      await gridInstance.saveEditData();
      return true;
    } catch (error) {
      console.error("[DxGrid] Save failed:", error);
      return false;
    } finally {
      isSavingRef.current = false;
    }
  }, []);

  // Gérer le clic sur une cellule pour démarrer l'édition en mode row
  const handleCellClick = useCallback(async (e: any) => {
    if (e.rowType !== 'data' || e.key === undefined || e.key === null) {
      return;
    }

    // Ignorer les clics sur les colonnes système ($select, $edit) et boutons
    if (e.column?.dataField?.startsWith('$')) {
      return;
    }

    // En mode readonly, sélectionner la ligne au lieu d'éditer
    const contextReadonly = isLocalMode ? readonly : (!editable && readonly);
    if (contextReadonly) {
      handleToggleSelection(e.key);
      return;
    }

    // Vérifier si la colonne est éditable
    if (!e.column?.allowEditing) {
      return;
    }

    const gridInstance = e.component || getGridInstance(dataGridRef);
    if (!gridInstance) {
      return;
    }

    // Vérifier s'il y a une ligne en cours d'édition
    const currentEditingKey = gridInstance.option('editing.editRowKey');
    const isSwitchingRow = currentEditingKey !== undefined &&
                           currentEditingKey !== null &&
                           currentEditingKey !== e.key;

    // Si on switch de ligne, sauvegarder puis ouvrir la nouvelle ligne
    if (isSwitchingRow) {
      // Empêcher DevExtreme de traiter l'événement immédiatement
      e.handled = true;

      const newRowIndex = gridInstance.getRowIndexByKey(e.key);
      const clickedColumnIndex = e.columnIndex;

      // Sauvegarder si dirty (avec mutex atomique hasEditData + saveEditData)
      const saved = await saveEditDataIfDirty();

      if (saved !== false) {
        // Ouvrir la nouvelle ligne en édition
        gridInstance.option('editing.editRowKey', e.key);

        // Mettre le focus sur la cellule cliquée
        if (newRowIndex >= 0 && clickedColumnIndex >= 0) {
          const cellElement = gridInstance.getCellElement(newRowIndex, clickedColumnIndex);
          gridInstance.focus(cellElement);
        }
      }
    } else {
      // Pas de switch, ouvrir directement
      const rowIndex = gridInstance.getRowIndexByKey(e.key);
      const dataField = e.column?.dataField;

      gridInstance.editRow(rowIndex);

      // Mettre le focus sur la cellule cliquée après que React ait rendu les composants
      // Utiliser getCellElementWorkaround car getCellElement() ne fonctionne pas avec dataRowRender
      const clickedColumnIndex = e.columnIndex;

      setTimeout(() => {
        const cell = getCellElementWorkaround(dataGridRef, rowIndex, clickedColumnIndex);

        if (!cell) {
          console.warn('[handleCellClick] Cell not found');
          return;
        }

        // Mettre à jour focusedColumnIndex pour que Tab fonctionne
        gridInstance.option('focusedColumnIndex', clickedColumnIndex);
        gridInstance.option('focusedRowIndex', rowIndex);

        // Focus sur l'input dans la cellule
        const input = cell.querySelector('input:not([readonly]), select:not([disabled]), textarea:not([readonly])') as HTMLElement;

        if (input) {
          input.focus();
        } else {
          console.warn('[handleCellClick] No focusable input found in cell');
        }
      }, 50);
    }
  }, [readonly, isLocalMode, editable, handleToggleSelection, saveEditDataIfDirty]);

  // Gérer la navigation Tab/Shift+Tab dans une ligne en édition
  const handleEditingTabNavigation = useHandleEditingTabNavigation({ dataGridRef });

  // Tracer les changements de focus AVANT
  const handleFocusedCellChanging = useCallback((e: any) => {
    handleEditingTabNavigation(e);
  }, [handleEditingTabNavigation]);

  // Tracer les changements de focus APRÈS
  const handleFocusedCellChanged = useCallback((e: any) => {
    // Callback vide pour DevExtreme
  }, []);

  // Intercepter Tab et Enter en mode édition (router vers hooks spécialisés)
  const handleKeyDown = useHandleEditingKeyDown({
    dataGridRef,
    editingRowFormAtomRef,
    initialRecordRef,
    localOnUpdate,
    localOnSave,
    isLocalMode
  });

  // Gérer l'initialisation d'une nouvelle ligne (utilise le système d'IDs négatifs Axelor)
  const handleInitNewRow = useCallback((e: any) => {
    // Définir un ID négatif comme Axelor le fait avec nextId()
    // Cela évite que DevExtreme génère ses propres clés temporaires (_DX_KEY_...)
    const newId = nextId();
    e.data.id = newId;

    // ✅ CRITIQUE: Initialiser le record avec les valeurs par défaut des champs
    // Les widgets Axelor affichent les defaultValue mais ne les propagent pas automatiquement
    // dans le formState. Il faut donc initialiser le record avec ces valeurs.
    if (fields) {
      Object.keys(fields).forEach(fieldName => {
        const fieldMeta = fields[fieldName];
        if (fieldMeta.defaultValue !== undefined && fieldMeta.defaultValue !== null) {
          e.data[fieldName] = fieldMeta.defaultValue;
        }
      });
    }

    // IMPORTANT: Stocker le record initial pour la nouvelle ligne
    // handleEditingStart n'est PAS appelé pour les nouvelles lignes créées via addRow()
    // donc on stocke ici directement
    initialRecordRef.current = { ...e.data };
  }, [fields]);

  // Handler pour synchroniser la sélection DevExtreme avec le GridState Axelor (pour toolbar OneToMany)
  const handleSelectionChanged = useCallback((e: any) => {
    if (!setState) return;

    const gridInstance = getGridInstance(dataGridRef);
    if (!gridInstance) return;

    // Récupérer les clés sélectionnées depuis DevExtreme
    const selectedRowKeys = e.selectedRowKeys || [];

    // Récupérer toutes les lignes visibles avec leurs indices
    const visibleRows = gridInstance.getVisibleRows();

    // Trouver les indices des lignes sélectionnées
    const selectedIndices = visibleRows
      .map((row: any, index: number) =>
        selectedRowKeys.includes(row.key) ? index : null
      )
      .filter((index: number | null) => index !== null) as number[];

    // Mettre à jour state.selectedRows pour que la toolbar OneToMany fonctionne
    setState((draft) => {
      draft.selectedRows = selectedIndices.length > 0 ? selectedIndices : null;
    });
  }, [setState]);

  // Gérer le clic en dehors de la grille pour auto-save (comme Axelor grid)
  // Ce handler est passé à DxEditRow via ClickAwayListener
  const handleRowClickAway = useHandleRowClickAway({
    dataGridRef,
    isRowEditingRef,
    isSavingRef,
    editingRowFormAtomRef,
    initialRecordRef,
    localOnUpdate,
    localOnSave,
    isLocalMode
  });

  // Gérer le début d'édition d'une ligne
  const handleEditingStart = useCallback((e: any) => {
    isRowEditingRef.current = true;

    // Stocker le record initial pour comparaison lors du save (pattern Axelor)
    const gridInstance = getGridInstance(dataGridRef);
    if (gridInstance) {
      const visibleRows = gridInstance.getVisibleRows();
      const editingRow = visibleRows.find((row: any) => row.key === e.key);
      if (editingRow && editingRow.data) {
        // Cloner le record pour éviter les modifications par référence
        initialRecordRef.current = { ...editingRow.data };
      }
    }

    // Note: Le formAtom est maintenant créé par DxEditRow via useFormHandlers()
    // Le clickAway est géré par ClickAwayListener dans DxEditRow (comme Axelor)
  }, []);

  // Gérer la fin d'édition après sauvegarde
  const handleSaved = useCallback((e: any) => {
    isRowEditingRef.current = false;

    // Retirer le focus pour éviter le cadre bleu persistant
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // Note: Le clickAway est géré par ClickAwayListener dans DxEditRow (comme Axelor)
  }, []);

  // Gérer l'annulation d'édition
  const handleEditCanceled = useCallback((e: any) => {
    isRowEditingRef.current = false;

    // Retirer le focus pour éviter le cadre bleu persistant
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // Note: Le clickAway est géré par ClickAwayListener dans DxEditRow (comme Axelor)
  }, []);

  // Synchroniser isRowEditingRef avec editing.editRowKey
  // Car onEditingStart/onSaved ne sont appelés que si <Editing> existe avec allowUpdating={true}
  useEffect(() => {
    const gridInstance = getGridInstance(dataGridRef);
    if (!gridInstance) return;

    const interval = setInterval(() => {
      const editingKey = gridInstance.option('editing.editRowKey');
      const shouldBeEditing = editingKey !== undefined && editingKey !== null;

      if (shouldBeEditing !== isRowEditingRef.current) {
        isRowEditingRef.current = shouldBeEditing;
      }
    }, 100);

    return () => clearInterval(interval);
  }, []); // Pas de dépendances car on utilise un ref

  // Exposer la méthode onAdd au parent via ref (compatible avec GridComponent)
  useImperativeHandle(ref, () => ({
    onAdd: () => {
      const gridInstance = getGridInstance(dataGridRef);
      if (gridInstance) {
        gridInstance.addRow();
      }
    },
  }), []);

  // Fonction pour obtenir les clés des lignes visibles
  const getVisibleRowKeys = useCallback(() => {
    const gridInstance = getGridInstance(dataGridRef);
    if (gridInstance) {
      // getVisibleRows() retourne un tableau d'objets comme { data: ..., key: ..., rowType: ... }
      // Nous avons besoin uniquement de la 'key' pour les lignes de données.
      return gridInstance.getVisibleRows().filter((row: any) => row.rowType === 'data').map((row: any) => row.key);
    }
    return [];
  }, []);

  // Fonction de rendu pour l'en-tête de la colonne de sélection
  // Cette fonction est mémoïsée pour éviter un nouveau composant à chaque rendu de DxGridInner.
  // Elle appelle getVisibleRowKeys à chaque fois qu'elle est exécutée par DevExtreme,
  // ce qui assure que SelectAllHeader reçoit toujours la liste la plus à jour.
  const renderSelectAllHeader = useCallback(() => {
    const currentVisibleRowKeys = getVisibleRowKeys();
    return <SelectAllHeader visibleRowKeys={currentVisibleRowKeys} />;
  }, [getVisibleRowKeys]); // getVisibleRowKeys est stable grâce à useCallback

  // Mémoriser la configuration de la colonne de sélection
  // OPTIMISATION : Passe l'atomFamily et les callbacks stables en paramètres
  // La référence de selectColumnProps ne change que si les callbacks changent
  const selectColumnProps = useMemo(() => {
    return getSelectColumnProps({
      rowSelectionAtomFamily,
      onToggleSelection: handleToggleSelection,
      onRevert: handleRevert,
      headerCellRender: renderSelectAllHeader, // Passez la fonction de rendu de l'en-tête
    });
  }, [handleToggleSelection, handleRevert, renderSelectAllHeader]); // Assurez-vous que renderSelectAllHeader est une dépendance

  // Mémoriser la configuration de la colonne d'édition
  const editColumnProps = useMemo(() => {
    return getEditColumnProps({
      view,
      onEdit,
    });
  }, [view, onEdit]);

  // Créer une Map de props de colonnes indexée par dataField pour lookup O(1)
  // Cela permet à DxDisplayRow d'appeler les cellRender de chaque colonne efficacement
  const columnPropsMap = useMemo(() => {
    const map = new Map<string, any>();

    // Ajouter la colonne de sélection si activée
    if (selectionMode !== "none") {
      map.set(selectColumnProps.dataField, selectColumnProps);
    }

    // Ajouter la colonne d'édition si activée
    if (view.editIcon !== false) {
      map.set(editColumnProps.dataField, editColumnProps);
    }

    // Ajouter toutes les colonnes standards (fields et buttons)
    columns.forEach((col: any, idx: number) => {
      const colProps = getStandardColumnProps({
        col,
        idx,
        view,
        viewContext: context,
        actionExecutor,
        onUpdate,
        allFields: fields,
      });
      map.set(colProps.dataField, colProps);
    });

    return map;
  }, [selectionMode, selectColumnProps, view, editColumnProps, columns, context, onUpdate, fields]);
  // ✅ actionExecutor et handleCellClick retirés des dépendances :
  // - actionExecutor est lié au formAtom, pas aux colonnes (passé dynamiquement par DxEditRow/DxDisplayRow)
  // - handleCellClick est géré au niveau grille via onCellClick={handleCellClick}, pas dans les colonnes

  // Monkey patches de diagnostic (activables via dx-grid-debug.ts)
  useEffect(() => {
    return enableDxGridDebug(dataGridRef);
  }, []);

  // Hook pour rendre les lignes de la grille DevExtreme
  // Utilisé pour rendre un FormRenderer complet quand la ligne est en édition
  const DxRow = useDxRow({
    view,
    fields,
    context,
    columnPropsMap,
    handleCellClick,
    dataGridRef,
    handleRowClickAway,
    onUpdate,
    actionExecutor,
    parentFormAtom,
    onEditRowFormAtomReady,
  });

  // Calculer le contexte de la grille (readonly, etc.) comme Axelor standard grid
  // Pour les grids OneToMany (mode local), readonly vient du formulaire parent
  // Pour les grids standalone (action-view), readonly = !editable
  // Formule: Si en mode local (OneToMany), utiliser readonly du parent directement
  //          Sinon, utiliser !editable && readonly
  const gridContext = useMemo(() => {
    const contextReadonly = isLocalMode ? readonly : (!editable && readonly);
    return {
      readonly: contextReadonly,
    };
  }, [editable, readonly, view.editable, isLocalMode]);

  return (
    <GridContext.Provider value={gridContext}>
      <Box d="flex" flexDirection="column" flex={1} style={{ height: "100%", minWidth: 0, overflow: "hidden" }}>
        <DataGrid
        ref={dataGridRef}
        dataSource={dxDataSource}
        keyExpr="id"
        dataRowRender={DxRow}
        showBorders={true}
        rowAlternationEnabled={true}
        hoverStateEnabled={true}
        columnAutoWidth={false}
        allowColumnResizing={true}
        columnResizingMode="widget"
        wordWrapEnabled={false}
        remoteOperations={REMOTE_OPERATIONS}
        repaintChangesOnly={true}
        width="100%"
        height="100%"
        keyboardNavigation={KEYBOARD_NAVIGATION}
        onKeyDown={handleKeyDown}
        onFocusedCellChanging={handleFocusedCellChanging}
        onFocusedCellChanged={handleFocusedCellChanged}
        onOptionChanged={handleOptionChanged}
        onContextMenuPreparing={handleContextMenuPreparing}
        onRowPrepared={handleRowPrepared}
        onCellPrepared={handleCellPrepared}
        onCellClick={handleCellClick}
        onInitNewRow={handleInitNewRow}
        focusedRowEnabled={true}
        onEditingStart={handleEditingStart}
        onSaved={handleSaved}
        onEditCanceled={handleEditCanceled}
        onRowDblClick={(e: any) => {
          // Ne pas ouvrir le formulaire si une ligne est en édition
          if (!isRowEditingRef.current) {
            onEdit?.(e.data);
          }
        }}
      >
        {/* Colonne de sélection/undo - affiche checkbox pour lignes normales, undo pour lignes modifiées */}
        {selectionMode !== "none" && (
          <Column
            key="$$select"
            {...selectColumnProps}
          />
        )}

        {/* Colonne edit-icon - cachée pour les lignes en édition */}
        {view.editIcon !== false && (
          <Column
            key="$$edit"
            {...getEditColumnProps({
              view,
              onEdit,
            })}
          />
        )}

        {/* Colonne de commandes DevExtreme vide pour désactiver les boutons Edit/Save/Cancel par défaut */}
        {view.editable && (
          <Column type="buttons" width={0} visible={false} />
        )}

        {/* Colonnes (fields ET buttons dans l'ordre de la vue) */}
        {columns.map((col: any, idx: number) => (
          <Column
            key={col.dataField || `col_${idx}`}
            {...getStandardColumnProps({
              col,
              idx,
              view,
              viewContext: context,
              actionExecutor,
              onUpdate,
              allFields: fields,
              onCellClick: handleCellClick,
            })}
          />
        ))}

        {/* Tri - UI DevExtreme, traitement Axelor server-side */}
        <Sorting mode="multiple" />

        {/* Filtrage - UI DevExtreme, traitement Axelor server-side */}
        {view.customSearch && <FilterRow visible />}
        {view.customSearch && <HeaderFilter visible />}

        {/* Groupement - Toujours actif pour permettre le drag & drop et menu contextuel */}
        <Grouping autoExpandAll={false} contextMenuEnabled={true} />

        {/* Pagination gérée par Axelor (externe à DevExtreme) */}
        <Paging enabled={false} />

        {/* Scrolling horizontal et vertical - mode standard pour les records de la page seulement */}
        <Scrolling
          mode="standard"
          rowRenderingMode="standard"
          columnRenderingMode="standard"
          showScrollbar="always"
          useNative={false}
        />

        {/* Sélection gérée manuellement via notre colonne personnalisée */}

        {/* Column Fixing */}
        <ColumnFixing enabled />

        {/* Édition (si editable) */}
        {view.editable && (
          <Editing
            mode="row"
            allowUpdating={view.canEdit !== false}
            allowAdding={false}
            allowDeleting={false}
            selectTextOnEditStart={true}
            startEditAction="click"
            useIcons={false}
            refreshMode="repaint"
            newRowPosition="last"
          />
        )}

        {/* Export Excel - désactivé car géré par Axelor */}
        <Export enabled={false} />

        {/* Toolbar - uniquement searchPanel, les boutons sont gérés par la toolbar Axelor */}
        <Toolbar>
          {view.freeSearch && <ToolbarItem name="searchPanel" />}
        </Toolbar>

        {/* MasterDetail pour expandable et tree-grid */}
        {needsMasterDetail && (
          <MasterDetail
            enabled={true}
            render={(detailProps: any) => (
              <MasterDetailRenderer
                view={view}
                record={detailProps.data}
                isTreeGrid={!!isTreeGrid}
              />
            )}
          />
        )}
        <StateStoring enabled={false} />
      </DataGrid>
        </Box>
      </GridContext.Provider>
  );
});

// Export avec React.memo pour optimiser les re-renders
export default React.memo(DxGridInner);

/**
 * Renderer pour le MasterDetail (expandable et tree-grid)
 */
function MasterDetailRenderer({
  view,
  record,
  isTreeGrid,
}: {
  view: GridView;
  record: any;
  isTreeGrid: boolean;
}) {
  if (isTreeGrid) {
    return (
      <Box p={2} bg="light">
        <p>
          <strong>Tree-Grid MasterDetail</strong> (à implémenter)
        </p>
        <p>Record ID: {record.id}</p>
        <p>Children field: {view.treeField}</p>
        {view.summaryView && <p>Summary View: {view.summaryView}</p>}
      </Box>
    );
  }

  // Expandable
  return (
    <Box p={2} bg="light">
      <p>
        <strong>Expandable MasterDetail</strong> (à implémenter)
      </p>
      <p>Record ID: {record.id}</p>
      {view.summaryView && <p>Summary View: {view.summaryView}</p>}
    </Box>
  );
}

