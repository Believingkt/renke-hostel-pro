import { supabase } from "@/integrations/supabase/client";

export const MEMBER_AVATAR_BUCKET = "member-avatars";
const SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 年

/**
 * avatar_url 可能是外部網址（LINE / Facebook 頭貼）或本站儲存空間的檔案路徑。
 * 外部網址直接使用，儲存空間路徑則換成簽名網址。
 */
export const resolveMemberAvatarUrl = async (value?: string | null): Promise<string | null> => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  const { data } = await supabase.storage
    .from(MEMBER_AVATAR_BUCKET)
    .createSignedUrl(value, SIGNED_URL_TTL);
  return data?.signedUrl || null;
};

export const uploadMemberAvatar = async (userId: string, file: File): Promise<string> => {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(MEMBER_AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (error) throw error;
  return path;
};
