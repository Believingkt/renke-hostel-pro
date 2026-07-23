import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";

interface Props {
  currentStep: string;
  checkInDate: Date | null;
  checkOutDate: Date | null;
  checkInDateStr: string;
  checkOutDateStr: string;
  calculateNights: () => number;
  totalGuests: number;
  selectedRoom: any;
  selectedMealPlan: any;
  getMealPlanDisplayName: (plan: any) => string;
  calculateTotal: () => number;
  calculateFinalTotal: () => number;
  calculateDiscount: () => number;
  petCount: number;
  petPlanSettings: { pricePerUnit: number };
  bbqMealsByDate: Record<string, number>;
  mealPlanSettings: { pricePerUnit: number };
  customAddonCounts: Record<string, number>;
  customAddonSettings: Array<{ addon_type: string; description?: string; price_per_unit?: number }>;
  appliedDiscount: { code: string } | null;
  isCheckingAvailability: boolean;
  roomTypes: any[];
  roomAvailability: Record<string, any>;
}

export default function OrderSummarySidebar(props: Props) {
  const {
    currentStep,
    checkInDate,
    checkOutDate,
    checkInDateStr,
    checkOutDateStr,
    calculateNights,
    totalGuests,
    selectedRoom,
    selectedMealPlan,
    getMealPlanDisplayName,
    calculateTotal,
    calculateFinalTotal,
    calculateDiscount,
    petCount,
    petPlanSettings,
    bbqMealsByDate,
    mealPlanSettings,
    customAddonCounts,
    customAddonSettings,
    appliedDiscount,
    isCheckingAvailability,
    roomTypes,
    roomAvailability,
  } = props;

  const hasAvailableRooms =
    !checkInDate ||
    !checkOutDate ||
    isCheckingAvailability ||
    roomTypes.some((room) => {
      const availability = roomAvailability[room.id];
      if (!availability) return false;
      return (
        !availability.isBlocked &&
        !availability.hasMissingPricing &&
        !availability.hasNoAvailability
      );
    });

  if (
    currentStep === "room" &&
    checkInDate &&
    checkOutDate &&
    !isCheckingAvailability &&
    !hasAvailableRooms
  ) {
    return null;
  }

  return (
    <div className="hidden lg:block md:col-span-1">
      <Card className="sticky top-24">
        <CardHeader>
          <CardTitle className="text-lg">訂單摘要</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {checkInDate && checkOutDate && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">入住日期</span>
                <span className="font-medium">{checkInDateStr}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">退房日期</span>
                <span className="font-medium">{checkOutDateStr}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">住宿天數</span>
                <span className="font-medium">{calculateNights()} 晚</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">入住人數</span>
                <span className="font-medium">{totalGuests} 人</span>
              </div>
            </div>
          )}

          {selectedRoom ? (
            <>
              <Separator />
              {selectedRoom.room_photos && selectedRoom.room_photos.length > 0 && (
                <div className="rounded-lg overflow-hidden">
                  <img
                    src={selectedRoom.room_photos[0].photo_url}
                    alt={selectedRoom.name}
                    className="w-full h-40 object-cover"
                  />
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground mb-1">房型</p>
                <p className="font-medium">{selectedRoom.name}</p>
              </div>

              {selectedMealPlan ? (
                <>
                  <Separator />
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {getMealPlanDisplayName(selectedMealPlan)} × {calculateNights()} 晚
                      </span>
                      <span className="font-medium">
                        NT$ {calculateTotal().toLocaleString()}
                      </span>
                    </div>
                    {petCount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          🐾 寵物方案 × {petCount} × {calculateNights()} 晚
                        </span>
                        <span className="font-medium">
                          NT$ {(petCount * petPlanSettings.pricePerUnit * calculateNights()).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {Object.entries(bbqMealsByDate)
                      .filter(([_, count]) => count > 0)
                      .map(([dateStr, count]) => (
                        <div key={dateStr} className="flex justify-between">
                          <span className="text-muted-foreground">
                            🍖 {format(new Date(dateStr), "MM/dd")} 餐食方案 × {count} 人
                          </span>
                          <span className="font-medium">
                            NT$ {(count * mealPlanSettings.pricePerUnit).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    {Object.entries(customAddonCounts)
                      .filter(([_, count]) => count > 0)
                      .map(([type, count]) => {
                        const setting = customAddonSettings.find((s) => s.addon_type === type);
                        return (
                          <div key={type} className="flex justify-between">
                            <span className="text-muted-foreground">
                              🛏️ {setting?.description || type} × {count} × {calculateNights()} 晚
                            </span>
                            <span className="font-medium">
                              NT$ {(count * (setting?.price_per_unit || 0) * calculateNights()).toLocaleString()}
                            </span>
                          </div>
                        );
                      })}
                    {appliedDiscount && (
                      <div className="flex justify-between text-primary">
                        <span>折扣 ({appliedDiscount.code})</span>
                        <span>- NT$ {calculateDiscount().toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">總金額</span>
                    <span className="text-2xl font-bold text-primary">
                      NT$ {calculateFinalTotal().toLocaleString()}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <Separator />
                  <div className="bg-muted/50 p-4 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">請選擇餐食方案以查看價格</p>
                  </div>
                </>
              )}
            </>
          ) : currentStep === "room" ? (
            <>
              <Separator />
              <div className="bg-muted/50 p-4 rounded-lg text-center">
                <p className="text-sm text-muted-foreground">請選擇房型以繼續</p>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
