interface CustomChartTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    dataKey: string;
    color: string;
    payload: any;
  }>;
  label?: string;
  valueFormatter?: (value: number) => string;
  comparisonMode?: 'lastYear' | 'lastMonth';
  isCustomRange?: boolean;
  chartConfig?: Record<string, { label: string; color?: string }>;
}

export const CustomChartTooltip = ({ 
  active, 
  payload, 
  label,
  valueFormatter = (value) => value.toString(),
  comparisonMode,
  isCustomRange,
  chartConfig
}: CustomChartTooltipProps) => {
  if (!active || !payload || payload.length === 0) return null;

  // 计算增长率
  const calculateGrowth = () => {
    if (isCustomRange || payload.length < 2) return null;
    
    // payload[0] is the comparison (去年/上月), payload[1] is current (今年/本月)
    const current = payload[1]?.value || 0;
    const previous = payload[0]?.value || 0;
    
    if (previous === 0 && current === 0) return null;
    if (previous === 0) return null; // 去年為0時不顯示增長率
    
    const growth = ((current - previous) / previous) * 100;
    return growth;
  };

  const growth = calculateGrowth();
  const isFuture = payload[0]?.payload?.isFuture;

  return (
    <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-3 min-w-[200px]">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-border">
        <p className="font-semibold text-sm text-foreground">{label}</p>
        {isFuture && (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
            未來月份
          </span>
        )}
      </div>
      
      <div className="space-y-2">
        {payload.map((entry, index) => {
          const displayName = chartConfig?.[entry.dataKey]?.label || entry.name;
          return (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-sm" 
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-sm text-muted-foreground">{displayName}</span>
              </div>
              <span className="text-sm font-semibold text-foreground">
                {valueFormatter(entry.value)}
              </span>
            </div>
          );
        })}
      </div>

      {growth !== null && !isFuture && (
        <div className="mt-2 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">增長率</span>
            <span className={`text-sm font-semibold ${
              growth >= 0 ? 'text-primary' : 'text-red-600'
            }`}>
              {growth >= 0 ? '+' : ''}{growth.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-muted-foreground">差異</span>
            <span className={`text-xs font-medium ${
              growth >= 0 ? 'text-primary' : 'text-red-600'
            }`}>
              {growth >= 0 ? '+' : ''}{valueFormatter(payload[1].value - payload[0].value)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
