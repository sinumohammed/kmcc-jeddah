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
import { useAuthStore } from './store/auth';
import { useThemeStore } from './store/theme';

function Home() {
  const member = useAuthStore((s) => s.member);
  return <Navigate to={member?.role === 'ADMIN' ? '/dashboard' : '/profile'} replace />;
}

export default function App() {
  const mode = useThemeStore((s) => s.mode);
  return (
    <ConfigProvider
      theme={{
        token: { colorPrimary: '#0f3460' },
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
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
