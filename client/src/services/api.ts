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

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

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
    }

    return "An unexpected error occurred.";
  }
}
