import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { AdminDashboard } from './pages/AdminDashboard';
import { Members } from './pages/Members';
import { Banks } from './pages/Banks';
import { Transactions } from './pages/Transactions';
import { Profile } from './pages/Profile';
import { useAuthStore } from './store/auth';

function Home() {
  const member = useAuthStore((s) => s.member);
  return <Navigate to={member?.role === 'ADMIN' ? '/dashboard' : '/profile'} replace />;
}

export default function App() {
  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#0f3460' } }}>
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
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
