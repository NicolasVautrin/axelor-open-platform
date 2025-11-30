import CustomStore from "devextreme/data/custom_store";
import DataSource from "devextreme/data/data_source";
import { DataStore } from "@/services/client/data-store";
// dxLog removed - using console.log instead
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
  editingRowFormAtomRef?: React.MutableRefObject<any>,  // ✅ FIX: Ref vers le formAtom de la ligne en édition
  editingRowStoreRef?: React.MutableRefObject<any>,     // ✅ FIX DevExtreme v22: Store Jotai dédié
  currentSortByRef?: React.MutableRefObject<string[] | undefined>  // ✅ FIX: Ref pour le tri courant (géré par handleOptionChanged)
) {
  const dxGridStore = new CustomStore({
    key: "id",

    /**
     * Charger les données (appelé par DevExtreme lors du refresh)
     */
    load: async (loadOptions) => {
      try {
        console.log("[DxDataSource] loadOptions:", loadOptions);
        console.log("[DxDataSource] loadOptions.sort:", loadOptions.sort);
        console.log("[DxDataSource] loadOptions.group:", loadOptions.group);

        // Convertir les options DevExtreme en SearchOptions Axelor
        const searchOptions: any = {
          ...dataStore.options,
          fields: fieldsToFetch,
        };

        // 1. Convertir le tri
        const sortBy: string[] = [];
        const addedFields = new Set<string>(); // Pour éviter les doublons

        // ✅ FIX TRI SERVEUR: D'abord le tri choisi par l'utilisateur (depuis la ref)
        if (currentSortByRef?.current && currentSortByRef.current.length > 0) {
          currentSortByRef.current.forEach((s: string) => {
            // Extraire le nom du champ (sans le préfixe -)
            const fieldName = s.startsWith('-') ? s.substring(1) : s;
            if (!addedFields.has(fieldName)) {
              sortBy.push(s);
              addedFields.add(fieldName);
            }
          });
          console.log("[DxDataSource] Added sortBy from ref:", currentSortByRef.current);
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
          console.log("[DxDataSource] Merged with loadOptions.sort");
        }

        if (sortBy.length > 0) {
          searchOptions.sortBy = sortBy;
          console.log("[DxDataSource] Final sortBy:", sortBy);
        }

        // 2. Convertir le filtre
        if (loadOptions.filter) {
          const axelorFilter = convertDxFilterToAxelor(loadOptions.filter);
          if (axelorFilter) {
            // S'assurer que le filtre est toujours dans une structure Criteria
            // L'API Axelor attend { operator, criteria: [...] }, pas un Filter direct
            const wrappedFilter = (axelorFilter as any).criteria
              ? axelorFilter  // Déjà une structure Criteria
              : { operator: "and", criteria: [axelorFilter] };  // Wrapper le Filter simple

            // Fusionner avec le filtre existant du dataStore
            // Vérifier que le filtre existant n'est pas vide (après un reset)
            const hasExistingFilter = searchOptions.filter &&
              Object.keys(searchOptions.filter).length > 0 &&
              (searchOptions.filter.criteria?.length > 0 || searchOptions.filter.fieldName);

            if (hasExistingFilter) {
              // Si un filtre valide existe déjà, créer un AND avec le nouveau filtre
              searchOptions.filter = {
                operator: "and",
                criteria: [searchOptions.filter, wrappedFilter],
              };
            } else {
              searchOptions.filter = wrappedFilter;
            }
            console.log("[DxDataSource] Converted filter:", wrappedFilter);
          }
        }

        // 3. Convertir la pagination
        if (loadOptions.skip !== undefined) {
          searchOptions.offset = loadOptions.skip;
        }
        if (loadOptions.take !== undefined) {
          searchOptions.limit = loadOptions.take;
        }

        const result = await dataStore.search(searchOptions);

        // Cloner les records pour éviter les problèmes d'immutabilité
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
      console.log("[DxDataSource] byKey called with key:", key);

      try {
        const record = await dataStore.read(key, { fields: fieldsToFetch });
        console.log("[DxDataSource] byKey result:", record);
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
      console.log("[DxDataSource] insert called with DevExtreme values:", values);

      try {
        // ✅ SOLUTION : Lire les valeurs depuis le formAtom au lieu des params DevExtreme
        // DevExtreme ne peut pas extraire les valeurs des widgets Axelor custom (avec dataRowRender)
        // ✅ FIX DevExtreme v22: Utiliser le store DÉDIÉ passé par DxEditRow
        let recordToSave = values;
        if (editingRowFormAtomRef?.current) {
          const store = editingRowStoreRef?.current || getDefaultStore();
          const formState = store.get(editingRowFormAtomRef.current) as any;
          if (formState?.record && Object.keys(formState.record).length > 0) {
            recordToSave = formState.record;
            console.log("[DxDataSource] Using values from formAtom instead of DevExtreme:", recordToSave);
          }
        }

        // Supprimer l'ID négatif pour les nouvelles lignes (système Axelor)
        const { id, ...dataToSave } = recordToSave;

        const result = await dataStore.save(dataToSave, { fields: fieldsToFetch });
        console.log("[DxDataSource] insert result:", result);
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
      console.log("[DxDataSource] update called with key:", key, "DevExtreme values:", values);

      try {
        // Récupérer le record complet d'abord (comme handleSaving le faisait)
        const originalRecord = await dataStore.read(key, { fields: fieldsToFetch });
        console.log("[DxDataSource] Original record fetched:", originalRecord);

        // Cloner l'originalRecord pour éviter les problèmes d'immutabilité
        const clonedOriginal = JSON.parse(JSON.stringify(originalRecord));

        // ✅ SOLUTION : Lire les valeurs depuis le formAtom au lieu des params DevExtreme
        // DevExtreme ne peut pas extraire les valeurs des widgets Axelor custom (avec dataRowRender)
        // ✅ FIX DevExtreme v22: Utiliser le store DÉDIÉ passé par DxEditRow
        let valuesToMerge = values;
        if (editingRowFormAtomRef?.current) {
          const store = editingRowStoreRef?.current || getDefaultStore();
          const formState = store.get(editingRowFormAtomRef.current) as any;
          if (formState?.record && Object.keys(formState.record).length > 0) {
            valuesToMerge = formState.record;
            console.log("[DxDataSource] Using values from formAtom instead of DevExtreme:", valuesToMerge);
          }
        }

        // Fusionner les modifications avec le record cloné
        const recordToSave = { ...clonedOriginal, ...valuesToMerge };
        console.log("[DxDataSource] Merged record to save:", recordToSave);

        const result = await dataStore.save(recordToSave, { fields: fieldsToFetch });
        console.log("[DxDataSource] update result:", result);

        // Retourner une copie mutable pour éviter "Cannot assign to read only property"
        // DevExtreme peut essayer de modifier l'objet retourné
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
      console.log("[DxDataSource] remove called with key:", key);

      try {
        // Récupérer le record pour obtenir la version
        const record = await dataStore.read(key, { fields: ["id", "version"] });
        console.log("[DxDataSource] Record fetched for deletion:", record);

        // Supprimer avec id et version (version obligatoire)
        await dataStore.delete({ id: key, version: record.version ?? 0 });
        console.log("[DxDataSource] Record deleted successfully");
      } catch (error) {
        console.error("[DxDataSource] Error removing record:", error);
        throw error;
      }
    },
  });

  // Créer le DataSource DevExtreme avec le DxGridStore
  const dataSource = new DataSource({
    store: dxGridStore,
    reshapeOnPush: true, // Permettre les mises à jour push
  });

  // Monkey patches de diagnostic (activables via dx-grid-debug.ts)
  enableDataSourceDebug(dataSource);

  // Synchroniser la sélection (atoms) avec le GridState (state.selectedRows)
  if (selectionSync) {
    const { setState, getRows } = selectionSync;
    const store = getDefaultStore();

    // S'abonner aux changements de sélection via l'atom
    const unsubscribe = store.sub(selectedRowsListAtom, () => {
      const selectedKeys = store.get(selectedRowsListAtom);
      const rows = getRows();

      console.log("[DxDataSource] Selection changed - selectedKeys:", selectedKeys, "rows count:", rows.length);

      // Convertir les keys en indices dans state.rows
      const selectedIndices: number[] = [];
      selectedKeys.forEach((key: any) => {
        const index = rows.findIndex((row) => row.record?.id === key);
        if (index !== -1) {
          selectedIndices.push(index);
        }
      });

      console.log("[DxDataSource] Converted to indices:", selectedIndices);

      // Mettre à jour state.selectedRows pour la toolbar
      setState((draft) => {
        draft.selectedRows = selectedIndices.length > 0 ? selectedIndices : null;
      });
    });

    // Attacher le unsubscribe au dataSource pour cleanup
    (dataSource as any)._selectionUnsubscribe = unsubscribe;
  }

  return dataSource;
}
