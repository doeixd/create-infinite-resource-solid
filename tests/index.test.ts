import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, createEffect } from 'solid-js';
import { createInfiniteResource } from '../src/index';

// Mock IntersectionObserver
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  elements: Set<Element>;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    this.elements = new Set();
  }

  observe(element: Element) {
    this.elements.add(element);
  }

  unobserve(element: Element) {
    this.elements.delete(element);
  }

  disconnect() {
    this.elements.clear();
  }

  // Helper to trigger intersection
  triggerIntersection(isIntersecting: boolean) {
    this.elements.forEach(element => {
      this.callback([{
        target: element,
        isIntersecting,
        boundingClientRect: {} as DOMRectReadOnly,
        intersectionRatio: isIntersecting ? 1 : 0,
        intersectionRect: {} as DOMRectReadOnly,
        rootBounds: null,
        time: Date.now(),
      }], this as unknown as IntersectionObserver);
    });
  }
}

describe('createInfiniteResource', () => {
  let dispose: (() => void) | undefined;
  let mockIO: MockIntersectionObserver;

  beforeEach(() => {
    vi.useFakeTimers();
    mockIO = new MockIntersectionObserver(() => {});
    vi.stubGlobal('IntersectionObserver', vi.fn((cb) => {
      mockIO = new MockIntersectionObserver(cb);
      return mockIO;
    }));
  });

  afterEach(() => {
    dispose?.();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should fetch initial page', async () => {
    await new Promise<void>((resolve) => {
      dispose = createRoot((dispose) => {
        const mockFetcher = vi.fn().mockResolvedValue(['item1', 'item2']);
        
        const { data, pageData } = createInfiniteResource(mockFetcher, {
          initialPageKey: 1,
        });

        createEffect(() => {
          if (!pageData.loading) {
            expect(mockFetcher).toHaveBeenCalledWith(1);
            expect(data()).toEqual(['item1', 'item2']);
            resolve();
          }
        });

        return dispose;
      });
    });
  });

  it('should handle memory limits', async () => {
    await new Promise<void>((resolve) => {
      dispose = createRoot((dispose) => {
        const pages = [
          ['page1-item1', 'page1-item2'],
          ['page2-item1', 'page2-item2'],
          ['page3-item1', 'page3-item2'],
        ];
        let currentPage = 0;
        
        const mockFetcher = vi.fn().mockImplementation(() => {
          return Promise.resolve(pages[currentPage++]);
        });

        const { data, getNextPage, pageData } = createInfiniteResource(mockFetcher, {
          initialPageKey: 1,
          maxPages: 2,
        });

        createEffect(() => {
          if (currentPage === pages.length) {
            // Should only contain last 2 pages
            expect(data()).toEqual([
              'page2-item1', 'page2-item2',
              'page3-item1', 'page3-item2'
            ]);
            resolve();
          } else if (!pageData.loading) {
            getNextPage();
          }
        });

        return dispose;
      });
    });
  });

  it('should handle custom data merging', async () => {
    await new Promise<void>((resolve) => {
      dispose = createRoot((dispose) => {
        type ComplexData = {
          items: string[];
          metadata: { page: number };
        };

        const mockFetcher = vi.fn().mockImplementation((page: number) => {
          return Promise.resolve({
            items: [`item${page}-1`, `item${page}-2`],
            metadata: { page }
          });
        });

        const { data, getNextPage, pageData } = createInfiniteResource<ComplexData, number>(
          mockFetcher,
          {
            initialPageKey: 1,
            mergeData: (prev, next) => [
              ...prev,
              {
                items: next.items,
                metadata: next.metadata
              }
            ]
          }
        );

        let fetchCount = 0;
        createEffect(() => {
          if (!pageData.loading) {
            fetchCount++;
            if (fetchCount === 1) {
              expect(data()[0].items).toEqual(['item1-1', 'item1-2']);
              getNextPage();
            } else if (fetchCount === 2) {
              expect(data()[0].items).toEqual(['item1-1', 'item1-2']);
              expect(data()[1].items).toEqual(['item2-1', 'item2-2']);
              expect(data()[1].metadata.page).toBe(2);
              resolve();
            }
          }
        });

        return dispose;
      });
    });
  });

  it('should handle errors', async () => {
    await new Promise<void>((resolve) => {
      const onError = vi.fn();
      const error = new Error('Fetch failed');

      dispose = createRoot((dispose) => {
        const mockFetcher = vi.fn().mockRejectedValue(error);

        createInfiniteResource(mockFetcher, {
          initialPageKey: 1,
          onError
        });

        setTimeout(() => {
          expect(onError).toHaveBeenCalledWith(error);
          resolve();
        }, 0);

        return dispose;
      });
    });
  });

  it('should handle refetchOnView directive', async () => {
    await new Promise<void>((resolve) => {
      dispose = createRoot((dispose) => {
        const mockFetcher = vi.fn()
          .mockResolvedValueOnce(['item1', 'item2'])
          .mockResolvedValueOnce(['item3', 'item4']);

        const { data, refetchOnView, pageData } = createInfiniteResource(mockFetcher, {
          initialPageKey: 1,
        });

        const div = document.createElement('div');
        refetchOnView(div, () => [true, () => {}]);

        // Simulate intersection
        mockIO.triggerIntersection(true);

        createEffect(() => {
          if (!pageData.loading && data().length === 4) {
            expect(data()).toEqual(['item1', 'item2', 'item3', 'item4']);
            resolve();
          }
        });

        return dispose;
      });
    });
  });

  it('should handle conditional refetchOnView', async () => {
    await new Promise<void>((resolve) => {
      dispose = createRoot((dispose) => {
        const mockFetcher = vi.fn().mockResolvedValue(['item']);
        let shouldFetch = false;

        const { refetchOnView } = createInfiniteResource(mockFetcher, {
          initialPageKey: 1,
        });

        const div = document.createElement('div');
        refetchOnView(div, () => [() => shouldFetch, () => {}]);

        // Shouldn't trigger fetch
        mockIO.triggerIntersection(true);
        expect(mockFetcher).toHaveBeenCalledTimes(1); // Only initial fetch

        // Should trigger fetch
        shouldFetch = true;
        mockIO.triggerIntersection(true);
        
        setTimeout(() => {
          expect(mockFetcher).toHaveBeenCalledTimes(2);
          resolve();
        }, 0);

        return dispose;
      });
    });
  });

  it('should handle hasReachedEnd', async () => {
    await new Promise<void>((resolve) => {
      dispose = createRoot((dispose) => {
        const mockFetcher = vi.fn().mockImplementation(async (
          _page: number,
          { setHasReachedEnd }: { setHasReachedEnd: (value: boolean) => void }
        ) => {
          setHasReachedEnd(true);
          return ['last-item'];
        });

        const { hasReachedEnd, getNextPage } = createInfiniteResource(mockFetcher, {
          initialPageKey: 1,
        });

        createEffect(() => {
          if (hasReachedEnd()) {
            getNextPage(); // Shouldn't trigger another fetch
            expect(mockFetcher).toHaveBeenCalledTimes(1);
            resolve();
          }
        });

        return dispose;
      });
    });
  });

  it('should cleanup observers', async () => {
    await new Promise<void>((resolve) => {
      dispose = createRoot((dispose) => {
        const mockFetcher = vi.fn().mockResolvedValue(['item']);
        
        const { refetchOnView } = createInfiniteResource(mockFetcher, {
          initialPageKey: 1,
        });

        const div = document.createElement('div');
        refetchOnView(div, () => [true, () => {}]);

        expect(mockIO.elements.size).toBe(1);
        dispose();
        expect(mockIO.elements.size).toBe(0);
        resolve();

        return dispose;
      });
    });
  });
});