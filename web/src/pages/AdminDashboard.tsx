import { Card, Col, Grid, List, Modal, Row, Statistic, Typography, theme } from 'antd';
import { PieChartOutlined, TeamOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Loader } from '../components/Loader';
import { CATEGORY_LABELS } from '../utils/transactionOptions';
import type { BankSummary, DashboardSummary, FlowBreakdownRow, MembersSummary } from '../types';

const TILES: { key: keyof DashboardSummary; label: string; color: string; category?: string }[] = [
  {
    key: 'totalSavingsAmount',
    label: 'Total Savings Amount',
    color: '#0f3460',
    category: 'SAVING_DEPOSIT,SAVING_WITHDRAWAL',
  },
  {
    key: 'totalLoanAmount',
    label: 'Total Loan Amount',
    color: '#c0392b',
    category: 'LOAN_DISBURSEMENT,LOAN_REPAYMENT',
  },
  { key: 'totalBankBalance', label: 'Total Bank Balance', color: '#16a085' },
  { key: 'totalProfit', label: 'Total Profit', color: '#8e44ad', category: 'PROFIT' },
  { key: 'totalInterestAmount', label: 'Total Interest Amount', color: '#2980b9', category: 'INTEREST' },
  { key: 'totalExpense', label: 'Total Expense', color: '#d35400', category: 'EXPENSE' },
  { key: 'totalZakat', label: 'Total Zakat', color: '#27ae60', category: 'ZAKAT' },
];

// Gross cash in/out across every category (unlike the per-category TILES above) — drills into a
// per-category breakdown via /dashboard/flow-summary rather than the transactions list.
const FLOW_TILES: { key: 'totalIncomeAll' | 'totalExpenseAll'; label: string; color: string; flow: 'INCOME' | 'EXPENSE' }[] = [
  { key: 'totalIncomeAll', label: 'Total Inflow (All)', color: '#1f9d55', flow: 'INCOME' },
  { key: 'totalExpenseAll', label: 'Total Outflow (All)', color: '#b7791f', flow: 'EXPENSE' },
];

const DONUT_COLORS = ['#0f3460', '#16a085', '#8e44ad', '#d35400', '#2980b9', '#27ae60', '#c0392b', '#f39c12'];

function DrillBadge({ color }: { color: string }) {
  return (
    <PieChartOutlined
      style={{ position: 'absolute', top: 10, right: 12, fontSize: 14, color, opacity: 0.6 }}
    />
  );
}

function buildDonutGradient(shares: { value: number; color: string }[]) {
  let cursor = 0;
  const stops: string[] = [];
  for (const s of shares) {
    const start = cursor;
    const end = cursor + s.value;
    stops.push(`${s.color} ${start}% ${end}%`);
    cursor = end;
  }
  if (cursor < 100) stops.push(`#e5e7eb ${cursor}% 100%`);
  return `conic-gradient(${stops.join(', ')})`;
}

export function AdminDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankSummaries, setBankSummaries] = useState<BankSummary[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [membersSummary, setMembersSummary] = useState<MembersSummary | null>(null);
  const [flowModalOpen, setFlowModalOpen] = useState(false);
  const [flowModalLoading, setFlowModalLoading] = useState(false);
  const [flowModalTile, setFlowModalTile] = useState<(typeof FLOW_TILES)[number] | null>(null);
  const [flowBreakdown, setFlowBreakdown] = useState<FlowBreakdownRow[]>([]);
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.sm;

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/summary').then(({ data }) => setSummary(data)),
      api.get('/dashboard/members-summary').then(({ data }) => setMembersSummary(data)),
    ]).finally(() => setLoading(false));
  }, []);

  const onBankBalanceClick = () => {
    setBankModalOpen(true);
    setBankLoading(true);
    api
      .get('/dashboard/banks-summary')
      .then(({ data }) => setBankSummaries(data))
      .finally(() => setBankLoading(false));
  };

  const goToBank = (bankId: string) => {
    setBankModalOpen(false);
    navigate(`/banks?bankId=${bankId}`);
  };

  const onMembersClick = () => {
    setMembersModalOpen(true);
  };

  const goToMembers = (type: 'saving' | 'loan') => {
    setMembersModalOpen(false);
    navigate(`/members?type=${type}`);
  };

  const onFlowTileClick = (tile: (typeof FLOW_TILES)[number]) => {
    setFlowModalTile(tile);
    setFlowModalOpen(true);
    setFlowModalLoading(true);
    api
      .get('/dashboard/flow-summary', { params: { flow: tile.flow } })
      .then(({ data }) => setFlowBreakdown(data.breakdown))
      .finally(() => setFlowModalLoading(false));
  };

  const goToFlowCategory = (category: string) => {
    if (!flowModalTile) return;
    setFlowModalOpen(false);
    navigate(`/transactions?flow=${flowModalTile.flow}&category=${category}`);
  };

  const positiveTotal = bankSummaries.reduce((sum, b) => sum + Math.max(0, Number(b.balance)), 0);
  const donutShares = bankSummaries.map((b, i) => ({
    ...b,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
    value: positiveTotal > 0 ? (Math.max(0, Number(b.balance)) / positiveTotal) * 100 : 0,
  }));

  const flowBreakdownTotal = flowBreakdown.reduce((sum, r) => sum + Number(r.amount), 0);
  const flowDonutShares = flowBreakdown.map((r, i) => ({
    ...r,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
    value: flowBreakdownTotal > 0 ? (Number(r.amount) / flowBreakdownTotal) * 100 : 0,
  }));

  const memberCountsBase = (membersSummary?.savingMembers ?? 0) + (membersSummary?.loanMembers ?? 0);
  const memberDonutShares = [
    { type: 'saving' as const, label: 'Saving Members', count: membersSummary?.savingMembers ?? 0, color: '#0f3460' },
    { type: 'loan' as const, label: 'Loan Members', count: membersSummary?.loanMembers ?? 0, color: '#c0392b' },
  ].map((s) => ({ ...s, value: memberCountsBase > 0 ? (s.count / memberCountsBase) * 100 : 0 }));

  if (loading) return <Loader />;

  return (
    <>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={12} md={8} lg={6}>
          <Card
            size={isMobile ? 'small' : 'default'}
            hoverable
            onClick={onMembersClick}
            style={{ position: 'relative', borderTop: '3px solid #0f3460' }}
          >
            <DrillBadge color="#0f3460" />
            <Statistic
              title={isMobile ? <span style={{ fontSize: 12 }}>Total Members</span> : 'Total Members'}
              value={membersSummary?.totalMembers ?? 0}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#0f3460', fontSize: isMobile ? 18 : undefined }}
            />
          </Card>
        </Col>
        {TILES.map((tile) => {
          const isBank = tile.key === 'totalBankBalance';
          const isSavings = tile.key === 'totalSavingsAmount';
          const drillable = isBank || Boolean(tile.category);
          const onClick = isBank
            ? onBankBalanceClick
            : tile.category
              ? () =>
                  navigate(
                    `/transactions?category=${tile.category}${isSavings ? '&bankId=none' : ''}`
                  )
              : undefined;
          return (
            <Col xs={12} sm={12} md={8} lg={6} key={tile.key}>
              <Card
                size={isMobile ? 'small' : 'default'}
                hoverable={drillable}
                onClick={onClick}
                style={drillable ? { position: 'relative', borderTop: `3px solid ${tile.color}` } : undefined}
              >
                {drillable && <DrillBadge color={tile.color} />}
                <Statistic
                  title={isMobile ? <span style={{ fontSize: 12 }}>{tile.label}</span> : tile.label}
                  value={Number(summary?.[tile.key] ?? 0)}
                  precision={2}
                  prefix="₹"
                  valueStyle={{ color: tile.color, fontSize: isMobile ? 18 : undefined }}
                />
              </Card>
            </Col>
          );
        })}
        {FLOW_TILES.map((tile) => (
          <Col xs={12} sm={12} md={8} lg={6} key={tile.key}>
            <Card
              size={isMobile ? 'small' : 'default'}
              hoverable
              onClick={() => onFlowTileClick(tile)}
              style={{ position: 'relative', borderTop: `3px solid ${tile.color}` }}
            >
              <DrillBadge color={tile.color} />
              <Statistic
                title={isMobile ? <span style={{ fontSize: 12 }}>{tile.label}</span> : tile.label}
                value={Number(summary?.[tile.key] ?? 0)}
                precision={2}
                prefix="₹"
                valueStyle={{ color: tile.color, fontSize: isMobile ? 18 : undefined }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Modal
        title="Bank Balance Breakdown"
        open={bankModalOpen}
        onCancel={() => setBankModalOpen(false)}
        footer={null}
      >
        {bankLoading ? (
          <Loader minHeight={200} />
        ) : (
          <>
            <div
              style={{
                width: 200,
                height: 200,
                borderRadius: '50%',
                margin: '16px auto',
                background: buildDonutGradient(donutShares),
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 30,
                  borderRadius: '50%',
                  background: token.colorBgContainer,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                }}
              >
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Total
                </Typography.Text>
                <Typography.Text strong>
                  ₹{Number(summary?.totalBankBalance ?? 0).toFixed(2)}
                </Typography.Text>
              </div>
            </div>
            <List
              dataSource={donutShares}
              renderItem={(bank) => (
                <List.Item
                  onClick={() => goToBank(bank.bankId)}
                  style={{ cursor: 'pointer' }}
                >
                  <List.Item.Meta
                    avatar={
                      <span
                        style={{
                          display: 'inline-block',
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          background: bank.color,
                          marginTop: 4,
                        }}
                      />
                    }
                    title={bank.name}
                  />
                  <Typography.Text strong>₹{Number(bank.balance).toFixed(2)}</Typography.Text>
                </List.Item>
              )}
            />
          </>
        )}
      </Modal>

      <Modal
        title="Member Breakdown"
        open={membersModalOpen}
        onCancel={() => setMembersModalOpen(false)}
        footer={null}
      >
        <div
          style={{
            width: 200,
            height: 200,
            borderRadius: '50%',
            margin: '16px auto',
            background: buildDonutGradient(memberDonutShares),
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 30,
              borderRadius: '50%',
              background: token.colorBgContainer,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
            }}
          >
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Total
            </Typography.Text>
            <Typography.Text strong>{membersSummary?.totalMembers ?? 0}</Typography.Text>
          </div>
        </div>
        <List
          dataSource={memberDonutShares}
          renderItem={(item) => (
            <List.Item onClick={() => goToMembers(item.type)} style={{ cursor: 'pointer' }}>
              <List.Item.Meta
                avatar={
                  <span
                    style={{
                      display: 'inline-block',
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: item.color,
                      marginTop: 4,
                    }}
                  />
                }
                title={item.label}
              />
              <Typography.Text strong>{item.count}</Typography.Text>
            </List.Item>
          )}
        />
      </Modal>

      <Modal
        title={flowModalTile ? `${flowModalTile.label} Breakdown` : 'Breakdown'}
        open={flowModalOpen}
        onCancel={() => setFlowModalOpen(false)}
        footer={null}
      >
        {flowModalLoading ? (
          <Loader minHeight={200} />
        ) : (
          <>
            <div
              style={{
                width: 200,
                height: 200,
                borderRadius: '50%',
                margin: '16px auto',
                background: buildDonutGradient(flowDonutShares),
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 30,
                  borderRadius: '50%',
                  background: token.colorBgContainer,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                }}
              >
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Total
                </Typography.Text>
                <Typography.Text strong>₹{flowBreakdownTotal.toFixed(2)}</Typography.Text>
              </div>
            </div>
            <List
              dataSource={flowDonutShares}
              renderItem={(row) => (
                <List.Item onClick={() => goToFlowCategory(row.category)} style={{ cursor: 'pointer' }}>
                  <List.Item.Meta
                    avatar={
                      <span
                        style={{
                          display: 'inline-block',
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          background: row.color,
                          marginTop: 4,
                        }}
                      />
                    }
                    title={CATEGORY_LABELS[row.category] ?? row.category}
                  />
                  <Typography.Text strong>₹{Number(row.amount).toFixed(2)}</Typography.Text>
                </List.Item>
              )}
            />
          </>
        )}
      </Modal>
    </>
  );
}
