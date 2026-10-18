import { describe, expect, it } from "vitest";
import { extractKolLinks, kolLinkPlatform, mergeKolLinks, splitKolLinks } from "@/lib/kolLinks";

const LEE =
  "https://www.instagram.com/FB: https://www.facebook.com/GIALEEMI Instagram ：https://www.instagram.com/mintangelme YouTube ：https://www.youtube.com/@mintangelme TikTok ：https://www.tiktok.com/@mintangelme/";

describe("splitKolLinks", () => {
  it("拆開李宓這種多平台貼法，IG 留主欄位", () => {
    const s = splitKolLinks(LEE);
    expect(s.split).toBe(true);
    expect(s.primary).toBe("https://www.instagram.com/mintangelme");
    expect(s.others).toEqual([
      "https://www.facebook.com/GIALEEMI",
      "https://www.youtube.com/@mintangelme",
      "https://www.tiktok.com/@mintangelme/",
    ]);
  });

  it("單一 IG 網址或帳號不拆", () => {
    expect(splitKolLinks("https://www.instagram.com/kai.stays/").split).toBe(false);
    expect(splitKolLinks("amile77").split).toBe(false);
    expect(splitKolLinks("").split).toBe(false);
  });

  it("單一連結但帶標籤時，去掉標籤", () => {
    const s = splitKolLinks("IG：https://www.instagram.com/abc");
    expect(s).toEqual({ primary: "https://www.instagram.com/abc", others: [], split: true });
  });

  it("沒有 IG 時依 TikTok → YouTube → FB 選主連結", () => {
    const s = splitKolLinks("https://www.facebook.com/x https://www.youtube.com/@y https://www.tiktok.com/@z");
    expect(s.primary).toBe("https://www.tiktok.com/@z");
    expect(s.others).toEqual(["https://www.facebook.com/x", "https://www.youtube.com/@y"]);
  });

  it("貼文連結不會被選為主連結", () => {
    const s = splitKolLinks("https://www.instagram.com/reel/DNkq71ChXKC/ https://www.youtube.com/@y");
    expect(s.primary).toBe("https://www.youtube.com/@y");
    expect(s.others).toEqual(["https://www.instagram.com/reel/DNkq71ChXKC/"]);
  });

  it("同一帳號不同寫法視為重複", () => {
    const s = splitKolLinks("https://www.instagram.com/ABC/ instagram.com/abc?igsh=1 https://youtube.com/@abc");
    expect(s.primary).toBe("https://www.instagram.com/ABC/");
    expect(s.others).toEqual(["https://youtube.com/@abc"]);
  });
});

describe("extractKolLinks / mergeKolLinks", () => {
  it("沒有網址回傳空陣列", () => {
    expect(extractKolLinks("就是很多字")).toEqual([]);
  });

  it("合併去重並排除主連結", () => {
    expect(
      mergeKolLinks(["https://www.youtube.com/@a"], ["https://youtube.com/@a/", "https://www.instagram.com/main"], "instagram.com/main"),
    ).toEqual(["https://www.youtube.com/@a"]);
  });

  it("辨認平台", () => {
    expect(kolLinkPlatform("https://youtu.be/x")).toBe("youtube");
    expect(kolLinkPlatform("https://m.facebook.com/x")).toBe("facebook");
    expect(kolLinkPlatform("https://www.threads.net/@x")).toBe("threads");
    expect(kolLinkPlatform("https://blog.example.com/x")).toBe("other");
  });
});
