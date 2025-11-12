import React from "react";
import { dxLog } from "@/utils/dev-tools";
import { getGridInstance } from "./dx-grid-utils";
import type { DataGrid } from "devextreme-react/data-grid";
import type DataSource from "devextreme/data/data_source";

/**
 * Flag pour activer/désactiver les monkey patches de debug
 * Mettre à true pour activer les traces de diagnostic
 */
export const DX_GRID_DEBUG_ENABLED = false;

/**
 * Applique les monkey patches de diagnostic sur le DataGrid
 *
 * Traces :
 * - Ordre d'exécution des controllers (data vs editing)
 * - Appels à optionChanged sur DataController et EditingController
 * - Appels à _refreshDataSource avec la cause (option qui a changé)
 */
export function enableDxGridDebug(dataGridRef: React.RefObject<React.ElementRef<typeof DataGrid> | null>) {
  if (!DX_GRID_DEBUG_ENABLED) return () => {};

  const gridInstance = getGridInstance(dataGridRef);
  if (!gridInstance) return () => {};

  const dataController = gridInstance.getController('data');
  const editingController = gridInstance.getController('editing');
  if (!dataController || !editingController) return () => {};

  // 1. Vérifier l'ordre des controllers
  const controllerNames = Object.keys((gridInstance as any)._controllers);
  dxLog("[MONKEY PATCH] Controllers order:", controllerNames);
  const dataIndex = controllerNames.indexOf('data');
  const editingIndex = controllerNames.indexOf('editing');
  dxLog(`[MONKEY PATCH] data at index ${dataIndex}, editing at index ${editingIndex}`);

  // 2. Variable pour capturer les derniers arguments de optionChanged
  let lastOptionChangedArgs: any = null;

  // 3. Patcher les optionChanged pour capturer les arguments
  const original_data_optionChanged = dataController.optionChanged.bind(dataController);
  const original_editing_optionChanged = editingController.optionChanged.bind(editingController);

  dataController.optionChanged = function(args: any) {
    // Capturer les arguments
    lastOptionChangedArgs = { name: args.name, fullName: args.fullName, handled: args.handled };
    const result = original_data_optionChanged(args);
    return result;
  };

  editingController.optionChanged = function(args: any) {
    if (args.name === 'editing') {
      dxLog(`[PATCH EDITING] optionChanged - fullName=${args.fullName}, handled=${args.handled}`);
    }
    const result = original_editing_optionChanged(args);
    if (args.name === 'editing') {
      dxLog(`[PATCH EDITING] optionChanged done - handled=${args.handled}`);
    }
    return result;
  };

  // 4. Patcher _refreshDataSource pour tracer QUI l'a appelé
  const original_refreshDataSource = dataController._refreshDataSource.bind(dataController);

  dataController._refreshDataSource = function(...args: any[]) {
    const stack = new Error().stack;
    dxLog("[PATCH] _refreshDataSource called - CAUSED BY optionChanged:", lastOptionChangedArgs);
    dxLog("[PATCH] _refreshDataSource - STACK:", stack);
    return original_refreshDataSource(...args);
  };

  dxLog("[PATCH] optionChanged + _refreshDataSource patched successfully");

  // Retourner une fonction cleanup
  return () => {
    dataController.optionChanged = original_data_optionChanged;
    editingController.optionChanged = original_editing_optionChanged;
    dataController._refreshDataSource = original_refreshDataSource;
  };
}

/**
 * Applique les monkey patches de diagnostic sur le DataSource
 *
 * Traces :
 * - Appels à load() avec la stack trace
 * - Appels à reload() avec la stack trace
 */
export function enableDataSourceDebug(dataSource: DataSource) {
  if (!DX_GRID_DEBUG_ENABLED) return () => {};

  const originalLoad = dataSource.load.bind(dataSource);
  const originalReload = dataSource.reload.bind(dataSource);

  dataSource.load = function(...args: any[]) {
    const stack = new Error().stack;
    dxLog("[DataSource] load() called MONKEY PATCH STACK:", stack);
    return originalLoad.apply(this, args as any);
  };

  dataSource.reload = function(...args: any[]) {
    const stack = new Error().stack;
    dxLog("[DataSource] reload() called MONKEY PATCH STACK:", stack);
    return originalReload.apply(this, args as any);
  };

  // Retourner une fonction cleanup
  return () => {
    dataSource.load = originalLoad;
    dataSource.reload = originalReload;
  };
}