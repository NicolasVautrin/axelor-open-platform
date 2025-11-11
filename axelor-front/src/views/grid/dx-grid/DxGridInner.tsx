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
import { getStandardColumnProps } from "./columns/StandardColumn";
import { getEditColumnProps } from "./columns/EditColumn";
import { getSelectColumnProps } from "./columns/SelectColumn";
import { rowSelectionAtomFamily, clearAllSelectionsAtom, toggleRowSelectionAtom } from "./selectionAtoms";
import { DataRecord } from "@/services/client/data.types";
import { i18n } from "@/services/client/i18n";
import { Icon } from "@/components/icon";
import { MaterialIcon } from "@axelor/ui/icons/material-icon";
import { useHilites } from "@/hooks/use-parser";
import { createEvalContext } from "@/hooks/use-parser/context";
import { parseExpression } from "@/hooks/use-parser/utils";
import { useViewAction } from "@/view-containers/views/scope";
import { useActionExecutor } from "@/views/form/builder/scope";
import { createFormAtom } from "@/views/form/builder/atoms";
import { legacyClassNames } from "@/styles/legacy";
import { toKebabCase } from "@/utils/names";
import {
  getDxCellValue,
  formatDxCellValue,
  getEffectiveWidget,
  mapAxelorTypeToDevExtreme as mapTypeToDevExtreme,
  getFieldsToFetch,
  getGridInstance,
  nextId,
  isNewRecord,
} from "./dx-grid-utils";
import { useDxColumns, useTriggerSearch, useHandleOptionChanged, useHandleSaving } from "./DxGridInner.hooks";
import { convertDxFilterToAxelor } from "./dx-filter-converter";
import { useGridState } from "../builder/utils";
import { useCustomizePopup } from "../builder/customize";

// Import des styles DevExtreme
import "devextreme/dist/css/dx.light.css";

interface DxGridInnerProps extends ViewProps<GridView> {
  onSearch?: (options?: SearchOptions) => Promise<any>;
  searchOptions?: Partial<SearchOptions>;
  onEdit?: (record: DataRecord, readonly?: boolean) => void;
  state: GridState;
  setState: (updater: (draft: GridState) => void) => void;
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
const DxGridInner = forwardRef<DxGridHandle, DxGridInnerProps,>(function DxGridInner(props, ref) {
  const { meta, dataStore, onSearch, searchOptions, onEdit, state, setState } = props;
  const view = meta.view;
  const fields = meta.fields || {};
  const { context } = useViewAction();

  // Ref pour accéder à l'instance DevExtreme DataGrid
  const dataGridRef = useRef<DxDataGrid>(null);

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

  // Synchroniser dataStore.records avec state.rows pour compatibilité avec grid Axelor
  const recordsRef = useRef(dataStore.records);
  const rowsRef = useRef<GridRow[]>([]);

  // Écouter les changements du dataStore
  useEffect(() => {
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
  }, [dataStore, setState]);

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

  // Column Chooser Axelor
  const onColumnCustomize = useCustomizePopup({
    view,
    stateAtom: gridStateAtom,
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
  
  // Utiliser directement les records du DataStore Axelor
  // La pagination est gérée par le composant de pagination Axelor (externe)
  // Initialiser avec les records existants (la recherche peut être déjà faite)
  const [records, setRecords] = useState<DataRecord[]>(dataStore.records);

  // S'abonner aux changements du dataStore (comme GridInner)
  // OPTIMISATION : Ne mettre à jour que si la référence a changé pour éviter les re-renders inutiles
  const recordsRefForComparison = useRef<DataRecord[]>(dataStore.records);
  useEffect(
    () =>
      dataStore.subscribe((ds) => {
        // Ne mettre à jour que si la référence a changé
        if (ds.records !== recordsRefForComparison.current) {
          recordsRefForComparison.current = ds.records;
          setRecords(ds.records);
        }
      }),
    [dataStore],
  );

  const editingRowKeyRef = useRef<any>(null);

  // Callback à appeler quand le saving est terminé
  const onSavingCompleteRef = useRef<(() => void) | null>(null);

  // Gestion de la sélection - Par défaut les checkboxes sont activées sauf si selector="none"
  const selectionMode = view.selector === "none" ? "none" : "multiple";

  // État pour savoir si des colonnes sont groupées
  const [hasGrouping, setHasGrouping] = useState<boolean>(groupByFields.length > 0);

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

  // Gérer la sauvegarde des modifications (mode batch editing)
  const handleSaving = useHandleSaving({ dataStore, fieldsToFetch, records, onSavingCompleteRef, dataGridRef });

  // Synchroniser l'état des lignes modifiées en mode batch
  const onRowUpdated = useCallback((e: any) => {
    dxLog("[DxGridInner] onRowUpdated", e);
  }, []);

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

  // Gérer le clic sur une cellule pour démarrer l'édition en mode row
  // Nécessaire car cellRender custom empêche startEditAction="click" de fonctionner automatiquement
  const handleCellClick = useCallback(async (e: any) => {
    if (e.rowType !== 'data' || e.key === undefined || e.key === null) {
      return;
    }

    // Ignorer les clics sur les colonnes système ($select, $edit) et boutons
    if (e.column?.dataField?.startsWith('$')) return;

    // Vérifier si la colonne est éditable
    if (!e.column?.allowEditing) {
      dxLog("[DxGridInner] Column not editable:", e.column?.dataField);
      return;
    }

    dxLog("[DxGridInner] handleCellClick - e.component available:", !!e.component);
    const gridInstance = e.component || getGridInstance(dataGridRef);
    if (!gridInstance) return;

    // Vérifier s'il y a une ligne en cours d'édition
    const currentEditingKey = gridInstance.option('editing.editRowKey');
    const isSwitchingRow = currentEditingKey !== undefined &&
                           currentEditingKey !== null &&
                           currentEditingKey !== e.key;

    dxLog("[DxGridInner] currentEditingKey:", currentEditingKey, "newKey:", e.key, "isSwitchingRow:", isSwitchingRow);

    // Si on clique sur une autre ligne et qu'une ligne est en édition
    if (isSwitchingRow) {
      dxLog("[DxGridInner] ✓ Switching rows - Saving current row before switching to new row");

      // Créer une Promise qui sera résolue quand la sauvegarde sera terminée
      const savingPromise = new Promise<void>((resolve) => {
        onSavingCompleteRef.current = () => {
          dxLog("[DxGridInner] onSavingComplete - Save completed");
          resolve(); // Résoudre la Promise pour indiquer que la sauvegarde est terminée
        };
      });

      // Déclencher la sauvegarde de l'ancienne ligne
      gridInstance.saveEditData();

      // Attendre que la sauvegarde soit terminée (y compris cancelEditData)
      await savingPromise;

      // Maintenant ouvrir la nouvelle ligne
      dxLog("[DxGridInner] Opening new row after save completed:", e.key);
      gridInstance.option('editing.editRowKey', e.key);
    } else {
      // Pas de switch, ouvrir directement (le focus fonctionne naturellement)
      gridInstance.option('editing.editRowKey', e.key);
    }
  }, []);

  // Gérer le début de l'édition d'une ligne
  const handleEditingStart = useCallback((e: any) => {
    const newEditingKey = e.key;

    dxLog("[DxGridInner] handleEditingStart - row entering edit mode", newEditingKey);

    // Tracker la ligne en édition pour la sauvegarde automatique
    editingRowKeyRef.current = newEditingKey;
  }, []);

  // Gérer le début de l'édition d'une ligne
  const handleOnSaved = useCallback((e: any) => {
    dxLog("[DxGridInner] handleOnSaved", e);
  }, []);

  // Gérer la fin de l'édition d'une ligne
  const handleEditingEnd = useCallback((e: any) => {
    dxLog("[DxGridInner] handleEditingEnd - row exiting edit mode", e);
    editingRowKeyRef.current = null;
  }, []);

  // Gérer la préparation des éditeurs pour notifier le grid des changements
  const handleEditorPreparing = useCallback((e: any) => {

  }, []);

  // Gérer l'initialisation d'une nouvelle ligne (utilise le système d'IDs négatifs Axelor)
  const handleInitNewRow = useCallback((e: any) => {
    // Définir un ID négatif comme Axelor le fait avec nextId()
    // Cela évite que DevExtreme génère ses propres clés temporaires (_DX_KEY_...)
    const newId = nextId();
    e.data.id = newId;

    dxLog("[DxGridInner] handleInitNewRow - assigned negative ID:", newId);
  }, []);

  // Gérer la touche Tab pour boucler dans la ligne actuelle en mode édition
  const handleFocusedCellChanging = useCallback((e: any) => {
    // Vérifier si c'est un événement Tab
    const isTabKey = e.event?.keyCode === 9 || e.event?.key === 'Tab';
    if (!isTabKey) return;

    dxLog("[DxGridInner] handleFocusedCellChanging - e.component available:", !!e.component);
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
  }, []);

  // Exposer la méthode onAdd au parent via ref (compatible avec GridComponent)
  useImperativeHandle(ref, () => ({
    onAdd: () => {
      const gridInstance = getGridInstance(dataGridRef);
      if (gridInstance) {
        gridInstance.addRow();
      }
    },
  }), []);

  // Mémoriser la configuration de la colonne de sélection
  // OPTIMISATION : Passe l'atomFamily et les callbacks stables en paramètres
  // La référence de selectColumnProps ne change que si les callbacks changent
  const selectColumnProps = useMemo(() => {
    return getSelectColumnProps({
      rowSelectionAtomFamily,
      onToggleSelection: handleToggleSelection,
      onRevert: handleRevert,
    });
  }, [handleToggleSelection, handleRevert]);

  return (
    <Box d="flex" flexDirection="column" flex={1} style={{ height: "100%", minWidth: 0, overflow: "hidden" }}>
      <DataGrid
        ref={dataGridRef}
        dataSource={records}
        keyExpr="id"
        showBorders={true}
        rowAlternationEnabled={true}
        hoverStateEnabled={true}
        columnAutoWidth={false}
        allowColumnResizing={true}
        columnResizingMode="widget"
        wordWrapEnabled={false}
        remoteOperations={false}
        repaintChangesOnly={true}
        width="100%"
        height="100%"
        keyboardNavigation={{
          enabled: true,
          editOnKeyPress: false,
        }}
        onFocusedCellChanging={handleFocusedCellChanging}
        onOptionChanged={handleOptionChanged}
        onContextMenuPreparing={handleContextMenuPreparing}
        onRowPrepared={handleRowPrepared}
        onCellPrepared={handleCellPrepared}
        onCellClick={handleCellClick}
        onEditorPreparing={handleEditorPreparing}
        onInitNewRow={handleInitNewRow}
        onSaving={handleSaving}
        onRowUpdated={onRowUpdated}
        onEditingStart={handleEditingStart}
        onSaved={handleOnSaved}
        focusedRowEnabled={true}
        onRowDblClick={(e: any) => {
          onEdit?.(e.data);
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

        {/* State Storage - Synchronisé avec Axelor gridState */}
        <StateStoring
          enabled
          type="custom"
          customLoad={() => {
            // DevExtreme appelle customLoad au démarrage pour restaurer l'état
            // Nous lisons l'état actuel de gridState.columns (Axelor)
            // Axelor ne stocke que name, width, visible
            // groupIndex et sortOrder sont gérés dynamiquement par DevExtreme via la vue XML
            const stateToLoad: any = {
              columns: (gridState.columns || []).map(col => ({
                dataField: col.name,
                width: col.width,
                visible: col.visible,
              })).filter(col => col.dataField), // Filtrer les colonnes sans dataField
            };
            return Promise.resolve(stateToLoad);
          }}
          customSave={(gridStateDx: any) => {
            // DevExtreme appelle customSave lorsque l'état change
            // Nous ne sauvegardons pas ici car handleOptionChanged s'en charge déjà
            // et pousse les changements dans le gridState Axelor.
            // La sauvegarde réelle dans la DB se fait via le dialogue de personnalisation Axelor.
            return Promise.resolve(); // Ne rien faire ici, la synchronisation est unidirectionnelle vers Axelor gridState
          }}
        />
      </DataGrid>
    </Box>
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

