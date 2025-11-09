/**
 * DevTools utilities - Only available in development mode
 */

import xmlFormatter from 'xml-formatter';

/**
 * Get CSRF token from cookie
 */
function getCsrfToken(): string | null {
  const match = document.cookie.match(/CSRF-TOKEN=([^;]+)/);
  return match ? match[1] : null;
}

/**
 * Format and indent XML string
 */
function formatXml(xml: string): string {
  return xmlFormatter(xml, {
    indentation: '  ',
    collapseContent: true,
    lineSeparator: '\n'
  });
}

/**
 * Update a view XML definition via API
 * Usage: updateView('view-name', '<grid>...</grid>')
 */
export async function updateView(viewName: string, newXml: string) {
  try {
    // Get the base path (e.g., /VPAuto)
    const basePath = window.location.pathname.split('/')[1] || '';
    const prefix = basePath ? `/${basePath}` : '';

    // Get CSRF token
    const csrfToken = getCsrfToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    // 1. Search for the view
    const searchResponse = await fetch(`${prefix}/ws/rest/com.axelor.meta.db.MetaView/search`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        data: {
          criteria: [{
            fieldName: 'name',
            operator: '=',
            value: viewName
          }]
        }
      })
    });

    const searchResult = await searchResponse.json();
    if (searchResult.total === 0) {
      throw new Error(`Vue ${viewName} non trouvée`);
    }

    const view = searchResult.data[0];

    // 2. Update the XML
    const formattedXml = formatXml(newXml);
    const updateResponse = await fetch(`${prefix}/ws/rest/com.axelor.meta.db.MetaView`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        data: {
          id: view.id,
          version: view.version,
          xml: formattedXml
        }
      })
    });

    const updateResult = await updateResponse.json();

    if (updateResult.status === 0) {
      console.log('✅ Vue mise à jour avec succès !');
      console.log('🔄 Rafraîchis la page (F5) pour voir les changements');
      return updateResult;
    } else {
      console.error('❌ Erreur:', updateResult);
      return updateResult;
    }
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour:', error);
    throw error;
  }
}

/**
 * Update an action XML definition via API
 * Usage: updateAction('action-name', '<action-view>...</action-view>')
 */
export async function updateAction(actionName: string, newXml: string) {
  try {
    // Get the base path (e.g., /VPAuto)
    const basePath = window.location.pathname.split('/')[1] || '';
    const prefix = basePath ? `/${basePath}` : '';

    // Get CSRF token
    const csrfToken = getCsrfToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    // 1. Search for the action
    const searchResponse = await fetch(`${prefix}/ws/rest/com.axelor.meta.db.MetaAction/search`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        data: {
          criteria: [{
            fieldName: 'name',
            operator: '=',
            value: actionName
          }]
        }
      })
    });

    const searchResult = await searchResponse.json();
    if (searchResult.total === 0) {
      throw new Error(`Action ${actionName} non trouvée`);
    }

    const action = searchResult.data[0];

    // 2. Update the XML
    const formattedXml = formatXml(newXml);
    const updateResponse = await fetch(`${prefix}/ws/rest/com.axelor.meta.db.MetaAction`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        data: {
          id: action.id,
          version: action.version,
          xml: formattedXml
        }
      })
    });

    const updateResult = await updateResponse.json();

    if (updateResult.status === 0) {
      console.log('✅ Action mise à jour avec succès !');
      console.log('🔄 Rafraîchis la page (F5) pour voir les changements');
      return updateResult;
    } else {
      console.error('❌ Erreur:', updateResult);
      return updateResult;
    }
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour:', error);
    throw error;
  }
}

/**
 * Add a new view XML definition via API
 * Usage: addView('view-name', 'grid', 'View Title', 'com.axelor.apps.base.db.Partner', '<grid>...</grid>')
 */
export async function addView(viewName: string, viewType: string, title: string, model: string, xml: string) {
  try {
    // Get the base path (e.g., /VPAuto)
    const basePath = window.location.pathname.split('/')[1] || '';
    const prefix = basePath ? `/${basePath}` : '';

    // Get CSRF token
    const csrfToken = getCsrfToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    // Create the view
    const formattedXml = formatXml(xml);
    const createResponse = await fetch(`${prefix}/ws/rest/com.axelor.meta.db.MetaView`, {
      method: 'PUT',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        data: {
          name: viewName,
          type: viewType,
          title: title,
          model: model,
          xml: formattedXml
        }
      })
    });

    const createResult = await createResponse.json();

    if (createResult.status === 0) {
      console.log('✅ Vue créée avec succès !');
      console.log('🔄 Rafraîchis la page (F5) pour voir les changements');
      return createResult;
    } else {
      console.error('❌ Erreur:', createResult);
      return createResult;
    }
  } catch (error) {
    console.error('❌ Erreur lors de la création:', error);
    throw error;
  }
}

/**
 * Add a new action XML definition via API
 * Usage: addAction('action-name', 'action-view', '<action-view>...</action-view>')
 */
export async function addAction(actionName: string, actionType: string, xml: string) {
  try {
    // Get the base path (e.g., /VPAuto)
    const basePath = window.location.pathname.split('/')[1] || '';
    const prefix = basePath ? `/${basePath}` : '';

    // Get CSRF token
    const csrfToken = getCsrfToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    // Create the action
    const formattedXml = formatXml(xml);
    const createResponse = await fetch(`${prefix}/ws/rest/com.axelor.meta.db.MetaAction`, {
      method: 'PUT',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        data: {
          name: actionName,
          type: actionType,
          xml: formattedXml
        }
      })
    });

    const createResult = await createResponse.json();

    if (createResult.status === 0) {
      console.log('✅ Action créée avec succès !');
      console.log('🔄 Rafraîchis la page (F5) pour voir les changements');
      return createResult;
    } else {
      console.error('❌ Erreur:', createResult);
      return createResult;
    }
  } catch (error) {
    console.error('❌ Erreur lors de la création:', error);
    throw error;
  }
}

/**
 * Add a new menu item via API
 * Usage: addMenuItem('menu-name', 'Menu Title', 'parent-menu-name', 'action-name')
 */
export async function addMenuItem(menuName: string, title: string, parentName?: string, actionName?: string) {
  try {
    // Get the base path (e.g., /VPAuto)
    const basePath = window.location.pathname.split('/')[1] || '';
    const prefix = basePath ? `/${basePath}` : '';

    // Get CSRF token
    const csrfToken = getCsrfToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    // Get parent menu if specified
    let parentId = null;
    if (parentName) {
      const parentSearchResponse = await fetch(`${prefix}/ws/rest/com.axelor.meta.db.MetaMenu/search`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          data: {
            criteria: [{
              fieldName: 'name',
              operator: '=',
              value: parentName
            }]
          }
        })
      });

      const parentSearchResult = await parentSearchResponse.json();
      if (parentSearchResult.total > 0) {
        parentId = parentSearchResult.data[0].id;
      }
    }

    // Get action if specified
    let actionId = null;
    if (actionName) {
      const actionSearchResponse = await fetch(`${prefix}/ws/rest/com.axelor.meta.db.MetaAction/search`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          data: {
            criteria: [{
              fieldName: 'name',
              operator: '=',
              value: actionName
            }]
          }
        })
      });

      const actionSearchResult = await actionSearchResponse.json();
      if (actionSearchResult.total > 0) {
        actionId = actionSearchResult.data[0].id;
      }
    }

    // Create the menu item
    const menuData: any = {
      name: menuName,
      title: title,
    };

    if (parentId) {
      menuData.parent = { id: parentId };
    }

    if (actionId) {
      menuData.action = { id: actionId };
    }

    const createResponse = await fetch(`${prefix}/ws/rest/com.axelor.meta.db.MetaMenu`, {
      method: 'PUT',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        data: menuData
      })
    });

    const createResult = await createResponse.json();

    if (createResult.status === 0) {
      console.log('✅ Menu créé avec succès !');
      console.log('🔄 Rafraîchis la page (F5) pour voir les changements');
      return createResult;
    } else {
      console.error('❌ Erreur:', createResult);
      return createResult;
    }
  } catch (error) {
    console.error('❌ Erreur lors de la création:', error);
    throw error;
  }
}

// Expose utilities on window in development mode
if (import.meta.env.DEV) {
  (window as any).updateView = updateView;
  (window as any).updateAction = updateAction;
  (window as any).addView = addView;
  (window as any).addAction = addAction;
  (window as any).addMenuItem = addMenuItem;
  console.log('🔧 DevTools loaded: updateView(), updateAction(), addView(), addAction(), addMenuItem() are available');
}
