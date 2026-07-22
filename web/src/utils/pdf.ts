import dayjs from 'dayjs';
import type { Member, Transaction } from '../types';

const ORG_NAME = 'JEDDAH NEERAD KMCC SECURITY SCEAM';

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

function cell(content: string, opts: { align?: string; bold?: boolean } = {}) {
  return `<td style="border: 1px solid #000; padding: 4px 6px; font-size: 12px; text-align: ${
    opts.align ?? 'center'
  }; ${opts.bold ? 'font-weight: bold;' : ''}">${content}</td>`;
}

export async function downloadMemberStatementPdf(member: Member, transactions: Transaction[]) {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);

  const type = member.isSavingMember ? 'savings' : member.isLoanMember ? 'loan' : 'member';
  const sorted = [...transactions].sort((a, b) => dayjs(a.date).diff(dayjs(b.date)));

  let running = 0;
  const rows = sorted.map((t, i) => {
    const credit = t.flow === 'INCOME' ? Number(t.amount) : 0;
    const debit = t.flow === 'EXPENSE' ? Number(t.amount) : 0;
    running += credit - debit;
    return { id: i + 1, date: t.date, narration: t.description, credit, debit, balance: running };
  });
  const finalBalance = rows.length > 0 ? rows[rows.length - 1].balance : 0;

  const container = document.createElement('div');
  container.style.cssText =
    'position: fixed; left: -9999px; top: 0; width: 800px; background: #fff; padding: 16px; font-family: Arial, sans-serif; color: #000;';

  container.innerHTML = `
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 4px;">
      <tr><td style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold; font-size: 14px;">${ORG_NAME}</td></tr>
      <tr><td style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold; font-size: 13px;">${
        type[0].toUpperCase() + type.slice(1)
      } Transaction List</td></tr>
    </table>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
      <tr>
        ${cell('FullName', { bold: true })}${cell('ID', { bold: true })}${cell('Type', { bold: true })}${cell(
          'Address',
          { bold: true }
        )}${cell('Balance', { bold: true })}
      </tr>
      <tr>
        ${cell(member.name)}${cell(member.memberCode)}${cell(type)}${cell(member.address || '-')}${cell(
          finalBalance.toFixed(2)
        )}
      </tr>
    </table>

    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        ${cell('ID', { bold: true })}${cell('Transaction date', { bold: true })}${cell('Narration', {
          bold: true,
        })}${cell('Credit', { bold: true })}${cell('Debit', { bold: true })}${cell('Balance Amount', {
          bold: true,
        })}
      </tr>
      ${rows
        .map(
          (r) => `<tr>
            ${cell(String(r.id))}${cell(dayjs(r.date).format('DD/MM/YYYY'))}${cell(r.narration, {
              align: 'left',
            })}${cell(r.credit ? r.credit.toFixed(2) : '0', { align: 'right' })}${cell(
              r.debit ? r.debit.toFixed(2) : '0',
              { align: 'right' }
            )}${cell(r.balance.toFixed(2), { align: 'right' })}
          </tr>`
        )
        .join('')}
    </table>

    ${FOOTER_HTML}
  `;

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, { scale: 2 });
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
