import {
  Alert,
  Button,
  DatePicker,
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
import { EditOutlined, DeleteOutlined, DownloadOutlined, UploadOutlined, PlusOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { api } from '../api/client';
import { downloadCsv, parseCsv, toCsv } from '../utils/csv';
import { TransactionFormFields } from '../components/TransactionFormFields';
import { CATEGORY_LABELS } from '../utils/transactionOptions';
import type { Bank, Loan, Member, Transaction } from '../types';

function RupeeIcon() {
  return <span style={{ fontWeight: 700 }}>₹</span>;
}

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
  loanId: string;
};

type LoanCandidate = { id: string; balance: string | number; disbursedDate: string };

type PreviewRow = {
  row: number;
  status: 'ok' | 'error' | 'needsLoanId';
  memberCode?: string;
  memberName?: string;
  bankName?: string;
  flow?: string;
  category?: string;
  amount?: number;
  date?: string;
  description?: string;
  loanNote?: string;
  error?: string;
  candidates?: LoanCandidate[];
};

export function Transactions() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.sm;

  const [searchParams, setSearchParams] = useSearchParams();
  const bankFilter = searchParams.get('bankId') ?? undefined;
  const categoryFilter = searchParams.get('category') ?? undefined;
  const categoryValues = categoryFilter ? categoryFilter.split(',') : [];
  const flowFilter = searchParams.get('flow') ?? undefined;
  const memberFilter = searchParams.get('memberId') ?? undefined;
  const dateFromFilter = searchParams.get('from') ?? undefined;
  const dateToFilter = searchParams.get('to') ?? undefined;

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
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: { row: number; error: string }[] } | null>(null);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importPreview, setImportPreview] = useState<PreviewRow[] | null>(null);
  const [loanSelections, setLoanSelections] = useState<Record<number, string>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [form] = Form.useForm();
  const [profitForm] = Form.useForm();

  const category = Form.useWatch('category', form);
  const selectedMemberId = Form.useWatch('memberId', form);
  const bankRequired = category !== 'SAVING_DEPOSIT' && category !== 'SAVING_WITHDRAWAL';

  const load = () => {
    setLoading(true);
    return api
      .get('/transactions', {
        params: {
          ...(bankFilter ? { bankId: bankFilter } : {}),
          ...(categoryFilter ? { category: categoryFilter } : {}),
          ...(flowFilter ? { flow: flowFilter } : {}),
          ...(memberFilter ? { memberId: memberFilter } : {}),
          ...(dateFromFilter ? { from: dateFromFilter } : {}),
          ...(dateToFilter ? { to: dateToFilter } : {}),
        },
      })
      .then(({ data }) => setTransactions(data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setSelectedRowKeys([]);
    load();
  }, [bankFilter, categoryFilter, flowFilter, memberFilter, dateFromFilter, dateToFilter]);

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

  const onBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      await Promise.all(selectedRowKeys.map((id) => api.delete(`/transactions/${id}`)));
      message.success(`${selectedRowKeys.length} transaction(s) deleted`);
      setSelectedRowKeys([]);
      load();
    } finally {
      setBulkDeleting(false);
    }
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

  const clearBankFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('bankId');
    setSearchParams(next);
  };

  const setFilterParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  const onDateRangeChange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    const next = new URLSearchParams(searchParams);
    if (dates && dates[0] && dates[1]) {
      next.set('from', dates[0].startOf('day').toISOString());
      next.set('to', dates[1].endOf('day').toISOString());
    } else {
      next.delete('from');
      next.delete('to');
    }
    setSearchParams(next);
  };

  const onExport = () => {
    const header = ['Date', 'MemberCode', 'MemberName', 'BankName', 'Flow', 'Category', 'Amount', 'Description', 'LoanId'];
    const rows = transactions.map((t) => [
      dayjs(t.date).format('YYYY-MM-DD'),
      t.member?.memberCode ?? '',
      t.member?.name ?? '',
      t.bank?.name ?? '',
      t.flow,
      t.category,
      t.amount,
      t.description,
      t.linkedLoanId ?? '',
    ]);
    downloadCsv(`transactions-${dayjs().format('YYYY-MM-DD')}.csv`, toCsv(header, rows));
  };

  const resetImportState = () => {
    setImportRows([]);
    setImportPreview(null);
    setLoanSelections({});
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
        loanId: r.LoanId,
      }));
      setImportRows(rows);
      const { data } = await api.post('/transactions/import', { rows, dryRun: true });
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
      const rows = importRows.map((r, idx) => {
        const selected = loanSelections[idx + 1];
        return selected ? { ...r, loanId: selected } : r;
      });
      const { data } = await api.post('/transactions/import', { rows });
      setImportResult(data);
      setImportPreview(null);
      if (data.created > 0) {
        message.success(`Imported ${data.created} transaction(s)`);
        load();
      }
    } catch (e: any) {
      message.error(e.response?.data?.error ?? 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" icon={<PlusOutlined />} title="Add Transaction" onClick={openAdd}>
          {!isMobile && 'Add Transaction'}
        </Button>
        <Button icon={<RupeeIcon />} title="Distribute Profit" onClick={() => setProfitOpen(true)}>
          {!isMobile && 'Distribute Profit'}
        </Button>
        <Button icon={<DownloadOutlined />} title="Export CSV" onClick={onExport}>
          {!isMobile && 'Export CSV'}
        </Button>
        <Button
          icon={<UploadOutlined />}
          title="Import CSV"
          onClick={() => {
            resetImportState();
            setImportOpen(true);
          }}
        >
          {!isMobile && 'Import CSV'}
        </Button>
        {selectedRowKeys.length > 0 && (
          <Popconfirm
            title={`Delete ${selectedRowKeys.length} selected transaction(s)?`}
            onConfirm={onBulkDelete}
          >
            <Button danger icon={<DeleteOutlined />} loading={bulkDeleting}>
              {isMobile ? selectedRowKeys.length : `Delete Selected (${selectedRowKeys.length})`}
            </Button>
          </Popconfirm>
        )}
        {bankFilter && (
          <Tag closable onClose={clearBankFilter} color="blue">
            Filtered by: {banks.find((b) => b.id === bankFilter)?.name ?? 'Bank'}
          </Tag>
        )}
      </Space>
      <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ marginBottom: 16, width: isMobile ? '100%' : undefined }} wrap>
        <Select
          allowClear
          placeholder="All Flows"
          style={{ width: isMobile ? '100%' : 160 }}
          value={flowFilter}
          options={[
            { label: 'Deposit', value: 'INCOME' },
            { label: 'Withdrawal', value: 'EXPENSE' },
          ]}
          onChange={(value) => setFilterParam('flow', value)}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="All Members"
          style={{ width: isMobile ? '100%' : 240 }}
          value={memberFilter}
          options={members.map((m) => ({ label: `${m.name} (${m.memberCode})`, value: m.id }))}
          onChange={(value) => setFilterParam('memberId', value)}
        />
        <Select
          allowClear
          mode="multiple"
          maxTagCount="responsive"
          placeholder="All Categories"
          style={{ width: isMobile ? '100%' : 240 }}
          value={categoryValues}
          options={Object.keys(CATEGORY_LABELS).map((c) => ({ label: CATEGORY_LABELS[c], value: c }))}
          onChange={(values: string[]) => setFilterParam('category', values.length ? values.join(',') : undefined)}
        />
        <DatePicker.RangePicker
          style={{ width: isMobile ? '100%' : undefined }}
          value={dateFromFilter && dateToFilter ? [dayjs(dateFromFilter), dayjs(dateToFilter)] : null}
          onChange={onDateRangeChange}
        />
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={transactions}
        scroll={{ x: 1030 }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as string[]),
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
          <TransactionFormFields
            form={form}
            members={members}
            banks={banks}
            memberLoans={memberLoans}
            bankRequired={bankRequired}
          />
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

      <Modal
        title="Import Transactions"
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
                disabled={importPreview.every((p) => p.status !== 'ok') || importPreview.some((p) => p.status === 'needsLoanId' && !loanSelections[p.row])}
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
              Upload a CSV with the same columns as Export CSV: <code>Date</code> (YYYY-MM-DD, or
              DD/MM/YYYY as Excel tends to rewrite it), <code>MemberCode</code> (required for Saving,
              Savings Withdrawal, and Loan rows), <code>BankName</code> (required except for Saving),{' '}
              <code>Flow</code> (INCOME/EXPENSE or Deposit/Withdrawal), <code>Category</code> (Saving,
              Savings Withdrawal, Interest, Profit, Expense, Zakat, Loan),{' '}
              <code>Amount</code>, <code>Description</code>,{' '}
              <code>LoanId</code> (optional — only needed for a loan repayment row when the member has
              more than one active loan; leave blank otherwise). A Loan-category row with an{' '}
              <code>EXPENSE</code> flow is treated as a disbursement (creates a new loan); with an{' '}
              <code>INCOME</code> flow it's a repayment against the member's active loan. You'll get a
              preview to check before anything is saved.
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
              description="Rows with errors will be skipped. Rows needing a loan selection must be resolved before importing."
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
                  width: 260,
                  render: (_, p) => {
                    if (p.status === 'ok') {
                      return <Tag color="green">{p.loanNote || 'OK'}</Tag>;
                    }
                    if (p.status === 'error') {
                      return <Tag color="red">{p.error}</Tag>;
                    }
                    return (
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Tag color="orange">Multiple active loans — pick one</Tag>
                        <Select
                          size="small"
                          style={{ width: '100%' }}
                          placeholder="Select loan to repay"
                          value={loanSelections[p.row]}
                          onChange={(val) => setLoanSelections((prev) => ({ ...prev, [p.row]: val }))}
                          options={(p.candidates ?? []).map((c) => ({
                            label: `${c.id.slice(-6)} — balance ₹${c.balance} (disbursed ${dayjs(c.disbursedDate).format('DD-MMM-YYYY')})`,
                            value: c.id,
                          }))}
                        />
                      </Space>
                    );
                  },
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
