import React, { useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { Provider, createStore } from "jotai";
import { ScopeProvider } from "bunshi/react";
import { ClickAwayListener } from "@axelor/ui";
import type { GridView } from "@/services/client/meta.types";
import type { DataContext, DataRecord } from "@/services/client/data.types";
import { useFormHandlers } from "@/views/form/builder/form";
import { FormScope, ActionDataHandler } from "@/views/form/builder/scope";
import { useAsyncEffect } from "@/hooks/use-async-effect";
import { DxCell } from "./DxCell";
import { calculateFixedOffsets } from "./columnFixingUtils";

interface DxEditRowProps {
  /** ✅ FIX MULTI-GRID: ID unique de la grille pour filtrer les clickAway events */
  gridId: string;
  /** Données de la ligne (row.data) */
  rowData: DataRecord;
  /** Clé de la ligne (row.key) */
  rowKey: any;
  /** Colonnes DevExtreme */
  columns: any[];
  /** Map des props de colonnes indexée par dataField pour lookup O(1) */
  columnPropsMap: Map<string, any>;
  /** Vue de la grille */
  view: GridView;
  /** Fields metadata */
  fields: Record<string, any>;
  /** Contexte de la vue */
  viewContext?: DataContext;
  /** Update handler */
  onUpdate?: (record: any) => Promise<any>;
  /** Handler pour clic en dehors de la ligne (auto-save)
   * Reçoit le store, formAtom, gridId et rowKey LOCAUX de cette ligne pour éviter les conflits entre grilles O2M
   */
  onClickAway?: (event: Event, store: any, formAtom: any, gridId: string, rowKey: any) => void | Promise<void>;
  /** Parent formAtom for O2M context (triggers onChange/onNew with correct context) */
  parentFormAtom?: any;
  /** Callback to notify parent when formAtom is ready */
  onFormAtomReady?: (formAtom: any) => void;
  /** Instance du DevExtreme DataGrid (pour synchronisation formAtom) */
  gridInstance?: any;
  /** Index de la ligne en édition (pour synchronisation formAtom) */
  rowIndex?: number;
  /** ✅ FIX DOUBLE TRIGGER: Ref partagé pour tracker si c'est une NOUVELLE ligne
   * Passé comme REF (pas valeur) pour pouvoir le reset après exécution de onNew
   * et éviter les doubles déclenchements lors des remontages DevExtreme */
  isNewRowRef?: React.MutableRefObject<boolean>;
  /** ✅ FIX RACE CONDITION: Ref partagé pour le formAtom - permet mise à jour synchrone entre DxEditRow */
  editingRowFormAtomRef?: React.MutableRefObject<any>;
  /** ✅ FIX: Store existant à réutiliser (doit correspondre à existingFormAtom) */
  existingStore?: any;
}

/**
 * Composant d'édition de ligne pour DevExtreme Grid.
 *
 * Utilisé par dataRowRender quand la ligne est en mode édition.
 * Retourne <tr> avec des <td> pour satisfaire DevExtreme.
 * Utilise editCellRender de colProps pour rendre les widgets Axelor.
 */
export const DxEditRow = React.memo(function DxEditRow(props: DxEditRowProps) {
  const { gridId, rowData, rowKey, columns, columnPropsMap, view, fields, viewContext, onUpdate, onClickAway, parentFormAtom, onFormAtomReady, isNewRowRef, editingRowFormAtomRef, existingStore } = props;

  // ✅ FIX DOUBLE TRIGGER: Lire la valeur du ref (sera reset à false après exécution de onNew)
  const isNewRow = isNewRowRef?.current ?? false;

  // ✅ FIX RACE CONDITION: Lire le formAtom existant du ref SYNCHRONEMENT au render
  // Cela permet aux DxEditRow montés en parallèle de partager le même formAtom
  const existingFormAtom = editingRowFormAtomRef?.current;

  // ✅ FIX DevExtreme v22 Portal Context Isolation:
  // Créer un store Jotai DÉDIÉ pour cette ligne d'édition.
  // DevExtreme v22 utilise ReactDOM.createPortal() pour rendre les templates,
  // ce qui casse la propagation du contexte React. En créant un store dédié
  // et en le passant au parent via onFormAtomReady, on garantit que :
  // 1. Les widgets utilisent ce store via <Provider store={store}>
  // 2. saveEditingRowAndClose utilise le MÊME store pour lire formAtom
  //
  // ✅ FIX REMONTAGE: Si existingStore est fourni, le réutiliser pour éviter
  // de perdre l'état lors du remontage de DxEditRow par DevExtreme
  const store = useMemo(() => existingStore || createStore(), [existingStore]);

  // ✅ SOLUTION : Mémoriser rowData initial pour éviter de recréer formAtom
  // quand rowData change (à cause des modifications de cellule)
  const initialRowDataRef = useRef<DataRecord | null>(null);
  if (!initialRowDataRef.current) {
    initialRowDataRef.current = rowData;
  }

  // ✅ FIX: Mémoriser l'objet meta pour éviter que useFormHandlers recrée le formAtom
  // à chaque render. Sans useMemo, { view, fields, model } est un NOUVEL objet
  // à chaque render, ce qui fait changer les dépendances du useMemo interne
  // de useFormHandlers, recréant ainsi le formAtom et perdant les modifications !
  const metaForForm = useMemo(() => ({
    view,
    fields,
    model: view.model,
  }), [view, fields]);

  // ✅ FIX REMONTAGE: Si existingFormAtom est fourni, le réutiliser pour éviter
  // de perdre les modifications lors du remontage de DxEditRow par DevExtreme
  const { formAtom, actionExecutor, actionHandler, recordHandler } = useFormHandlers(
    metaForForm as any,
    initialRowDataRef.current, // Toujours utiliser le rowData initial
    {
      parent: parentFormAtom,  // ← AJOUTER pour que le contexte ait _parent
      formAtom: existingFormAtom,  // ✅ Réutiliser le formAtom existant si fourni
    }
  );

  // ✅ FIX RACE CONDITION: Mettre à jour le ref SYNCHRONEMENT si on a créé un nouveau formAtom
  // C'est safe de modifier un ref pendant le render car il n'est pas tracké par React
  // Cela permet aux DxEditRow montés en parallèle de partager le même formAtom
  if (!existingFormAtom && editingRowFormAtomRef && formAtom) {
    editingRowFormAtomRef.current = formAtom;
  }

  // Ref pour la ligne <tr> pour accéder aux inputs après le rendu
  const rowRef = useRef<HTMLTableRowElement>(null);

  // Notifier le parent que le formAtom ET le store sont prêts (pour accès depuis saveEditingRowAndClose)
  // ✅ FIX: Passer aussi le store dédié pour que saveEditingRowAndClose puisse lire formAtom
  // depuis le même store que celui utilisé par les widgets
  // ✅ FIX TIMING: useLayoutEffect au lieu de useEffect pour notifier AVANT le prochain render
  // DevExtreme peut appeler DxRow plusieurs fois en succession rapide, et si on utilise useEffect,
  // le second appel verra un ref vide car useEffect s'exécute après le render (trop tard).
  useLayoutEffect(() => {
    onFormAtomReady?.({ formAtom, store });
  }, [formAtom, store, onFormAtomReady]);

  // Ref pour éviter les exécutions multiples du trigger onNew (à cause de re-renders)
  const onNewExecutedRef = useRef(false);

  // Exécuter les triggers O2M (onNew/onChange) comme le fait FormRenderer
  // ✅ IMPORTANT : isNewRow vient de isNewRowRef qui est set dans handleInitNewRow (true) ou handleEditingStart (false)
  // Cela permet de distinguer :
  // - Création d'une NOUVELLE ligne via "+" → isNewRow=true → trigger onNew
  // - Ré-édition d'une ligne existante (même avec ID négatif) → isNewRow=false → pas de trigger onNew
  useAsyncEffect(async () => {
    const { onNew } = view;
    // ✅ FIX DOUBLE TRIGGER: Lire directement depuis le ref pour avoir la valeur la plus récente
    // (isNewRow local pourrait être stale si le composant est remonté)
    const isNewRowCurrent = isNewRowRef?.current ?? false;
    const onNewAction = isNewRowCurrent && onNew;

    // ✅ Exécuter seulement si c'est une VRAIE nouvelle ligne ET pas déjà exécuté
    // Le ref évite les exécutions multiples dues aux re-renders (actionExecutor qui change de référence)
    if (onNewAction && !onNewExecutedRef.current) {
      onNewExecutedRef.current = true;

      // ✅ FIX DOUBLE TRIGGER: Reset le ref AVANT d'exécuter pour éviter double trigger
      // si DevExtreme remonte le composant pendant l'exécution async
      if (isNewRowRef) {
        isNewRowRef.current = false;
      }

      await actionExecutor.execute(onNewAction);
    }
  }, [view, actionExecutor, rowKey, isNewRowRef]);

  // Fix Tab navigation : définir tabIndex={-1} sur les inputs readonly
  // pour que le browser les saute lors de la navigation Tab
  useEffect(() => {
    if (rowRef.current) {
      const readonlyInputs = rowRef.current.querySelectorAll('input[readonly]');
      readonlyInputs.forEach((input) => {
        (input as HTMLInputElement).tabIndex = -1;
      });
    }
  }, [rowKey]); // Re-run quand la ligne change

  /**
   * Handler pour intercepter Tab/Shift+Tab et naviguer dans la ligne d'édition
   * Sans ce handler, le focus sort de la ligne vers les filtres de colonnes
   * car DevExtreme dataRowRender crée un DOM personnalisé que le browser ne gère pas correctement
   */
  const handleKeyDown = useMemo(() => {
    return (e: React.KeyboardEvent<HTMLTableRowElement>) => {
      if (e.key !== 'Tab') return;

      const row = rowRef.current;
      if (!row) return;

      // Trouver tous les inputs éditables dans la ligne (dans l'ordre DOM)
      const editableInputs = Array.from(
        row.querySelectorAll('input:not([readonly]):not([tabindex="-1"]), select:not([disabled]), textarea:not([readonly])')
      ) as HTMLElement[];

      if (editableInputs.length === 0) return;

      // Trouver l'input actuellement focusé
      const activeElement = document.activeElement as HTMLElement;
      const currentIndex = editableInputs.indexOf(activeElement);

      if (currentIndex === -1) return;

      // Intercepter TOUS les Tab pour empêcher le focus de sortir de la ligne
      e.preventDefault();
      e.stopPropagation();

      const isShiftPressed = e.shiftKey;
      let nextIndex: number;

      if (isShiftPressed) {
        // Shift+Tab : aller à l'input précédent (boucler si premier)
        nextIndex = currentIndex === 0 ? editableInputs.length - 1 : currentIndex - 1;
      } else {
        // Tab : aller à l'input suivant (boucler si dernier)
        nextIndex = currentIndex === editableInputs.length - 1 ? 0 : currentIndex + 1;
      }

      const nextInput = editableInputs[nextIndex];
      if (nextInput) {
        nextInput.focus();
        // Sélectionner le texte si c'est un input texte
        if (nextInput instanceof HTMLInputElement && (nextInput.type === 'text' || nextInput.type === '')) {
          nextInput.select();
        }
      }
    };
  }, []);

  // Calculer les offsets pour les colonnes fixées (pour position: sticky)
  const { leftOffsets, rightOffsets } = useMemo(
    () => calculateFixedOffsets(columns),
    [columns]
  );

  // ✅ FIX: Wrapper onClickAway pour passer le store, formAtom, gridId et rowKey LOCAUX
  // Cela évite les conflits quand plusieurs grilles O2M sont sur la même page
  // et garantit que seul le DxEditRow de la ligne en édition sauvegarde
  const handleClickAway = useMemo(() => {
    if (!onClickAway) return undefined;
    return (event: Event) => {
      onClickAway(event, store, formAtom, gridId, rowKey);
    };
  }, [onClickAway, store, formAtom, gridId, rowKey]);

  // Construire le contenu de la ligne (tr) avec les cellules
  // Si onClickAway est défini, wrapper le <tr> avec ClickAwayListener
  const rowContent = handleClickAway ? (
    <ClickAwayListener onClickAway={handleClickAway}>
      <tr ref={rowRef} className="dx-row dx-data-row dx-row-lines" onKeyDown={handleKeyDown}>
        {columns.map((col: any, index: number) => {
          const key = col.dataField || `col_${index}`;
          const leftOffset = leftOffsets.get(col.dataField || col.name || col.caption);
          const rightOffset = rightOffsets.get(col.dataField || col.name || col.caption);

          // Colonnes sans dataField (système) → cellule vide
          if (!col.dataField) {
            return (
              <DxCell key={key} col={col} leftOffset={leftOffset} rightOffset={rightOffset}>
                {/* Cellule vide */}
              </DxCell>
            );
          }

          // Lookup O(1) dans la Map des props de colonnes
          const colProps = columnPropsMap.get(col.dataField);

          // Si la colonne a un editCellRender ou cellRender, l'utiliser
          // editCellRender en priorité, puis cellRender (fallback pour colonnes sans rendu spécial en édition)
          if (colProps?.editCellRender || colProps?.cellRender) {
            const cellData = {
              data: rowData,
              value: rowData?.[col.dataField],
              displayValue: rowData?.[col.dataField],
              row: { data: rowData, key: rowKey },
              column: col,
              rowIndex: index,
              key: rowKey,
              // IMPORTANT: Passer formAtom, store et actionExecutor via cellData
              formAtom: formAtom,
              store: store,  // Pour debug: comparer store.get() vs useAtomValue()
              actionExecutor: actionExecutor,
            };

            // Utiliser editCellRender en priorité, sinon cellRender (fallback)
            const renderedCell = colProps.editCellRender
              ? colProps.editCellRender(cellData)
              : colProps.cellRender(cellData);

            return (
              <DxCell key={key} col={col} leftOffset={leftOffset} rightOffset={rightOffset}>
                {renderedCell}
              </DxCell>
            );
          }

          // Sinon, afficher la valeur brute (fallback)
          return (
            <DxCell key={key} col={col} leftOffset={leftOffset} rightOffset={rightOffset}>
              {rowData[col.dataField]}
            </DxCell>
          );
        })}
      </tr>
    </ClickAwayListener>
  ) : (
    <tr ref={rowRef} className="dx-row dx-data-row dx-row-lines" onKeyDown={handleKeyDown}>
      {columns.map((col: any, index: number) => {
        const key = col.dataField || `col_${index}`;
        const leftOffset = leftOffsets.get(col.dataField || col.name || col.caption);
        const rightOffset = rightOffsets.get(col.dataField || col.name || col.caption);

        // Colonnes sans dataField (système) → cellule vide
        if (!col.dataField) {
          return (
            <DxCell key={key} col={col} leftOffset={leftOffset} rightOffset={rightOffset}>
              {/* Cellule vide */}
            </DxCell>
          );
        }

        // Lookup O(1) dans la Map des props de colonnes
        const colProps = columnPropsMap.get(col.dataField);

        // Si la colonne a un editCellRender ou cellRender, l'utiliser
        // editCellRender en priorité, puis cellRender (fallback pour colonnes sans rendu spécial en édition)
        if (colProps?.editCellRender || colProps?.cellRender) {
          const cellData = {
            data: rowData,
            value: rowData?.[col.dataField],
            displayValue: rowData?.[col.dataField],
            row: { data: rowData, key: rowKey },
            column: col,
            rowIndex: index,
            key: rowKey,
            // IMPORTANT: Passer formAtom, store et actionExecutor via cellData
            formAtom: formAtom,
            store: store,  // Pour debug: comparer store.get() vs useAtomValue()
            actionExecutor: actionExecutor,
          };

          // Utiliser editCellRender en priorité, sinon cellRender (fallback)
          const renderedCell = colProps.editCellRender
            ? colProps.editCellRender(cellData)
            : colProps.cellRender(cellData);

          return (
            <DxCell key={key} col={col} leftOffset={leftOffset} rightOffset={rightOffset}>
              {renderedCell}
            </DxCell>
          );
        }

        // Sinon, afficher la valeur brute (fallback)
        return (
          <DxCell key={key} col={col} leftOffset={leftOffset} rightOffset={rightOffset}>
            {rowData[col.dataField]}
          </DxCell>
        );
      })}
    </tr>
  );

  // Wrapper le contenu dans ScopeProvider pour injecter le bon actionExecutor
  // Cela permet à FormWidget d'utiliser l'actionExecutor de la grid row au lieu de celui du parent form
  //
  // ✅ FIX DevExtreme v22: Wrapper avec Provider Jotai utilisant un store DÉDIÉ
  // DevExtreme v22 rend les templates via createPortal() qui perd le contexte React.
  // Le store dédié (créé avec createStore()) est passé au parent via onFormAtomReady
  // pour que saveEditingRowAndClose puisse lire l'état depuis le même store.
  return (
    <Provider store={store}>
      <ScopeProvider
        scope={FormScope}
        value={{
          formAtom,
          actionExecutor,
          actionHandler,
          recordHandler,
        }}
      >
        {/* ActionDataHandler gère l'application des valeurs/attrs retournées par les actions */}
        <ActionDataHandler formAtom={formAtom} />
        {rowContent}
      </ScopeProvider>
    </Provider>
  );
}, (prev, next) => {
  // Comparaison custom pour éviter re-renders inutiles
  // IMPORTANT : On ignore les changements de rowData pendant l'édition
  // car le formAtom (créé par useFormHandlers) est la source de vérité, pas rowData.
  // Cela évite de démonter/remonter le ClickAwayListener à chaque changement de valeur,
  // ce qui causait des auto-save intempestifs lors de la fermeture des dropdowns.
  const isEqual = (
    prev.gridId === next.gridId &&  // ✅ FIX MULTI-GRID
    prev.rowKey === next.rowKey &&
    // prev.rowData === next.rowData &&  // ❌ IGNORÉ pendant l'édition
    prev.columns === next.columns &&
    prev.columnPropsMap === next.columnPropsMap &&
    prev.view === next.view &&
    prev.fields === next.fields &&
    prev.viewContext === next.viewContext &&
    prev.onUpdate === next.onUpdate &&
    prev.onClickAway === next.onClickAway &&
    prev.parentFormAtom === next.parentFormAtom &&
    prev.onFormAtomReady === next.onFormAtomReady &&
    // ✅ FIX DOUBLE TRIGGER: Le ref lui-même ne change pas, donc pas besoin de comparer
    prev.isNewRowRef === next.isNewRowRef &&
    // ✅ FIX RACE CONDITION: Le ref lui-même ne change pas, donc pas besoin de comparer
    prev.editingRowFormAtomRef === next.editingRowFormAtomRef &&
    prev.existingStore === next.existingStore
  );

  return isEqual;
});