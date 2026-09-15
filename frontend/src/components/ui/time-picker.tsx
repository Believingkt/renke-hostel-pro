import * as React from 'react';
import { Clock, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { cn } from '@/lib/utils';
import { ScrollArea } from './scroll-area';

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  error?: string;
}

const HOURS = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

export function TimePicker({ value, onChange, className, error }: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  
  // Parse current value (HH:MM format)
  const parseTime = (timeStr: string) => {
    if (!timeStr) return { period: '下午', hour: '03', minute: '00' };
    
    const [hourStr, minuteStr] = timeStr.split(':');
    let hour = parseInt(hourStr, 10);
    const minute = minuteStr || '00';
    
    const period = hour >= 12 ? '下午' : '上午';
    if (hour === 0) hour = 12;
    else if (hour > 12) hour = hour - 12;
    
    return {
      period,
      hour: hour.toString().padStart(2, '0'),
      minute
    };
  };
  
  const { period, hour, minute } = parseTime(value);
  
  const formatTimeDisplay = () => {
    return `${period} ${hour}:${minute}`;
  };
  
  const handlePeriodChange = (newPeriod: string) => {
    updateTime(newPeriod, hour, minute);
  };
  
  const handleHourChange = (newHour: string) => {
    updateTime(period, newHour, minute);
  };
  
  const handleMinuteChange = (newMinute: string) => {
    updateTime(period, hour, newMinute);
  };
  
  const updateTime = (p: string, h: string, m: string) => {
    let hour24 = parseInt(h, 10);
    if (p === '下午' && hour24 !== 12) {
      hour24 += 12;
    } else if (p === '上午' && hour24 === 12) {
      hour24 = 0;
    }
    const newValue = `${hour24.toString().padStart(2, '0')}:${m}`;
    onChange(newValue);
  };

  const SelectColumn = ({ 
    options, 
    value, 
    onChange 
  }: { 
    options: string[]; 
    value: string; 
    onChange: (v: string) => void 
  }) => (
    <ScrollArea className="h-[180px]">
      <div className="flex flex-col gap-1 p-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              'w-full px-3 py-2 text-sm rounded-md transition-all duration-150',
              'hover:bg-primary/10',
              value === option 
                ? 'bg-primary text-primary-foreground font-medium shadow-sm' 
                : 'text-foreground hover:text-primary'
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </ScrollArea>
  );

  return (
    <div className={cn('space-y-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              'w-full h-12 justify-start text-left font-normal text-base',
              !value && 'text-muted-foreground',
              error && 'border-destructive focus-visible:ring-destructive/20'
            )}
          >
            <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
            {formatTimeDisplay()}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-popover" align="start">
          <div className="p-4">
            <div className="flex gap-2">
              {/* 上午/下午 */}
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-2 text-center">時段</span>
                <div className="border rounded-lg overflow-hidden bg-muted/30">
                  <SelectColumn 
                    options={['上午', '下午']} 
                    value={period} 
                    onChange={handlePeriodChange} 
                  />
                </div>
              </div>
              
              {/* 小時 */}
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-2 text-center">小時</span>
                <div className="border rounded-lg overflow-hidden bg-muted/30">
                  <SelectColumn 
                    options={HOURS} 
                    value={hour} 
                    onChange={handleHourChange} 
                  />
                </div>
              </div>
              
              {/* 分鐘 */}
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-2 text-center">分鐘</span>
                <div className="border rounded-lg overflow-hidden bg-muted/30">
                  <SelectColumn 
                    options={MINUTES} 
                    value={minute} 
                    onChange={handleMinuteChange} 
                  />
                </div>
              </div>
            </div>
            
            {/* 快速選擇 */}
            <div className="mt-4 pt-4 border-t">
              <span className="text-xs text-muted-foreground block mb-2">快速選擇</span>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: '下午 3:00', value: '15:00' },
                  { label: '下午 4:00', value: '16:00' },
                  { label: '上午 10:00', value: '10:00' },
                  { label: '上午 11:00', value: '11:00' },
                ].map((preset) => (
                  <Button
                    key={preset.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onChange(preset.value);
                      setOpen(false);
                    }}
                    className={cn(
                      'text-xs',
                      value === preset.value && 'bg-primary text-primary-foreground'
                    )}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}

// 簡化版退房時間選擇器
export function CheckOutTimePicker({ value, onChange, className, error }: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  
  // Parse current value (HH:MM format)
  const parseTime = (timeStr: string) => {
    if (!timeStr) return { period: '上午', hour: '11', minute: '00' };
    
    const [hourStr, minuteStr] = timeStr.split(':');
    let hour = parseInt(hourStr, 10);
    const minute = minuteStr || '00';
    
    const period = hour >= 12 ? '下午' : '上午';
    if (hour === 0) hour = 12;
    else if (hour > 12) hour = hour - 12;
    
    return {
      period,
      hour: hour.toString().padStart(2, '0'),
      minute
    };
  };
  
  const { period, hour, minute } = parseTime(value);
  
  const formatTimeDisplay = () => {
    return `${period} ${hour}:${minute}`;
  };
  
  const handlePeriodChange = (newPeriod: string) => {
    updateTime(newPeriod, hour, minute);
  };
  
  const handleHourChange = (newHour: string) => {
    updateTime(period, newHour, minute);
  };
  
  const handleMinuteChange = (newMinute: string) => {
    updateTime(period, hour, newMinute);
  };
  
  const updateTime = (p: string, h: string, m: string) => {
    let hour24 = parseInt(h, 10);
    if (p === '下午' && hour24 !== 12) {
      hour24 += 12;
    } else if (p === '上午' && hour24 === 12) {
      hour24 = 0;
    }
    const newValue = `${hour24.toString().padStart(2, '0')}:${m}`;
    onChange(newValue);
  };

  const SelectColumn = ({ 
    options, 
    value, 
    onChange 
  }: { 
    options: string[]; 
    value: string; 
    onChange: (v: string) => void 
  }) => (
    <ScrollArea className="h-[180px]">
      <div className="flex flex-col gap-1 p-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              'w-full px-3 py-2 text-sm rounded-md transition-all duration-150',
              'hover:bg-primary/10',
              value === option 
                ? 'bg-primary text-primary-foreground font-medium shadow-sm' 
                : 'text-foreground hover:text-primary'
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </ScrollArea>
  );

  return (
    <div className={cn('space-y-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              'w-full h-12 justify-start text-left font-normal text-base',
              !value && 'text-muted-foreground',
              error && 'border-destructive focus-visible:ring-destructive/20'
            )}
          >
            <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
            {formatTimeDisplay()}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-popover" align="start">
          <div className="p-4">
            <div className="flex gap-2">
              {/* 上午/下午 */}
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-2 text-center">時段</span>
                <div className="border rounded-lg overflow-hidden bg-muted/30">
                  <SelectColumn 
                    options={['上午', '下午']} 
                    value={period} 
                    onChange={handlePeriodChange} 
                  />
                </div>
              </div>
              
              {/* 小時 */}
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-2 text-center">小時</span>
                <div className="border rounded-lg overflow-hidden bg-muted/30">
                  <SelectColumn 
                    options={HOURS} 
                    value={hour} 
                    onChange={handleHourChange} 
                  />
                </div>
              </div>
              
              {/* 分鐘 */}
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-2 text-center">分鐘</span>
                <div className="border rounded-lg overflow-hidden bg-muted/30">
                  <SelectColumn 
                    options={MINUTES} 
                    value={minute} 
                    onChange={handleMinuteChange} 
                  />
                </div>
              </div>
            </div>
            
            {/* 快速選擇 */}
            <div className="mt-4 pt-4 border-t">
              <span className="text-xs text-muted-foreground block mb-2">快速選擇</span>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: '上午 10:00', value: '10:00' },
                  { label: '上午 11:00', value: '11:00' },
                  { label: '中午 12:00', value: '12:00' },
                ].map((preset) => (
                  <Button
                    key={preset.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onChange(preset.value);
                      setOpen(false);
                    }}
                    className={cn(
                      'text-xs',
                      value === preset.value && 'bg-primary text-primary-foreground'
                    )}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
