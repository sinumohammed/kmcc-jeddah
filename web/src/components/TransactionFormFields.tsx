import { DatePicker, Form, Input, InputNumber, Select } from 'antd';
import type { FormInstance } from 'antd';
import dayjs from 'dayjs';
import type { Bank, Loan, Member, TxnFlow } from '../types';
import {
  CATEGORY_OPTIONS,
  FLOW_OPTIONS,
  LOAN_LINKED_CATEGORIES,
  MEMBER_REQUIRED_CATEGORIES,
} from '../utils/transactionOptions';

interface Props {
  form: FormInstance;
  members: Member[];
  banks: Bank[];
  memberLoans: Loan[];
  bankRequired?: boolean;
  showMember?: boolean;
  // Only meaningful when showMember is false. Excludes LOAN_DISBURSEMENT/LOAN_REPAYMENT from
  // the Category dropdown — needed when *creating* a bank-only entry (no member field to
  // satisfy their member requirement), but must stay false when *editing* an existing
  // transaction: an existing loan-linked row's category wouldn't match any option in a
  // filtered list, leaving the Select showing a blank/unmatched value.
  restrictLoanCategories?: boolean;
}

export function TransactionFormFields({
  form,
  members,
  banks,
  memberLoans,
  bankRequired = true,
  showMember = true,
  restrictLoanCategories = false,
}: Props) {
  const flow = Form.useWatch('flow', form);
  const category = Form.useWatch('category', form);
  const memberRequired = MEMBER_REQUIRED_CATEGORIES.includes(category);

  const categoryOptions = flow
    ? restrictLoanCategories
      ? CATEGORY_OPTIONS[flow as TxnFlow].filter((o) => !LOAN_LINKED_CATEGORIES.includes(o.value))
      : CATEGORY_OPTIONS[flow as TxnFlow]
    : [];

  return (
    <>
      <Form.Item name="flow" label="Flow" rules={[{ required: true }]}>
        <Select options={FLOW_OPTIONS} />
      </Form.Item>
      <Form.Item name="category" label="Category" rules={[{ required: true }]}>
        <Select options={categoryOptions} disabled={!flow} />
      </Form.Item>
      {showMember && (
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
      )}
      {showMember && category === 'LOAN_REPAYMENT' && (
        <Form.Item name="linkedLoanId" label="Loan">
          <Select
            options={memberLoans.map((l) => ({
              label: `₹${l.principalAmount} on ${dayjs(l.disbursedDate).format('DD-MMM-YYYY')} (balance ₹${l.balance})`,
              value: l.id,
            }))}
          />
        </Form.Item>
      )}
      <Form.Item
        name="bankId"
        label={bankRequired ? 'Bank' : 'Bank (optional)'}
        rules={bankRequired ? [{ required: true }] : []}
        extra={
          !bankRequired
            ? "If left blank, this deposit won't be reflected in any bank's balance — add it manually from the Banks page instead."
            : undefined
        }
      >
        <Select allowClear={!bankRequired} options={banks.map((b) => ({ label: b.name, value: b.id }))} />
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
    </>
  );
}
