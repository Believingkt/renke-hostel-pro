CREATE TABLE public.ai_reply_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  scenario text NOT NULL,
  template text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_reply_templates TO authenticated;
GRANT ALL ON public.ai_reply_templates TO service_role;

ALTER TABLE public.ai_reply_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_reply_templates read admin" ON public.ai_reply_templates
  FOR SELECT USING (public.is_admin_or_super());
CREATE POLICY "ai_reply_templates write super" ON public.ai_reply_templates
  FOR ALL USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role))
           WITH CHECK (public.user_has_team_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_ai_reply_templates_updated_at
  BEFORE UPDATE ON public.ai_reply_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ai_reply_templates (name, scenario, template, is_active, sort) VALUES
('標準資訊型', '詢問空房', '客人詢問空房時，先用一句話摘要條件（日期、人數），接著條列房型：{{房型}}（可住人數）／{{價格}}／{{日期}}。語氣中性專業，不誇飾，最後提供下一步選項。', true, 1),
('推薦促購型', '比較房型', '比較房型時，主動點出各房型差異與適合對象，並針對最推薦的一個說明理由（如「{{房型}} 以 {{價格}} 含早餐最划算」）。適度使用 emoji，結尾邀請客人前往預訂或加入行程。', true, 2),
('親切引導型', '推薦行程', '用溫暖口語的方式回應，先同理客人的需求，再以「我幫您整理了幾個選擇」帶出 {{房型}} 或周邊活動、餐飲建議，並主動提示 {{日期}} 的注意事項。每次只問一個問題，讓客人容易回答。', true, 3);