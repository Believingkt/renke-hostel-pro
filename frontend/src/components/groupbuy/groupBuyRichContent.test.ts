import { describe, it, expect } from "vitest";
import { renderGroupBuyRichHtml } from "@/components/groupbuy/GroupBuyRichContent";

describe("renderGroupBuyRichHtml", () => {
  it("將 <p> 內以 <br> 分行的人工編號轉成真正的 ol/li", () => {
    const html = "<p>說明段落。</p><p>1. 第一條 <br>2. 第二條 <br>3. 第三條</p>";
    const out = renderGroupBuyRichHtml(html);
    expect(out).toContain("<ol>");
    expect((out.match(/<li>/g) || []).length).toBe(3);
    expect(out).toContain("<p>說明段落。</p>");
    expect(out).not.toMatch(/<li>\s*1\./);
  });

  it("將行首符號轉成 ul/li", () => {
    const out = renderGroupBuyRichHtml("<p>・第一項<br>・第二項</p>");
    expect(out).toContain("<ul>");
    expect((out.match(/<li>/g) || []).length).toBe(2);
  });

  it("純文字編號也轉成 ol", () => {
    const out = renderGroupBuyRichHtml("前言\n1. 甲\n2. 乙");
    expect(out).toContain("<p>前言</p>");
    expect(out).toContain("<ol>");
  });

  it("保留 h2/h3、粗體與連結", () => {
    const out = renderGroupBuyRichHtml(
      '<h2>標題</h2><h3>次標</h3><p><strong>粗</strong> <a href="https://a.com">連結</a></p>'
    );
    expect(out).toContain("<h2>");
    expect(out).toContain("<h3>");
    expect(out).toContain("<strong>");
    expect(out).toContain("href=\"https://a.com\"");
  });
});
