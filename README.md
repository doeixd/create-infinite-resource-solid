# `createInfiniteResource`

A SolidJS primitive for managing paginated data fetching. Handles common infinite scrolling patterns.

## Basic Usage

```tsx
function ProductList() {
  const { data, hasReachedEnd, refetchOnView } = createInfiniteResource(
    async (page: number) => {
      const response = await fetch(`/api/products?page=${page}`);
      return response.json();
    },
    { initialPageKey: 1 }
  );

  return (
    <div>
      <For each={data()}>{product => 
        <ProductCard product={product} />
      }</For>

      <div use:refetchOnView={[!hasReachedEnd(), getNextPage]}>
        {hasReachedEnd() ? 'No more products' : 'Loading...'}
      </div>
    </div>
  );
}
```

## Memory Management

Controls how much data is kept in memory:

```tsx
const { data } = createInfiniteResource(
  fetchProducts,
  {
    initialPageKey: 1,
    maxPages: 5  // Only keep last 5 pages
  }
);
```

## Custom Data Structures

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

### Types

```typescript
function createInfiniteResource<T, P = number | string>(
  fetcher: (pageKey: P, context: FetcherContext<P>) => Promise<T>,
  options: InfiniteResourceOptions<T, P>
): InfiniteResourceReturn<T, P>

type InfiniteResourceOptions<T, P> = {
  // Starting page key
  initialPageKey: P;
  
  // Maximum pages to keep in memory
  maxPages?: number;
  
  // Custom merge function for pages
  mergeData?: (prevPages: T[], newPage: T) => T[];
  
  // Error callback
  onError?: (error: Error) => void;
}

type FetcherContext<P> = {
  setNextPageNumber: Setter<P>;
  hasReachedEnd: Accessor<boolean>;
  setHasReachedEnd: Setter<boolean>;
}

type InfiniteResourceReturn<T, P> = {
  // The merged dataset
  data: Accessor<T extends Array<infer U> ? U[] : T[]>;
  
  // Raw page responses
  pageData: Resource<T>;
  
  // Manually fetch next page
  getNextPage: () => void;
  
  // Current page key
  pageKey: Accessor<P>;
  
  // Whether all data is loaded
  hasReachedEnd: Accessor<boolean>;
  
  // Directive for viewport loading
  refetchOnView: Directive<[
    boolean | (() => boolean),
    () => void
  ]>;
}
```

### Intersection Observer Directive

The `refetchOnView` directive provides viewport-based loading:

```tsx
// Basic usage
<div use:refetchOnView={[true, getNextPage]}>
  Loading...
</div>

// With condition
<div use:refetchOnView={[
  () => !isLoading() && !hasReachedEnd(),
  getNextPage
]}>
  Loading...
</div>
```

## Key Concepts

### Page Keys
- Can be numbers (page numbers) or strings (cursors)
- Passed to fetcher function
- Used to track fetch state

### Data Management
- By default flattens array responses
- `mergeData` preserves page structure
- `maxPages` controls memory usage

### Loading States
- `pageData.loading` tracks current fetch
- `hasReachedEnd` indicates completion
- Error handling via `onError` callback

### Cleanup
- Automatically removes observers
- Handles component unmounting
- Memory cleanup with `maxPages`

## Limitations

- No built-in request debouncing/throttling
- No automatic retry mechanism
- No built-in error UI handling
- All data management is in-memory
