const { isIn, isNotEmpty, isString, minLength } = require('class-validator');

const VALID_NODE_ENVS = ['development', 'test', 'production'];
const MIN_SECRET_LENGTH = 32;

/**
 * Tạo hàm validate cấu hình môi trường cho ConfigModule.forRoot({ validate }).
 * Chỉ báo TÊN biến bị thiếu hoặc không hợp lệ, tuyệt đối không in giá trị.
 */
function createEnvValidator(options) {
  const {
    serviceName,
    requiredDbUrl,
    requiredSecrets = [],
    conditionalSecrets = [],
  } = options;

  return function validateEnv(config) {
    const errors = [];

    const nodeEnv = config.NODE_ENV;
    if (nodeEnv !== undefined && nodeEnv !== '' && !isIn(nodeEnv, VALID_NODE_ENVS)) {
      errors.push(`NODE_ENV (giá trị hợp lệ: ${VALID_NODE_ENVS.join(', ')})`);
    }

    if (requiredDbUrl) {
      const dbVal = config[requiredDbUrl];
      if (!isString(dbVal) || !isNotEmpty(dbVal.trim()) || !dbVal.startsWith('mysql://')) {
        errors.push(`${requiredDbUrl} (bắt buộc, định dạng mysql://...)`);
      }
    }

    for (const secretKey of requiredSecrets) {
      const val = config[secretKey];
      if (!isString(val) || !isNotEmpty(val.trim())) {
        errors.push(`${secretKey} (bắt buộc, thiếu giá trị)`);
      } else if (val.startsWith('CHANGE_ME_')) {
        errors.push(`${secretKey} (vẫn đang dùng giá trị giữ chỗ CHANGE_ME_*)`);
      } else if (!minLength(val, MIN_SECRET_LENGTH)) {
        errors.push(`${secretKey} (tối thiểu ${MIN_SECRET_LENGTH} ký tự)`);
      }
    }

    for (const rule of conditionalSecrets) {
      if (rule.when(config)) {
        const val = config[rule.key];
        if (!isString(val) || !isNotEmpty(val.trim())) {
          errors.push(`${rule.key} (bắt buộc khi ${rule.reason})`);
        } else if (val.startsWith('CHANGE_ME_')) {
          errors.push(`${rule.key} (vẫn đang dùng giá trị giữ chỗ CHANGE_ME_*)`);
        } else if (!minLength(val, MIN_SECRET_LENGTH)) {
          errors.push(`${rule.key} (tối thiểu ${MIN_SECRET_LENGTH} ký tự)`);
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `[ConfigValidationError] [${serviceName}] Cấu hình môi trường không hợp lệ:\n - ${errors.join('\n - ')}`
      );
    }

    return config;
  };
}

/**
 * Đọc biến môi trường bắt buộc tại runtime; ném lỗi nêu tên biến nếu thiếu.
 */
function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`[ConfigError] Thiếu biến môi trường bắt buộc: ${name}`);
  }
  return value;
}

module.exports = {
  createEnvValidator,
  requireEnv,
  MIN_SECRET_LENGTH,
};
