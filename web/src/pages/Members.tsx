import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { api } from '../api/client';
import type { Member } from '../types';

const TYPE_LABELS: Record<string, string> = { saving: 'Saving Members', loan: 'Loan Members' };

export function Members() {
  const [searchParams, setSearchParams] = useSearchParams();
  const typeFilter = searchParams.get('type') ?? undefined;

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [form] = Form.useForm();
  const memberType = Form.useWatch('memberType', form);

  const load = () => {
    setLoading(true);
    return api
      .get('/members', { params: typeFilter ? { type: typeFilter } : {} })
      .then(({ data }) => setMembers(data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [typeFilter]);

  const clearTypeFilter = () => setSearchParams({});

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    setOpen(true);
  };

  const openEdit = async (member: Member) => {
    setEditing(member);
    const { data: full } = await api.get(`/members/${member.id}`);
    const currentYear = dayjs().year();
    const currentAmount = full.monthlyAmounts?.find((m: any) => m.year === currentYear)?.amount;

    form.setFieldsValue({
      name: full.name,
      mobile: full.mobile,
      address: full.address,
      joinDate: dayjs(full.joinDate),
      memberType: full.isSavingMember ? 'saving' : full.isLoanMember ? 'loan' : undefined,
      monthlyAmount: currentAmount ? Number(currentAmount) : undefined,
      password: undefined,
    });
    setOpen(true);
  };

  const onSubmit = async (values: any) => {
    const { memberType: type, monthlyAmount, password, ...rest } = values;
    const payload: any = {
      ...rest,
      isSavingMember: type === 'saving',
      isLoanMember: type === 'loan',
      joinDate: values.joinDate?.toISOString() ?? new Date().toISOString(),
    };
    if (password) payload.password = password;

    setSaving(true);
    try {
      if (editing) {
        await api.put(`/members/${editing.id}`, payload);
        if (type === 'saving' && monthlyAmount) {
          await api.post(`/members/${editing.id}/monthly-amount`, {
            year: dayjs().year(),
            amount: monthlyAmount,
          });
        }
        message.success('Member updated');
      } else {
        await api.post('/members', { ...payload, monthlyAmount });
        message.success('Member added');
      }
      setOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    await api.delete(`/members/${id}`);
    message.success('Member removed');
    load();
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" onClick={openAdd}>
          Add Member
        </Button>
        {typeFilter && (
          <Tag closable onClose={clearTypeFilter} color="blue">
            Filtered by: {TYPE_LABELS[typeFilter] ?? typeFilter}
          </Tag>
        )}
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={members}
        scroll={{ x: 660 }}
        columns={[
          { title: 'Member ID', dataIndex: 'memberCode', width: 110 },
          { title: 'Name', dataIndex: 'name', width: 160, ellipsis: true },
          { title: 'Mobile', dataIndex: 'mobile', width: 120 },
          {
            title: 'Type',
            width: 90,
            render: (_, r) =>
              r.isSavingMember ? (
                <Tag color="blue">Saving</Tag>
              ) : r.isLoanMember ? (
                <Tag color="volcano">Loan</Tag>
              ) : (
                '-'
              ),
          },
          {
            title: 'Join Date',
            dataIndex: 'joinDate',
            width: 110,
            render: (d) => dayjs(d).format('DD-MMM-YYYY'),
          },
          {
            title: 'Actions',
            width: 90,
            fixed: 'right',
            render: (_, record) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
                <Popconfirm title="Remove this member?" onConfirm={() => onDelete(record.id)}>
                  <Button danger size="small" icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? 'Edit Member' : 'Add Member'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={form.submit}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={onSubmit}
          initialValues={{ joinDate: dayjs(), memberType: 'saving' }}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="mobile" label="Mobile Number" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="address" label="Address">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="password"
            label={editing ? 'Password (leave blank to keep unchanged)' : 'Password'}
            rules={editing ? [] : [{ required: true }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item name="joinDate" label="Join Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="memberType" label="Member Type" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio value="saving">Saving Member</Radio>
              <Radio value="loan">Loan Member</Radio>
            </Radio.Group>
          </Form.Item>
          {memberType === 'saving' && (
            <Form.Item
              name="monthlyAmount"
              label={`Monthly Savings Amount (${dayjs().year()})`}
              rules={editing ? [] : [{ required: true }]}
            >
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
}
