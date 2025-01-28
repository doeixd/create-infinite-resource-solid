import {
  Accessor,
  Resource,
  ResourceFetcher,
  ResourceOptions,
  ResourceReturn,
  Setter,
  batch,
  createComputed,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
} from 'solid-js';
import { Directive, isServer, tryOnCleanup } from '@solid-primitives/utils';

type InfiniteResourceOptions<T, P> = {
  initialPageKey: P;
  onError?: (error: Error) => void;
  /** Maximum number of pages to keep in memory. When exceeded, oldest pages are removed. */
  maxPages?: number;
  /** Custom function to merge new data with existing data. If not provided, assumes array-based data. */
  mergeData?: (prevData: T[], newData: T) => T[];
} & ResourceOptions<T>;

type FetcherContext<P> = {
  setNextPageNumber: Setter<P>;
  hasReachedEnd: Accessor<boolean>;
  setHasReachedEnd: Setter<boolean>;
};

type InfiniteResourceReturn<T, P> = {
  /** Flattened array of all fetched data */
  data: Accessor<(T extends readonly (infer InnerArr)[] ? InnerArr : T)[]>;
  /** Raw array of responses from each page */
  allData: Accessor<T[]>;
  /** Setter for raw data array */
  setAllData: Setter<T[]>;
  /** Resource from the current page */
  pageData: Resource<T>;
  /** Directive for triggering fetch on element view */
  refetchOnView: Directive<RefetchDirectiveArgs>;
  /** Manually trigger next page fetch */
  getNextPage: () => void;
  /** Current page number/key */
  pageKey: Accessor<P>;
  /** Set current page number/key */
  setPageKey: Setter<P>;
  /** Whether all pages have been fetched */
  hasReachedEnd: Accessor<boolean>;
  /** Set end-of-data status */
  setHasReachedEnd: Setter<boolean>;
  /** Underlying resource */
  resource: ResourceReturn<T>;
};

type RefetchDirectiveArgs = [boolean | (() => boolean), () => void] | (() => [boolean | (() => boolean), () => void]);

/**
 * Creates an infinite resource that fetches data in pages.
 * 
 * @template T - Type of data returned by the fetcher
 * @template P - Type of the page key/number (defaults to number | string)
 * 
 * @param fetcher - Function to fetch data for a given page
 * @param options - Configuration options
 * @returns Object containing data and control methods
 * 
 * @example
 * ```ts
 * const {data, getNextPage, hasReachedEnd} = createInfiniteResource(
 *   async (page) => {
 *     const response = await fetch(`/api/items?page=${page}`);
 *     return response.json();
 *   },
 *   { initialPageKey: 1 }
 * );
 * ```
 */
export function createInfiniteResource<T, P = number | string>(
  fetcher: ResourceFetcher<P, T, unknown>, 
  options: InfiniteResourceOptions<T, P> = { initialPageKey: 1 as P }
): InfiniteResourceReturn<T, P> {
  const [allData, setAllData] = createSignal<T[]>([]);
  const [pageKey, setPageKey] = createSignal(options.initialPageKey);
  const [hasReachedEnd, setHasReachedEnd] = createSignal(false);

  const data = createMemo<ReturnType<InfiniteResourceReturn<T, P>['data']>>(() => {
    const current = allData();
    if (options.mergeData) return current as any;
    return current.flat(1) as any;
  });

  const resource = createResource<T, P>(pageKey, fetcher, options);
  const [pageData, { refetch }] = resource 

  // Handle new page data
  createComputed(() => {
    if (pageData.loading || !pageData()) return;
    
    if (pageData.error) {
      options.onError?.(pageData.error);
      return;
    }

    batch(() => {
      setAllData(prev => {
        const newData = pageData();
        if (!newData) return prev;

        let updatedData: T[];
        
        // Use custom merge function if provided
        if (options.mergeData) {
          updatedData = options.mergeData(prev, newData);
        } else {
          updatedData = [...prev, newData];
        }

        // Apply maxPages limit if set
        if (options.maxPages && updatedData.length > options.maxPages) {
          updatedData = updatedData.slice(-options.maxPages);
        }

        return updatedData;
      });
    });
  });

  const getNextPage = () => {
    if (hasReachedEnd()) return;

    refetch({
      setNextPageNumber: setPageKey,
      hasReachedEnd,
      setHasReachedEnd,
    } satisfies FetcherContext<P>);
  };

  /**
   * Creates a directive that triggers data fetching when an element becomes visible in the viewport.
   * 
   * @returns A directive function that can be used with Solid's use:directive
   * 
   * @example
   * ```tsx
   * // Basic usage
   * <div use:refetchOnView={[true, () => console.log("fetching")]}>
   *   Loading more...
   * </div>
   * 
   * // With conditional fetching
   * <div use:refetchOnView={[
   *   () => !isLoading(), 
   *   () => fetchNextBatch()
   * ]}>
   *   Load More
   * </div>
   * ```
   */
  const createRefetchDirective = (): Directive<RefetchDirectiveArgs> => {
    let callback = getNextPage;

    /**
     * The directive function that sets up the intersection observer.
     * 
     * @param element - The DOM element to observe for visibility changes
     * @param accessor - Function that returns the directive arguments
     *                  First argument is a boolean or function returning boolean that controls if observation should occur
     *                  Second argument is an optional callback function to execute when the element is visible
     */
    return (element, accessor) => {
      if (isServer) return;

      const args = accessor();
      const [condition, customCallback] = typeof args === 'function' ? args() : args;
      
      if (typeof customCallback === 'function') {
        callback = customCallback;
      }

      if (!isServer) {
        // @ts-expect-error
        const observer = new IntersectionObserver(entries => {
          const shouldFetch = entries[0]?.isIntersecting && 
            !hasReachedEnd() && 
            !pageData.loading;

          if (shouldFetch) {
            callback();
          }
        });

        const shouldObserve = typeof condition === 'function' ? condition() : condition;
        
        if (shouldObserve) {
          observer.observe(element);
          tryOnCleanup(() => observer.unobserve(element));
        }

        onCleanup(() => observer.disconnect());
      }
    };
  };

  return {
    data,
    allData,
    setAllData,
    pageData,
    refetchOnView: createRefetchDirective(),
    getNextPage,
    pageKey,
    setPageKey,
    hasReachedEnd,
    setHasReachedEnd,
    resource,
  };
}


export default createInfiniteResource;