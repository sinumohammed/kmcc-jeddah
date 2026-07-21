import 'dotenv/config';
import { prisma } from './lib/prisma';
import { hashPassword } from './lib/auth';

async function main() {
  const passwordHash = await hashPassword('admin123');

  const admin = await prisma.member.upsert({
    where: { memberCode: 'KMCC0001' },
    update: {},
    create: {
      memberCode: 'KMCC0001',
      name: 'Admin',
      mobile: '9999999999',
      passwordHash,
      role: 'ADMIN',
      isSavingMember: false,
      isLoanMember: false,
    },
  });

  await prisma.bank.upsert({
    where: { id: 'seed-bank-1' },
    update: {},
    create: { id: 'seed-bank-1', name: 'Main Bank Account' },
  });

  console.log('Seeded admin login -> mobile: 9999999999, memberCode: KMCC0001, password: admin123');
  console.log('Admin id:', admin.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
