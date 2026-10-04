import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Branch } from './entities/branch.entity';
import { Stock } from './entities/stock.entity';
import { StockTransaction } from './entities/stock-transaction.entity';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
if (!process.env.INVENTORY_DB_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
}
if (!process.env.INVENTORY_DB_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

const seedBranches = [
  {
    id: 'br-01',
    name: 'CSM Bến Nghé - Quận 1',
    address: '123 Lê Lợi, Phường Bến Nghé, Quận 1, TP.HCM',
    phone: '028.3822.0001',
    latitude: 10.7719600,
    longitude: 106.7001400,
  },
  {
    id: 'br-02',
    name: 'CSM Phú Mỹ Hưng - Quận 7',
    address: '456 Nguyễn Lương Bằng, Phường Tân Phú, Quận 7, TP.HCM',
    phone: '028.5413.0002',
    latitude: 10.7295000,
    longitude: 106.7218000,
  },
  {
    id: 'br-03',
    name: 'CSM Hàng Xanh - Bình Thạnh',
    address: '789 Điện Biên Phủ, Phường 25, Quận Bình Thạnh, TP.HCM',
    phone: '028.3512.0003',
    latitude: 10.8016000,
    longitude: 106.7118000,
  },
];

async function runSeed() {
  const dbUrl = process.env.INVENTORY_DB_URL;
  if (!dbUrl) {
    console.error('INVENTORY_DB_URL not found');
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'mysql',
    url: dbUrl,
    entities: [Branch, Stock, StockTransaction],
    synchronize: true,
    ssl: { rejectUnauthorized: false },
  });

  await dataSource.initialize();
  console.log('Connected to Inventory DB. Seeding branches...');

  const branchRepo = dataSource.getRepository(Branch);

  for (const b of seedBranches) {
    let existing = await branchRepo.findOne({ where: { id: b.id } });
    if (!existing) {
      const newB = branchRepo.create(b);
      await branchRepo.save(newB);
      console.log(`Created branch: ${b.id} - ${b.name}`);
    } else {
      existing.name = b.name;
      existing.address = b.address;
      existing.phone = b.phone;
      existing.latitude = b.latitude;
      existing.longitude = b.longitude;
      existing.is_active = true;
      await branchRepo.save(existing);
      console.log(`Updated branch: ${b.id}`);
    }
  }

  await dataSource.destroy();
  console.log('Branch seeding completed successfully.');
}

runSeed().catch((err) => {
  console.error('Error seeding branches:', err);
  process.exit(1);
});
