import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

interface Props {
  title: string;
}

export default function TeamPlaceholder({ title }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">{title}</h2>
      <Card>
        <CardContent className="py-16 flex flex-col items-center text-muted-foreground gap-3">
          <Construction className="h-10 w-10" />
          <p>功能開發中</p>
        </CardContent>
      </Card>
    </div>
  );
}
