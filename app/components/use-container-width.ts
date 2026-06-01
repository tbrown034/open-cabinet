"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

const noop = () => {};

export function useContainerWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (typeof window === "undefined") return noop;

    const observer = new ResizeObserver(onStoreChange);
    if (ref.current) observer.observe(ref.current);
    window.addEventListener("resize", onStoreChange);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onStoreChange);
    };
  }, []);

  const getSnapshot = useCallback(
    () => ref.current?.clientWidth ?? fallback,
    [fallback]
  );
  const getServerSnapshot = useCallback(() => fallback, [fallback]);
  const width = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  return [ref, width] as const;
}
