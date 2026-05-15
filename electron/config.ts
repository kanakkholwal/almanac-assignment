import "dotenv/config";

import { app } from "electron";
import { z } from "zod";

import type { AppRuntimeInfo, LiteLLMConfig } from "../shared/ipc";

import { logger } from "./logger";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  VITE_LITELLM_BASE_URL: z.string().url().default("https://litellm.memfold.ai"),
  LITELLM_API_KEY: z.string().optional().default(""),
  VITE_DEFAULT_CHAT_MODEL: z.string().min(1).default("claude-sonnet-4-6"),
  VITE_DEFAULT_TRANSCRIBE_MODEL: z.string().min(1).default("whisper-1"),
  VITE_DEFAULT_TTS_MODEL: z.string().min(1).default("tts-1"),
  VITE_DEFAULT_TTS_VOICE: z.string().min(1).default("alloy"),
  VITE_ENABLE_AUTO_UPDATE: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});

export type ParsedEnv = z.infer<typeof envSchema>;

let parsed: ParsedEnv | null = null;

export function getEnv(): ParsedEnv {
  if (parsed) return parsed;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    logger.error("Environment validation failed", result.error.flatten());
    throw new Error(
      `Environment validation failed: ${result.error.issues
        .map((issue) => `${issue.path.join(".")} — ${issue.message}`)
        .join("; ")}`,
    );
  }

  parsed = result.data;
  return parsed;
}

export function getBaseUrl(): string {
  return getEnv().VITE_LITELLM_BASE_URL.replace(/\/$/, "");
}

export function getApiKey(): string {
  return getEnv().LITELLM_API_KEY.trim();
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0;
}

export function getDefaults() {
  const env = getEnv();
  return {
    chat: env.VITE_DEFAULT_CHAT_MODEL,
    transcribe: env.VITE_DEFAULT_TRANSCRIBE_MODEL,
    speech: env.VITE_DEFAULT_TTS_MODEL,
    voice: env.VITE_DEFAULT_TTS_VOICE,
  };
}

export function isAutoUpdateEnabled(): boolean {
  return getEnv().VITE_ENABLE_AUTO_UPDATE;
}

export function getLiteLLMConfig(): LiteLLMConfig {
  const env = getEnv();
  return {
    baseUrl: getBaseUrl(),
    apiKeyPresent: hasApiKey(),
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
