import { Button, Card, Form, Input, message, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

export function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', values);
      login(data.token, data.member);
      navigate(data.member.role === 'ADMIN' ? '/dashboard' : '/profile');
    } catch (err: any) {
      message.error(err.response?.data?.error ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#f0f2f5',
      }}
    >
      <Card style={{ width: 360 }}>
        <Typography.Title level={3} style={{ textAlign: 'center' }}>
          KMCC Login
        </Typography.Title>
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="username"
            label="Mobile Number or Member ID"
            rules={[{ required: true, message: 'Enter your mobile number or Member ID' }]}
          >
            <Input placeholder="e.g. 9999999999 or KMCC0001" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            Login
          </Button>
        </Form>
      </Card>
      <div style={{ marginTop: 24, color: 'rgba(0, 0, 0, 0.45)', fontSize: 13 }}>
        KMCC | Designed by Sinu
      </div>
    </div>
  );
}
