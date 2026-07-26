import {
  Alert,
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
  Upload,
  message,
} from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { api } from '../api/client';
import { parseCsv } from '../utils/csv';
import { TransactionFormFields } from '../components/TransactionFormFields';
import type { Bank, Transaction } from '../types';

function flowLabel(flow: string) {
  return flow === 'INCOME' ? 'Deposit' : 'Withdrawal';
}

type ImportRow = {
  date: string;
  memberCode: string;
  bankName: string;
  flow: string;
  category: string;
  amount: string;
  description: string;
};

type PreviewRow = {
  row: number;
  status: 'ok' | 'error';
  memberCode?: string;
  memberName?: string;
  bankName?: string;
  flow?: string;
  category?: string;
  amount?: number;
  date?: string;
  description?: string;
  error?: string;
};

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

  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: { row: number; error: string }[] } | null>(null);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importPreview, setImportPreview] = useState<PreviewRow[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txnLoading, setTxnLoading] = useState(true);
  const [editTxnOpen, setEditTxnOpen] = useState(false);
  const [editTxnSaving, setEditTxnSaving] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [editTxnForm] = Form.useForm();
  const [selectedTxnKeys, setSelectedTxnKeys] = useState<string[]>([]);
  const [bulkTxnDeleting, setBulkTxnDeleting] = useState(false);

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
    setSelectedTxnKeys([]);
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

  const onBulkDeleteTxn = async () => {
    setBulkTxnDeleting(true);
    try {
      await Promise.all(selectedTxnKeys.map((id) => api.delete(`/transactions/${id}`)));
      message.success(`${selectedTxnKeys.length} transaction(s) deleted`);
      setSelectedTxnKeys([]);
      loadTransactions();
    } finally {
      setBulkTxnDeleting(false);
    }
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

  const resetImportState = () => {
    setImportRows([]);
    setImportPreview(null);
    setImportResult(null);
  };

  const onImportFile = async (file: File) => {
    setPreviewLoading(true);
    resetImportState();
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      const rows: ImportRow[] = parsed.map((r) => ({
        date: r.Date,
        memberCode: r.MemberCode,
        bankName: r.BankName,
        flow: r.Flow,
        category: r.Category,
        amount: r.Amount,
        description: r.Description,
      }));
      setImportRows(rows);
      const { data } = await api.post('/transactions/import', { rows, dryRun: true, bankOnly: true });
      setImportPreview(data.preview);
    } catch (e: any) {
      message.error(e.response?.data?.error ?? 'Failed to preview file');
    } finally {
      setPreviewLoading(false);
    }
    return false;
  };

  const onConfirmImport = async () => {
    setImporting(true);
    try {
      const { data } = await api.post('/transactions/import', { rows: importRows, bankOnly: true });
      setImportResult(data);
      setImportPreview(null);
      if (data.created > 0) {
        message.success(`Imported ${data.created} ${data.created === 1 ? 'entry' : 'entries'}`);
        load();
        loadTransactions();
      }
    } catch (e: any) {
      message.error(e.response?.data?.error ?? 'Import failed');
    } finally {
      setImporting(false);
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
        <Button
          icon={<UploadOutlined />}
          onClick={() => {
            resetImportState();
            setImportOpen(true);
          }}
        >
          Import CSV
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
        {selectedTxnKeys.length > 0 && (
          <Popconfirm
            title={`Delete ${selectedTxnKeys.length} selected transaction(s)?`}
            onConfirm={onBulkDeleteTxn}
          >
            <Button danger icon={<DeleteOutlined />} loading={bulkTxnDeleting}>
              {isMobile ? selectedTxnKeys.length : `Delete Selected (${selectedTxnKeys.length})`}
            </Button>
          </Popconfirm>
        )}
      </Space>
      <Table
        rowKey="id"
        loading={txnLoading}
        dataSource={transactions}
        scroll={{ x: 1030 }}
        rowSelection={{
          selectedRowKeys: selectedTxnKeys,
          onChange: (keys) => setSelectedTxnKeys(keys as string[]),
        }}
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

      <Modal
        title="Import Bank Entries"
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        width={importPreview && !importResult ? 900 : 520}
        footer={
          importPreview && !importResult ? (
            <Space>
              <Button onClick={resetImportState}>Back</Button>
              <Button
                type="primary"
                loading={importing}
                disabled={importPreview.every((p) => p.status !== 'ok')}
                onClick={onConfirmImport}
              >
                Confirm Import ({importPreview.filter((p) => p.status === 'ok').length} row(s))
              </Button>
            </Space>
          ) : importResult ? (
            <Space>
              <Button onClick={resetImportState}>Import Another File</Button>
              <Button type="primary" onClick={() => setImportOpen(false)}>
                Close
              </Button>
            </Space>
          ) : (
            <Button onClick={() => setImportOpen(false)}>Close</Button>
          )
        }
        destroyOnClose
      >
        {!importPreview && !importResult && (
          <>
            <Typography.Paragraph>
              Upload a CSV with columns: <code>Date</code> (YYYY-MM-DD, or DD/MM/YYYY as Excel
              tends to rewrite it), <code>MemberCode</code> (optional — every category importable
              here can be recorded without a member), <code>BankName</code> (always required, since
              every row here is a bank-side entry), <code>Flow</code> (INCOME/EXPENSE or
              Deposit/Withdrawal), <code>Category</code> (Saving, Interest, Profit, Expense, Zakat
              only — Loan and Savings Withdrawal rows always need a member and aren't importable on
              this page; use Transactions page import for those), <code>Amount</code>,{' '}
              <code>Description</code>. You'll get a preview to check before anything is saved.
            </Typography.Paragraph>
            <Upload.Dragger
              accept=".csv"
              multiple={false}
              showUploadList={false}
              disabled={previewLoading}
              beforeUpload={onImportFile}
            >
              <p className="ant-upload-drag-icon">
                <UploadOutlined />
              </p>
              <p className="ant-upload-text">
                {previewLoading ? 'Reading file…' : 'Click or drag a CSV file here to import'}
              </p>
            </Upload.Dragger>
          </>
        )}

        {importPreview && !importResult && (
          <>
            <Alert
              style={{ marginBottom: 12 }}
              type={importPreview.some((p) => p.status !== 'ok') ? 'warning' : 'success'}
              showIcon
              message={`${importPreview.filter((p) => p.status === 'ok').length} of ${importPreview.length} row(s) ready to import`}
              description="Rows with errors will be skipped."
            />
            <Table
              size="small"
              rowKey="row"
              dataSource={importPreview}
              pagination={false}
              scroll={{ y: 360 }}
              columns={[
                { title: 'Row', dataIndex: 'row', width: 55 },
                {
                  title: 'Member',
                  width: 150,
                  render: (_, p) => (p.memberName ? `${p.memberName} (${p.memberCode})` : '-'),
                },
                { title: 'Bank', dataIndex: 'bankName', width: 130, render: (v) => v || '-' },
                {
                  title: 'Flow',
                  dataIndex: 'flow',
                  width: 90,
                  render: (v) => (v ? <Tag color={v === 'INCOME' ? 'green' : 'red'}>{flowLabel(v)}</Tag> : '-'),
                },
                { title: 'Category', dataIndex: 'category', width: 120 },
                { title: 'Amount', dataIndex: 'amount', width: 90, render: (v) => (v != null ? `₹${v}` : '-') },
                {
                  title: 'Status',
                  width: 200,
                  render: (_, p) =>
                    p.status === 'ok' ? (
                      <Tag color="green">OK</Tag>
                    ) : (
                      <Tag color="red">{p.error}</Tag>
                    ),
                },
              ]}
            />
          </>
        )}

        {importResult && (
          <div>
            <Alert
              type={importResult.errors.length === 0 ? 'success' : 'warning'}
              showIcon
              message={`Imported ${importResult.created} of ${importResult.created + importResult.errors.length} row(s)`}
            />
            {importResult.errors.length > 0 && (
              <ul style={{ maxHeight: 200, overflowY: 'auto', marginTop: 8 }}>
                {importResult.errors.map((e) => (
                  <li key={e.row}>
                    Row {e.row}: {e.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
