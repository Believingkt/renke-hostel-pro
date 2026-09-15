CREATE TABLE public.platform_legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_legal_documents TO anon;
GRANT SELECT, INSERT, UPDATE ON public.platform_legal_documents TO authenticated;
GRANT ALL ON public.platform_legal_documents TO service_role;

ALTER TABLE public.platform_legal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_docs_public_read" ON public.platform_legal_documents
FOR SELECT USING (true);

CREATE POLICY "legal_docs_hq_insert" ON public.platform_legal_documents
FOR INSERT TO authenticated
WITH CHECK (user_has_team_role(auth.uid(), 'super_admin'::app_role) OR user_has_team_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "legal_docs_hq_update" ON public.platform_legal_documents
FOR UPDATE TO authenticated
USING (user_has_team_role(auth.uid(), 'super_admin'::app_role) OR user_has_team_role(auth.uid(), 'admin'::app_role))
WITH CHECK (user_has_team_role(auth.uid(), 'super_admin'::app_role) OR user_has_team_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER platform_legal_documents_updated_at
BEFORE UPDATE ON public.platform_legal_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.platform_legal_documents (slug, title, content) VALUES
('terms', '條款及細則', '住宿條款以本頁面公告為準，入住時間、退房時間、房內設施使用規則等，請於入住前確認。

取消政策：如需取消訂單，將依訂單日與入住日之間隔天數，扣除相應手續費，實際比例以最終確認頁與客服說明為準。'),
('privacy', '隱私條款', '我們將依個人資料保護法蒐集、處理及利用您所提供之聯絡資訊，僅用於完成訂房、付款與入住相關服務。');