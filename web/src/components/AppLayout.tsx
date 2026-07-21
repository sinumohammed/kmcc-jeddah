import { Layout, Menu, Button, Typography } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  BankOutlined,
  SwapOutlined,
  UserOutlined,
  LogoutOutlined,
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

  const items = isAdmin
    ? [
        { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
        { key: '/members', icon: <TeamOutlined />, label: 'Members' },
        { key: '/banks', icon: <BankOutlined />, label: 'Banks' },
        { key: '/transactions', icon: <SwapOutlined />, label: 'Transactions' },
        { key: '/profile', icon: <UserOutlined />, label: 'Member Profile' },
      ]
    : [{ key: '/profile', icon: <UserOutlined />, label: 'My Profile' }];

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
      <Layout>
        <Header
          style={{
            background: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 16px',
          }}
        >
          <Typography.Text strong>
            {member?.name} ({member?.memberCode})
          </Typography.Text>
          <Button icon={<LogoutOutlined />} onClick={() => { logout(); navigate('/login'); }}>
            Logout
          </Button>
        </Header>
        <Content style={{ margin: 16 }}>
          <Outlet />
        </Content>
        <Footer style={{ textAlign: 'center', color: 'rgba(0, 0, 0, 0.45)' }}>
          KMCC | Designed by Sinu
        </Footer>
      </Layout>
    </Layout>
  );
}
