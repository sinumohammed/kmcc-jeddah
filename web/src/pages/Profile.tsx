import { Alert, Avatar, Card, Col, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import { PhoneOutlined, UserOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { api } from '../api/client';
import { Loader } from '../components/Loader';
import { useAuthStore } from '../store/auth';
import type { Loan, Member, MonthlyContribution, Transaction } from '../types';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function Profile() {
  const authMember = useAuthStore((s) => s.member)!;
  const isAdmin = authMember.role === 'ADMIN';

  const [memberList, setMemberList] = useState<Member[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(isAdmin ? undefined : authMember.id);
  const [target, setTarget] = useState<Member | null>(null);
  const [contributions, setContributions] = useState<MonthlyContribution[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/members').then(({ data }) => {
      setMemberList(data);
      if (data.length > 0) setSelectedId((prev) => prev ?? data[0].id);
    });
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoading(true);
    setAvatarError(false);

    api
      .get(`/members/${selectedId}`)
      .then(async ({ data: full }) => {
        if (cancelled) return;
        setTarget(full);

        const tasks: Promise<any>[] = [
          api.get('/transactions', { params: { memberId: selectedId } }).then(({ data }) => setTransactions(data)),
        ];

        if (full.isSavingMember) {
          tasks.push(
            api
              .get(`/members/${selectedId}/contributions`, { params: { year: dayjs().year() } })
              .then(({ data }) => setContributions(data))
          );
        } else {
          setContributions([]);
        }

        if (full.isLoanMember) {
          tasks.push(api.get('/loans', { params: { memberId: selectedId } }).then(({ data }) => setLoans(data)));
        } else {
          setLoans([]);
        }

        await Promise.all(tasks);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  if (loading || !target) return <Loader />;

  const lifetimeSavings = transactions
    .filter((t) => t.category === 'SAVING_DEPOSIT')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const loanBalance = loans.reduce((sum, l) => sum + Number(l.balance), 0);
  const displayBalance = target.isSavingMember ? lifetimeSavings : target.isLoanMember ? loanBalance : 0;
  const balanceLabel = target.isLoanMember ? 'Outstanding Loan Balance' : 'Balance';

  return (
    <>
      {isAdmin && (
        <Select
          showSearch
          optionFilterProp="label"
          style={{ width: 280, marginBottom: 16 }}
          value={selectedId}
          onChange={setSelectedId}
          options={memberList.map((m) => ({ label: `${m.name} (${m.memberCode})`, value: m.id }))}
        />
      )}

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col>
            <Avatar
              size={80}
              icon={<UserOutlined />}
              src={!avatarError ? `/avatars/${target.memberCode}.jpg` : undefined}
              onError={() => {
                setAvatarError(true);
                return true;
              }}
            />
          </Col>
          <Col flex="auto">
            <Typography.Title level={4} style={{ marginBottom: 4 }}>
              {target.name} ({target.memberCode})
            </Typography.Title>
            <Space direction="vertical" size={2}>
              {target.address && <Typography.Text type="secondary">{target.address}</Typography.Text>}
              <a href={`tel:${target.mobile}`}>
                <PhoneOutlined /> {target.mobile}
              </a>
              <Tag color={target.isSavingMember ? 'blue' : target.isLoanMember ? 'volcano' : 'default'}>
                {target.isSavingMember ? 'Saving Member' : target.isLoanMember ? 'Loan Member' : 'Member'}
              </Tag>
            </Space>
          </Col>
          <Col>
            <Statistic title={balanceLabel} value={displayBalance} prefix="₹" precision={2} />
          </Col>
        </Row>
      </Card>

      {target.isSavingMember && (
        <Card title={`${dayjs().year()} Contribution Schedule`} style={{ marginBottom: 16 }}>
          {contributions.length === 0 ? (
            <Alert
              type="warning"
              showIcon
              message="Monthly savings amount not set"
              description={`No monthly amount has been set for ${target.name} for ${dayjs().year()} yet. Set it from the Members page (Edit member) to generate this year's contribution schedule.`}
            />
          ) : (
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
          )}
        </Card>
      )}

      {target.isLoanMember && (
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

      <Card title="Transactions">
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
