import { createEnvValidator, requireEnv } from './index';

describe('libs/config env validation', () => {
  const validSecret = 'a'.repeat(32);

  it('passes when required DB URL and secrets are valid', () => {
    const validate = createEnvValidator({
      serviceName: 'test-service',
      requiredDbUrl: 'AUTH_DB_URL',
      requiredSecrets: ['JWT_SECRET', 'INTERNAL_SECRET'],
    });

    const result = validate({
      NODE_ENV: 'development',
      AUTH_DB_URL: 'mysql://root:pass@localhost:3306/csm_auth',
      JWT_SECRET: validSecret,
      INTERNAL_SECRET: validSecret,
    });

    expect(result.NODE_ENV).toBe('development');
  });

  it('throws with variable names (never values) when secret is missing or too short', () => {
    const validate = createEnvValidator({
      serviceName: 'test-service',
      requiredSecrets: ['JWT_SECRET', 'INTERNAL_SECRET'],
    });

    const shortSecret = 'super-short-secret-value';
    expect(() =>
      validate({
        JWT_SECRET: shortSecret,
      }),
    ).toThrow(/JWT_SECRET[\s\S]*INTERNAL_SECRET/);

    try {
      validate({ JWT_SECRET: shortSecret });
    } catch (err: any) {
      expect(err.message).not.toContain(shortSecret);
    }
  });

  it('throws when secret still has CHANGE_ME_ placeholder', () => {
    const validate = createEnvValidator({
      serviceName: 'test-service',
      requiredSecrets: ['JWT_SECRET'],
    });

    expect(() =>
      validate({
        JWT_SECRET: 'CHANGE_ME_JWT_SECRET_MIN_32_CHARS_HEX_OR_RANDOM',
      }),
    ).toThrow(/JWT_SECRET/);
  });

  it('validates conditional secrets only when condition is true', () => {
    const validate = createEnvValidator({
      serviceName: 'payment-service',
      conditionalSecrets: [
        {
          key: 'PAYMENT_SIMULATION_SECRET',
          reason: 'PAYMENT_SIMULATION=true',
          when: (cfg) => cfg.PAYMENT_SIMULATION === 'true',
        },
      ],
    });

    expect(() => validate({ PAYMENT_SIMULATION: 'false' })).not.toThrow();
    expect(() => validate({ PAYMENT_SIMULATION: 'true' })).toThrow(
      /PAYMENT_SIMULATION_SECRET/,
    );
  });

  it('requireEnv throws naming the missing variable', () => {
    delete process.env.NON_EXISTENT_TEST_VAR;
    expect(() => requireEnv('NON_EXISTENT_TEST_VAR')).toThrow(
      /NON_EXISTENT_TEST_VAR/,
    );
  });
});
