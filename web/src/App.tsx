import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { AdminDashboard } from './pages/AdminDashboard';
import { Members } from './pages/Members';
import { Banks } from './pages/Banks';
import { Transactions } from './pages/Transactions';
import { Profile } from './pages/Profile';
import { Settings } from './pages/Settings';
import { Assistant } from './pages/Assistant';
import NewVersionBar from './components/NewVersionBar';
import { useAuthStore } from './store/auth';
import { useThemeStore } from './store/theme';

function Home() {
  const member = useAuthStore((s) => s.member);
  return <Navigate to={member?.role === 'ADMIN' ? '/dashboard' : '/profile'} replace />;
}

const BRAND = { colorPrimary: '#0f3460' };

export default function App() {
  const mode = useThemeStore((s) => s.mode);
  // The phone's top bar and the page behind the app follow the app's light / dark choice: the
  // header's colour as theme-color, the layout's as the page background (found in use: the top bar
  // stayed white on phones - newer iPhones colour it from the page, which was always white).
  useEffect(() => {
    const t = antdTheme.getDesignToken({ token: BRAND, algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm });
    document.documentElement.style.colorScheme = mode;
    document.documentElement.style.background = t.colorBgLayout;
    document.body.style.background = t.colorBgLayout;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.colorBgContainer);
  }, [mode]);
  return (
    <ConfigProvider
      theme={{
        token: BRAND,
        algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Home />} />
              <Route element={<ProtectedRoute allow={['ADMIN']} />}>
                <Route path="/dashboard" element={<AdminDashboard />} />
                <Route path="/members" element={<Members />} />
                <Route path="/banks" element={<Banks />} />
                <Route path="/transactions" element={<Transactions />} />
              </Route>
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/assistant" element={<Assistant />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
      <NewVersionBar />
    </ConfigProvider>
  );
}
