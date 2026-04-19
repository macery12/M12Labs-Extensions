import http from '@/api/http';

const base = (uuid: string) => `/api/client/servers/${uuid}/extensions/minecraft_icon_builder`;

export interface IconData {
    has_icon: boolean;
    image_base64: string | null;
}

export const getIcon = async (uuid: string): Promise<IconData> => {
    const { data } = await http.get(`${base(uuid)}`);
    return data.attributes || data;
};

export const saveIcon = async (uuid: string, imageBase64: string): Promise<void> => {
    await http.post(`${base(uuid)}/icon`, { image_base64: imageBase64 });
};
