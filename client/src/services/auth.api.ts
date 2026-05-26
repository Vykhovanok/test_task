import type { AuthResponse, AuthUser } from "@/lib/models";
import { apiClient } from "./api";

export class AuthApi {
  static async register(payload: {
    email: string;
    name: string;
    password: string;
  }): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>("/auth/register", payload);

    return response.data;
  }

  static async login(payload: {
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>("/auth/login", payload);

    return response.data;
  }

  static async logout(): Promise<void> {
    await apiClient.post("/auth/logout");
  }

  static async me(): Promise<AuthUser> {
    const response = await apiClient.get<AuthUser>("/auth/me");

    return response.data;
  }
}
