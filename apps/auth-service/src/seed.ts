import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { User, UserRole } from './entities/user.entity';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const seedUsers = [
  {
    email: 'admin@csm.vn',
    password: 'Admin@123456',
    role: UserRole.ADMIN,
    branch_id: null,
  },
  {
    email: 'manager.q1@csm.vn',
    password: 'Manager@123456',
    role: UserRole.BRANCH_MANAGER,
    branch_id: 'br-01',
  },
  {
    email: 'customer@csm.vn',
    password: 'Customer@123456',
    role: UserRole.CUSTOMER,
    branch_id: null,
  },
];

async function runSeed() {
  const dbUrl = process.env.AUTH_DB_URL;
  if (!dbUrl) {
    console.error('AUTH_DB_URL not found in environment');
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'mysql',
    url: dbUrl,
    entities: [User],
    synchronize: true,
    ssl: { rejectUnauthorized: false },
  });

  await dataSource.initialize();
  console.log('Connected to Auth DB. Seeding users...');

  const userRepo = dataSource.getRepository(User);

  for (const item of seedUsers) {
    const existing = await userRepo.findOne({ where: { email: item.email } });
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(item.password, salt);

    if (existing) {
      existing.password_hash = password_hash;
      existing.role = item.role;
      existing.branch_id = (item.branch_id || null) as any;
      await userRepo.save(existing);
      console.log(`Updated user: ${item.email} (${item.role})`);
    } else {
      const newUser = userRepo.create({
        email: item.email,
        password_hash,
        role: item.role,
        branch_id: (item.branch_id || null) as any,
      });
      await userRepo.save(newUser);
      console.log(`Created user: ${item.email} (${item.role})`);
    }
  }

  await dataSource.destroy();
  console.log('Seeding finished successfully.');
}

runSeed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
