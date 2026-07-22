import {
  Button,
  Checkbox,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  message,
} from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { api } from '../api/client';
import type { Bank } from '../types';

export function Banks() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Bank | null>(null);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    return api
      .get('/banks')
      .then(({ data }) => setBanks(data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    setOpen(true);
  };

  const openEdit = (bank: Bank) => {
    setEditing(bank);
    form.setFieldsValue({
      ...bank,
      accountOpenDate: bank.accountOpenDate ? dayjs(bank.accountOpenDate) : undefined,
    });
    setOpen(true);
  };

  const onSubmit = async (values: any) => {
    const payload = {
      ...values,
      accountOpenDate: values.accountOpenDate?.toISOString(),
    };
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/banks/${editing.id}`, payload);
        message.success('Bank updated');
      } else {
        await api.post('/banks', payload);
        message.success('Bank added');
      }
      setOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    await api.delete(`/banks/${id}`);
    message.success('Bank removed');
    load();
  };

  return (
    <>
      <Button type="primary" style={{ marginBottom: 16 }} onClick={openAdd}>
        Add Bank
      </Button>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={banks}
        expandable={{
          expandedRowRender: (bank) => (
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Account Holder">{bank.accountHolderName || '-'}</Descriptions.Item>
              <Descriptions.Item label="Branch Sol ID">{bank.branchSolId || '-'}</Descriptions.Item>
              <Descriptions.Item label="Customer ID">{bank.customerId || '-'}</Descriptions.Item>
              <Descriptions.Item label="Account Open Date">
                {bank.accountOpenDate ? dayjs(bank.accountOpenDate).format('DD-MMM-YYYY') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Mode of Operation">{bank.modeOfOperation || '-'}</Descriptions.Item>
              <Descriptions.Item label="Joint Holders">{bank.jointHolders || '-'}</Descriptions.Item>
              <Descriptions.Item label="MICR Code">{bank.micrCode || '-'}</Descriptions.Item>
              <Descriptions.Item label="SWIFT Code">{bank.swiftCode || '-'}</Descriptions.Item>
              <Descriptions.Item label="Currency">{bank.currency}</Descriptions.Item>
              <Descriptions.Item label="Nomination">
                {bank.nominationRegistered ? 'Registered' : 'Not Registered'}
              </Descriptions.Item>
              <Descriptions.Item label="Opening Balance">
                ₹{Number(bank.openingBalance).toFixed(2)}
              </Descriptions.Item>
            </Descriptions>
          ),
        }}
        scroll={{ x: 700 }}
        columns={[
          { title: 'Bank Name', dataIndex: 'name', width: 160, ellipsis: true },
          { title: 'Account Number', dataIndex: 'accountNumber', width: 160, ellipsis: true },
          { title: 'IFSC', dataIndex: 'ifscCode', width: 120 },
          { title: 'Branch', dataIndex: 'branchName', width: 160, ellipsis: true },
          {
            title: 'Actions',
            width: 90,
            fixed: 'right',
            render: (_, record) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
                <Popconfirm title="Remove this bank?" onConfirm={() => onDelete(record.id)}>
                  <Button danger size="small" icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? 'Edit Bank' : 'Add Bank'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={form.submit}
        confirmLoading={saving}
        destroyOnClose
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={onSubmit} initialValues={{ currency: 'INR' }}>
          <Form.Item name="name" label="Bank Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Federal Bank" />
          </Form.Item>
          <Form.Item name="accountHolderName" label="Account Holder Name">
            <Input />
          </Form.Item>
          <Form.Item name="accountNumber" label="Account Number">
            <Input />
          </Form.Item>
          <Form.Item name="branchName" label="Branch Name">
            <Input />
          </Form.Item>
          <Form.Item name="branchSolId" label="Branch Sol ID">
            <Input />
          </Form.Item>
          <Form.Item name="customerId" label="Customer ID">
            <Input />
          </Form.Item>
          <Form.Item name="accountOpenDate" label="Account Open Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="modeOfOperation" label="Mode of Operation">
            <Select
              allowClear
              options={[
                { label: 'Single', value: 'Single' },
                { label: 'Joint', value: 'Joint' },
              ]}
            />
          </Form.Item>
          <Form.Item name="jointHolders" label="Joint Holders">
            <Input />
          </Form.Item>
          <Form.Item name="ifscCode" label="IFSC Code">
            <Input />
          </Form.Item>
          <Form.Item name="micrCode" label="MICR Code">
            <Input />
          </Form.Item>
          <Form.Item name="swiftCode" label="SWIFT Code">
            <Input />
          </Form.Item>
          <Form.Item name="currency" label="Currency">
            <Input />
          </Form.Item>
          <Form.Item name="nominationRegistered" valuePropName="checked">
            <Checkbox>Nomination Registered</Checkbox>
          </Form.Item>
          <Form.Item
            name="openingBalance"
            label="Opening Balance (as per statement, when this bank is first added)"
          >
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
