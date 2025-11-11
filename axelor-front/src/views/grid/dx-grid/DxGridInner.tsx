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
import { getSelectColumnProps, SelectAllHeader } from "./columns/SelectColumn";
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
import { useDxColumns, useTriggerSearch, useHandleOptionChanged, useHandleEditingTabNavigation } from "./DxGridInner.hooks";
import { createDxDataSource } from "./createDxDataSource";
import { convertDxFilterToAxelor } from "./dx-filter-converter";
import { enableDxGridDebug } from "./dx-grid-debug";
import { useGridState } from "../builder/utils";
import { useCustomizePopup } from "../builder/customize";

// Import des styles DevExtreme
import "devextreme/dist/css/dx.light.css";

// Constantes pour éviter les changements de référence tout en restant mutables
const REMOTE_OPERATIONS = {
  sorting: true,
  grouping: true,
  filtering: true,
  paging: true,
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

  // Créer le DataSource DevExtreme qui wrappe le DataStore Axelor
  // Le CustomStore gère automatiquement les opérations CRUD et refresh().done() fonctionne
  const dxDataSource = useMemo(() => {
    return createDxDataSource(dataStore, fieldsToFetch);
  }, [dataStore, fieldsToFetch]);

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

    const gridInstance = e.component || getGridInstance(dataGridRef);
    if (!gridInstance) return;

    // Vérifier s'il y a une ligne en cours d'édition
    const currentEditingKey = gridInstance.option('editing.editRowKey');
    const isSwitchingRow = currentEditingKey !== undefined &&
                           currentEditingKey !== null &&
                           currentEditingKey !== e.key;

    dxLog("[DxGridInner] currentEditingKey:", currentEditingKey, "newKey:", e.key, "isSwitchingRow:", isSwitchingRow);

    // Si on switch de ligne, sauvegarder puis ouvrir la nouvelle ligne
    if (isSwitchingRow) {
      dxLog("[DxGridInner] ✓ Switching rows - Saving then opening target row");

      // Empêcher DevExtreme de traiter l'événement immédiatement
      e.handled = true;

      const newRowIndex = gridInstance.getRowIndexByKey(e.key);
      const clickedColumnIndex = e.columnIndex;

      dxLog("[DxGridInner] Switch details - newRowIndex:", newRowIndex, "clickedColumnIndex:", clickedColumnIndex, "targetKey:", e.key);

      // Sauvegarder la ligne courante
      gridInstance.saveEditData().done(() => {
        dxLog("[DxGridInner] saveEditData().done() - Opening target row");

        // Ouvrir la nouvelle ligne en édition en utilisant l'option directement
        // (évite les reloads déclenchés par editRow())
        gridInstance.option('editing.editRowKey', e.key);
        dxLog("[DxGridInner] editing.editRowKey set to:", e.key);

        // Mettre le focus sur la cellule cliquée
        if (newRowIndex >= 0 && clickedColumnIndex >= 0) {
          const cellElement = gridInstance.getCellElement(newRowIndex, clickedColumnIndex);
          dxLog("[DxGridInner] cellElement:", cellElement);
          gridInstance.focus(cellElement);
          dxLog("[DxGridInner] Focus set on cell");
        } else {
          dxLog("[DxGridInner] ❌ Cannot set focus - invalid indices:", { newRowIndex, clickedColumnIndex });
        }
      }).fail(() => {
        dxLog("[DxGridInner] saveEditData() failed");
      });
    } else {
      // Pas de switch, ouvrir directement
      gridInstance.option('editing.editRowKey', e.key);
    }
  }, []);

  // Gérer la navigation Tab/Shift+Tab dans une ligne en édition
  const handleEditingTabNavigation = useHandleEditingTabNavigation({ dataGridRef });

  // DEBUG: Tracer les changements de focus AVANT
  const handleFocusedCellChanging = useCallback((e: any) => {
    dxLog("[DxGridInner] onFocusedCellChanging - prevRowIndex:", e.prevRowIndex, "newRowIndex:", e.newRowIndex, "prevColumnIndex:", e.prevColumnIndex, "newColumnIndex:", e.newColumnIndex);
  }, []);

  // DEBUG: Tracer les changements de focus APRÈS
  const handleFocusedCellChanged = useCallback((e: any) => {
    dxLog("[DxGridInner] onFocusedCellChanged - rowIndex:", e.rowIndex, "columnIndex:", e.columnIndex);
  }, []);

  // Gérer l'initialisation d'une nouvelle ligne (utilise le système d'IDs négatifs Axelor)
  const handleInitNewRow = useCallback((e: any) => {
    // Définir un ID négatif comme Axelor le fait avec nextId()
    // Cela évite que DevExtreme génère ses propres clés temporaires (_DX_KEY_...)
    const newId = nextId();
    e.data.id = newId;

    dxLog("[DxGridInner] handleInitNewRow - assigned negative ID:", newId);
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

  // Fonction pour obtenir les clés des lignes visibles
  const getVisibleRowKeys = useCallback(() => {
    const gridInstance = getGridInstance(dataGridRef);
    if (gridInstance) {
      // getVisibleRows() retourne un tableau d'objets comme { data: ..., key: ..., rowType: ... }
      // Nous avons besoin uniquement de la 'key' pour les lignes de données.
      return gridInstance.getVisibleRows().filter(row => row.rowType === 'data').map(row => row.key);
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

  // Monkey patches de diagnostic (activables via dx-grid-debug.ts)
  useEffect(() => {
    return enableDxGridDebug(dataGridRef);
  }, []);

  return (
    <Box d="flex" flexDirection="column" flex={1} style={{ height: "100%", minWidth: 0, overflow: "hidden" }}>
      <DataGrid
        ref={dataGridRef}
        dataSource={dxDataSource}
        keyExpr="id"
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
        onFocusedCellChanging={handleFocusedCellChanging}
        onFocusedCellChanged={handleFocusedCellChanged}
        onOptionChanged={handleOptionChanged}
        onContextMenuPreparing={handleContextMenuPreparing}
        onRowPrepared={handleRowPrepared}
        onCellPrepared={handleCellPrepared}
        onCellClick={handleCellClick}
        onInitNewRow={handleInitNewRow}
        onRowUpdated={onRowUpdated}
        focusedRowEnabled={!view.editable}
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

