import CustomStore from "devextreme/data/custom_store";
import DataSource from "devextreme/data/data_source";
import { DataStore } from "@/services/client/data-store";
import { dxLog } from "@/utils/dev-tools";
import { convertDxFilterToAxelor } from "./dx-filter-converter";
import { enableDataSourceDebug } from "./dx-grid-debug";

/**
 * Crée un DataSource DevExtreme qui wrappe le DataStore Axelor
 *
 * Avantages:
 * - DevExtreme gère automatiquement les opérations CRUD via le CustomStore
 * - Plus besoin de onSaving custom avec e.cancel = true
 * - refresh().done() fonctionne correctement car reload() retourne une Promise
 * - Architecture plus propre et standard
 */
export function createDxDataSource(dataStore: DataStore, fieldsToFetch: string[]) {
  const dxGridStore = new CustomStore({
    key: "id",

    /**
     * Charger les données (appelé par DevExtreme lors du refresh)
     */
    load: async (loadOptions) => {
      try {
        // Convertir les options DevExtreme en SearchOptions Axelor
        const searchOptions: any = {
          ...dataStore.options,
          fields: fieldsToFetch,
        };

        // 1. Convertir le tri et le groupement
        const sortBy: string[] = [];

        // Les groupBy viennent en premier dans le tri
        if (loadOptions.group && Array.isArray(loadOptions.group)) {
          loadOptions.group.forEach((g: any) => {
            const prefix = g.desc ? '-' : '';
            sortBy.push(`${prefix}${g.selector}`);
          });
        }

        // Puis les sorts normaux
        if (loadOptions.sort && Array.isArray(loadOptions.sort)) {
          loadOptions.sort.forEach((s: any) => {
            const prefix = s.desc ? '-' : '';
            sortBy.push(`${prefix}${s.selector}`);
          });
        }

        if (sortBy.length > 0) {
          searchOptions.sortBy = sortBy;
          dxLog("[DxDataSource] Converted sortBy:", sortBy);
        }

        // 2. Convertir le filtre
        if (loadOptions.filter) {
          const axelorFilter = convertDxFilterToAxelor(loadOptions.filter);
          if (axelorFilter) {
            // Fusionner avec le filtre existant du dataStore
            if (searchOptions.filter) {
              // Si un filtre existe déjà, créer un AND avec le nouveau filtre
              searchOptions.filter = {
                operator: "and",
                criteria: [searchOptions.filter, axelorFilter],
              };
            } else {
              searchOptions.filter = axelorFilter;
            }
            dxLog("[DxDataSource] Converted filter:", axelorFilter);
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
      dxLog("[DxDataSource] byKey called with key:", key);

      try {
        const record = await dataStore.read(key, { fields: fieldsToFetch });
        dxLog("[DxDataSource] byKey result:", record);
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
      dxLog("[DxDataSource] insert called with values:", values);

      try {
        // Supprimer l'ID négatif pour les nouvelles lignes (système Axelor)
        const { id, ...recordToSave } = values;

        const result = await dataStore.save(recordToSave, { fields: fieldsToFetch });
        dxLog("[DxDataSource] insert result:", result);
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
      dxLog("[DxDataSource] update called with key:", key, "values:", values);

      try {
        // Récupérer le record complet d'abord (comme handleSaving le faisait)
        const originalRecord = await dataStore.read(key, { fields: fieldsToFetch });
        dxLog("[DxDataSource] Original record fetched:", originalRecord);

        // Cloner l'originalRecord pour éviter les problèmes d'immutabilité
        const clonedOriginal = JSON.parse(JSON.stringify(originalRecord));

        // Fusionner les modifications avec le record cloné
        const recordToSave = { ...clonedOriginal, ...values };
        dxLog("[DxDataSource] Merged record to save:", recordToSave);

        const result = await dataStore.save(recordToSave, { fields: fieldsToFetch });
        dxLog("[DxDataSource] update result:", result);

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
      dxLog("[DxDataSource] remove called with key:", key);

      try {
        // Récupérer le record pour obtenir la version
        const record = await dataStore.read(key, { fields: ["id", "version"] });
        dxLog("[DxDataSource] Record fetched for deletion:", record);

        // Supprimer avec id et version (version obligatoire)
        await dataStore.delete({ id: key, version: record.version ?? 0 });
        dxLog("[DxDataSource] Record deleted successfully");
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

  return dataSource;
}
