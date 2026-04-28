import http from '@/api/http';

const extensionId = 'minecraft_log_uploader';
const base = (uuid: string) => `/api/client/servers/${uuid}/extensions/${extensionId}`;

export interface LogFile {
    name: string;
    size: number;
    modified_at: string | null;
}

export interface LogListResponse {
    logs: LogFile[];
}

export interface LogContentResponse {
    file: string;
    content: string;
    truncated: boolean;
}

export interface UploadResponse {
    url: string;
    id: string;
}

export const listLogs = (uuid: string): Promise<LogListResponse> =>
    http
        .get(`${base(uuid)}/logs`)
        .then(({ data }) => data.attributes as LogListResponse);

export const getLog = (uuid: string, file: string): Promise<LogContentResponse> =>
    http
        .get(`${base(uuid)}/logs/content`, { params: { file } })
        .then(({ data }) => data.attributes as LogContentResponse);

export const uploadLog = (uuid: string, file: string): Promise<UploadResponse> =>
    http
        .post(`${base(uuid)}/logs/upload`, { file })
        .then(({ data }) => data.attributes as UploadResponse);
