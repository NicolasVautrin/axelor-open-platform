import { LoadingCache } from "@/utils/cache";

import { request, RequestOptions } from "./client";
import { DataContext } from "./data.types";
import {
  actionView as fetchAction,
  fields as fetchFields,
  view as fetchView,
  type MetaData,
  type ViewData,
} from "./meta";
import {
  findViewFields,
  processFields,
  processView,
  processWidgets,
} from "./meta-utils";
import { FormView, type ActionView, type ViewType } from "./meta.types";
import { reject } from "./reject";
import { dxLog } from "@/utils/dev-tools";

const cache = new LoadingCache<Promise<any>>();

const makeKey = (...args: any[]) => args.map((x) => x || "").join(":");

export async function findActionView(
  name: string,
  context?: DataContext,
  options?: RequestOptions,
): Promise<ActionView> {
  return fetchAction(name, context, options).then((view) =>
    view ? { ...view, name } : view,
  );
}

export async function findView<T extends ViewType>({
  type,
  name,
  model,
  resource,
  context,
  ...props
}: {
  type: string;
  name?: string;
  model?: string;
  resource?: string;
  context?: DataContext;
}): Promise<ViewData<T> | null> {
  const key = makeKey("view", model, type, name ?? resource);
  return cache.get(key, async () => {
    if (type === "html") {
      return Promise.resolve({ view: { name: name ?? resource, type } });
    }

    if (type === "chart") {
      return Promise.resolve({ view: { name, model, type } });
    }

    // for custom form view like dms spreadsheet/html view
    if ((props as FormView).items) {
      const { fields = {}, ...viewProps } = props as ViewData<FormView>;
      return { model, view: { name, model, type, ...viewProps }, fields };
    }

    const data = await fetchView({ type: type as any, name, model, context });

    if (data.fields) {
      data.fields = processFields(data.fields);
    }

    if (data.view) {
      const { related } = await findViewFields(data.fields ?? {}, data.view);
      data.related = { ...data.related, ...related };

      // process the meta data
      processView(data, data.view);
      processWidgets(data.view);

      return data;
    }

    // delete cache when view is null
    cache.delete(key);
    return null;
  });
}

export async function findFields(
  model: string,
  jsonModel?: string,
): Promise<MetaData> {
  const key = makeKey("meta", model, jsonModel);
  return cache.get(key, async () => {
    try {
      return await fetchFields(model, jsonModel);
    } catch (err) {
      cache.delete(key); // delete cache when error occurs
    }
  });
}

export async function saveView(data: any) {
  dxLog('[saveView] Called with data:', { name: data.name, model: data.model, groupBy: data.groupBy, hasItems: !!data.items });

  const resp = await request({
    url: "ws/meta/view/save",
    method: "POST",
    body: { data },
  });

  dxLog('[saveView] Response received:', { ok: resp.ok, status: resp.status });

  if (resp.ok) {
    const { status, data: responseData } = await resp.json();
    dxLog('[saveView] Response parsed:', { status, data: responseData });
    if (status === 0) {
      const { model, type, name } = responseData;
      const key = makeKey("view", model, type, name);
      cache.delete(key);
      return responseData;
    }
    return reject(responseData);
  }

  return Promise.reject(resp.status);
}
