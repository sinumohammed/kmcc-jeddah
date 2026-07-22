import {
  Button,
  Checkbox,
  DatePicker,
  Descriptions,
  Form,
  Grid,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { api } from '../api/client';
import { TransactionFormFields } from '../components/TransactionFormFields';
import type { Bank, Transaction } from '../types';

function flowLabel(flow: string) {
  return flow === 'INCOME' ? 'Deposit' : 'Withdrawal';
}

export function Banks() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.sm;

  const [searchParams, setSearchParams] = useSearchParams();
  const bankFilter = searchParams.get('bankId') ?? undefined;

  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Bank | null>(null);
  const [form] = Form.useForm();

  const [entryOpen, setEntryOpen] = useState(false);
  const [entrySaving, setEntrySaving] = useState(false);
  const [entryForm] = Form.useForm();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txnLoading, setTxnLoading] = useState(true);
  const [editTxnOpen, setEditTxnOpen] = useState(false);
  const [editTxnSaving, setEditTxnSaving] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [editTxnForm] = Form.useForm();

  const load = () => {
    setLoading(true);
    return api
      .get('/banks')
      .then(({ data }) => setBanks(data))
      .finally(() => setLoading(false));
  };

  const loadTransactions = () => {
    setTxnLoading(true);
    return api
      .get('/transactions', { params: bankFilter ? { bankId: bankFilter } : {} })
      .then(({ data }) => setTransactions(data.filter((t: Transaction) => t.bankId)))
      .finally(() => setTxnLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [bankFilter]);

  const clearBankFilter = () => setSearchParams({});

  const openEditTxn = (txn: Transaction) => {
    setEditingTxn(txn);
    editTxnForm.setFieldsValue({
      flow: txn.flow,
      category: txn.category,
      bankId: txn.bankId ?? undefined,
      amount: Number(txn.amount),
      date: dayjs(txn.date),
      description: txn.description,
    });
    setEditTxnOpen(true);
  };

  const onSubmitEditTxn = async (values: any) => {
    setEditTxnSaving(true);
    try {
      await api.put(`/transactions/${editingTxn!.id}`, { ...values, date: values.date.toISOString() });
      message.success('Transaction updated');
      setEditTxnOpen(false);
      loadTransactions();
    } finally {
      setEditTxnSaving(false);
    }
  };

  const onDeleteTxn = async (id: string) => {
    await api.delete(`/transactions/${id}`);
    message.success('Transaction deleted');
    loadTransactions();
  };

  const openAddEntry = () => {
    entryForm.resetFields();
    setEntryOpen(true);
  };

  const onSubmitEntry = async (values: any) => {
    setEntrySaving(true);
    try {
      await api.post('/transactions', { ...values, date: values.date.toISOString() });
      message.success('Entry added');
      setEntryOpen(false);
      load();
      loadTransactions();
    } finally {
      setEntrySaving(false);
    }
  };

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
      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" onClick={openAdd}>
          Add Bank
        </Button>
        <Button icon={<PlusOutlined />} onClick={openAddEntry}>
          Add Entry
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={banks}
        expandable={{
          expandedRowRender: (bank) => (
            <div style={{ overflowX: 'auto' }}>
              <Descriptions size="small" column={isMobile ? 1 : 2} bordered style={{ minWidth: isMobile ? 280 : 560 }}>
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
            </div>
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

      <Typography.Title level={5} style={{ marginTop: 24, marginBottom: 12 }}>
        Transactions
      </Typography.Title>
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Filter by bank"
          style={{ width: 220 }}
          value={bankFilter}
          options={banks.map((b) => ({ label: b.name, value: b.id }))}
          onChange={(value) => setSearchParams(value ? { bankId: value } : {})}
        />
        {bankFilter && (
          <Tag closable onClose={clearBankFilter} color="blue">
            Filtered by: {banks.find((b) => b.id === bankFilter)?.name ?? 'Bank'}
          </Tag>
        )}
      </Space>
      <Table
        rowKey="id"
        loading={txnLoading}
        dataSource={transactions}
        scroll={{ x: 1030 }}
        columns={[
          {
            title: 'Date',
            dataIndex: 'date',
            width: 110,
            render: (d) => dayjs(d).format('DD-MMM-YYYY'),
          },
          {
            title: 'Member',
            width: 160,
            ellipsis: true,
            render: (_, r) => (r.member ? `${r.member.name} (${r.member.memberCode})` : '-'),
          },
          { title: 'Bank', width: 140, ellipsis: true, render: (_, r) => r.bank?.name ?? '-' },
          {
            title: 'Flow',
            dataIndex: 'flow',
            width: 100,
            render: (f) => <Tag color={f === 'INCOME' ? 'green' : 'red'}>{flowLabel(f)}</Tag>,
          },
          { title: 'Category', dataIndex: 'category', width: 130 },
          {
            title: 'Amount',
            dataIndex: 'amount',
            width: 120,
            render: (a) => `₹${Number(a).toFixed(2)}`,
          },
          { title: 'Description', dataIndex: 'description', width: 180, ellipsis: true },
          {
            title: 'Actions',
            width: 90,
            fixed: 'right',
            render: (_, record) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEditTxn(record)} />
                <Popconfirm title="Delete this transaction?" onConfirm={() => onDeleteTxn(record.id)}>
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

      <Modal
        title="Add Entry"
        open={entryOpen}
        onCancel={() => setEntryOpen(false)}
        onOk={entryForm.submit}
        confirmLoading={entrySaving}
        destroyOnClose
      >
        <Form
          form={entryForm}
          layout="vertical"
          onFinish={onSubmitEntry}
          initialValues={{ date: dayjs(), flow: 'INCOME', category: 'SAVING_DEPOSIT' }}
        >
          <TransactionFormFields
            form={entryForm}
            members={[]}
            banks={banks}
            memberLoans={[]}
            showMember={false}
            restrictLoanCategories
          />
        </Form>
      </Modal>

      <Modal
        title="Edit Transaction"
        open={editTxnOpen}
        onCancel={() => setEditTxnOpen(false)}
        onOk={editTxnForm.submit}
        confirmLoading={editTxnSaving}
        destroyOnClose
      >
        <Form form={editTxnForm} layout="vertical" onFinish={onSubmitEditTxn}>
          <TransactionFormFields form={editTxnForm} members={[]} banks={banks} memberLoans={[]} showMember={false} />
        </Form>
      </Modal>
    </>
  );
}
