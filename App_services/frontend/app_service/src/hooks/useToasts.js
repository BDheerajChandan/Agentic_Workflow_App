// src/hooks/useToasts.js

import { useCallback, useRef, useState } from "react";

export default function useToasts() {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (kind, message) => {
      const id = ++seq.current;
      setToasts((t) => [...t.slice(-4), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === "error" ? 12000 : 5000);
    },
    [dismiss]
  );

  return { toasts, push, dismiss };
}