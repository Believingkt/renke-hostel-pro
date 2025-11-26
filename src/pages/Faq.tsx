import { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, GripVertical, HelpCircle, MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader } from "@/components/PageHeader";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  display_order: number;
  is_published: boolean;
}

// Validation schema for FAQ inputs
const faqSchema = z.object({
  question: z.string()
    .trim()
    .min(1, "問題不能為空")
    .max(500, "問題長度不能超過 500 字元"),
  answer: z.string()
    .trim()
    .min(1, "答案不能為空")
    .max(2000, "答案長度不能超過 2000 字元"),
  is_published: z.boolean(),
});

const Faq = () => {
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [accommodationId, setAccommodationId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingFaq, setDeletingFaq] = useState<FaqItem | null>(null);
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);
  const [formData, setFormData] = useState({
    question: "",
    answer: "",
    is_published: true,
  });

  useEffect(() => {
    loadFaqs();
  }, []);

  const loadFaqs = async () => {
    try {
      const { data: infoData } = await supabase
        .from("accommodation_info")
        .select("id")
        .maybeSingle();

      if (infoData) {
        setAccommodationId(infoData.id);

        const { data: faqData, error } = await supabase
          .from("faqs")
          .select("*")
          .eq("accommodation_id", infoData.id)
          .order("display_order");

        if (error) throw error;
        setFaqs(faqData || []);
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error loading FAQs:", error);
      }
      toast.error("載入常見問題失敗");
    }
  };

  const handleSave = async () => {
    if (!accommodationId) {
      toast.error("找不到旅宿資訊");
      return;
    }

    // Validate input with Zod schema
    const validation = faqSchema.safeParse(formData);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      toast.error(firstError.message);
      return;
    }

    try {
      if (editingFaq) {
        const { error } = await supabase
          .from("faqs")
          .update({
            question: formData.question,
            answer: formData.answer,
            is_published: formData.is_published,
          })
          .eq("id", editingFaq.id);

        if (error) throw error;
        toast.success("更新成功");
      } else {
        const maxOrder = faqs.length > 0 ? Math.max(...faqs.map(f => f.display_order)) : 0;
        
        const { error } = await supabase
          .from("faqs")
          .insert({
            accommodation_id: accommodationId,
            question: formData.question,
            answer: formData.answer,
            is_published: formData.is_published,
            display_order: maxOrder + 1,
          });

        if (error) throw error;
        toast.success("新增成功");
      }

      loadFaqs();
      handleCloseDialog();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error saving FAQ:", error);
      }
      toast.error("儲存失敗");
    }
  };

  const handleDeleteClick = (faq: FaqItem) => {
    setDeletingFaq(faq);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingFaq) return;

    try {
      const { error } = await supabase.from("faqs").delete().eq("id", deletingFaq.id);

      if (error) throw error;
      toast.success("刪除成功");
      loadFaqs();
      setDeleteDialogOpen(false);
      setDeletingFaq(null);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error deleting FAQ:", error);
      }
      toast.error("刪除失敗");
    }
  };

  const handleEdit = (faq: FaqItem) => {
    setEditingFaq(faq);
    setFormData({
      question: faq.question,
      answer: faq.answer,
      is_published: faq.is_published,
    });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingFaq(null);
    setFormData({
      question: "",
      answer: "",
      is_published: true,
    });
  };

  const handleTogglePublish = async (faq: FaqItem) => {
    try {
      const { error } = await supabase
        .from("faqs")
        .update({ is_published: !faq.is_published })
        .eq("id", faq.id);

      if (error) throw error;
      toast.success(faq.is_published ? "已隱藏" : "已發布");
      loadFaqs();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error toggling publish:", error);
      }
      toast.error("操作失敗");
    }
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        title="常見問題"
        icon={HelpCircle}
        action={
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            新增問題
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardDescription>
            填寫常見問題的內容，這些內容將顯示在網站前台
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {faqs.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="尚無常見問題"
                description="開始建立常見問題，幫助顧客快速找到答案"
                action={{
                  label: "新增第一個問題",
                  onClick: () => setIsDialogOpen(true)
                }}
              />
            ) : (
              faqs.map((faq) => (
                <div
                  key={faq.id}
                  className="flex items-start gap-4 p-4 border rounded-lg"
                >
                  <GripVertical className="h-5 w-5 text-muted-foreground mt-1 cursor-move" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="font-semibold">{faq.question}</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {faq.answer}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`publish-${faq.id}`} className="text-sm">
                            {faq.is_published ? "已發布" : "已隱藏"}
                          </Label>
                          <Switch
                            id={`publish-${faq.id}`}
                            checked={faq.is_published}
                            onCheckedChange={() => handleTogglePublish(faq)}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(faq)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost-destructive"
                          size="icon"
                          onClick={() => handleDeleteClick(faq)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingFaq ? "編輯常見問題" : "新增常見問題"}
            </DialogTitle>
            <DialogDescription>
              填寫常見問題的內容，這些內容將顯示在網站前台
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="question">問題</Label>
              <Input
                id="question"
                placeholder="請輸入問題"
                value={formData.question}
                onChange={(e) =>
                  setFormData({ ...formData, question: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="answer">答案</Label>
              <Textarea
                id="answer"
                placeholder="請輸入答案"
                value={formData.answer}
                onChange={(e) =>
                  setFormData({ ...formData, answer: e.target.value })
                }
                rows={6}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is_published"
                checked={formData.is_published}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_published: checked })
                }
              />
              <Label htmlFor="is_published">立即發布</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              取消
            </Button>
            <Button onClick={handleSave}>
              {editingFaq ? "更新" : "新增"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除常見問題「{deletingFaq?.question}」嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Faq;
