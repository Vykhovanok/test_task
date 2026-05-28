import axios from "axios";
import { API_BASE_URL } from "@/lib/constants";

export class TokenStorage {
  static key = "file-storage-access-token";

  static get(): string | null {
    if (typeof window === "undefined") {
      return null;
    }

    return window.localStorage.getItem(this.key);
  }

  static set(token: string): void {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(this.key, token);
  }

  static clear(): void {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(this.key);
  }
}

const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 8_000;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!axios.isAxiosError(error) || !error.config) {
      return Promise.reject(error);
    }

    const config = error.config as typeof error.config & {
      __retryCount?: number;
    };
    const retryCount = config.__retryCount ?? 0;
    const status = error.response?.status;
    const shouldRetry =
      retryCount < MAX_RETRIES &&
      (status === undefined || RETRYABLE_STATUS_CODES.has(status));

    if (!shouldRetry) {
      return Promise.reject(error);
    }

    config.__retryCount = retryCount + 1;
    await new Promise((resolve) => window.setTimeout(resolve, RETRY_DELAY_MS));

    return apiClient(config);
  },
);

apiClient.interceptors.request.use((config) => {
  const token = TokenStorage.get();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export class ApiErrorFormatter {
  static toMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const data = error.response?.data as { message?: string | string[] } | undefined;
      const message = data?.message;

      if (Array.isArray(message)) {
        return message.join(", ");
      }

      if (message) {
        return message;
      }

      if (error.response?.status === 502) {
        return "API is waking up on Render (free tier). Wait about a minute and try again.";
      }
    }

    if (axios.isAxiosError(error) && !error.response) {
      return "Cannot reach API. Open the API URL in a tab first, then retry.";
    }

    return "An unexpected error occurred.";
  }
}
