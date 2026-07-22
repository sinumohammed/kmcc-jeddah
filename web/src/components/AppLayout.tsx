import { Layout, Menu, Button, Typography, theme } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  BankOutlined,
  SwapOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

const { Header, Sider, Content, Footer } = Layout;

export function AppLayout() {
  const { member, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = member?.role === 'ADMIN';
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { token } = theme.useToken();

  const items = isAdmin
    ? [
        { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
        { key: '/members', icon: <TeamOutlined />, label: 'Members' },
        { key: '/banks', icon: <BankOutlined />, label: 'Banks' },
        { key: '/transactions', icon: <SwapOutlined />, label: 'Transactions' },
        { key: '/profile', icon: <UserOutlined />, label: 'Member Profile' },
        { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
      ]
    : [
        { key: '/profile', icon: <UserOutlined />, label: 'My Profile' },
        { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
      ];

  const mobileMenuOpen = isMobile && !collapsed;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        breakpoint="lg"
        collapsedWidth="0"
        collapsed={collapsed}
        onCollapse={setCollapsed}
        onBreakpoint={(broken) => {
          setIsMobile(broken);
          setCollapsed(broken);
        }}
        style={
          mobileMenuOpen
            ? { position: 'fixed', insetInlineStart: 0, top: 0, bottom: 0, zIndex: 999 }
            : undefined
        }
      >
        <div style={{ color: '#fff', padding: 16, fontWeight: 700, fontSize: 18 }}>KMCC</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={items}
          onClick={(e) => {
            navigate(e.key);
            if (isMobile) setCollapsed(true);
          }}
        />
      </Sider>
      {mobileMenuOpen && (
        <div
          onClick={() => setCollapsed(true)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.45)', zIndex: 998 }}
        />
      )}
      <Layout>
        <Header
          style={{
            background: token.colorBgContainer,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 16px',
          }}
        >
          <Typography.Text strong style={{ color: token.colorText }}>
            {member?.name} ({member?.memberCode})
          </Typography.Text>
          <Button icon={<LogoutOutlined />} onClick={() => { logout(); navigate('/login'); }}>
            Logout
          </Button>
        </Header>
        <Content style={{ margin: 16 }}>
          <Outlet />
        </Content>
        <Footer style={{ textAlign: 'center', color: token.colorTextSecondary }}>
          KMCC | Designed by Sinu
        </Footer>
      </Layout>
    </Layout>
  );
}
