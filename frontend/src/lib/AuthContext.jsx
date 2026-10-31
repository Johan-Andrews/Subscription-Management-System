import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import api from './api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = useCallback(async (token, rethrow = false) => {
    try {
      if (!token) {
        setUser(null);
        return null;
      }
      const profile = await api.get('/auth/me');
      setUser(profile);
      return profile;
    } catch (err) {
      console.error('Failed to load user profile:', err);
      setUser(null);
      if (rethrow) throw err;
      return null;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (currentSession?.access_token) {
      await fetchUserProfile(currentSession.access_token);
    } else {
      setUser(null);
    }
  }, [fetchUserProfile]);

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (mounted) {
          setSession(initialSession);
          if (initialSession?.access_token) {
            await fetchUserProfile(initialSession.access_token);
          }
        }
      } catch (err) {
        console.error('Error during initial auth setup:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);
      if (newSession?.access_token) {
        await fetchUserProfile(newSession.access_token);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserProfile]);

  const login = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    try {
      let profile = null;
      if (data.session?.access_token) {
        profile = await fetchUserProfile(data.session.access_token, true);
      }
      return { ...data, profile };
    } catch (err) {
      await supabase.auth.signOut().catch(() => {});
      setSession(null);
      setUser(null);
      const msg = err.response?.data?.error?.message || err.message || 'Authentication failed';
      const customErr = new Error(msg);
      customErr.status = err.response?.status || 403;
      throw customErr;
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setSession(null);
      setUser(null);
    }
  };

  const role = user?.role || null;
  const roleHome = role === 'CUSTOMER' ? '/portal/profile' : '/customers';

  const value = {
    session,
    user,
    role,
    roleHome,
    customerId: user?.customerId || null,
    loading,
    login,
    logout,
    refreshUser,
    isAuthenticated: !!session && !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

