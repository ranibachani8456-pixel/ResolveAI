import { createContext, useCallback, useEffect, useMemo, useReducer } from "react";
import { authApi } from "../api/authApi.js";
import { clearToken, getToken, setToken } from "../api/tokenStorage.js";

export const AuthContext = createContext(null);

const initialState = {
  status: "initializing",
  user: null,
  organization: null,
};

function authReducer(state, action) {
  switch (action.type) {
    case "AUTHENTICATED":
      return {
        status: "authenticated",
        user: action.payload.user,
        organization: action.payload.organization,
      };
    case "ANONYMOUS":
      return { status: "anonymous", user: null, organization: null };
    default:
      return state;
  }
}

function normalizeSession(data) {
  const user = data.user;
  return {
    user,
    organization: data.organization || user?.organization || null,
  };
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  const establishSession = useCallback((data) => {
    setToken(data.token);
    dispatch({ type: "AUTHENTICATED", payload: normalizeSession(data) });
  }, []);

  const logout = useCallback(() => {
    clearToken();
    dispatch({ type: "ANONYMOUS" });
  }, []);

  const login = useCallback(async (credentials, signal) => {
    const response = await authApi.login(credentials, signal);
    establishSession(response.data);
    return response.data;
  }, [establishSession]);

  const googleLogin = useCallback(async (credential, signal) => {
    const response = await authApi.google(credential, signal);
    establishSession(response.data);
    return response.data;
  }, [establishSession]);

  const register = useCallback(async (details, signal) => {
    const response = await authApi.register(details, signal);
    establishSession(response.data);
    return response.data;
  }, [establishSession]);

  useEffect(() => {
    const controller = new AbortController();
    if (!getToken()) {
      dispatch({ type: "ANONYMOUS" });
      return () => controller.abort();
    }

    authApi.me(controller.signal)
      .then((response) => {
        dispatch({ type: "AUTHENTICATED", payload: normalizeSession(response.data) });
      })
      .catch((error) => {
        if (error.name !== "AbortError") logout();
      });
    return () => controller.abort();
  }, [logout]);

  useEffect(() => {
    window.addEventListener("resolveai:unauthorized", logout);
    return () => window.removeEventListener("resolveai:unauthorized", logout);
  }, [logout]);

  const value = useMemo(
    () => ({ ...state, login, googleLogin, register, logout }),
    [state, login, googleLogin, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
