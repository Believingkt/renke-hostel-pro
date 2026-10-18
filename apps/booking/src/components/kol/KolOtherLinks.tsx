import { useState } from "react";
import { ExternalLink, Plus, X } from "lucide-react";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@lakeze/shared/components/ui/popover";
import { KOL_LINK_PLATFORM_LABEL, extractKolLinks, kolLinkPlatform, mergeKolLinks } from "@/lib/kolLinks";

const PlatformTag = ({ url }: { url: string }) => (
  <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] font-normal">
    {KOL_LINK_PLATFORM_LABEL[kolLinkPlatform(url)]}
  </Badge>
);

/** 唯讀的其他平台連結清單（詳細頁、清單彈出框共用） */
export const KolOtherLinksList = ({ links }: { links: string[] }) => (
  <ul className="space-y-1" data-testid="kol-other-links-list">
    {links.map((l) => (
      <li key={l} className="flex items-start gap-1.5">
        <PlatformTag url={l} />
        <a href={l} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all text-xs inline-flex gap-1">
          {l}
          <ExternalLink className="h-3 w-3 shrink-0 mt-0.5" />
        </a>
      </li>
    ))}
  </ul>
);

/** 清單用：主連結旁的「+N」小標，點開看全部其他平台連結 */
export const KolOtherLinksBadge = ({ links }: { links: string[] | null | undefined }) => {
  if (!links?.length) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mt-1 inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
          onClick={(e) => e.stopPropagation()}
          data-testid="kol-other-links-badge"
        >
          +{links.length} 其他平台
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" onClick={(e) => e.stopPropagation()}>
        <div className="text-xs font-medium mb-2">其他平台連結</div>
        <KolOtherLinksList links={links} />
      </PopoverContent>
    </Popover>
  );
};

type FieldProps = {
  links: string[];
  primary: string;
  onChange: (links: string[]) => void;
};

/** 表單用：其他平台連結的新增／刪除 */
export const KolOtherLinksField = ({ links, primary, onChange }: FieldProps) => {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const add = () => {
    const found = extractKolLinks(input);
    if (found.length === 0) {
      setError("請貼完整網址（例如 https://www.youtube.com/@帳號）");
      return;
    }
    onChange(mergeKolLinks(links, found, primary));
    setInput("");
    setError("");
  };

  return (
    <div className="space-y-2" data-testid="kol-other-links-field">
      {links.map((l, i) => (
        <div key={l} className="flex items-center gap-2 text-xs" data-testid={`kol-other-link-${i}`}>
          <PlatformTag url={l} />
          <a href={l} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-primary hover:underline" title={l}>
            {l}
          </a>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0"
            onClick={() => onChange(links.filter((x) => x !== l))}
            data-testid={`kol-other-link-remove-${i}`}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="貼上 FB／YouTube／TikTok 等連結，可一次貼多個"
          data-testid="kol-other-link-input"
        />
        <Button type="button" variant="outline" size="sm" className="h-10 shrink-0" onClick={add} data-testid="kol-other-link-add">
          <Plus className="h-4 w-4 mr-1" />
          加入
        </Button>
      </div>
      {error && (
        <div className="text-xs text-destructive" data-testid="kol-other-link-error">
          {error}
        </div>
      )}
    </div>
  );
};
