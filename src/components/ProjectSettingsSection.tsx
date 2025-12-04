import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SaveButtonContainer } from "@/components/ui/save-button-container";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2 } from "lucide-react";

interface ProjectSettingsSectionProps {
  accommodationId: string;
}

export const ProjectSettingsSection = ({ accommodationId }: ProjectSettingsSectionProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");

  useEffect(() => {
    if (accommodationId) {
      loadProjectSettings();
    }
  }, [accommodationId]);

  const loadProjectSettings = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("accommodation_info")
        .select("name, description")
        .eq("id", accommodationId)
        .single();

      if (error) throw error;

      if (data) {
        setProjectName(data.name || "");
        setProjectDescription(data.description || "");
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error loading project settings:", error);
      }
      toast.error("無法載入專案設定");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!projectName.trim()) {
      toast.error("請輸入專案名稱");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("accommodation_info")
        .update({
          name: projectName.trim(),
          description: projectDescription.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", accommodationId);

      if (error) throw error;

      toast.success("專案設定已儲存");
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error saving project settings:", error);
      }
      toast.error("儲存失敗，請重試");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-6 w-32" />
          </div>
          <Skeleton className="h-4 w-48 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-24 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">專案設定</CardTitle>
        </div>
        <CardDescription>設定您的專案基本資訊</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="projectName">專案名稱 *</Label>
          <Input
            id="projectName"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="請輸入專案名稱"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="projectDescription">專案說明</Label>
          <Textarea
            id="projectDescription"
            value={projectDescription}
            onChange={(e) => setProjectDescription(e.target.value)}
            placeholder="請輸入專案說明（選填）"
            rows={4}
          />
        </div>

        <SaveButtonContainer
          onSave={handleSave}
          isSaving={isSaving}
          disabled={!projectName.trim()}
        />
      </CardContent>
    </Card>
  );
};
