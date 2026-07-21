import 'dotenv/config';
import { prisma } from './lib/prisma';
import { hashPassword } from './lib/auth';
import { nextMemberCode } from './lib/memberCode';

const NAMES = [
  'ABDUL RAHAMAN.P',
  'MUHAMMED AIJAZ.P',
  'SAKEENA RAHMAN.AR',
  'LIBA ABDUL RAHMAN',
  'NUFAIL .EP',
  'NOUSHAD EP',
  'ASSAINAR.P',
  'ABDUL GAFOOR.P',
  'MUMTHAZ PALOLI',
  'MUJEEB K',
  'SADIQUE',
  'MOHAMMED .EP',
  'ABDUL KABEER P',
  'BASHEER.P',
  'FAVAS TK',
  'SAHADUDDIN MAKKAH',
  'MUJEEB KILINADAN',
  'FAISAL KAYANIKARA',
  'SHAMEER CM',
  'ABDU SALEEM (THUMBY)',
  'MUJEEB BARBER',
  'SHAREEF.KP',
  'BASHEER KP MKH',
  'M.A. SALEEM. CM',
  'JAMSHEER',
  'BAVUTTY GAFOOR',
  'ARSHAD MOOLAYIL',
  'BAVA PATTALAM',
  'MAJID PT',
  'JAFAR PALAKKAL',
  'KHIDIR',
  'FAISAL KP',
  'MOHAMED ASHKER',
  'YOUSAF. KP',
  'SHARAFU KP',
  'RABEED.TK',
  'BASHEER .MV',
  'ALAVI .MV',
  'ASLAM PALAKKAL',
  'ABUBACKER(KUNCHA)',
  'NIZAR THAYYIL',
  'ABBAS.P',
  'HABEEB.K',
  'ASHRAF.K',
  'SAIFUDHEEN PE',
  'MHD BASHEER .PAMBODAN',
  'SAFEERUDHEEN.P',
  'SULAIMAN .TK',
  'SHANU',
  'RASHID KILINADEN',
  'ASSAINAR P DAMAM',
  'ABDUL SADIQUE KP',
  'ABDULLA KUTTY.KP',
  'SAKEER PAMBODEN',
  'RIYAS KOONIKKUTH',
  'SHARAFUDDEN AK',
  'HASSAN MOULAVI.P T',
  'HASSAN MOULAVI TK',
  'ASHRAF PE',
  'HAMSA KOYA',
  'MUNEER.KP',
  'ASHIQUE.KP',
  'SHOUKATH',
];

async function main() {
  const passwordHash = await hashPassword('123456');
  let created = 0;
  let skipped = 0;

  for (const rawName of NAMES) {
    const name = rawName.replace(/\s+/g, ' ').trim();

    const existing = await prisma.member.findFirst({ where: { name, active: true } });
    if (existing) {
      skipped++;
      continue;
    }

    const memberCode = await nextMemberCode();
    await prisma.member.create({
      data: {
        memberCode,
        name,
        mobile: '123456',
        passwordHash,
        role: 'MEMBER',
        isSavingMember: true,
        isLoanMember: false,
      },
    });
    created++;
  }

  console.log(`Seeded ${created} members (mobile: 123456, password: 123456), skipped ${skipped} already existing.`);
  console.log('Monthly savings amount is not set yet for these members — set it per member from the Members/edit flow before their contribution schedule can be generated.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
