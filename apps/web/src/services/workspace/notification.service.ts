import type { INotification, INotificationFilters, INotificationPage, IUnreadNotificationsCount } from "@/types";

import { appendOffsetPageParams } from "@/lib/pagination/offset-query";
import { APIService } from "../api.service";

class NotificationService extends APIService {
  getNotifications(workspaceSlug: string, filters: INotificationFilters = {}) {
    const qs = new URLSearchParams();
    appendOffsetPageParams(qs, filters);
    if (filters.category && filters.category !== "all") qs.set("category", filters.category);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.get<INotificationPage>(`/workspaces/${workspaceSlug}/notifications/${suffix}`);
  }

  getUnreadCount(workspaceSlug: string) {
    return this.get<IUnreadNotificationsCount>(
      `/workspaces/${workspaceSlug}/notifications/unread/`,
    );
  }

  markRead(workspaceSlug: string, notificationId: string, read: boolean) {
    return this.patch<INotification>(
      `/workspaces/${workspaceSlug}/notifications/${notificationId}/`,
      { read },
    );
  }

  markAllRead(workspaceSlug: string) {
    return this.post<{ success: boolean }>(
      `/workspaces/${workspaceSlug}/notifications/mark-all-read/`,
      {},
    );
  }
}

export const notificationService = new NotificationService();
