import "dotenv/config";

import { app } from "electron";
import { z } from "zod";

import type { AppRuntimeInfo, LiteLLMConfig } from "../shared/ipc.ts";

import { logger } from "./logger";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  VITE_LITELLM_BASE_URL: z.string().url().default("https://litellm.memfold.ai"),
  LITELLM_API_KEY: z.string().min(1, "LITELLM_API_KEY is required"),
  VITE_DEFAULT_CHAT_MODEL: z.string().min(1).default("gpt-4o-mini"),
  VITE_DEFAULT_TRANSCRIBE_MODEL: z.string().min(1).default("gpt-4o-mini-transcribe"),
  VITE_DEFAULT_TTS_MODEL: z.string().min(1).default("gpt-4o-mini-tts"),
  VITE_ENABLE_AUTO_UPDATE: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});

type ParsedEnv = z.infer<typeof envSchema>;

let parsedEnv: ParsedEnv | null = null;

export function getEnv() {
  if (parsedEnv) {
    return parsedEnv;
  }

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    logger.error("Environment validation failed", result.error.flatten());
    throw new Error(
      `Environment validation failed: ${result.error.issues.map((issue) => issue.message).join(", ")}`,
    );
  }

  parsedEnv = result.data;
  return parsedEnv;
}

export function getLiteLLMConfig(): LiteLLMConfig {
  const env = getEnv();

  return {
    baseUrl: env.VITE_LITELLM_BASE_URL,
    apiKeyPresent: Boolean(env.LITELLM_API_KEY),
    defaultChatModel: env.VITE_DEFAULT_CHAT_MODEL,
    defaultTranscribeModel: env.VITE_DEFAULT_TRANSCRIBE_MODEL,
    defaultSpeechModel: env.VITE_DEFAULT_TTS_MODEL,
    environment: env.NODE_ENV,
    appVersion: app.getVersion(),
  };
}

export function getRuntimeInfo(): AppRuntimeInfo {
  const env = getEnv();

  return {
    platform: process.platform as AppRuntimeInfo["platform"],
    appVersion: app.getVersion(),
    environment: env.NODE_ENV,
    config: getLiteLLMConfig(),
  };
}

export function getLiteLLMKey() {
  return getEnv().LITELLM_API_KEY;
}

export function isAutoUpdateEnabled() {
  return getEnv().VITE_ENABLE_AUTO_UPDATE;
}
