import { describe, expect, it } from "vitest";
import { extractKolLinks, kolDisplayLinks, kolLinkPlatform, kolLinkSearchFilters, mergeKolLinks, splitKolLinks } from "@/lib/kolLinks";

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

describe("splitKolLinks 邊界", () => {
  it("全形句號與中文緊接網址", () => {
    const s = splitKolLinks("IG：https://www.instagram.com/abc。YT：https://www.youtube.com/@abc。");
    expect(s.primary).toBe("https://www.instagram.com/abc");
    expect(s.others).toEqual(["https://www.youtube.com/@abc"]);
    expect(splitKolLinks("https://www.instagram.com/abc粉絲10萬 https://www.youtube.com/@abc").primary).toBe(
      "https://www.instagram.com/abc",
    );
  });

  it("半形逗號與｜分隔", () => {
    expect(splitKolLinks("https://www.instagram.com/abc,https://www.youtube.com/@abc").others).toEqual([
      "https://www.youtube.com/@abc",
    ]);
    expect(splitKolLinks("https://www.instagram.com/abc｜https://www.tiktok.com/@abc").others).toEqual([
      "https://www.tiktok.com/@abc",
    ]);
  });

  it("同帳號貼兩次清成 1 個", () => {
    expect(splitKolLinks("https://www.youtube.com/@ABC https://youtube.com/@abc")).toEqual({
      primary: "https://www.youtube.com/@ABC",
      others: [],
      split: true,
    });
  });

  it("IG：純帳號不會被丟掉", () => {
    const s = splitKolLinks("IG：abc YT：https://www.youtube.com/@abc");
    expect(s.primary).toBe("https://www.instagram.com/abc");
    expect(s.others).toEqual(["https://www.youtube.com/@abc"]);
  });

  it("TikTok 影片不當主連結", () => {
    const s = splitKolLinks("https://www.tiktok.com/@abc/video/1 https://www.facebook.com/abc");
    expect(s.primary).toBe("https://www.facebook.com/abc");
  });

  it("純帳號主欄位會排除同一個 IG 網址", () => {
    expect(mergeKolLinks([], ["https://www.instagram.com/amile77"], "amile77")).toEqual([]);
  });

  it("FB profile.php 只看 id 去重", () => {
    expect(
      mergeKolLinks(["https://www.facebook.com/profile.php?id=1"], ["https://facebook.com/profile.php?id=1&ref=x"]),
    ).toHaveLength(1);
  });
});

describe("kolLinkSearchFilters", () => {
  it("網址去掉 https、www、結尾斜線後比對其他平台連結", () => {
    expect(kolLinkSearchFilters("https://www.youtube.com/@abc/")).toEqual(["other_links_text.ilike.%youtube.com/@abc%"]);
    expect(kolLinkSearchFilters("小美")).toEqual(["other_links_text.ilike.%小美%"]);
  });

  it("IG 網址另外用帳號比對主欄位", () => {
    expect(kolLinkSearchFilters("https://www.instagram.com/kai.stays/?igsh=1")).toEqual([
      "other_links_text.ilike.%instagram.com/kai.stays%",
      "ig_handle.ilike.%kai.stays%",
    ]);
  });
});

describe("第二輪修正", () => {
  it("貼文網址不加帳號條件", () => {
    expect(kolLinkSearchFilters("https://www.instagram.com/p/ABC123/")).toEqual(["other_links_text.ilike.%instagram.com/p/ABC123%"]);
  });

  it("FB profile.php 搜尋保留 id", () => {
    expect(kolLinkSearchFilters("https://m.facebook.com/profile.php?id=100012345")).toEqual([
      "other_links_text.ilike.%profile.php?id=100012345%",
    ]);
  });

  it("中文路徑的 FB 連結不會被丟掉，但英文帳號後接中文仍截斷", () => {
    const s = splitKolLinks("FB：https://facebook.com/小美 IG：https://www.instagram.com/mei粉絲3萬");
    expect(s.primary).toBe("https://www.instagram.com/mei");
    expect(s.others).toEqual(["https://facebook.com/小美"]);
  });
});

describe("kolDisplayLinks（畫面顯示，不寫回資料庫）", () => {
  it("舊資料塞了多個連結：只顯示主連結，其他拆到其他平台", () => {
    const blob =
      "https://www.instagram.com/FB: https://www.facebook.com/GIALEEMI Instagram ：https://www.instagram.com/mintangelme YouTube ：https://www.youtube.com/@mintangelme TikTok ：https://www.tiktok.com/@mintangelme/";
    const d = kolDisplayLinks({ ig_handle: blob, ig_url: blob, other_links: [] });
    expect(d.primary).toBe("https://www.instagram.com/mintangelme/");
    expect(d.others.map(kolLinkPlatform)).toEqual(["facebook", "youtube", "tiktok"]);
  });

  it("一般資料照舊使用 ig_url 與 other_links", () => {
    expect(
      kolDisplayLinks({ ig_handle: "kai.stays", ig_url: "https://www.instagram.com/kai.stays/", other_links: ["https://www.youtube.com/@kai"] }),
    ).toEqual({ primary: "https://www.instagram.com/kai.stays/", others: ["https://www.youtube.com/@kai"] });
    expect(kolDisplayLinks({ ig_handle: "kai.stays", ig_url: null, other_links: null })).toEqual({
      primary: "https://www.instagram.com/kai.stays/",
      others: [],
    });
  });
});

describe("kolDisplayLinks：只有 ig_url（Ragic 款項表單）", () => {
  it("ig_url 塞了多個連結時只取主連結；一般 ig_url 原樣", () => {
    expect(
      kolDisplayLinks({ ig_url: "Instagram：https://www.instagram.com/mei YouTube：https://www.youtube.com/@mei" }).primary,
    ).toBe("https://www.instagram.com/mei/");
    expect(kolDisplayLinks({ ig_url: "https://www.instagram.com/mei/" }).primary).toBe("https://www.instagram.com/mei/");
    expect(kolDisplayLinks({ ig_url: null }).primary).toBeNull();
  });
});
