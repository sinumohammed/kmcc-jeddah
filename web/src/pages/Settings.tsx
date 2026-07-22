import { Button, Card, Form, Input, message, Space, Switch, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Loader } from '../components/Loader';
import { useAuthStore } from '../store/auth';
import { useThemeStore } from '../store/theme';

export function Settings() {
  const authMember = useAuthStore((s) => s.member)!;
  const { mode, toggle } = useThemeStore();

  const [loading, setLoading] = useState(true);
  const [contactForm] = Form.useForm();
  const [contactSaving, setContactSaving] = useState(false);

  const [passwordForm] = Form.useForm();
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    api.get(`/members/${authMember.id}`).then(({ data }) => {
      contactForm.setFieldsValue({ mobile: data.mobile, address: data.address ?? '' });
    }).finally(() => setLoading(false));
  }, [authMember.id]);

  if (loading) return <Loader />;

  async function saveContact(values: { mobile: string; address?: string }) {
    setContactSaving(true);
    try {
      await api.put(`/members/${authMember.id}/contact`, values);
      message.success('Contact details updated');
    } catch (e: any) {
      message.error(e.response?.data?.error ?? 'Failed to update contact details');
    } finally {
      setContactSaving(false);
    }
  }

  async function changePassword(values: { currentPassword: string; newPassword: string }) {
    setPasswordSaving(true);
    try {
      await api.post('/auth/change-password', values);
      message.success('Password changed');
      passwordForm.resetFields();
    } catch (e: any) {
      message.error(e.response?.data?.error ?? 'Failed to change password');
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title="Appearance">
        <Space align="center">
          <Typography.Text>Dark theme</Typography.Text>
          <Switch checked={mode === 'dark'} onChange={toggle} />
        </Space>
      </Card>

      <Card title="Contact Details">
        <Form form={contactForm} layout="vertical" onFinish={saveContact} style={{ maxWidth: 400 }}>
          <Form.Item name="mobile" label="Mobile Number" rules={[{ required: true, message: 'Mobile number is required' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="address" label="Address">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={contactSaving}>
              Save Contact Details
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="Change Password">
        <Form form={passwordForm} layout="vertical" onFinish={changePassword} style={{ maxWidth: 400 }}>
          <Form.Item
            name="currentPassword"
            label="Current Password"
            rules={[{ required: true, message: 'Current password is required' }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="New Password"
            rules={[
              { required: true, message: 'New password is required' },
              { min: 6, message: 'Password must be at least 6 characters' },
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="Confirm New Password"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Please confirm the new password' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error('Passwords do not match'));
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={passwordSaving}>
              Change Password
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </Space>
  );
}
