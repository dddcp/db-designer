import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: (dark: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  isDarkMode: false,
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(
    () => localStorage.getItem('theme') === 'dark'
  );

  useEffect(() => {
    invoke('apply_window_theme', { isDark: isDarkMode }).catch(() => {});
  }, [isDarkMode]);

  const toggleTheme = useCallback((dark: boolean) => {
    setIsDarkMode(dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, []);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
