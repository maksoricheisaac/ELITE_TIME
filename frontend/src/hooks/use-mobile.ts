import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener('change', onChange);
    // Schedule initial check via timer so setState is called inside an external
    // callback rather than synchronously in the effect body.
    const id = setTimeout(onChange, 0);
    return () => { clearTimeout(id); mql.removeEventListener('change', onChange); };
  }, []);

  return !!isMobile;
}
