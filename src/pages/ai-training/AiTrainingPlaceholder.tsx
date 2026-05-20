import { Construction } from "lucide-react";

interface Props {
  title: string;
  description?: string;
}

export default function AiTrainingPlaceholder({ title, description }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>

      <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed rounded-lg">
        <Construction className="h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-base font-medium">此功能將在下個階段完成</p>
        <p className="text-sm text-muted-foreground mt-1">
          Phase 1 已完成資料地基，敬請期待後續迭代。
        </p>
      </div>
    </div>
  );
}
