import { createContext, useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import ToastViewport from "../components/feedback/ToastViewport.jsx";

export const ToastContext = createContext(null);

function toastReducer(state, action) {
  if (action.type === "ADD") return [...state, action.toast].slice(-4);
  if (action.type === "REMOVE") return state.filter((toast) => toast.id !== action.id);
  return state;
}

export function ToastProvider({ children }) {
  const [toasts, dispatch] = useReducer(toastReducer, []);
  const nextId = useRef(1);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    dispatch({ type: "REMOVE", id });
  }, []);
  const notify = useCallback((message, variant = "info", options = {}) => {
    const id = nextId.current++;
    dispatch({ type: "ADD", toast: { id, message, variant } });
    timers.current.set(id, window.setTimeout(() => dismiss(id), options.duration ?? 4_500));
    return id;
  }, [dismiss]);

  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current.clear();
  }, []);

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
