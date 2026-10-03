import {
  createElement,
  lazy,
  useSyncExternalStore,
  type ComponentProps,
  type ComponentType,
} from 'react';

const retryDelays = [150, 500] as const;
const failedPages = new Set<() => void>();
const listeners = new Set<() => void>();
const stylesheetRecoveries = new Map<string, Promise<void>>();
const stylesheetStates = new Map<string, 'loaded' | 'failed'>();
let revision = 0;
let loaderGeneration = 0;
let stylesheetAttempt = 0;

function errorMessage(error: unknown): string {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String(error.message)
    : '';
}

/** Only failures identifying an unloaded module or stylesheet are safe to retry. */
export function isPageResourceFailure(error: unknown): boolean {
  if (error instanceof PageResourceError) return true;
  const message = errorMessage(error);
  return (
    /^(?:Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed)(?::|\s|\.|$)/i.test(
      message
    ) || /^Unable to preload CSS for\s+\S+/i.test(message)
  );
}

export class PageResourceError extends Error {
  constructor(cause: unknown) {
    super('The page resources could not be loaded.', { cause });
    this.name = 'PageResourceError';
  }
}

function assetStylesheetUrl(value: string): URL | null {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(value, window.location.href);
    if (url.origin !== window.location.origin || !/^\/assets\/[^/]+\.css$/.test(url.pathname))
      return null;
    url.searchParams.delete('prispect_retry');
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

if (typeof document !== 'undefined' && typeof HTMLLinkElement !== 'undefined') {
  for (const [eventName, state] of [
    ['load', 'loaded'],
    ['error', 'failed'],
  ] as const) {
    document.addEventListener(
      eventName,
      (event) => {
        const link = event.target;
        if (!(link instanceof HTMLLinkElement) || link.rel !== 'stylesheet') return;
        const url = assetStylesheetUrl(link.href);
        if (url) stylesheetStates.set(url.href, state);
      },
      true
    );
  }
}

function cssUrl(error: unknown): URL | null {
  const match = /^Unable to preload CSS for\s+(\S+)\s*$/i.exec(errorMessage(error));
  return match ? assetStylesheetUrl(match[1]!) : null;
}

export function failedPageModuleUrl(error: unknown): URL | null {
  const match =
    /^(?:Failed to fetch dynamically imported module|error loading dynamically imported module):\s+(\S+)\s*$/i.exec(
      errorMessage(error)
    );
  if (!match || typeof window === 'undefined') return null;
  try {
    const url = new URL(match[1]!, window.location.href);
    return url.origin === window.location.origin &&
      !url.username &&
      !url.password &&
      /^\/assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{6,}\.js$/.test(url.pathname)
      ? url
      : null;
  } catch {
    return null;
  }
}

function reloadStylesheet(url: URL, error: unknown): Promise<void> {
  const recovery = stylesheetRecoveries.get(url.href);
  if (recovery) return recovery;
  if (stylesheetStates.get(url.href) === 'loaded') return Promise.resolve();
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
    if (assetStylesheetUrl(link.href)?.href === url.href) link.remove();
  }
  const pending = new Promise<void>((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.crossOrigin = '';
    const retryUrl = new URL(url);
    retryUrl.searchParams.set('prispect_retry', `css-${++stylesheetAttempt}`);
    link.href = retryUrl.href;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (loaded: boolean) => {
      clearTimeout(timer);
      link.onload = null;
      link.onerror = null;
      if (loaded) {
        stylesheetStates.set(url.href, 'loaded');
        resolve();
      } else {
        stylesheetStates.set(url.href, 'failed');
        link.remove();
        reject(error);
      }
    };
    timer = setTimeout(() => finish(false), 8000);
    link.onload = () => finish(true);
    link.onerror = () => finish(false);
    document.head.appendChild(link);
  });
  stylesheetRecoveries.set(url.href, pending);
  void pending.then(
    () => stylesheetRecoveries.delete(url.href),
    () => stylesheetRecoveries.delete(url.href)
  );
  return pending;
}

async function reloadFailedStylesheets(
  error: unknown,
  requiredStylesheets: Set<string>
): Promise<void> {
  const url = cssUrl(error);
  if (!url || typeof document === 'undefined') return;
  // Vite marks every preload as seen before it reports the first rejected CSS link.
  // Recover this loader's unloaded styles without blocking unrelated pages.
  requiredStylesheets.add(url.href);
  const urls = new Map([[url.href, url]]);
  for (const href of requiredStylesheets) {
    const failed = stylesheetStates.get(href) !== 'loaded' && assetStylesheetUrl(href);
    if (failed) urls.set(failed.href, failed);
  }
  // A failed link can still expose an empty CSSStyleSheet in Chromium. The error
  // event, rather than !!link.sheet, determines whether that asset needs recovery.
  if (stylesheetStates.get(url.href) !== 'loaded') stylesheetStates.set(url.href, 'failed');
  await Promise.all([...urls.values()].map((asset) => reloadStylesheet(asset, error)));
}

function invokePageLoader<T>(loader: () => Promise<T>, requiredStylesheets: Set<string>) {
  const before =
    typeof document === 'undefined'
      ? null
      : new Set(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
  try {
    return loader();
  } finally {
    if (before) {
      // Vite adds preload links synchronously, before returning its promise. Take
      // this snapshot immediately so concurrent asynchronous imports cannot mix scopes.
      for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
        const url = !before.has(link) && assetStylesheetUrl(link.href);
        if (url) requiredStylesheets.add(url.href);
      }
    }
  }
}

export async function loadPageModule<T>(
  loader: () => Promise<T>,
  recoverModule?: (url: URL) => Promise<T>,
  requiredStylesheets = new Set<string>()
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt - 1]));
    }
    // A new lazy generation still shares Vite's seen-preload cache. Repair known
    // CSS failures even on its first attempt before letting an import succeed.
    const trackedFailure = [...requiredStylesheets].find(
      (href) => stylesheetStates.get(href) === 'failed'
    );
    const cssFailure = cssUrl(lastError)
      ? lastError
      : trackedFailure
        ? new Error(`Unable to preload CSS for ${trackedFailure}`)
        : null;
    if (cssFailure) {
      try {
        await reloadFailedStylesheets(cssFailure, requiredStylesheets);
      } catch (error) {
        lastError = error;
        continue;
      }
    }
    try {
      const moduleUrl = attempt > 0 && recoverModule ? failedPageModuleUrl(lastError) : null;
      if (moduleUrl && recoverModule) return await recoverModule(moduleUrl);
      return await invokePageLoader(loader, requiredStylesheets);
    } catch (error) {
      if (!isPageResourceFailure(error)) throw error;
      const failedStylesheet = cssUrl(error);
      if (failedStylesheet) {
        requiredStylesheets.add(failedStylesheet.href);
        if (stylesheetStates.get(failedStylesheet.href) !== 'loaded')
          stylesheetStates.set(failedStylesheet.href, 'failed');
      }
      lastError = error;
    }
  }
  throw new PageResourceError(lastError);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => revision;

/** Recreate rejected React.lazy loaders without replacing already loaded pages. */
export function resetFailedLazyPages(): void {
  if (!failedPages.size) return;
  for (const reset of failedPages) reset();
  failedPages.clear();
  revision++;
  for (const listener of listeners) listener();
}

// Match React.lazy's component constraint so Promise.then retains the concrete
// exported component and its props rather than contextually widening the result.
export function lazyPage<Module, Component extends ComponentType<any>>(
  importer: () => Promise<Module>,
  pick: (module: Module) => Component
): ComponentType<ComponentProps<Component>> & { preload: () => Promise<void> } {
  // Keep this component's actual CSS dependencies across manual lazy resets.
  const requiredStylesheets = new Set<string>();
  const makePage = () => {
    const generation = ++loaderGeneration;
    let resourceAttempt = 0;
    const load = async () => {
      try {
        const module = await loadPageModule(
          importer,
          async (url) => {
            // Browsers remember a rejected import URL. Retry only the failed leaf
            // script with a fresh bounded URL; its shared dependencies stay unchanged.
            url.searchParams.set('prispect_retry', `${generation}-${++resourceAttempt}`);
            url.hash = '';
            return (await import(/* @vite-ignore */ url.href)) as Module;
          },
          requiredStylesheets
        );
        failedPages.delete(reset);
        return { default: pick(module) };
      } catch (error) {
        if (error instanceof PageResourceError) failedPages.add(reset);
        throw error;
      }
    };
    // Intent preloading and React share one request and the same recovery state.
    let pending: ReturnType<typeof load> | undefined;
    const preload = () => (pending ||= load());
    return { Page: lazy(preload), preload };
  };
  let resource = makePage();
  const reset = () => {
    resource = makePage();
  };
  function LazyPage(props: ComponentProps<Component>) {
    useSyncExternalStore(subscribe, snapshot, snapshot);
    return createElement(resource.Page, props);
  }
  LazyPage.preload = async () => {
    await resource.preload();
  };
  return LazyPage;
}
