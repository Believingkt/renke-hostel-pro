import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// 收集 channel handler 與 toast 呼叫
const handlers: Array<(payload: any) => void> = [];
const filtersUsed: string[] = [];
const channelNames: string[] = [];
const toastCalls: any[] = [];
const removedChannels: any[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const channelObj: any = {
    on: (_event: string, opts: any, cb: (payload: any) => void) => {
      filtersUsed.push(opts.filter);
      handlers.push(cb);
      return channelObj;
    },
    subscribe: () => channelObj,
  };
  return {
    supabase: {
      channel: (name: string) => {
        channelNames.push(name);
        return channelObj;
      },
      removeChannel: (ch: any) => {
        removedChannels.push(ch);
      },
    },
  };
});

vi.mock("@/hooks/use-toast", () => ({
  toast: (args: any) => {
    toastCalls.push(args);
  },
}));

const subdomainMock = vi.fn();
vi.mock("./use-subdomain", () => ({
  useSubdomain: () => subdomainMock(),
}));

import { useOrderNotifications } from "./use-order-notifications";

const ACC_A = "11111111-1111-1111-1111-111111111111";
const ACC_B = "22222222-2222-2222-2222-222222222222";

describe("useOrderNotifications - 跨民宿隔離", () => {
  beforeEach(() => {
    handlers.length = 0;
    filtersUsed.length = 0;
    channelNames.length = 0;
    toastCalls.length = 0;
    removedChannels.length = 0;
    subdomainMock.mockReset();
  });

  it("postgres_changes filter 必須綁定當前 accommodationId", () => {
    subdomainMock.mockReturnValue({ accommodationId: ACC_A });
    renderHook(() => useOrderNotifications(true));

    expect(channelNames[0]).toBe(`notifications-${ACC_A}`);
    expect(filtersUsed[0]).toBe(`accommodation_id=eq.${ACC_A}`);
  });

  it("收到符合當前 accommodation 的事件時應觸發 toast", () => {
    subdomainMock.mockReturnValue({ accommodationId: ACC_A });
    renderHook(() => useOrderNotifications(true));

    handlers[0]({
      new: {
        accommodation_id: ACC_A,
        title: "🎉 新訂單",
        description: "ABC123",
      },
    });

    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0].title).toBe("🎉 新訂單");
  });

  it("即使收到他民宿的 payload（例如 server filter race），也不應觸發 toast", () => {
    subdomainMock.mockReturnValue({ accommodationId: ACC_A });
    renderHook(() => useOrderNotifications(true));

    handlers[0]({
      new: {
        accommodation_id: ACC_B,
        title: "他民宿訂單",
        description: "should not show",
      },
    });

    expect(toastCalls).toHaveLength(0);
  });

  it("未啟用或無 accommodationId 時不應建立訂閱", () => {
    subdomainMock.mockReturnValue({ accommodationId: null });
    renderHook(() => useOrderNotifications(true));
    expect(channelNames).toHaveLength(0);

    subdomainMock.mockReturnValue({ accommodationId: ACC_A });
    renderHook(() => useOrderNotifications(false));
    expect(channelNames).toHaveLength(0);
  });
});
