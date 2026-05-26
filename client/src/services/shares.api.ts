import type { ShareInvitation } from "@/lib/models";
import { apiClient } from "./api";

export type CreateInvitationPayload = {
  resourceId: string;
  email: string;
  role: "VIEWER" | "EDITOR";
};

export class SharesApi {
  static async listResourceInvitations(
    resourceId: string,
  ): Promise<ShareInvitation[]> {
    const response = await apiClient.get<ShareInvitation[]>(
      `/shares/resource/${resourceId}`,
    );

    return response.data;
  }

  static async createInvitation(
    payload: CreateInvitationPayload,
  ): Promise<ShareInvitation> {
    const response = await apiClient.post<ShareInvitation>(
      "/shares/invitations",
      payload,
    );

    return response.data;
  }

  static async acceptInvitation(invitationId: string): Promise<ShareInvitation> {
    const response = await apiClient.post<ShareInvitation>(
      `/shares/invitations/${invitationId}/accept`,
    );

    return response.data;
  }

  static async revokeInvitation(invitationId: string): Promise<ShareInvitation> {
    const response = await apiClient.delete<ShareInvitation>(
      `/shares/invitations/${invitationId}`,
    );

    return response.data;
  }
}
