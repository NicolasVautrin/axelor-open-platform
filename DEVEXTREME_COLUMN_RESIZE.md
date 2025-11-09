# DevExtreme DataGrid - Redimensionnement et Sauvegarde des Largeurs de Colonnes

## Date
2025-01-09

## Problème résolu
Les colonnes de la grid DevExtreme ne pouvaient pas être redimensionnées, et les largeurs personnalisées n'étaient pas sauvegardées.

## Solution implémentée

### 1. Activation du redimensionnement
Ajout des propriétés DevExtreme au composant DataGrid :
- `allowColumnResizing={true}` 
- `columnResizingMode="widget"`

### 2. Architecture de persistance
Deux états avec responsabilités séparées (validé par Zen MCP) :
- **state (props)** : Données métier (rows, selectedRows)
- **gridState (local)** : Configuration UI (columns uniquement)

### 3. Synchronisation temps réel
`handleOptionChanged` capture les changements DevExtreme et met à jour `gridState.columns` avec le format GridColumn Axelor compatible.

### 4. Flux de sauvegarde
Redimensionnement → DevExtreme event → gridState.columns → Dialogue personnalisation → Base de données → Restauration au chargement

## Fichiers modifiés
- `axelor-front/src/views/grid/dx-grid/DxGridInner.tsx`
- `axelor-front/src/main.tsx` (import dev-tools)
- `axelor-front/src/views/grid/grid.tsx` (intégration DxGrid)

## Référence
Voir CLAUDE.md pour les bonnes pratiques de modification des vues Axelor.
