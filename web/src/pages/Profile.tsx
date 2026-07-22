import { Alert, Avatar, Card, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
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
  const currentYear = dayjs().year();
  const monthlyScheme = target.monthlyAmounts?.find((m) => m.year === currentYear)?.amount;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar
            size={56}
            icon={<UserOutlined />}
            src={!avatarError ? `/avatars/${target.memberCode}.jpg` : undefined}
            onError={() => {
              setAvatarError(true);
              return true;
            }}
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <Typography.Text
              strong
              style={{
                display: 'block',
                fontSize: 16,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={target.name}
            >
              {target.name}
            </Typography.Text>
            <Typography.Text type="secondary">{target.memberCode}</Typography.Text>
          </div>
          <Statistic
            title={balanceLabel}
            value={displayBalance}
            prefix="₹"
            precision={2}
            style={{ flexShrink: 0, textAlign: 'right' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
          {target.address && <Typography.Text type="secondary">{target.address}</Typography.Text>}
          <a href={`tel:${target.mobile}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PhoneOutlined /> {target.mobile}
          </a>
          <Space wrap size={4}>
            <Tag color={target.isSavingMember ? 'blue' : target.isLoanMember ? 'volcano' : 'default'}>
              {target.isSavingMember ? 'Saving Member' : target.isLoanMember ? 'Loan Member' : 'Member'}
            </Tag>
            {target.isSavingMember && monthlyScheme && (
              <Tag color="gold">Scheme ₹{Number(monthlyScheme).toFixed(0)}</Tag>
            )}
          </Space>
        </div>
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
                { title: 'Month', dataIndex: 'month', width: 90, render: (m) => MONTH_NAMES[m - 1] },
                {
                  title: 'Paid',
                  dataIndex: 'amountPaid',
                  width: 110,
                  render: (a) => `₹${Number(a).toFixed(2)}`,
                },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  width: 90,
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
                scroll={{ x: 560 }}
                columns={[
                  {
                    title: 'Date',
                    dataIndex: 'date',
                    width: 110,
                    render: (d) => dayjs(d).format('DD-MMM-YYYY'),
                  },
                  { title: 'Category', dataIndex: 'category', width: 140 },
                  {
                    title: 'Amount',
                    dataIndex: 'amount',
                    width: 120,
                    render: (a) => `₹${Number(a).toFixed(2)}`,
                  },
                  { title: 'Description', dataIndex: 'description', width: 190, ellipsis: true },
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
          scroll={{ x: 700 }}
          columns={[
            {
              title: 'Date',
              dataIndex: 'date',
              width: 110,
              render: (d) => dayjs(d).format('DD-MMM-YYYY'),
            },
            {
              title: 'Flow',
              dataIndex: 'flow',
              width: 110,
              render: (f) => (
                <Tag color={f === 'INCOME' ? 'green' : 'red'}>{f === 'INCOME' ? 'Deposit' : 'Withdrawal'}</Tag>
              ),
            },
            { title: 'Category', dataIndex: 'category', width: 130 },
            {
              title: 'Amount',
              dataIndex: 'amount',
              width: 120,
              render: (a) => `₹${Number(a).toFixed(2)}`,
            },
            { title: 'Description', dataIndex: 'description', width: 190, ellipsis: true },
          ]}
        />
      </Card>
    </>
  );
}
