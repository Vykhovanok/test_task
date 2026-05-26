import type { PublicLink, ResourceNode } from "@/lib/models";
import { apiClient } from "./api";

export class PublicLinksApi {
  static async create(resourceId: string): Promise<PublicLink> {
    const response = await apiClient.post<PublicLink>("/public-links", {
      resourceId,
    });

    return response.data;
  }

  static async resolve(token: string): Promise<ResourceNode> {
    const response = await apiClient.get<ResourceNode>(`/public-links/${token}`);

    return response.data;
  }

  static async getActive(resourceId: string): Promise<PublicLink | null> {
    const response = await apiClient.get<PublicLink | null>(
      `/public-links/resource/${resourceId}`,
    );

    return response.data;
  }

  static async revoke(publicLinkId: string): Promise<PublicLink> {
    const response = await apiClient.delete<PublicLink>(
      `/public-links/${publicLinkId}`,
    );

    return response.data;
  }
}
