export interface ConditionalSecretRule {
  key: string;
  reason: string;
  when: (config: Record<string, any>) => boolean;
}

export interface EnvValidatorOptions {
  serviceName: string;
  requiredDbUrl?: string;
  requiredSecrets?: string[];
  conditionalSecrets?: ConditionalSecretRule[];
}

export declare const MIN_SECRET_LENGTH: number;

export declare function createEnvValidator(
  options: EnvValidatorOptions,
): (config: Record<string, any>) => Record<string, any>;

export declare function requireEnv(name: string): string;
