import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface RoomPricing {
  weekday_2_meals?: number;
  weekday_3_meals?: number;
  weekend_2_meals?: number;
  weekend_3_meals?: number;
}

interface UseRoomPricingProps {
  roomTypeId: string;
  startDate?: Date | null;
  endDate?: Date | null;
}

/**
 * Hook to fetch room pricing from inventory
 * Returns pricing information for a specific room type
 */
export function useRoomPricing({ roomTypeId, startDate, endDate }: UseRoomPricingProps) {
  const [pricing, setPricing] = useState<RoomPricing>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomTypeId) return;

    const fetchPricing = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const today = new Date();
        const queryStartDate = startDate || today;
        const queryEndDate = endDate || new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

        const { data, error: fetchError } = await supabase
          .from('room_inventory_pricing')
          .select('price, date, notes')
          .eq('room_type_id', roomTypeId)
          .gte('date', queryStartDate.toISOString().split('T')[0])
          .lte('date', queryEndDate.toISOString().split('T')[0])
          .order('date', { ascending: true });

        if (fetchError) throw fetchError;

        // 從庫存數據推測不同方案的價格
        // 這裡簡化處理：假設價格從低到高為不同方案
        if (data && data.length > 0) {
          const uniquePrices = [...new Set(data.map(d => d.price))].sort((a, b) => a - b);
          
          setPricing({
            weekday_2_meals: uniquePrices[0],
            weekday_3_meals: uniquePrices[1] || uniquePrices[0],
            weekend_2_meals: uniquePrices[2] || uniquePrices[0],
            weekend_3_meals: uniquePrices[3] || uniquePrices[1] || uniquePrices[0],
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '獲取價格失敗');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPricing();
  }, [roomTypeId, startDate, endDate]);

  return { pricing, isLoading, error };
}

/**
 * Get price for a specific date from inventory
 */
export async function getRoomPriceForDate(
  roomTypeId: string,
  date: Date
): Promise<number | null> {
  try {
    const dateStr = date.toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('room_inventory_pricing')
      .select('price')
      .eq('room_type_id', roomTypeId)
      .eq('date', dateStr)
      .maybeSingle();

    if (error) throw error;
    return data?.price || null;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching price for date:', error);
    }
    return null;
  }
}
