import dayjs from 'dayjs';
import type { Member, Transaction } from '../types';

const ORG_NAME = 'JEDDAH NEERAD KMCC SECURITY SCHEME';
const BRAND_COLOR = '#0f3460';
const BRAND_TINT = '#e7edf5';
const BORDER_COLOR = '#d6dde6';
const MUTED_TEXT = '#5b6470';

const FOOTER_HTML = `
  <div style="margin-top: 32px; text-align: center;">
    <div style="display: inline-block; background: #6aa84f; color: #fff; padding: 12px 32px; font-weight: bold; font-size: 18px; line-height: 1.4; border-radius: 4px;">
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
    <p style="margin: 4px 0; color: ${MUTED_TEXT};">${dayjs().format('DD.MM.YYYY')}</p>
  </div>
`;

function cell(
  content: string,
  opts: { align?: string; bold?: boolean; header?: boolean; total?: boolean } = {}
) {
  const bg = opts.header ? BRAND_COLOR : opts.total ? BRAND_TINT : '#fff';
  const color = opts.header ? '#fff' : opts.total ? BRAND_COLOR : '#1a1f27';
  return `<td style="border: 1px solid ${BORDER_COLOR}; padding: 6px 8px; font-size: 11px; text-align: ${
    opts.align ?? 'center'
  }; background: ${bg}; color: ${color}; ${opts.bold || opts.total ? 'font-weight: 700;' : ''}">${content}</td>`;
}

// Images are loaded once and re-embedded as data URLs so html2canvas never has to fetch or
// rasterize a live network/SVG resource during capture — a source of blank images on mobile.
function urlToDataUrl(url: string): Promise<string | null> {
  return fetch(url)
    .then((res) => (res.ok ? res.blob() : Promise.reject(new Error('not ok'))))
    .then(
      (blob) =>
        new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        })
    )
    .catch(() => null);
}

// Drawn directly on canvas (not loaded from an asset) so it can never fail to render.
function defaultAvatarDataUrl(size = 200): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = BRAND_COLOR;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(size / 2, size * 0.38, size * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(size / 2, size * 1.05, size * 0.42, Math.PI, 0);
  ctx.fill();
  return canvas.toDataURL('image/png');
}

function sanitizeFileNamePart(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '');
}

function waitForImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));
  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        })
    )
  ).then(() => undefined);
}

export async function downloadMemberStatementPdf(member: Member, transactions: Transaction[]) {
  const [{ default: jsPDF }, { default: html2canvas }, avatarDataUrl, logoDataUrl] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
    urlToDataUrl(`/avatars/${member.memberCode}.jpg`),
    urlToDataUrl('/KMCC.png'),
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

  const avatarHtml = `<img src="${avatarDataUrl ?? defaultAvatarDataUrl()}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid ${BRAND_TINT}; box-shadow: 0 0 0 1px ${BRAND_COLOR};" />`;

  const iconHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" style="width: 54px; height: 54px; object-fit: contain;" />`
    : '';

  const container = document.createElement('div');
  container.style.cssText =
    'position: fixed; left: -9999px; top: 0; width: 800px; background: #fff; padding: 24px; font-family: Arial, sans-serif; color: #1a1f27;';

  container.innerHTML = `
    <div style="border: 1px solid ${BORDER_COLOR}; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
      <div style="background: ${BRAND_COLOR}; color: #fff; padding: 14px 20px; text-align: center;">
        <div style="font-weight: 700; font-size: 16px; letter-spacing: 0.4px;">${ORG_NAME}</div>
        <div style="font-size: 11px; opacity: 0.85; margin-top: 2px; text-transform: uppercase; letter-spacing: 1px;">${
          type[0].toUpperCase() + type.slice(1)
        } Statement</div>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-top: 1px solid ${BORDER_COLOR};">
        <div style="display: flex; align-items: center; gap: 16px;">
          ${avatarHtml}
          <div>
            <div style="font-size: 17px; font-weight: 700; margin-bottom: 6px;">${member.name}</div>
            <div style="font-size: 11px; color: ${MUTED_TEXT}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Member ID &nbsp;·&nbsp; Mobile</div>
            <div style="font-size: 12px; margin-bottom: 6px;"><strong>${member.memberCode}</strong> &nbsp;·&nbsp; <strong>${member.mobile}</strong></div>
            ${
              member.address
                ? `<div style="font-size: 12px; color: ${MUTED_TEXT};">${member.address}</div>`
                : ''
            }
          </div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 10px;">
          ${iconHtml}
          <div style="text-align: right;">
            <div style="font-size: 10px; color: ${MUTED_TEXT}; text-transform: uppercase; letter-spacing: 0.5px;">${
              type === 'loan' ? 'Outstanding Balance' : 'Balance'
            }</div>
            <div style="font-size: 16px; font-weight: 700; color: ${BRAND_COLOR};">₹${finalBalance.toFixed(2)}</div>
          </div>
        </div>
      </div>
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
          (r, i) => `<tr style="background: ${i % 2 === 1 ? '#f7f9fb' : '#fff'};">
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
        ${cell('Total', { total: true })}${cell('', { total: true })}${cell('', {
          total: true,
        })}${cell(totalCredit.toFixed(2), { align: 'right', total: true })}${cell(totalDebit.toFixed(2), {
          align: 'right',
          total: true,
        })}${cell(finalBalance.toFixed(2), { align: 'right', total: true })}
      </tr>
    </table>

    ${FOOTER_HTML}
  `;

  document.body.appendChild(container);

  try {
    await waitForImages(container);
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

    const fileName = `${sanitizeFileNamePart(member.name)}_${sanitizeFileNamePart(member.memberCode)}.pdf`;
    pdf.save(fileName);
  } finally {
    document.body.removeChild(container);
  }
}
