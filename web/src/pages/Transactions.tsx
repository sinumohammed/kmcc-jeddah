import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
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
import type { Bank, Loan, Member, Transaction, TxnFlow } from '../types';

const FLOW_OPTIONS = [
  { label: 'Deposit', value: 'INCOME' },
  { label: 'Withdrawal', value: 'EXPENSE' },
];

const CATEGORY_OPTIONS: Record<TxnFlow, { label: string; value: string }[]> = {
  INCOME: [
    { label: 'Saving', value: 'SAVING_DEPOSIT' },
    { label: 'Interest', value: 'INTEREST' },
    { label: 'Loan', value: 'LOAN_REPAYMENT' },
    { label: 'Zakat', value: 'ZAKAT' },
  ],
  EXPENSE: [
    { label: 'Loan', value: 'LOAN_DISBURSEMENT' },
    { label: 'Expense', value: 'EXPENSE' },
    { label: 'Zakat', value: 'ZAKAT' },
  ],
};

const MEMBER_REQUIRED_CATEGORIES = ['SAVING_DEPOSIT', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT'];

function flowLabel(flow: string) {
  return flow === 'INCOME' ? 'Deposit' : 'Withdrawal';
}

export function Transactions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const bankFilter = searchParams.get('bankId') ?? undefined;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [memberLoans, setMemberLoans] = useState<Loan[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [profitOpen, setProfitOpen] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [form] = Form.useForm();
  const [profitForm] = Form.useForm();

  const flow = Form.useWatch('flow', form);
  const category = Form.useWatch('category', form);
  const selectedMemberId = Form.useWatch('memberId', form);
  const memberRequired = MEMBER_REQUIRED_CATEGORIES.includes(category);

  const load = () => {
    setLoading(true);
    return api
      .get('/transactions', { params: bankFilter ? { bankId: bankFilter } : {} })
      .then(({ data }) => setTransactions(data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [bankFilter]);

  useEffect(() => {
    api.get('/members').then(({ data }) => setMembers(data));
    api.get('/banks').then(({ data }) => setBanks(data));
  }, []);

  useEffect(() => {
    if (category === 'LOAN_REPAYMENT' && selectedMemberId) {
      api.get('/loans', { params: { memberId: selectedMemberId } }).then(({ data }) => setMemberLoans(data));
    } else {
      setMemberLoans([]);
    }
  }, [category, selectedMemberId]);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    setOpen(true);
  };

  const openEdit = (txn: Transaction) => {
    setEditing(txn);
    form.setFieldsValue({
      flow: txn.flow,
      category: txn.category,
      memberId: txn.memberId ?? undefined,
      linkedLoanId: txn.linkedLoanId ?? undefined,
      bankId: txn.bankId,
      amount: Number(txn.amount),
      date: dayjs(txn.date),
      description: txn.description,
    });
    setOpen(true);
  };

  const onSubmit = async (values: any) => {
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/transactions/${editing.id}`, { ...values, date: values.date.toISOString() });
        message.success('Transaction updated');
      } else {
        await api.post('/transactions', { ...values, date: values.date.toISOString() });
        message.success('Transaction added');
      }
      setOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    await api.delete(`/transactions/${id}`);
    message.success('Transaction deleted');
    load();
  };

  const onDistributeProfit = async (values: any) => {
    setDistributing(true);
    try {
      const { data } = await api.post('/transactions/profit-distribution', {
        ...values,
        date: values.date.toISOString(),
      });
      message.success(`Profit distributed to ${data.count} members`);
      setProfitOpen(false);
      profitForm.resetFields();
      load();
    } finally {
      setDistributing(false);
    }
  };

  const clearBankFilter = () => setSearchParams({});

  return (
    <>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" onClick={openAdd}>
          Add Transaction
        </Button>
        <Button onClick={() => setProfitOpen(true)}>Distribute Profit</Button>
        {bankFilter && (
          <Tag closable onClose={clearBankFilter} color="blue">
            Filtered by: {banks.find((b) => b.id === bankFilter)?.name ?? 'Bank'}
          </Tag>
        )}
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={transactions}
        scroll={{ x: 960 }}
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
          { title: 'Bank', dataIndex: ['bank', 'name'], width: 140, ellipsis: true },
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
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
                <Popconfirm title="Delete this transaction?" onConfirm={() => onDelete(record.id)}>
                  <Button danger size="small" icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? 'Edit Transaction' : 'Add Transaction'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={form.submit}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onSubmit} initialValues={{ date: dayjs() }}>
          <Form.Item name="flow" label="Flow" rules={[{ required: true }]}>
            <Select options={FLOW_OPTIONS} />
          </Form.Item>
          <Form.Item name="category" label="Category" rules={[{ required: true }]}>
            <Select options={flow ? CATEGORY_OPTIONS[flow as TxnFlow] : []} disabled={!flow} />
          </Form.Item>
          <Form.Item
            name="memberId"
            label={memberRequired ? 'Member' : 'Member (optional)'}
            rules={memberRequired ? [{ required: true, message: 'Member is required for this category' }] : []}
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={members.map((m) => ({ label: `${m.name} (${m.memberCode})`, value: m.id }))}
            />
          </Form.Item>
          {category === 'LOAN_REPAYMENT' && (
            <Form.Item name="linkedLoanId" label="Loan">
              <Select
                options={memberLoans.map((l) => ({
                  label: `₹${l.principalAmount} on ${dayjs(l.disbursedDate).format('DD-MMM-YYYY')} (balance ₹${l.balance})`,
                  value: l.id,
                }))}
              />
            </Form.Item>
          )}
          <Form.Item name="bankId" label="Bank" rules={[{ required: true }]}>
            <Select options={banks.map((b) => ({ label: b.name, value: b.id }))} />
          </Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} />
          </Form.Item>
          <Form.Item name="date" label="Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Distribute Profit"
        open={profitOpen}
        onCancel={() => setProfitOpen(false)}
        onOk={profitForm.submit}
        confirmLoading={distributing}
        destroyOnClose
      >
        <Form form={profitForm} layout="vertical" onFinish={onDistributeProfit} initialValues={{ date: dayjs() }}>
          <Form.Item name="totalAmount" label="Total Profit Amount" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} />
          </Form.Item>
          <Form.Item name="bankId" label="Bank" rules={[{ required: true }]}>
            <Select options={banks.map((b) => ({ label: b.name, value: b.id }))} />
          </Form.Item>
          <Form.Item name="date" label="Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <p style={{ color: '#888' }}>
            Amount is split across all active saving members proportional to each member's total
            savings collected to date.
          </p>
        </Form>
      </Modal>
    </>
  );
}
