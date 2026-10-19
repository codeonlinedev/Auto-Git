import { useEffect } from 'react';
import type { DependencyList } from 'react';

export function useWindowMessage(handler: (message: any, event: MessageEvent) => void, deps: DependencyList = []) {
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      handler(event.data, event);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, deps);
}
