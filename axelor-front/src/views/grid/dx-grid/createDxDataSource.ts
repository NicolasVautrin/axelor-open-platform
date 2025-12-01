import CustomStore from "devextreme/data/custom_store";
import DataSource from "devextreme/data/data_source";
import { DataStore } from "@/services/client/data-store";
import { convertDxFilterToAxelor } from "./dx-filter-converter";
import { enableDataSourceDebug } from "./dx-grid-debug";
import { GridRow } from "@axelor/ui/grid";
import { getDefaultStore } from "jotai";
import { selectedRowsListAtom } from "./selectionAtoms";

/**
 * Options pour la synchronisation de sélection
 */
export interface SelectionSyncOptions {
  setState: (updater: (draft: any) => void) => void;
  getRows: () => GridRow[];
}

/**
 * Crée un DataSource DevExtreme qui wrappe le DataStore Axelor
 *
 * Avantages:
 * - DevExtreme gère automatiquement les opérations CRUD via le CustomStore
 * - Plus besoin de onSaving custom avec e.cancel = true
 * - refresh().done() fonctionne correctement car reload() retourne une Promise
 * - Architecture plus propre et standard
 * - Synchronise automatiquement la sélection avec GridState
 */
export function createDxDataSource(
  dataStore: DataStore,
  fieldsToFetch: string[],
  selectionSync?: SelectionSyncOptions,
  editingRowFormAtomRef?: React.MutableRefObject<any>,
  editingRowStoreRef?: React.MutableRefObject<any>,
  currentSortByRef?: React.MutableRefObject<string[] | undefined>,
  searchOptionsRef?: React.MutableRefObject<Partial<import("@/services/client/data").SearchOptions> | undefined>,
  useCacheRef?: React.MutableRefObject<boolean>
) {
  const dxStore = new CustomStore({
    key: "id",

    /**
     * Charger les données (appelé par DevExtreme lors du refresh)
     */
    load: async (loadOptions) => {
      try {
        // ✅ FIX REFRESH: Si le cache est activé (refresh manuel depuis toolbar Axelor),
        // retourner les données déjà chargées au lieu de refaire une requête
        if (useCacheRef?.current) {
          useCacheRef.current = false; // Désactiver le cache pour les prochains appels
          return {
            data: JSON.parse(JSON.stringify(dataStore.records)),
            totalCount: dataStore.page?.totalCount || dataStore.records.length,
          };
        }

        // Convertir les options DevExtreme en SearchOptions Axelor
        const searchOptions: any = {
          ...dataStore.options,
          fields: fieldsToFetch,
        };

        // 1. Convertir le tri
        const sortBy: string[] = [];
        const addedFields = new Set<string>(); // Pour éviter les doublons

        // D'abord le tri choisi par l'utilisateur (depuis la ref)
        if (currentSortByRef?.current && currentSortByRef.current.length > 0) {
          currentSortByRef.current.forEach((s: string) => {
            const fieldName = s.startsWith('-') ? s.substring(1) : s;
            if (!addedFields.has(fieldName)) {
              sortBy.push(s);
              addedFields.add(fieldName);
            }
          });
        }

        // Puis merger avec loadOptions.sort (tri par défaut comme "id")
        if (loadOptions.sort && Array.isArray(loadOptions.sort)) {
          loadOptions.sort.forEach((s: any) => {
            if (!addedFields.has(s.selector)) {
              const prefix = s.desc ? '-' : '';
              sortBy.push(`${prefix}${s.selector}`);
              addedFields.add(s.selector);
            }
          });
        }

        if (sortBy.length > 0) {
          searchOptions.sortBy = sortBy;
        }

        // 2. Convertir le filtre
        if (loadOptions.filter) {
          const axelorFilter = convertDxFilterToAxelor(loadOptions.filter);
          if (axelorFilter) {
            const wrappedFilter = (axelorFilter as any).criteria
              ? axelorFilter
              : { operator: "and", criteria: [axelorFilter] };

            const hasExistingFilter = searchOptions.filter &&
              Object.keys(searchOptions.filter).length > 0 &&
              (searchOptions.filter.criteria?.length > 0 || searchOptions.filter.fieldName);

            if (hasExistingFilter) {
              searchOptions.filter = {
                operator: "and",
                criteria: [searchOptions.filter, wrappedFilter],
              };
            } else {
              searchOptions.filter = wrappedFilter;
            }
          }
        }

        // 3. Convertir la pagination
        // ✅ FIX PAGINATION: Utiliser les valeurs d'Axelor (searchOptionsRef) au lieu de DevExtreme (loadOptions)
        // Quand Axelor change de page via sa toolbar, il met à jour searchOptions.offset/limit
        // Mais DevExtreme passe loadOptions.skip=0 car il ne gère pas la pagination Axelor
        if (searchOptionsRef?.current?.offset !== undefined) {
          searchOptions.offset = searchOptionsRef.current.offset;
        } else if (loadOptions.skip !== undefined) {
          searchOptions.offset = loadOptions.skip;
        }
        if (searchOptionsRef?.current?.limit !== undefined) {
          searchOptions.limit = searchOptionsRef.current.limit;
        } else if (loadOptions.take !== undefined) {
          searchOptions.limit = loadOptions.take;
        }

        const result = await dataStore.search(searchOptions);

        return {
          data: JSON.parse(JSON.stringify(result.records)),
          totalCount: result.page.totalCount || result.records.length,
        };
      } catch (error) {
        console.error("[DxDataSource] Error loading data:", error);
        throw error;
      }
    },

    /**
     * Lire un enregistrement par sa clé
     */
    byKey: async (key) => {
      try {
        const record = await dataStore.read(key, { fields: fieldsToFetch });
        return record;
      } catch (error) {
        console.error("[DxDataSource] Error reading record:", error);
        throw error;
      }
    },

    /**
     * Insérer un nouvel enregistrement
     */
    insert: async (values) => {
      try {
        // Lire les valeurs depuis le formAtom au lieu des params DevExtreme
        let recordToSave = values;
        if (editingRowFormAtomRef?.current) {
          const store = editingRowStoreRef?.current || getDefaultStore();
          const formState = store.get(editingRowFormAtomRef.current) as any;
          if (formState?.record && Object.keys(formState.record).length > 0) {
            recordToSave = formState.record;
          }
        }

        // Supprimer l'ID négatif pour les nouvelles lignes
        const { id, ...dataToSave } = recordToSave;

        const result = await dataStore.save(dataToSave, { fields: fieldsToFetch });
        return result;
      } catch (error) {
        console.error("[DxDataSource] Error inserting record:", error);
        throw error;
      }
    },

    /**
     * Mettre à jour un enregistrement existant
     */
    update: async (key, values) => {
      try {
        const originalRecord = await dataStore.read(key, { fields: fieldsToFetch });
        const clonedOriginal = JSON.parse(JSON.stringify(originalRecord));

        // Lire les valeurs depuis le formAtom au lieu des params DevExtreme
        let valuesToMerge = values;
        if (editingRowFormAtomRef?.current) {
          const store = editingRowStoreRef?.current || getDefaultStore();
          const formState = store.get(editingRowFormAtomRef.current) as any;
          if (formState?.record && Object.keys(formState.record).length > 0) {
            valuesToMerge = formState.record;
          }
        }

        // ✅ FIX: Toujours utiliser la version du serveur pour éviter OptimisticLockException
        // Le formAtom peut contenir une version obsolète (ex: version=0 après un insert)
        const recordToSave = { ...clonedOriginal, ...valuesToMerge, version: clonedOriginal.version };
        const result = await dataStore.save(recordToSave, { fields: fieldsToFetch });

        return JSON.parse(JSON.stringify(result));
      } catch (error) {
        console.error("[DxDataSource] Error updating record:", error);
        throw error;
      }
    },

    /**
     * Supprimer un enregistrement
     */
    remove: async (key) => {
      try {
        const record = await dataStore.read(key, { fields: ["id", "version"] });
        await dataStore.delete({ id: key, version: record.version ?? 0 });
      } catch (error) {
        console.error("[DxDataSource] Error removing record:", error);
        throw error;
      }
    },
  });

  const dataSource = new DataSource({
    store: dxStore,
    // Note: Ne pas utiliser reshapeOnPush car ça déclenche une keyset pagination
    // qui génère des filtres curseurs incompatibles avec Axelor
  });

  enableDataSourceDebug(dataSource);

  // Synchroniser la sélection avec le GridState
  if (selectionSync) {
    const { setState, getRows } = selectionSync;
    const store = getDefaultStore();

    const unsubscribe = store.sub(selectedRowsListAtom, () => {
      const selectedKeys = store.get(selectedRowsListAtom);
      const rows = getRows();

      const selectedIndices: number[] = [];
      selectedKeys.forEach((key: any) => {
        const index = rows.findIndex((row) => row.record?.id === key);
        if (index !== -1) {
          selectedIndices.push(index);
        }
      });

      setState((draft) => {
        draft.selectedRows = selectedIndices.length > 0 ? selectedIndices : null;
      });
    });

    (dataSource as any)._selectionUnsubscribe = unsubscribe;
  }

  return dataSource;
}
