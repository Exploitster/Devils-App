import type { RuntimeConfig, Environment } from "../config";
import { AppError } from "../errors";
import type { DodoProviderConfig } from "./dodo-provider";
export function dodoConfig(
  config: RuntimeConfig,
  env: Environment = process.env,
): DodoProviderConfig {
  const environment = env.DEVILS_DODO_ENVIRONMENT;
  if (
    !["test_mode", "live_mode"].includes(environment ?? "") ||
    !env.DEVILS_DODO_API_KEY?.trim() ||
    !env.DEVILS_DODO_MONTHLY_PRODUCT_ID?.trim() ||
    !env.DEVILS_DODO_WEBHOOK_SECRET?.trim()
  )
    throw new AppError(
      "DODO_NOT_CONFIGURED",
      "Dodo Payments setup is not complete yet.",
      503,
    );
  if (config.paymentsEnabled && environment !== "live_mode")
    throw new AppError(
      "DODO_TEST_ONLY",
      "Test payments cannot activate paid access.",
      503,
    );
  return {
    apiKey: env.DEVILS_DODO_API_KEY!,
    productId: env.DEVILS_DODO_MONTHLY_PRODUCT_ID!,
    webhookSecret: env.DEVILS_DODO_WEBHOOK_SECRET!,
    environment: environment as DodoProviderConfig["environment"],
    appUrl: config.appUrl,
  };
}
