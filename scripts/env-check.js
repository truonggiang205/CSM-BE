#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SECRET_MIN_32 = new Set([
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'INTERNAL_SECRET',
  'PAYMENT_SIMULATION_SECRET',
]);

const PASSWORD_MIN_12 = new Set([
  'MYSQL_PASSWORD',
  'MYSQL_ROOT_PASSWORD',
  'SEED_PASSWORD',
]);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file' && argv[i + 1]) {
      args.file = argv[++i];
    } else if (argv[i] === '--example' && argv[i + 1]) {
      args.example = argv[++i];
    }
  }
  return args;
}

function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const map = new Map();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    map.set(key, val);
  }
  return map;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const envPath = path.resolve(args.file || path.join(process.cwd(), '.env'));
  const examplePath = path.resolve(args.example || path.join(process.cwd(), '.env.example'));

  if (!fs.existsSync(examplePath)) {
    console.error(`❌ Không tìm thấy file mẫu: ${examplePath}`);
    process.exit(1);
  }
  if (!fs.existsSync(envPath)) {
    console.error(`❌ Không tìm thấy file .env tại: ${envPath}`);
    process.exit(1);
  }

  const exampleMap = parseEnvFile(examplePath);
  const envMap = parseEnvFile(envPath);

  const missing = [];
  const extra = [];
  const weakOrPlaceholder = [];

  for (const key of exampleMap.keys()) {
    if (!envMap.has(key)) {
      missing.push(key);
    }
  }

  for (const key of envMap.keys()) {
    if (!exampleMap.has(key)) {
      extra.push(key);
    }
  }

  for (const [key, val] of envMap.entries()) {
    if (val.includes('CHANGE_ME_')) {
      weakOrPlaceholder.push(`${key} (còn giá trị giữ chỗ CHANGE_ME_*)`);
      continue;
    }
    if (SECRET_MIN_32.has(key) && val.length < 32) {
      weakOrPlaceholder.push(`${key} (quá ngắn, tối thiểu 32 ký tự)`);
    } else if (PASSWORD_MIN_12.has(key) && val.length < 12) {
      weakOrPlaceholder.push(`${key} (quá ngắn, tối thiểu 12 ký tự)`);
    }
  }

  console.log(`🔍 Kiểm tra cấu hình: ${envPath}`);
  console.log(`   So sánh với mẫu: ${examplePath}`);

  if (missing.length > 0) {
    console.log('\n❌ Biến thiếu (có trong .env.example nhưng chưa có trong .env):');
    for (const k of missing) console.log(`   - ${k}`);
  } else {
    console.log('\n✅ Không thiếu biến nào so với .env.example.');
  }

  if (extra.length > 0) {
    console.log('\n⚠️ Biến thừa (có trong .env nhưng không khai báo trong .env.example):');
    for (const k of extra) console.log(`   - ${k}`);
  } else {
    console.log('✅ Không có biến thừa.');
  }

  if (weakOrPlaceholder.length > 0) {
    console.log('\n❌ Biến secret/mật khẩu chưa đạt chuẩn (chỉ nêu tên biến):');
    for (const item of weakOrPlaceholder) console.log(`   - ${item}`);
  } else {
    console.log('✅ Tất cả secret/mật khẩu đều đạt độ dài tối thiểu và không còn placeholder.');
  }

  if (missing.length > 0 || weakOrPlaceholder.length > 0) {
    process.exit(1);
  }
}

main();
