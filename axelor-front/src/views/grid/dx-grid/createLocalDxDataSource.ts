import CustomStore from "devextreme/data/custom_store";
import DataSource from "devextreme/data/data_source";
import { DataRecord } from "@/services/client/data.types";
import { dxLog } from "@/utils/dev-tools";
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
  editingRowFormAtomRef?: React.MutableRefObject<any>
) {
  dxLog("[LocalDxDataSource] Creating with", records.length, "records");

  const localStore = new CustomStore({
    key: "id",

    /**
     * Charger les données depuis l'array local
     * Pas d'appel serveur - DevExtreme gère le tri/filtrage côté client
     */
    load: async () => {
      dxLog("[LocalDxDataSource] load() called - returning local records");

      try {
        // Cloner les records pour éviter les problèmes d'immutabilité
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
      dxLog("[LocalDxDataSource] byKey called with key:", key);

      try {
        const record = records.find((r) => r.id === key);
        if (!record) {
          throw new Error(`Record with id ${key} not found`);
        }
        dxLog("[LocalDxDataSource] byKey result:", record);
        return JSON.parse(JSON.stringify(record));
      } catch (error) {
        console.error("[LocalDxDataSource] Error reading record:", error);
        throw error;
      }
    },

    /**
     * Insérer un nouvel enregistrement (nouveau record dans OneToMany)
     */
    insert: async (values) => {
      dxLog("[LocalDxDataSource] insert called with DevExtreme values:", values);

      try {
        if (!handlers.onSave) {
          console.warn("[LocalDxDataSource] onSave handler not provided");
          return values;
        }

        // ✅ SOLUTION : Lire les valeurs depuis le formAtom au lieu des params DevExtreme
        // DevExtreme ne peut pas extraire les valeurs des widgets Axelor custom (avec dataRowRender)
        let recordToSave = values;
        if (editingRowFormAtomRef?.current) {
          const store = getDefaultStore();
          const formState = store.get(editingRowFormAtomRef.current) as any;
          if (formState?.record) {
            recordToSave = formState.record;
            dxLog("[LocalDxDataSource] Using values from formAtom instead of DevExtreme:", recordToSave);
          }
        }

        const result = await handlers.onSave(recordToSave);
        dxLog("[LocalDxDataSource] insert result:", result);

        return result;
      } catch (error) {
        console.error("[LocalDxDataSource] Error inserting record:", error);
        throw error;
      }
    },

    /**
     * Mettre à jour un enregistrement existant (édition inline dans OneToMany)
     */
    update: async (key, values) => {
      dxLog("[LocalDxDataSource] update called with key:", key, "DevExtreme values:", values);

      try {
        if (!handlers.onUpdate) {
          console.warn("[LocalDxDataSource] onUpdate handler not provided");
          return values;
        }

        // Récupérer le record original
        const originalRecord = records.find((r) => r.id === key);
        if (!originalRecord) {
          throw new Error(`Record with id ${key} not found`);
        }
        dxLog("[LocalDxDataSource] Original record found:", originalRecord);

        // ✅ SOLUTION : Lire les valeurs depuis le formAtom au lieu des params DevExtreme
        // DevExtreme ne peut pas extraire les valeurs des widgets Axelor custom (avec dataRowRender)
        let valuesToMerge = values;
        if (editingRowFormAtomRef?.current) {
          const store = getDefaultStore();
          const formState = store.get(editingRowFormAtomRef.current) as any;
          if (formState?.record) {
            valuesToMerge = formState.record;
            dxLog("[LocalDxDataSource] Using values from formAtom instead of DevExtreme:", valuesToMerge);
          }
        }

        // Fusionner les modifications avec le record original
        const recordToSave = { ...originalRecord, ...valuesToMerge };
        dxLog("[LocalDxDataSource] Merged record to save:", recordToSave);

        const result = await handlers.onUpdate(recordToSave);
        dxLog("[LocalDxDataSource] update result:", result);

        // Retourner une copie mutable
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
      dxLog("[LocalDxDataSource] remove called with key:", key);

      try {
        if (!handlers.onDelete) {
          console.warn("[LocalDxDataSource] onDelete handler not provided");
          return;
        }

        // Récupérer le record à supprimer
        const record = records.find((r) => r.id === key);
        if (!record) {
          throw new Error(`Record with id ${key} not found`);
        }
        dxLog("[LocalDxDataSource] Record to delete:", record);

        // Appeler le handler avec un array (OneToMany.onDelete prend un array)
        await handlers.onDelete([record]);
        dxLog("[LocalDxDataSource] Record deleted successfully");
      } catch (error) {
        console.error("[LocalDxDataSource] Error removing record:", error);
        throw error;
      }
    },
  });

  // Créer le DataSource DevExtreme avec le localStore
  const dataSource = new DataSource({
    store: localStore,
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

      dxLog("[LocalDxDataSource] Selection changed - selectedKeys:", selectedKeys, "rows count:", rows.length);

      // Convertir les keys en indices dans state.rows
      const selectedIndices: number[] = [];
      selectedKeys.forEach((key: any) => {
        const index = rows.findIndex((row) => row.record?.id === key);
        if (index !== -1) {
          selectedIndices.push(index);
        }
      });

      dxLog("[LocalDxDataSource] Converted to indices:", selectedIndices);

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