import { useState, useEffect } from 'react';

export type NetworkSpeed = 'fast' | 'slow' | 'offline';

interface NetworkStatus {
  speed: NetworkSpeed;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

/**
 * 網路連線狀態偵測 Hook
 * 根據 Network Information API 判斷網路速度
 */
export const useNetworkStatus = (): NetworkStatus => {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    speed: 'fast',
  });

  useEffect(() => {
    // 檢查瀏覽器是否支援 Network Information API
    const connection = (navigator as any).connection || 
                      (navigator as any).mozConnection || 
                      (navigator as any).webkitConnection;

    const updateNetworkStatus = () => {
      if (!navigator.onLine) {
        setNetworkStatus({ speed: 'offline' });
        return;
      }

      if (connection) {
        const effectiveType = connection.effectiveType;
        const downlink = connection.downlink;
        const rtt = connection.rtt;
        const saveData = connection.saveData;

        // 判斷網路速度
        let speed: NetworkSpeed = 'fast';
        
        // 如果用戶啟用了數據節省模式，直接判定為慢速
        if (saveData) {
          speed = 'slow';
        } 
        // 根據有效連線類型判斷
        else if (effectiveType === 'slow-2g' || effectiveType === '2g') {
          speed = 'slow';
        } 
        else if (effectiveType === '3g') {
          // 3G 也視為慢速
          speed = 'slow';
        }
        // 根據下載速度和 RTT 判斷
        else if (downlink < 1.5 || rtt > 200) {
          speed = 'slow';
        }

        setNetworkStatus({
          speed,
          effectiveType,
          downlink,
          rtt,
          saveData,
        });
      } else {
        // 不支援 Network Information API，假設為快速連線
        setNetworkStatus({ speed: 'fast' });
      }
    };

    // 初始化
    updateNetworkStatus();

    // 監聽網路狀態變化
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);

    if (connection) {
      connection.addEventListener('change', updateNetworkStatus);
    }

    return () => {
      window.removeEventListener('online', updateNetworkStatus);
      window.removeEventListener('offline', updateNetworkStatus);
      
      if (connection) {
        connection.removeEventListener('change', updateNetworkStatus);
      }
    };
  }, []);

  return networkStatus;
};
