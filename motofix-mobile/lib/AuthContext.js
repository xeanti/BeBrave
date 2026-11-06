import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from './supabase';
import { createAuthSessionController, INITIAL_AUTH_STATE, manageSessionRefresh } from './authSession';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState(INITIAL_AUTH_STATE);
  const controllerRef = useRef(null);

  useEffect(() => {
    const controller = createAuthSessionController(supabase, setState);
    controllerRef.current = controller;
    controller.start();
    const stopRefresh = Platform.OS !== 'web'
      ? manageSessionRefresh(supabase.auth, AppState)
      : () => {};

    return () => {
      controller.stop();
      stopRefresh();
    };
  }, []);

  const retry = useCallback(() => controllerRef.current?.retry(), []);

  return <AuthContext.Provider value={{ ...state, retry }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
