import { supabase } from "@/integrations/supabase/client";
import { parseISO } from "date-fns";

export interface ConflictDetectionResult {
  hasConflict: boolean;
  conflictType?: 'overbooked' | 'duplicate';
  message?: string;
  availableRooms?: number;
  bookedRooms?: number;
  conflictingOrders?: any[];
}

/**
 * 檢測訂房衝突 - 每個房型每天只能被預訂一次
 * @param roomTypeId 房型ID
 * @param checkInDate 入住日期
 * @param checkOutDate 退房日期
 * @param accommodationId 住宿ID
 * @param excludeOrderId 排除的訂單ID（編輯時使用）
 * @param guestInfo 客人資訊（用於檢測重複訂房）
 * @returns 衝突檢測結果
 */
export const detectBookingConflict = async (
  roomTypeId: string,
  checkInDate: string,
  checkOutDate: string,
  accommodationId: string,
  excludeOrderId?: string,
  guestInfo?: {
    guestName?: string;
    guestPhone?: string;
    guestEmail?: string;
  }
): Promise<ConflictDetectionResult> => {
  try {
    // 1. 獲取房型資訊
    const { data: roomType, error: roomTypeError } = await supabase
      .from("room_types")
      .select("room_count, name")
      .eq("id", roomTypeId)
      .single();

    if (roomTypeError || !roomType) {
      console.error("Error fetching room type:", roomTypeError);
      return { hasConflict: false };
    }

    // 2. 查詢該房型在指定日期範圍內的所有訂單（排除已取消的）
    let ordersQuery = supabase
      .from("orders")
      .select("*")
      .eq("accommodation_id", accommodationId)
      .eq("room_type_id", roomTypeId)
      .neq("order_status", "cancelled");

    // 如果是編輯模式，排除當前訂單
    if (excludeOrderId) {
      ordersQuery = ordersQuery.neq("id", excludeOrderId);
    }

    const { data: orders, error: ordersError } = await ordersQuery;

    if (ordersError) {
      console.error("Error fetching orders:", ordersError);
      return { hasConflict: false };
    }

    // 3. 檢測重複訂房（同一客人在相同或重疊日期）
    if (guestInfo && (guestInfo.guestPhone || guestInfo.guestEmail)) {
      const duplicateOrders = orders?.filter((order) => {
        // 檢查客人資訊是否匹配
        const phoneMatch = guestInfo.guestPhone && order.guest_phone === guestInfo.guestPhone;
        const emailMatch = guestInfo.guestEmail && order.guest_email === guestInfo.guestEmail;
        
        if (!phoneMatch && !emailMatch) return false;

        // 檢查日期是否重疊
        const orderCheckIn = parseISO(order.check_in_date);
        const orderCheckOut = parseISO(order.check_out_date);
        const newCheckIn = parseISO(checkInDate);
        const newCheckOut = parseISO(checkOutDate);

        // 判斷日期是否重疊
        const hasOverlap = 
          (newCheckIn >= orderCheckIn && newCheckIn < orderCheckOut) ||
          (newCheckOut > orderCheckIn && newCheckOut <= orderCheckOut) ||
          (newCheckIn <= orderCheckIn && newCheckOut >= orderCheckOut);

        return hasOverlap;
      });

      if (duplicateOrders && duplicateOrders.length > 0) {
        return {
          hasConflict: true,
          conflictType: 'duplicate',
          message: `檢測到重複訂房：該客人在相同日期已有 ${duplicateOrders.length} 筆訂單`,
          conflictingOrders: duplicateOrders
        };
      }
    }

    // 4. 檢測房型衝突 - 每個房型每天只能被預訂一次
    const checkIn = parseISO(checkInDate);
    const checkOut = parseISO(checkOutDate);
    
    // 檢查是否有任何訂單與新訂單的日期範圍重疊
    const conflictingOrders = orders?.filter((order) => {
      const orderCheckIn = parseISO(order.check_in_date);
      const orderCheckOut = parseISO(order.check_out_date);
      
      // 判斷日期是否重疊
      const hasOverlap = 
        (checkIn >= orderCheckIn && checkIn < orderCheckOut) ||
        (checkOut > orderCheckIn && checkOut <= orderCheckOut) ||
        (checkIn <= orderCheckIn && checkOut >= orderCheckOut);

      return hasOverlap;
    }) || [];

    // 如果有任何重疊的訂單，表示該房型在該日期範圍內已被預訂
    if (conflictingOrders.length > 0) {
      return {
        hasConflict: true,
        conflictType: 'overbooked',
        message: `該房型「${roomType.name}」在選定日期內已被預訂，每個房型每天只能接受一筆訂單`,
        availableRooms: 0,
        bookedRooms: 1,
        conflictingOrders
      };
    }

    // 無衝突 - 該房型在該日期範圍內可以預訂
    return {
      hasConflict: false,
      availableRooms: 1,
      bookedRooms: 0
    };
  } catch (error) {
    console.error("Error in detectBookingConflict:", error);
    return { hasConflict: false };
  }
};

/**
 * 獲取可用房間數量 - 在新規則下，返回0或1
 */
export const getAvailableRoomCount = async (
  roomTypeId: string,
  checkInDate: string,
  checkOutDate: string,
  accommodationId: string,
  excludeOrderId?: string
): Promise<number> => {
  const result = await detectBookingConflict(
    roomTypeId,
    checkInDate,
    checkOutDate,
    accommodationId,
    excludeOrderId
  );
  
  // 在新規則下，每個房型每天只能被預訂一次，所以返回值只有0或1
  return result.availableRooms || 0;
};

export interface AlternativeRoomSuggestion {
  roomTypeId: string;
  roomTypeName: string;
  capacity: number;
  basePrice: number;
  availableRooms: number;
}

/**
 * 獲取替代房型建議
 * 當選定的房型已被預訂時，建議其他可用的房型
 */
export const getAlternativeRoomSuggestions = async (
  currentRoomTypeId: string,
  checkInDate: string,
  checkOutDate: string,
  accommodationId: string,
  guestCount: number = 2
): Promise<AlternativeRoomSuggestion[]> => {
  try {
    // 1. 獲取所有其他房型
    const { data: roomTypes, error } = await supabase
      .from("room_types")
      .select("id, name, capacity, base_price, room_count")
      .eq("accommodation_id", accommodationId)
      .neq("id", currentRoomTypeId)
      .gte("capacity", guestCount);

    if (error || !roomTypes) {
      console.error("Error fetching room types:", error);
      return [];
    }

    // 2. 檢查每個房型的可用性
    const suggestions: AlternativeRoomSuggestion[] = [];
    
    for (const roomType of roomTypes) {
      const result = await detectBookingConflict(
        roomType.id,
        checkInDate,
        checkOutDate,
        accommodationId
      );

      // 在新規則下，只要沒有衝突就是可用的
      if (!result.hasConflict) {
        suggestions.push({
          roomTypeId: roomType.id,
          roomTypeName: roomType.name,
          capacity: roomType.capacity,
          basePrice: roomType.base_price,
          availableRooms: 1 // 每個房型每天只能被預訂一次
        });
      }
    }

    // 3. 按價格從低到高排序
    suggestions.sort((a, b) => a.basePrice - b.basePrice);

    return suggestions;
  } catch (error) {
    console.error("Error in getAlternativeRoomSuggestions:", error);
    return [];
  }
};

/**
 * 檢查所有房型的可用性，只返回可預訂的房型
 */
export const getAvailableRoomTypes = async (
  checkInDate: string,
  checkOutDate: string,
  accommodationId: string,
  guestCount: number = 2
): Promise<string[]> => {
  try {
    // 1. 獲取所有符合人數要求的房型
    const { data: roomTypes, error } = await supabase
      .from("room_types")
      .select("id")
      .eq("accommodation_id", accommodationId)
      .gte("capacity", guestCount);

    if (error || !roomTypes) {
      console.error("Error fetching room types:", error);
      return [];
    }

    // 2. 檢查每個房型的可用性
    const availableRoomTypeIds: string[] = [];
    
    for (const roomType of roomTypes) {
      const result = await detectBookingConflict(
        roomType.id,
        checkInDate,
        checkOutDate,
        accommodationId
      );

      // 只有沒有衝突的房型才加入可用列表
      if (!result.hasConflict) {
        availableRoomTypeIds.push(roomType.id);
      }
    }

    return availableRoomTypeIds;
  } catch (error) {
    console.error("Error in getAvailableRoomTypes:", error);
    return [];
  }
};
