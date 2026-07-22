import dayjs from 'dayjs';
import type { Member, Transaction } from '../types';

const ORG_NAME = 'JEDDAH NEERAD KMCC SECURITY SCHEME';
const BRAND_COLOR = '#0f3460';

const FOOTER_HTML = `
  <div style="margin-top: 32px; text-align: center;">
    <div style="display: inline-block; background: #6aa84f; color: #fff; padding: 12px 32px; font-weight: bold; font-size: 18px; line-height: 1.4;">
      ജിദ്ദ നീറാട് കെ.എം.സി.സി<br />കുടുംബ സുരക്ഷാ പദ്ധതി
    </div>
    <p style="margin: 16px 0 4px; font-weight: bold;">അസ്സലാമു അലൈകും</p>
    <p style="margin: 4px 0; font-size: 13px;">
      പ്രവാസ ലോകത്ത് ഒന്നെ പതിറ്റാണ്ടിന്റെ പാരമ്പര്യവുമായി ജിദ്ദ നീറാട് കെഎംസിസി സുരക്ഷ പദ്ധതി മുന്നേറി കൊണ്ടിരിക്കുകയാണ്
    </p>
    <p style="margin: 4px 0; font-size: 13px;">
      നാടിന്റെ നന്മയിലും കൂട്ടായ്മയിലും തോളോട് തോൾ ചേർന്ന് നിൽക്കുന്ന ഈ കൂട്ടായ്മയിലെ
    </p>
    <p style="margin: 4px 0 20px; font-size: 13px;">
      എല്ലാവർക്കും നന്ദി അറിയിക്കുന്നതോടൊപ്പം തുടർന്നും എല്ലാവരുടെയും സഹകരണം പ്രതീക്ഷിക്കുന്നു
    </p>
    <p style="margin: 4px 0; font-weight: bold;">ജിദ്ദ നീറാട് കെഎംസിസി കമ്മിറ്റി</p>
    <p style="margin: 4px 0;">${dayjs().format('DD.MM.YYYY')}</p>
  </div>
`;

function cell(content: string, opts: { align?: string; bold?: boolean; header?: boolean } = {}) {
  const bg = opts.header ? BRAND_COLOR : '#fff';
  const color = opts.header ? '#fff' : '#000';
  return `<td style="border: 1px solid #000; padding: 5px 6px; font-size: 11px; text-align: ${
    opts.align ?? 'center'
  }; background: ${bg}; color: ${color}; ${opts.bold ? 'font-weight: bold;' : ''}">${content}</td>`;
}

async function resolveAvatarUrl(memberCode: string): Promise<string | null> {
  const url = `/avatars/${memberCode}.jpg`;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok ? url : null;
  } catch {
    return null;
  }
}

async function resolveLogoUrl(): Promise<string | null> {
  const url = '/KMCC.svg';
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok ? url : null;
  } catch {
    return null;
  }
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export async function downloadMemberStatementPdf(member: Member, transactions: Transaction[]) {
  const [{ default: jsPDF }, { default: html2canvas }, avatarUrl, logoUrl] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
    resolveAvatarUrl(member.memberCode),
    resolveLogoUrl(),
  ]);

  const type = member.isSavingMember ? 'savings' : member.isLoanMember ? 'loan' : 'member';
  const sorted = [...transactions].sort((a, b) => dayjs(a.date).diff(dayjs(b.date)));

  let running = 0;
  let totalCredit = 0;
  let totalDebit = 0;
  const rows = sorted.map((t, i) => {
    const credit = t.flow === 'INCOME' ? Number(t.amount) : 0;
    const debit = t.flow === 'EXPENSE' ? Number(t.amount) : 0;
    running += credit - debit;
    totalCredit += credit;
    totalDebit += debit;
    return { id: i + 1, date: t.date, narration: t.description, credit, debit, balance: running };
  });
  const finalBalance = rows.length > 0 ? rows[rows.length - 1].balance : 0;

  const avatarHtml = avatarUrl
    ? `<img src="${avatarUrl}" style="width: 84px; height: 84px; border-radius: 50%; object-fit: cover; border: 2px solid ${BRAND_COLOR};" />`
    : `<div style="width: 84px; height: 84px; border-radius: 50%; background: ${BRAND_COLOR}; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: bold;">${initials(
        member.name
      )}</div>`;

  const iconHtml = logoUrl
    ? `<img src="${logoUrl}" style="width: 56px; height: 56px; object-fit: contain;" />`
    : '';

  const container = document.createElement('div');
  container.style.cssText =
    'position: fixed; left: -9999px; top: 0; width: 800px; background: #fff; padding: 20px; font-family: Arial, sans-serif; color: #000;';

  container.innerHTML = `
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
      <tr><td style="border: 1px solid #000; padding: 8px; text-align: center; font-weight: bold; font-size: 15px; background: ${BRAND_COLOR}; color: #fff;">${ORG_NAME}</td></tr>
      <tr><td style="border: 1px solid #000; border-top: none; padding: 6px; text-align: center; font-weight: bold; font-size: 13px;">${
        type[0].toUpperCase() + type.slice(1)
      } Transaction List</td></tr>
    </table>

    <div style="display: flex; align-items: center; justify-content: space-between; border: 1px solid #000; border-radius: 6px; padding: 14px 18px; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; gap: 16px;">
        ${avatarHtml}
        <div>
          <div style="font-size: 17px; font-weight: bold; margin-bottom: 4px;">${member.name}</div>
          <div style="font-size: 12px; margin-bottom: 2px;">ID: <strong>${member.memberCode}</strong> &nbsp;&nbsp; Mobile: <strong>${member.mobile}</strong></div>
          ${member.address ? `<div style="font-size: 12px; margin-bottom: 2px; color: #444;">${member.address}</div>` : ''}
          <div style="font-size: 12px; margin-top: 4px;">Type: <strong>${type}</strong> &nbsp;&nbsp; Balance: <strong>₹${finalBalance.toFixed(
            2
          )}</strong></div>
        </div>
      </div>
      ${iconHtml}
    </div>

    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        ${cell('ID', { bold: true, header: true })}${cell('Transaction Date', {
          bold: true,
          header: true,
        })}${cell('Narration', { bold: true, header: true })}${cell('Credit', {
          bold: true,
          header: true,
        })}${cell('Debit', { bold: true, header: true })}${cell('Balance', { bold: true, header: true })}
      </tr>
      ${rows
        .map(
          (r, i) => `<tr style="background: ${i % 2 === 1 ? '#f4f6f8' : '#fff'};">
            ${cell(String(r.id))}${cell(dayjs(r.date).format('DD/MM/YYYY'))}${cell(r.narration, {
              align: 'left',
            })}${cell(r.credit ? r.credit.toFixed(2) : '-', { align: 'right' })}${cell(
              r.debit ? r.debit.toFixed(2) : '-',
              { align: 'right' }
            )}${cell(r.balance.toFixed(2), { align: 'right', bold: true })}
          </tr>`
        )
        .join('')}
      <tr>
        ${cell('Total', { bold: true, header: true })}${cell('', { header: true })}${cell('', {
          header: true,
        })}${cell(totalCredit.toFixed(2), { align: 'right', bold: true, header: true })}${cell(
          totalDebit.toFixed(2),
          { align: 'right', bold: true, header: true }
        )}${cell(finalBalance.toFixed(2), { align: 'right', bold: true, header: true })}
      </tr>
    </table>

    ${FOOTER_HTML}
  `;

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, { scale: 2, useCORS: true });
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/png');

    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`${member.memberCode}-statement.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
