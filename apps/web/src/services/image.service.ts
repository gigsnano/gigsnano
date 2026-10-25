import { APIService } from "./api.service";

interface UploadAssetResponse {
  id: string;
  url: string;
  file_name?: string | null;
}

export interface UploadedFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
}

/** File → base64 (without the `data:<mime>;base64,` prefix the backend rejects). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

class ImageService extends APIService {
  /**
   * Upload an inline editor image and return an absolute, `<img>`-loadable URL.
   * The URL is built from the API base (not the page origin) so the stored HTML
   * renders wherever it's viewed; the served endpoint is an unauthenticated
   * capability URL (unguessable id).
   */
  async uploadImage(workspaceSlug: string, file: File, projectId?: string): Promise<string> {
    const data = await fileToBase64(file);
    const res = await this.post<UploadAssetResponse>(`/workspaces/${workspaceSlug}/images/`, {
      mime_type: file.type,
      data,
      file_name: file.name || null,
      project_id: projectId ?? null,
    });
    return `${this.baseURL}/workspaces/${workspaceSlug}/images/${res.id}/`;
  }

  /** Absolute, capability-URL download link for an uploaded file (unguessable id). */
  fileUrl(workspaceSlug: string, fileId: string): string {
    return `${this.baseURL}/workspaces/${workspaceSlug}/files/${fileId}/`;
  }

  /**
   * Upload any file (the comment "attach" button). Returns the file's identity
   * (`fileId`) plus display metadata for the `attachment` editor node — the
   * download URL is derived from the id at render (GIN-372), so it is not stored.
   */
  async uploadFile(workspaceSlug: string, file: File, projectId?: string): Promise<UploadedFile> {
    const data = await fileToBase64(file);
    const res = await this.post<UploadAssetResponse>(`/workspaces/${workspaceSlug}/files/`, {
      mime_type: file.type || "application/octet-stream",
      data,
      file_name: file.name || null,
      project_id: projectId ?? null,
    });
    return {
      fileId: res.id,
      fileName: res.file_name || file.name || "download",
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    };
  }
}

export const imageService = new ImageService();
