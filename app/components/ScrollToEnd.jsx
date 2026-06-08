"use client";

import { useEffect, useRef } from "react";

export default function ScrollToEnd({ children, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.scrollLeft = element.scrollWidth;
  }, []);

  return (
    <div className={className} ref={ref}>
      {children}
    </div>
  );
}
