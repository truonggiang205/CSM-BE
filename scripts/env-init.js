#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir' && argv[i + 1]) {
      args.dir = argv[++i];
    } else if (argv[i] === '--example' && argv[i + 1]) {
      args.example = argv[++i];
    }
  }
  return args;
}

function randomHex64() {
  return crypto.randomBytes(32).toString('hex');
}

function randomPassword(prefix = 'Csm!') {
  return `${prefix}${crypto.randomBytes(12).toString('hex')}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetDir = path.resolve(args.dir || process.env.ENV_TARGET_DIR || process.cwd());
  const examplePath = path.resolve(args.example || path.join(process.cwd(), '.env.example'));
  const envPath = path.join(targetDir, '.env');

  if (!fs.existsSync(examplePath)) {
    console.error(`❌ Không tìm thấy file mẫu: ${examplePath}`);
    process.exit(1);
  }

  if (fs.existsSync(envPath)) {
    console.log(`ℹ️ File .env đã tồn tại tại ${envPath}. Không ghi đè.`);
    process.exit(0);
  }

  fs.mkdirSync(targetDir, { recursive: true });

  const mysqlPass = randomHex64().slice(0, 32);
  const mysqlRootPass = mysqlPass;
  const jwtSecret = randomHex64();
  const jwtRefreshSecret = randomHex64();
  const internalSecret = randomHex64();
  const paymentSimSecret = randomHex64();
  const seedPassword = randomPassword('CsmDemo@');

  const generatedKeys = [];
  const raw = fs.readFileSync(examplePath, 'utf8');

  const lines = raw.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return line;
    }

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) return line;

    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();

    if (key === 'MYSQL_PASSWORD') {
      generatedKeys.push(key);
      return `${key}="${mysqlPass}"`;
    }
    if (key === 'MYSQL_ROOT_PASSWORD') {
      generatedKeys.push(key);
      return `${key}="${mysqlRootPass}"`;
    }
    if (key === 'JWT_SECRET') {
      generatedKeys.push(key);
      return `${key}="${jwtSecret}"`;
    }
    if (key === 'JWT_REFRESH_SECRET') {
      generatedKeys.push(key);
      return `${key}="${jwtRefreshSecret}"`;
    }
    if (key === 'INTERNAL_SECRET') {
      generatedKeys.push(key);
      return `${key}="${internalSecret}"`;
    }
    if (key === 'PAYMENT_SIMULATION_SECRET') {
      generatedKeys.push(key);
      return `${key}="${paymentSimSecret}"`;
    }
    if (key === 'SEED_PASSWORD') {
      generatedKeys.push(key);
      return `${key}="${seedPassword}"`;
    }
    if (key.endsWith('_DB_URL') && val.includes('CHANGE_ME_MYSQL_PASSWORD_MIN_16_CHARS')) {
      generatedKeys.push(key);
      return `${key}=${val.replace('CHANGE_ME_MYSQL_PASSWORD_MIN_16_CHARS', mysqlPass)}`;
    }

    return line;
  });

  fs.writeFileSync(envPath, lines.join('\n'), { encoding: 'utf8', mode: 0o600 });

  console.log(`✅ Đã khởi tạo .env từ .env.example tại: ${envPath}`);
  console.log('🔐 Danh sách biến đã tự sinh giá trị ngẫu nhiên (không in giá trị):');
  for (const k of generatedKeys) {
    console.log(`   - ${k}`);
  }
}

main();
