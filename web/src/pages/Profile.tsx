import { Card, Col, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { api } from '../api/client';
import { Loader } from '../components/Loader';
import { useAuthStore } from '../store/auth';
import type { Loan, MonthlyContribution, Transaction } from '../types';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function Profile() {
  const member = useAuthStore((s) => s.member)!;
  const [contributions, setContributions] = useState<MonthlyContribution[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      member.isSavingMember
        ? api
            .get(`/members/${member.id}/contributions`, { params: { year: dayjs().year() } })
            .then(({ data }) => setContributions(data))
        : Promise.resolve(),
      api.get('/transactions').then(({ data }) => setTransactions(data)),
      member.isLoanMember ? api.get('/loans').then(({ data }) => setLoans(data)) : Promise.resolve(),
    ]).finally(() => setLoading(false));
  }, [member.id, member.isSavingMember, member.isLoanMember]);

  const totalPaid = contributions.reduce((sum, c) => sum + Number(c.amountPaid), 0);

  if (loading) return <Loader />;

  return (
    <>
      <Typography.Title level={3}>
        {member.name} ({member.memberCode})
      </Typography.Title>

      {member.isSavingMember && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} md={8}>
              <Card>
                <Statistic title="Total Savings Paid (this year)" value={totalPaid} prefix="₹" precision={2} />
              </Card>
            </Col>
          </Row>
          <Card title={`${dayjs().year()} Contribution Schedule`} style={{ marginBottom: 16 }}>
            <Table
              rowKey="id"
              pagination={false}
              dataSource={contributions}
              columns={[
                { title: 'Month', dataIndex: 'month', render: (m) => MONTH_NAMES[m - 1] },
                { title: 'Amount Due', dataIndex: 'amountDue', render: (a) => `₹${Number(a).toFixed(2)}` },
                { title: 'Amount Paid', dataIndex: 'amountPaid', render: (a) => `₹${Number(a).toFixed(2)}` },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  render: (s) => (
                    <Tag color={s === 'PAID' ? 'green' : s === 'PARTIAL' ? 'orange' : 'red'}>{s}</Tag>
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}

      {member.isLoanMember && (
        <Card title="Loan Details" style={{ marginBottom: 16 }}>
          {loans.map((loan) => (
            <div key={loan.id} style={{ marginBottom: 24 }}>
              <Space direction="vertical">
                <Typography.Text>
                  Principal: ₹{Number(loan.principalAmount).toFixed(2)} | Balance: ₹
                  {Number(loan.balance).toFixed(2)} |{' '}
                  <Tag color={loan.status === 'ACTIVE' ? 'volcano' : 'green'}>{loan.status}</Tag>
                </Typography.Text>
              </Space>
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={loan.transactions ?? []}
                columns={[
                  { title: 'Date', dataIndex: 'date', render: (d) => dayjs(d).format('DD-MMM-YYYY') },
                  { title: 'Category', dataIndex: 'category' },
                  { title: 'Amount', dataIndex: 'amount', render: (a) => `₹${Number(a).toFixed(2)}` },
                  { title: 'Description', dataIndex: 'description' },
                ]}
              />
            </div>
          ))}
        </Card>
      )}

      <Card title="My Transactions">
        <Table
          rowKey="id"
          dataSource={transactions}
          columns={[
            { title: 'Date', dataIndex: 'date', render: (d) => dayjs(d).format('DD-MMM-YYYY') },
            {
              title: 'Flow',
              dataIndex: 'flow',
              render: (f) => (
                <Tag color={f === 'INCOME' ? 'green' : 'red'}>{f === 'INCOME' ? 'Deposit' : 'Withdrawal'}</Tag>
              ),
            },
            { title: 'Category', dataIndex: 'category' },
            { title: 'Amount', dataIndex: 'amount', render: (a) => `₹${Number(a).toFixed(2)}` },
            { title: 'Description', dataIndex: 'description' },
          ]}
        />
      </Card>
    </>
  );
}
