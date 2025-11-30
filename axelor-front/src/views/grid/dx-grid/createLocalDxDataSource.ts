import CustomStore from "devextreme/data/custom_store";
import DataSource from "devextreme/data/data_source";
import { DataRecord } from "@/services/client/data.types";
import { enableDataSourceDebug } from "./dx-grid-debug";
import { GridRow } from "@axelor/ui/grid";
import { getDefaultStore } from "jotai";
import { selectedRowsListAtom } from "./selectionAtoms";

/**
 * Handlers pour les opérations CRUD en mode local (OneToMany)
 */
export interface LocalDataSourceHandlers {
  onUpdate?: (record: DataRecord) => Promise<DataRecord>;
  onSave?: (record: DataRecord) => Promise<DataRecord>;
  onDelete?: (records: DataRecord[]) => Promise<void>;
}

/**
 * Options pour la synchronisation de sélection
 */
export interface SelectionSyncOptions {
  setState: (updater: (draft: any) => void) => void;
  getRows: () => GridRow[];
}

/**
 * Crée un DataSource DevExtreme en mode local pour OneToMany/panel-related
 *
 * Différences avec createDxDataSource :
 * - Utilise un array local de records au lieu de dataStore.search()
 * - Appelle les handlers OneToMany (onUpdate, onSave) au lieu de dataStore.save()
 * - Pas d'appel serveur pour le load() - données déjà en mémoire
 * - Support du tri/filtrage côté client
 * - Synchronise automatiquement la sélection avec GridState
 */
export function createLocalDxDataSource(
  records: DataRecord[],
  handlers: LocalDataSourceHandlers = {},
  selectionSync?: SelectionSyncOptions,
  editingRowFormAtomRef?: React.MutableRefObject<any>,
  editingRowStoreRef?: React.MutableRefObject<any>
) {
  const localStore = new CustomStore({
    key: "id",

    /**
     * Charger les données depuis l'array local
     */
    load: async () => {
      try {
        return {
          data: JSON.parse(JSON.stringify(records)),
          totalCount: records.length,
        };
      } catch (error) {
        console.error("[LocalDxDataSource] Error loading data:", error);
        throw error;
      }
    },

    /**
     * Lire un enregistrement par sa clé depuis l'array local
     */
    byKey: async (key) => {
      try {
        const record = records.find((r) => r.id === key);
        if (!record) {
          throw new Error(`Record with id ${key} not found`);
        }
        return JSON.parse(JSON.stringify(record));
      } catch (error) {
        console.error("[LocalDxDataSource] Error reading record:", error);
        throw error;
      }
    },

    /**
     * Insérer un nouvel enregistrement
     */
    insert: async (values) => {
      try {
        if (!handlers.onSave) {
          console.warn("[LocalDxDataSource] onSave handler not provided");
          return values;
        }

        // Lire les valeurs depuis le formAtom au lieu des params DevExtreme
        let recordToSave = values;
        if (editingRowFormAtomRef?.current) {
          const store = editingRowStoreRef?.current || getDefaultStore();
          const formState = store.get(editingRowFormAtomRef.current) as any;
          if (formState?.record) {
            recordToSave = formState.record;
          }
        }

        const result = await handlers.onSave(recordToSave);
        return result;
      } catch (error) {
        console.error("[LocalDxDataSource] Error inserting record:", error);
        throw error;
      }
    },

    /**
     * Mettre à jour un enregistrement existant
     */
    update: async (key, values) => {
      try {
        if (!handlers.onUpdate) {
          console.warn("[LocalDxDataSource] onUpdate handler not provided");
          return values;
        }

        const originalRecord = records.find((r) => r.id === key);
        if (!originalRecord) {
          throw new Error(`Record with id ${key} not found`);
        }

        // Lire les valeurs depuis le formAtom au lieu des params DevExtreme
        let valuesToMerge = values;
        if (editingRowFormAtomRef?.current) {
          const store = editingRowStoreRef?.current || getDefaultStore();
          const formState = store.get(editingRowFormAtomRef.current) as any;
          if (formState?.record) {
            valuesToMerge = formState.record;
          }
        }

        const recordToSave = { ...originalRecord, ...valuesToMerge };
        const result = await handlers.onUpdate(recordToSave);

        return JSON.parse(JSON.stringify(result));
      } catch (error) {
        console.error("[LocalDxDataSource] Error updating record:", error);
        throw error;
      }
    },

    /**
     * Supprimer un enregistrement
     */
    remove: async (key) => {
      try {
        if (!handlers.onDelete) {
          console.warn("[LocalDxDataSource] onDelete handler not provided");
          return;
        }

        const record = records.find((r) => r.id === key);
        if (!record) {
          throw new Error(`Record with id ${key} not found`);
        }

        await handlers.onDelete([record]);
      } catch (error) {
        console.error("[LocalDxDataSource] Error removing record:", error);
        throw error;
      }
    },
  });

  const dataSource = new DataSource({
    store: localStore,
    reshapeOnPush: true,
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
