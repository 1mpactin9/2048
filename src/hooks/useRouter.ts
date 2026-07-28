// tiny path-based router — no external dependency

import { useEffect, useState } from 'preact/hooks';

export function useRouter() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (to: string) => {
    if (to === window.location.pathname) return;
    window.history.pushState({}, '', to);
    setPath(to);
    window.scrollTo(0, 0);
  };

  return { path, navigate };
}
