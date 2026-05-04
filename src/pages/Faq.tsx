import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, Edit2, GripVertical, HelpCircle, MessageSquare, Home } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
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
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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
import { useAccommodation } from "@/contexts/AccommodationContext";

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
  const isMobile = useIsMobile();
  const { currentAccommodationId: accommodationId } = useAccommodation();
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingFaq, setDeletingFaq] = useState<FaqItem | null>(null);
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);
  const [formData, setFormData] = useState({
    question: "",
    answer: "",
    is_published: true,
  });

  // Reset list immediately when accommodation switches to prevent cross-tenant data flash
  useEffect(() => {
    setFaqs([]);
  }, [accommodationId]);

  useEffect(() => {
    if (accommodationId) {
      loadFaqs();
    }
  }, [accommodationId]);

  const loadFaqs = async () => {
    if (!accommodationId) return;
    try {
      const { data: faqData, error } = await supabase
        .from("faqs")
        .select("*")
        .eq("accommodation_id", accommodationId)
        .order("display_order");

      if (error) throw error;
      setFaqs(faqData || []);
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
      <AdminPageHeader
        title="常見問題"
        icon={HelpCircle}
        action={
          <Button onClick={() => setIsDialogOpen(true)} className="h-11 sm:h-10 touch-manipulation">
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
                          className="h-10 w-10 sm:h-9 sm:w-9 touch-manipulation"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost-destructive"
                          size="icon"
                          onClick={() => handleDeleteClick(faq)}
                          className="h-10 w-10 sm:h-9 sm:w-9 touch-manipulation"
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

      {isMobile ? (
        <Drawer open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle className="text-lg">
                {editingFaq ? "編輯常見問題" : "新增常見問題"}
              </DrawerTitle>
              <DrawerDescription className="text-sm">
                填寫常見問題的內容，這些內容將顯示在網站前台
              </DrawerDescription>
            </DrawerHeader>

            <div className="px-4 space-y-4 overflow-y-auto max-h-[60vh]">
              <div className="space-y-2">
                <Label htmlFor="question" className="text-base">問題</Label>
                <Input
                  id="question"
                  placeholder="請輸入問題"
                  value={formData.question}
                  onChange={(e) =>
                    setFormData({ ...formData, question: e.target.value })
                  }
                  className="h-12 text-base touch-manipulation"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="answer" className="text-base">答案</Label>
                <RichTextEditor
                  value={formData.answer}
                  onChange={(value) => setFormData({ ...formData, answer: value })}
                  placeholder="請輸入答案"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_published"
                  checked={formData.is_published}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_published: checked })
                  }
                  className="touch-manipulation"
                />
                <Label htmlFor="is_published" className="text-base">立即發布</Label>
              </div>
            </div>

            <DrawerFooter className="pt-4">
              <Button onClick={handleSave} className="w-full h-12 text-base touch-manipulation">
                {editingFaq ? "更新" : "新增"}
              </Button>
              <DrawerClose asChild>
                <Button variant="outline" className="w-full h-12 text-base touch-manipulation">
                  取消
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
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
                  className="h-12 text-base sm:h-10 sm:text-sm touch-manipulation"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="answer">答案</Label>
                <RichTextEditor
                  value={formData.answer}
                  onChange={(value) => setFormData({ ...formData, answer: value })}
                  placeholder="請輸入答案"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_published"
                  checked={formData.is_published}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_published: checked })
                  }
                  className="touch-manipulation"
                />
                <Label htmlFor="is_published">立即發布</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleCloseDialog} className="h-11 sm:h-10 touch-manipulation">
                取消
              </Button>
              <Button onClick={handleSave} className="h-11 sm:h-10 touch-manipulation">
                {editingFaq ? "更新" : "新增"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

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
            <AlertDialogCancel className="h-11 sm:h-10 touch-manipulation">取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 h-11 sm:h-10 touch-manipulation"
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
