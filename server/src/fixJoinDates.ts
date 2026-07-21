import 'dotenv/config';
import { prisma } from './lib/prisma';

// One-off correction: the initial bulk member seed defaulted joinDate to "now"
// (the seed run date), which made contribution schedules start from that
// month instead of January. This backdates all non-admin members to Jan 1 of
// the current year so their yearly contribution schedule starts correctly.
async function main() {
  const janFirst = new Date(new Date().getFullYear(), 0, 1);
  const result = await prisma.member.updateMany({
    where: { role: 'MEMBER' },
    data: { joinDate: janFirst },
  });
  console.log(`Updated joinDate to ${janFirst.toISOString()} for ${result.count} members.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
