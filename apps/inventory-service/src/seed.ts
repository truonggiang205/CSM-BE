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
    name: 'Chi nhánh Quận 1 (Bến Nghé)',
    address: '123 Lê Lợi, Bến Nghé, Quận 1, TP.HCM',
  },
  {
    id: 'br-02',
    name: 'Chi nhánh Quận 7 (Phú Mỹ Hưng)',
    address: '456 Nguyễn Lương Bằng, Tân Phú, Quận 7, TP.HCM',
  },
  {
    id: 'br-03',
    name: 'Chi nhánh Bình Thạnh (Hàng Xanh)',
    address: '789 Điện Biên Phủ, Phường 25, Bình Thạnh, TP.HCM',
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
