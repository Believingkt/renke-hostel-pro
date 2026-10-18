import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { igHandleCleanupNote, isContentPostUrl, normalizeIgHandle } from "@/lib/kolInviteValidation";
import { igMatchOrFilter } from "@/hooks/useKolIgRecords";
import { KolSearchInput } from "@/components/kol/KolSearchInput";

describe("IG 網址整理", () => {
  it("個人頁的分頁網址含帳號，不是貼文", () => {
    for (const url of [
      "https://www.instagram.com/amile77/reels/",
      "https://www.instagram.com/amile77/tagged/",
      "https://www.instagram.com/amile77/?igsh=abc",
      "https://www.instagram.com/stories/amile77/3312/",
      "https://m.instagram.com/amile77",
      "https://www.instagram.com/_u/amile77",
      "amile77/reels",
    ]) {
      expect(isContentPostUrl(url)).toBe(false);
      expect(normalizeIgHandle(url)).toBe("amile77");
    }
  });

  it("不含帳號的貼文網址仍判定為貼文", () => {
    for (const url of [
      "https://www.instagram.com/reel/DNkq71ChXKC/",
      "https://www.instagram.com/p/C9abc/",
      "instagram.com/tv/xyz",
      "https://www.instagram.com/stories/highlights/17912345678/",
      "https://www.youtube.com/shorts/abc123",
      "reel/DNkq71ChXKC",
      "p/ABC",
    ]) {
      expect(isContentPostUrl(url)).toBe(true);
    }
    // 其他平台網址含帳號者不擋
    for (const url of [
      "https://www.facebook.com/cube0412",
      "https://www.facebook.com/cube0412/videos/123",
      "https://www.tiktok.com/@user/video/123",
      "https://www.youtube.com/@user/videos",
      "https://x.com/user/status/1",
    ]) {
      expect(isContentPostUrl(url)).toBe(false);
    }
  });

  it("Facebook profile.php 保留 id，不同人不會被整理成同一個", () => {
    expect(normalizeIgHandle("https://www.facebook.com/profile.php?id=1000123")).toBe("facebook.com/profile.php?id=1000123");
    expect(normalizeIgHandle("https://www.facebook.com/profile.php?id=1000999")).toBe("facebook.com/profile.php?id=1000999");
    expect(normalizeIgHandle("www.facebook.com/profile.php?id=1000123")).toBe("facebook.com/profile.php?id=1000123");
    expect(normalizeIgHandle("www.facebook.com/abc")).toBe(normalizeIgHandle("https://www.facebook.com/abc"));
  });

  it("整理提示只在網址帶了多餘分頁或參數時出現", () => {
    expect(igHandleCleanupNote("https://www.instagram.com/amile77/reels/")).toBe("instagram.com/amile77");
    expect(igHandleCleanupNote("https://www.instagram.com/amile77/")).toBeNull();
    expect(igHandleCleanupNote("amile77")).toBeNull();
    expect(igHandleCleanupNote("www.instagram.com/amile77")).toBeNull();
    expect(igHandleCleanupNote("https://www.instagram.com/reel/DNkq71ChXKC/")).toBeNull();
  });

  it("比對條件跳脫底線，並涵蓋舊資料存成整串網址", () => {
    expect(igMatchOrFilter("_bs.foodie").split(",")).toEqual([
      "ig_handle.ilike.\\_bs.foodie",
      "ig_handle.ilike.@\\_bs.foodie",
      "ig_handle.ilike.*instagram.com/\\_bs.foodie",
      "ig_handle.ilike.*instagram.com/\\_bs.foodie/*",
      "ig_handle.ilike.*instagram.com/\\_bs.foodie?*",
    ]);
  });
});

describe("KolSearchInput（iOS Safari 中文輸入）", () => {
  it("關閉自動填入，並在選字完成後才送出搜尋", () => {
    const onValueChange = vi.fn();
    render(<KolSearchInput value="" onValueChange={onValueChange} placeholder="搜尋" testId="s" />);
    const input = screen.getByTestId("s") as HTMLInputElement;
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.getAttribute("type")).toBe("search");
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "ㄒ" } });
    expect(onValueChange).not.toHaveBeenCalled();
    expect(input.value).toBe("ㄒ");
    fireEvent.change(input, { target: { value: "謝" } });
    fireEvent.compositionEnd(input, { target: { value: "謝" } });
    expect(onValueChange).toHaveBeenLastCalledWith("謝");
    fireEvent.change(input, { target: { value: "謝晴" } });
    expect(onValueChange).toHaveBeenLastCalledWith("謝晴");
  });
});
