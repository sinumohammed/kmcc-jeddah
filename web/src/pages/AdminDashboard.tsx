import { Card, Col, List, Modal, Row, Statistic, Typography, theme } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Loader } from '../components/Loader';
import type { BankSummary, DashboardSummary } from '../types';

const TILES: { key: keyof DashboardSummary; label: string; color: string }[] = [
  { key: 'totalSavingsAmount', label: 'Total Savings Amount', color: '#0f3460' },
  { key: 'totalLoanAmount', label: 'Total Loan Amount', color: '#c0392b' },
  { key: 'totalBankBalance', label: 'Total Bank Balance', color: '#16a085' },
  { key: 'totalProfit', label: 'Total Profit', color: '#8e44ad' },
  { key: 'totalInterestAmount', label: 'Total Interest Amount', color: '#2980b9' },
  { key: 'totalExpense', label: 'Total Expense', color: '#d35400' },
  { key: 'totalZakat', label: 'Total Zakat', color: '#27ae60' },
];

const DONUT_COLORS = ['#0f3460', '#16a085', '#8e44ad', '#d35400', '#2980b9', '#27ae60', '#c0392b', '#f39c12'];

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
  const navigate = useNavigate();
  const { token } = theme.useToken();

  useEffect(() => {
    api
      .get('/dashboard/summary')
      .then(({ data }) => setSummary(data))
      .finally(() => setLoading(false));
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
    navigate(`/transactions?bankId=${bankId}`);
  };

  const positiveTotal = bankSummaries.reduce((sum, b) => sum + Math.max(0, Number(b.balance)), 0);
  const donutShares = bankSummaries.map((b, i) => ({
    ...b,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
    value: positiveTotal > 0 ? (Math.max(0, Number(b.balance)) / positiveTotal) * 100 : 0,
  }));

  if (loading) return <Loader />;

  return (
    <>
      <Row gutter={[16, 16]}>
        {TILES.map((tile) => (
          <Col xs={24} sm={12} md={8} lg={6} key={tile.key}>
            <Card
              hoverable={tile.key === 'totalBankBalance'}
              onClick={tile.key === 'totalBankBalance' ? onBankBalanceClick : undefined}
            >
              <Statistic
                title={tile.label}
                value={Number(summary?.[tile.key] ?? 0)}
                precision={2}
                prefix="₹"
                valueStyle={{ color: tile.color }}
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
    </>
  );
}
