import { prisma } from './prisma';

const PREFIX = 'KMCC';

export async function nextMemberCode(): Promise<string> {
  const last = await prisma.member.findFirst({
    where: { memberCode: { startsWith: PREFIX } },
    orderBy: { memberCode: 'desc' },
  });

  const lastSeq = last ? parseInt(last.memberCode.replace(PREFIX, ''), 10) : 0;
  const nextSeq = lastSeq + 1;
  return `${PREFIX}${String(nextSeq).padStart(4, '0')}`;
}
