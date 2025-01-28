# `createInfiniteResource`

A SolidJS primitive for managing paginated data fetching with built-in memory management and intersection observer support.

## Instalation 

```bash
npm install @doeixd/create-infinite-resource-solid
```

## Why is this useful?

Managing infinite scroll in SolidJS typically involves coordinating several primitives (resources, signals, effects) while handling pagination state, memory cleanup, and intersection observers. This primitive handles these concerns while remaining flexible enough for cursor-based pagination, complex data structures, and memory constraints.


## Core Concepts

This primitive wraps `createResource` with some key differences:

1. The fetcher receives a context object for pagination control:
```ts
type FetcherContext<P> = {
  setNextPageKey: Setter<P>;   // Set next page/cursor
  hasReachedEnd: Accessor<boolean>; // Check if at end
  setHasReachedEnd: Setter<boolean>; // Mark as complete
}

// Usage
const resource = createInfiniteResource(
  async (page, { setNextPageKey, setHasReachedEnd }) => {
    const data = await fetchData(page);
    
    // Either set next page
    setNextPageKey(data.nextCursor);
    // Or mark as complete
    setHasReachedEnd(true);
    
    return data;
  }
);
```

2. Pages are accumulated rather than replaced:
```ts
// Default behavior: Flattens arrays
const { data } = createInfiniteResource<string[]>();
data(); // ["item1", "item2", "item3"] (from all pages)

// Custom merging: Preserve page structure
const { data } = createInfiniteResource<Response>({
  mergeData: (prev, next) => [...prev, next]
});
data(); // [page1, page2, page3]
```

### Important Details

1. **Memory Management**
   ```ts
   createInfiniteResource(fetcher, {
     maxPages: 5 // Only keep last 5 pages
   });
   ```
   When maxPages is hit, oldest pages are removed. This affects what's returned from `data()` but doesn't refetch dropped pages on scroll up.

2. **Loading States**
   ```ts
   const { pageData, data } = createInfiniteResource();
   pageData.loading; // Current page loading
   data(); // All accumulated data (even during loads)
   ```
   Unlike regular resources, you get both the current page's loading state and accumulated data.

3. **Intersection Observer**
   ```ts
   // Basic
   <div use:refetchOnView={[true, getNextPage]}>
   
   // With conditions
   <div use:refetchOnView={[
     () => !isError() && !hasReachedEnd(),
     getNextPage
   ]}>
   ```
   The directive automatically cleans up observers and respects loading states.

### Common Patterns

1. **Cursor-based Pagination**
```ts
type Response = { items: Item[], nextCursor: string | null }

createInfiniteResource<Response, string>(
  async (cursor, { setNextPageKey, setHasReachedEnd }) => {
    const data = await fetch(`/api?cursor=${cursor}`);
    
    if (data.nextCursor) {
      setNextPageKey(data.nextCursor);
    } else {
      setHasReachedEnd(true);
    }
    return data;
  },
  {
    initialPageKey: 'initial',
    mergeData: (prev, next) => [...prev, next] // Keep cursor info
  }
);
```

2. **Error Handling with Retries**
```ts
createInfiniteResource(fetcher, {
  onError: (error) => {
    if (error.status === 429) { // Rate limit
      setTimeout(getNextPage, 1000);
    }
  }
});
```

3. **Virtual Lists**
```ts
// Keep limited window of data in memory
createInfiniteResource(fetcher, {
  maxPages: 3,
  mergeData: (prev, next) => {
    const window = [...prev, next].slice(-3);
    virtualizer.setItemCount(totalCount);
    return window;
  }
});
```

## Gotchas

1. `maxPages` drops old data but doesn't refetch - consider UX implications
2. Default array flattening assumes uniform page data
3. Page keys must be managed manually through `setNextPageKey`
4. The directive assumes element visibility means "load more"

## Type Details

```ts
createInfiniteResource<
  T, // Response type (e.g., Product[])
  P = number | string // Page key type
>

// For complex data:
createInfiniteResource<Response, Cursor>
// Response = { items: Product[], cursor: string }
// Cursor = string
```


### Custom Data Structures

For non-array responses, each page's data is preserved:

```tsx
type ThreadPage = {
  messages: Message[];
  participants: User[];
  cursor: string;
};

const { data } = createInfiniteResource<ThreadPage, string>(
  async (cursor) => {
    const response = await fetch(`/api/thread?cursor=${cursor}`);
    return response.json();
  },
  {
    initialPageKey: 'initial',
    // Each page is preserved as an array element
    mergeData: (prevPages, newPage) => [...prevPages, newPage]
  }
);

// Access individual pages
data().map(page => ({
  messages: page.messages,
  participants: page.participants
}));
```


## API Reference

### Function Signature

```ts
function createInfiniteResource<T, P = number | string>(
  fetcher: (
    pageKey: P, 
    context: FetcherContext<P>
  ) => Promise<T>,
  options?: InfiniteResourceOptions<T, P>
): InfiniteResourceReturn<T, P>
```

### Types

#### Options
```ts
type InfiniteResourceOptions<T, P> = {
  // Initial page key passed to fetcher
  initialPageKey: P;
  
  // Maximum number of pages to keep in memory
  maxPages?: number;
  
  // Custom function to merge pages
  mergeData?: (prevPages: T[], newPage: T) => T[];
  
  // Called when fetcher throws
  onError?: (error: Error) => void;
  
  // All createResource options
  initialValue?: T;
  name?: string;
  deferStream?: boolean;
  storage?: () => Signal<T | undefined>;
} & ResourceOptions<T>
```

#### Fetcher Context
```ts
type FetcherContext<P> = {
  // Set the next page key
  setNextPageKey: Setter<P>;
  
  // Check if at end
  hasReachedEnd: Accessor<boolean>;
  
  // Mark as complete
  setHasReachedEnd: Setter<boolean>;
}
```

#### Return Value
```ts
type InfiniteResourceReturn<T, P> = {
  // Merged data from all pages
  // If T is an array type, flattens by default
  data: Accessor<T extends Array<infer U> ? U[] : T[]>;
  
  // Raw page responses
  allData: Accessor<T[]>;
  
  // Current page resource
  pageData: Resource<T>;
  
  // Trigger next page load
  getNextPage: () => void;
  
  // Get/set page key
  pageKey: Accessor<P>;
  setPageKey: Setter<P>;
  
  // End of data tracking
  hasReachedEnd: Accessor<boolean>;
  setHasReachedEnd: Setter<boolean>;
  
  // Intersection observer directive
  refetchOnView: Directive<RefetchDirectiveArgs>;
  
  // Underlying resource
  resource: ResourceReturn<T>;
}

// Directive arguments
type RefetchDirectiveArgs = [
  boolean | (() => boolean), // Condition
  () => void                 // Callback
] | (() => [
  boolean | (() => boolean),
  () => void
])
```

### Methods

#### getNextPage
Triggers the next page load using the current page key.
```ts
const { getNextPage } = createInfiniteResource(fetcher);
getNextPage(); // Loads next page if !hasReachedEnd
```

#### refetchOnView
Directive for viewport-based loading.
```ts
// Attach to element
<div use:refetchOnView={[condition, callback]} />

// With reactive condition
<div use:refetchOnView={[
  () => canLoadMore(),
  () => loadMore()
]} />
```

### Properties

#### data
Returns merged data from all pages. By default, flattens arrays:
```ts
// With array responses
type T = Product[]
const { data } = createInfiniteResource<T>();
data(); // Product[] (flattened from all pages)

// With custom merging
const { data } = createInfiniteResource<T>({
  mergeData: (prev, next) => [...prev, next]
});
data(); // Product[][] (array of pages)
```

#### pageData
Resource for current page with loading states:
```ts
const { pageData } = createInfiniteResource();
pageData.loading;  // Current page loading
pageData.error;    // Current page error
pageData();        // Current page data
```

#### hasReachedEnd
Tracks if all data has been loaded:
```ts
const { hasReachedEnd } = createInfiniteResource();
hasReachedEnd(); // boolean

// Common pattern
<Show 
  when={!hasReachedEnd()} 
  fallback="No more items"
>
  <LoadMoreButton />
</Show>
```

### Resource Access

The underlying resource is exposed for advanced cases:
```ts
const { resource } = createInfiniteResource(fetcher);
const [data, { refetch }] = resource;

// Manual refetch with context
refetch({
  setNextPageKey,
  hasReachedEnd,
  setHasReachedEnd
});
```