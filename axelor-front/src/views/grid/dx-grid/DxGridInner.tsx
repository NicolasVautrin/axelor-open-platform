import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box } from "@axelor/ui";
import { GridRow, GridState, getRows } from "@axelor/ui/grid";
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
  Selection,
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
import { Cell } from "@/views/grid/renderers/cell/cell";
import { legacyClassNames } from "@/styles/legacy";
import { toKebabCase } from "@/utils/names";
import {
  getDxCellValue,
  formatDxCellValue,
  getEffectiveWidget,
  mapAxelorTypeToDevExtreme as mapTypeToDevExtreme,
  getFieldsToFetch,
} from "./dx-grid-utils";
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
export default function DxGridInner(props: DxGridInnerProps) {
  const { meta, dataStore, onSearch, searchOptions, onEdit, state, setState } = props;
  const view = meta.view;
  const fields = meta.fields || {};
  const { context } = useViewAction();

  // Ref pour accéder à l'instance DevExtreme DataGrid
  const dataGridRef = useRef<DxDataGrid>(null);

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
  const getContext = useCallback(() => context, [context]);

  // Exécuteur d'actions pour les button fields
  const actionExecutor = useActionExecutor(view, {
    formAtom,
    getContext,
    onRefresh: onSearch,
  });

  // Fonction onUpdate pour les widgets (pour l'instant vide, sera utilisé pour l'édition)
  const onUpdate = useCallback((record: DataRecord) => {
    // TODO: Implémenter la mise à jour des records si besoin
    console.log("[DxGrid] onUpdate called", record);
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

    // Ajouter les champs référencés dans les hilites
    (view.hilites || []).forEach((hilite) => {
      if (hilite.condition) {
        // Extraire les noms de champs de la condition (regex simple pour identifier les identifiants)
        const matches = hilite.condition.match(/[a-zA-Z_][a-zA-Z0-9_.]*/g);
        if (matches) {
          matches.forEach((match) => {
            // Ignorer les opérateurs et mots clés
            if (!['true', 'false', 'null', 'undefined', 'and', 'or', 'not', 'eq', 'ne', 'gt', 'lt', 'gte', 'lte'].includes(match.toLowerCase())) {
              if (!fieldNames.includes(match)) {
                fieldNames.push(match);
              }
            }
          });
        }
      }
    });

    return fieldNames;
  }, [view.items, view.hilites, fields]);

  // Déclencher la recherche initiale au montage
  useEffect(() => {
    if (onSearch && dataStore.records.length === 0) {
      console.log("[DxGridInner] Triggering initial search with fields", fieldsToFetch);
      onSearch({ fields: fieldsToFetch });
    }
  }, [onSearch, dataStore, fieldsToFetch]);

  // Déclencher la recherche quand searchOptions change (pagination)
  useEffect(() => {
    if (onSearch && searchOptions) {
      console.log("[DxGridInner] searchOptions changed, triggering search", searchOptions);
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
  const columns = useMemo(() => {
    // Créer une map pour une recherche rapide des propriétés de colonne dans gridState
    const gridStateColumnMap = new Map();
    (gridState.columns || []).forEach(col => {
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
        if (field.widget === "button" || field.type === "button") {
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
          console.log(`[DxGridInner] Selection list for ${field.name}:`, fieldMeta.selectionList);
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
  }, [view.items, fields, groupByFields, gridState.columns]);


  // Utiliser directement les records du DataStore Axelor
  // La pagination est gérée par le composant de pagination Axelor (externe)
  // Initialiser avec les records existants (la recherche peut être déjà faite)
  const [records, setRecords] = useState<DataRecord[]>(dataStore.records);

  // S'abonner aux changements du dataStore (comme GridInner)
  useEffect(
    () =>
      dataStore.subscribe((ds) => {
        console.log("[DxGridInner] DataStore updated", {
          totalCount: ds.page.totalCount,
          records: ds.records.length,
        });
        setRecords(ds.records);
      }),
    [dataStore],
  );

  // Gestion de la sélection
  const selectionMode = view.selector === "checkbox" ? "multiple" : "none";

  // État pour savoir si des colonnes sont groupées
  const [hasGrouping, setHasGrouping] = useState<boolean>(groupByFields.length > 0);

  // Ref pour éviter les appels en boucle
  const isSearchingRef = useRef(false);

  // Fonction pour déclencher une recherche avec tri/filtre
  const triggerSearch = useCallback(async (options: {
    sortBy?: string[];
    filter?: any;
  }) => {
    if (isSearchingRef.current) {
      console.log("[DxGridInner] Search already in progress, skipping");
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

      console.log("[DxGridInner] Triggering search with", searchOptions);

      // Appeler le dataStore
      await dataStore.search(searchOptions);
    } catch (error) {
      console.error("[DxGridInner] Search error", error);
    } finally {
      isSearchingRef.current = false;
    }
  }, [dataStore, fieldsToFetch]);

  // Intercepter les changements de tri et de groupement
  const handleOptionChanged = useCallback((e: any) => {
    // Détecter les changements de groupement
    if (e.name === "columns" && e.fullName?.includes("groupIndex")) {
      console.log("[DxGridInner] Grouping changed", e);

      // Vérifier s'il y a des colonnes groupées
      const groupedColumns = e.component.getVisibleColumns()
        .filter((col: any) => col.groupIndex !== undefined);

      setHasGrouping(groupedColumns.length > 0);
    }

    // Détecter les changements de tri
    if (e.name === "columns" && e.fullName?.includes("sortOrder")) {
      console.log("[DxGridInner] Sort changed", e);

      // Récupérer les colonnes triées
      const sortedColumns = e.component.getVisibleColumns()
        .filter((col: any) => col.sortOrder)
        .sort((a: any, b: any) => (a.sortIndex || 0) - (b.sortIndex || 0));

      if (sortedColumns.length > 0) {
        const sortBy = sortedColumns.map((col: any) =>
          `${col.sortOrder === 'desc' ? '-' : ''}${col.dataField}`
        );

        console.log("[DxGridInner] Transmit sort to Axelor", sortBy);

        // Transmettre le tri à Axelor
        triggerSearch({ sortBy });
      } else {
        // Aucun tri : effacer le tri en passant un tableau vide
        console.log("[DxGridInner] Clear sort");
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
        const hasChanges = updatedColumns.some((newCol, index) => {
          const oldCol = existingAxelorColumns[index];
          return !oldCol ||
                 oldCol.name !== newCol.name ||
                 oldCol.width !== newCol.width ||
                 oldCol.visible !== newCol.visible;
        });

        if (hasChanges) {
          console.log("[DxGridInner] Updating Axelor gridState with DevExtreme column changes", updatedColumns);
          draft.columns = updatedColumns;
        }
      });
    }
  }, [triggerSearch, setGridState]);

  // Intercepter les changements de filtres
  const handleContentReady = useCallback((e: any) => {
    // TODO: Implémenter la détection de changement de filtre
    // Pour l'instant désactivé car déclenché trop tôt

    // Les filtres DevExtreme sont accessibles via e.component.getCombinedFilter()
    // const filter = e.component.getCombinedFilter();
    // if (filter) {
    //   console.log("[DxGridInner] Filter changed", filter);
    //   // Convertir et transmettre à Axelor
    //   triggerSearch({ filter });
    // }
  }, [triggerSearch]);

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

  // Gérer les changements de sélection
  const handleSelectionChanged = useCallback((e: any) => {
    const selectedRowKeys = e.selectedRowKeys || [];

    // Convertir les IDs en indices de lignes
    const selectedIndices = selectedRowKeys
      .map((id: number) => state.rows.findIndex(row => row.record.id === id))
      .filter((index: number) => index !== -1);

    // Mettre à jour le state Axelor
    setState((draft) => {
      draft.selectedRows = selectedIndices.length > 0 ? selectedIndices : null;
    });
  }, [state.rows, setState]);

  console.log("[DxGridInner] Rendering DevExtreme Grid", {
    widget,
    isExpandable,
    isTreeGrid,
    needsMasterDetail,
    columns: columns.filter((col: any) => !col.isButton).length,
    buttonColumns: columns.filter((col: any) => col.isButton).length,
    totalColumns: columns.length,
    recordsCount: records.length,
    dataStoreRecordsCount: dataStore.records.length,
    groupByFields,
    hasGrouping,
    showGroupPanel: hasGrouping || groupByFields.length > 0,
    view,
  });

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
        width="100%"
        height="100%"
        onOptionChanged={handleOptionChanged}
        onContentReady={handleContentReady}
        onContextMenuPreparing={handleContextMenuPreparing}
        onRowPrepared={handleRowPrepared}
        onCellPrepared={handleCellPrepared}
        onSelectionChanged={handleSelectionChanged}
        onRowDblClick={(e: any) => {
          onEdit?.(e.data);
        }}
      >
        {/* Colonne de sélection avec largeur fixe */}
        {selectionMode !== "none" && (
          <Column type="selection" width={40} />
        )}

        {/* Colonne edit-icon */}
        {view.editIcon !== false && (
          <Column
            dataField="$$edit"
            caption=""
            width={40}
            minWidth={40}
            fixed={true}
            fixedPosition="left"
            alignment="center"
            allowSorting={false}
            allowFiltering={false}
            allowGrouping={false}
            allowHiding={false}
            cellRender={(cellData: any) => {
              const icon = view.readonly ? "description" : "edit";
              return (
                <Box
                  d="inline-flex"
                  onClick={() => {
                    onEdit?.(cellData.data, view.readonly);
                  }}
                  style={{ cursor: "pointer", justifyContent: "center", alignItems: "center", height: "100%" }}
                >
                  <MaterialIcon icon={icon} />
                </Box>
              );
            }}
          />
        )}

        {/* Colonnes (fields ET buttons dans l'ordre de la vue) */}
        {columns.map((col: any, idx: number) => {
          return (
            <Column
              key={col.dataField || `col_${idx}`}
              dataField={col.dataField}
              caption={col.caption}
              width={col.width}
              minWidth={col.minWidth}
              maxWidth={col.maxWidth}
              visible={col.visible}
              visibleIndex={col.visibleIndex}
              alignment={col.alignment}
              allowSorting={col.allowSorting}
              allowFiltering={col.allowFiltering}
              allowGrouping={col.allowGrouping}
              allowHiding={col.allowHiding}
              allowReordering={col.allowReordering}
              dataType={col.dataType}
              groupIndex={col.groupIndex}
              lookup={col.lookup}
              calculateCellValue={col.calculateCellValue}
              customizeText={col.customizeText}
              cellRender={(col.field?.widget || col.isButton) ? (cellData: any) => {
                // Utiliser le composant Cell d'Axelor pour rendre les widgets ET boutons de manière générique
                // On passe toutes les props nécessaires comme dans la grid Axelor standard
                return (
                  <Cell
                    view={view}
                    viewContext={context}
                    data={col.field || col.button}
                    value={cellData.value}
                    rawValue={cellData.value}
                    record={cellData.data}
                    rowIndex={cellData.rowIndex}
                    columnIndex={cellData.columnIndex}
                    actionExecutor={actionExecutor}
                    onUpdate={onUpdate}
                  />
                );
              } : undefined}
            />
          );
        })}

        {/* Tri - UI DevExtreme, traitement Axelor server-side */}
        <Sorting mode="multiple" />

        {/* Filtrage - UI DevExtreme, traitement Axelor server-side */}
        {view.customSearch && <FilterRow visible />}
        {view.customSearch && <HeaderFilter visible />}

        {/* Groupement - Toujours actif pour permettre le drag & drop et menu contextuel */}
        <Grouping autoExpandAll={false} contextMenuEnabled={true} />
        {/* Panneau de groupe - Visible si groupBy défini OU si l'utilisateur a créé des groupes */}
        <GroupPanel visible={hasGrouping || groupByFields.length > 0} />

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

        {/* Sélection (comportement) */}
        {selectionMode !== "none" && (
          <Selection
            mode={selectionMode}
            showCheckBoxesMode="always"
            selectAllMode="page"
            deferred={false}
          />
        )}

        {/* Column Fixing */}
        <ColumnFixing enabled />

        {/* Édition (si editable) */}
        {view.editable && (
          <Editing
            mode="row"
            allowUpdating={view.canEdit !== false}
            allowAdding={view.canNew !== false}
            allowDeleting={view.canDelete !== false}
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
            // Nous lisons l'état actuel de gridState.columns
            console.log("[DxGridInner] StateStoring customLoad: Loading from Axelor gridState", gridState.columns);
            // DevExtreme s'attend à un objet avec des propriétés comme 'columns', 'grouping', 'sorting', etc.
            // Nous construisons cet objet à partir de gridState.columns
            const stateToLoad: any = {
              columns: (gridState.columns || []).map(col => ({
                dataField: col.name,
                width: col.width ? parseInt(col.width) : undefined,
                visible: col.visible,
                visibleIndex: col.visibleIndex,
                groupIndex: col.groupIndex,
                sortOrder: col.sortOrder,
              })).filter(col => col.dataField), // Filtrer les colonnes sans dataField
            };
            return Promise.resolve(stateToLoad);
          }}
          customSave={(gridStateDx: any) => {
            // DevExtreme appelle customSave lorsque l'état change
            // Nous ne sauvegardons pas ici car handleOptionChanged s'en charge déjà
            // et pousse les changements dans le gridState Axelor.
            // La sauvegarde réelle dans la DB se fait via le dialogue de personnalisation Axelor.
            console.log("[DxGridInner] StateStoring customSave: DevExtreme state changed, but Axelor gridState is updated via onOptionChanged. No direct save here.");
            return Promise.resolve(); // Ne rien faire ici, la synchronisation est unidirectionnelle vers Axelor gridState
          }}
        />
      </DataGrid>
    </Box>
  );
}

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

/**
 * Mapper les types Axelor vers DevExtreme
 */
function mapAxelorTypeToDevExtreme(
  type?: string
): "string" | "number" | "date" | "boolean" | "datetime" | "object" {
  if (!type) return "string";

  const typeUpper = type.toUpperCase();

  if (typeUpper.includes("INTEGER") || typeUpper.includes("LONG")) {
    return "number";
  }
  if (typeUpper.includes("DECIMAL") || typeUpper.includes("DOUBLE")) {
    return "number";
  }
  if (typeUpper === "DATE") {
    return "date";
  }
  if (typeUpper === "DATETIME" || typeUpper === "TIME") {
    return "datetime";
  }
  if (typeUpper === "BOOLEAN") {
    return "boolean";
  }

  return "string";
}
