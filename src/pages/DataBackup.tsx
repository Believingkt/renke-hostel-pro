import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Download, 
  Upload, 
  Trash2, 
  Clock, 
  Database,
  AlertCircle,
  CheckCircle2,
  FileArchive,
  Calendar,
  Eraser,
  Archive,
  Home
} from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";

interface BackupLog {
  id: string;
  backup_type: string;
  backup_mode: string;
  base_backup_id: string | null;
  incremental_since: string | null;
  file_path: string;
  file_size: number;
  uncompressed_size: number | null;
  compression_ratio: number | null;
  is_compressed: boolean | null;
  orders_count: number;
  customers_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

const DataBackup = () => {
  const { currentAccommodationId: accommodationId } = useAccommodation();
  const [backups, setBackups] = useState<BackupLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingBackup, setDeletingBackup] = useState<BackupLog | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<BackupLog | null>(null);
  const [clearExisting, setClearExisting] = useState(false);
  const [backupMode, setBackupMode] = useState<'full' | 'incremental'>('full');

  // Reset list immediately on accommodation switch to prevent cross-tenant data flash
  useEffect(() => {
    setBackups([]);
  }, [accommodationId]);

  useEffect(() => {
    if (accommodationId) {
      loadBackups();
    }
  }, [accommodationId]);

  const loadBackups = async () => {
    if (!accommodationId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('backup_logs')
        .select('*')
        .eq('accommodation_id', accommodationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBackups(data || []);
    } catch (error) {
      console.error('Error loading backups:', error);
      toast.error('載入備份記錄失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    if (!accommodationId) return;

    try {
      setCreating(true);
      const { data, error } = await supabase.functions.invoke('backup-data', {
        body: {
          accommodationId,
          backupType: 'manual',
          backupMode,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast.success('備份建立成功', {
          description: `已備份 ${data.backup.ordersCount} 筆訂單和 ${data.backup.customersCount} 筆客戶資料\n壓縮率: ${data.backup.compressionRatio}`,
        });
        loadBackups();
      } else {
        throw new Error(data.error || '備份失敗');
      }
    } catch (error) {
      console.error('Error creating backup:', error);
      toast.error('建立備份失敗', {
        description: error instanceof Error ? error.message : '未知錯誤',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!accommodationId || !selectedBackup) return;

    try {
      setRestoring(selectedBackup.id);
      const { data, error } = await supabase.functions.invoke('restore-data', {
        body: {
          accommodationId,
          filePath: selectedBackup.file_path,
          clearExisting,
        },
      });

      if (error) throw error;

      if (data.success) {
        const modeText = data.restored.backupMode === 'incremental' ? '增量' : '完整';
        toast.success(`${modeText}備份還原成功`, {
          description: `已還原 ${data.restored.ordersCount} 筆訂單和 ${data.restored.customersCount} 筆客戶資料`,
        });
        loadBackups();
        setRestoreDialogOpen(false);
        setSelectedBackup(null);
      } else {
        throw new Error(data.error || '還原失敗');
      }
    } catch (error) {
      console.error('Error restoring backup:', error);
      toast.error('還原資料失敗', {
        description: error instanceof Error ? error.message : '未知錯誤',
      });
    } finally {
      setRestoring(null);
    }
  };

  const handleDeleteBackupClick = (backup: BackupLog) => {
    setDeletingBackup(backup);
    setDeleteDialogOpen(true);
  };

  const handleDeleteBackup = async () => {
    if (!accommodationId || !deletingBackup) return;

    try {
      setDeleting(deletingBackup.id);

      // Delete file from storage
      const { error: storageError } = await supabase.storage
        .from('backups')
        .remove([deletingBackup.file_path]);

      if (storageError) throw storageError;

      // Delete log from database
      const { error: dbError } = await supabase
        .from('backup_logs')
        .delete()
        .eq('id', deletingBackup.id);

      if (dbError) throw dbError;

      toast.success('備份已刪除');
      loadBackups();
    } catch (error) {
      console.error('Error deleting backup:', error);
      toast.error('刪除備份失敗');
    } finally {
      setDeleting(null);
    }
  };

  const handleCleanupOldBackups = async (dryRun: boolean = false) => {
    try {
      setCleaning(true);
      const { data, error } = await supabase.functions.invoke('cleanup-old-backups', {
        body: {
          retentionDays: 30,
          dryRun,
        },
      });

      if (error) throw error;

      if (data.success) {
        if (dryRun) {
          toast.info('清理預覽', {
            description: data.message,
          });
        } else {
          toast.success('清理完成', {
            description: `已刪除 ${data.deleted} 個舊備份，釋放 ${data.spaceFreed} 空間`,
          });
          loadBackups();
        }
      } else {
        throw new Error(data.error || '清理失敗');
      }
    } catch (error) {
      console.error('Error cleaning up backups:', error);
      toast.error('清理舊備份失敗', {
        description: error instanceof Error ? error.message : '未知錯誤',
      });
    } finally {
      setCleaning(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const calculateTotalStats = () => {
    const totalCompressedSize = backups.reduce((sum, b) => sum + (b.file_size || 0), 0);
    const totalUncompressedSize = backups.reduce((sum, b) => sum + (b.uncompressed_size || b.file_size || 0), 0);
    const avgCompressionRatio = backups.filter(b => b.compression_ratio).length > 0
      ? backups.filter(b => b.compression_ratio).reduce((sum, b) => sum + (b.compression_ratio || 0), 0) / backups.filter(b => b.compression_ratio).length
      : 0;
    const spaceSaved = totalUncompressedSize - totalCompressedSize;

    return {
      totalCompressedSize,
      totalUncompressedSize,
      avgCompressionRatio,
      spaceSaved,
    };
  };

  const stats = calculateTotalStats();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />成功</Badge>;
      case 'restored':
        return <Badge variant="secondary" className="gap-1"><Upload className="h-3 w-3" />已還原</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />失敗</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const openRestoreDialog = (backup: BackupLog) => {
    setSelectedBackup(backup);
    setClearExisting(false);
    setRestoreDialogOpen(true);
  };

  if (loading) {
    return <TableSkeleton />;
  }

  return (
    <div className="space-y-6 md:space-y-8 p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/admin" className="flex items-center hover:opacity-70 transition-opacity">
                <Home className="h-4 w-4" />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>資料備份</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title="資料備份與還原"
        icon={Database}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            自動備份設置
          </CardTitle>
          <CardDescription>
            系統會定期自動備份您的資料，並使用 gzip 壓縮以節省儲存空間。您也可以隨時手動建立備份。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="space-y-1">
                <p className="font-medium">自動每日備份</p>
                <p className="text-sm text-muted-foreground">
                  系統將在每天凌晨 2:00 自動備份資料
                </p>
              </div>
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                已啟用
              </Badge>
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="space-y-1">
                <p className="font-medium">自動清理舊備份</p>
                <p className="text-sm text-muted-foreground">
                  系統將在每天凌晨 3:00 自動刪除超過 30 天的舊備份
                </p>
              </div>
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                已啟用
              </Badge>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2 p-4 bg-muted/30 rounded-lg">
              <Label className="text-sm font-medium">備份模式</Label>
              <div className="flex gap-2">
                <Button
                  variant={backupMode === 'full' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setBackupMode('full')}
                  disabled={creating || cleaning}
                  className="flex-1"
                >
                  完整備份
                </Button>
                <Button
                  variant={backupMode === 'incremental' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setBackupMode('incremental')}
                  disabled={creating || cleaning}
                  className="flex-1"
                >
                  增量備份
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {backupMode === 'full' 
                  ? '完整備份所有資料，適合首次備份或定期備份' 
                  : '僅備份自上次備份後變更的資料，節省時間和空間'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleCreateBackup}
              disabled={creating || cleaning || !accommodationId}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              {creating ? '備份中...' : '立即建立備份'}
            </Button>
            <Button
              onClick={() => handleCleanupOldBackups(false)}
              disabled={creating || cleaning || !accommodationId}
              variant="outline"
              className="gap-2"
            >
              <Eraser className="h-4 w-4" />
              {cleaning ? '清理中...' : '清理舊備份'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileArchive className="h-5 w-5" />
            備份歷史記錄
          </CardTitle>
          <CardDescription className="space-y-2">
            <div>查看和管理所有備份檔案（系統自動保留最近 30 天的備份）</div>
            {backups.length > 0 && (
              <div className="flex flex-wrap gap-3 pt-2 text-xs">
                <span className="flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  總備份數: {backups.length} 個
                </span>
                <span className="flex items-center gap-1">
                  <FileArchive className="h-3 w-3" />
                  使用空間: {formatFileSize(stats.totalCompressedSize)}
                </span>
                {stats.avgCompressionRatio > 0 && (
                  <>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      平均壓縮率: {stats.avgCompressionRatio.toFixed(1)}%
                    </span>
                    <span className="flex items-center gap-1 text-primary">
                      節省空間: {formatFileSize(stats.spaceSaved)}
                    </span>
                  </>
                )}
              </div>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <EmptyState
              icon={FileArchive}
              title="尚無備份記錄"
              description="點擊上方按鈕建立第一個備份"
            />
          ) : (
            <div className="space-y-3">
              {backups.map((backup) => (
                <div
                  key={backup.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {format(new Date(backup.created_at), 'PPP HH:mm', { locale: zhTW })}
                      </span>
                      {getStatusBadge(backup.status)}
                      <Badge variant="outline">
                        {backup.backup_type === 'auto' ? '自動' : '手動'}
                      </Badge>
                      <Badge 
                        variant={backup.backup_mode === 'full' ? 'default' : 'secondary'}
                      >
                        {backup.backup_mode === 'full' ? '完整' : '增量'}
                      </Badge>
                      {backup.is_compressed && (
                        <Badge variant="secondary" className="gap-1">
                          <Archive className="h-3 w-3" />
                          已壓縮
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>訂單: {backup.orders_count} 筆</span>
                      <span>客戶: {backup.customers_count} 筆</span>
                      <span>大小: {formatFileSize(backup.file_size || 0)}</span>
                      {backup.is_compressed && backup.compression_ratio && (
                        <Badge variant="secondary" className="gap-1">
                          <FileArchive className="h-3 w-3" />
                          壓縮率 {backup.compression_ratio.toFixed(1)}%
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openRestoreDialog(backup)}
                      disabled={restoring === backup.id || deleting === backup.id}
                      className="gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      還原
                    </Button>
                    <Button
                      variant="ghost-destructive"
                      size="sm"
                      onClick={() => handleDeleteBackupClick(backup)}
                      disabled={restoring === backup.id || deleting === backup.id}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認還原備份？</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                即將還原以下備份的資料：
              </p>
              {selectedBackup && (
                <div className="p-3 bg-muted rounded-lg space-y-2 text-sm">
                  <div>備份時間: {format(new Date(selectedBackup.created_at), 'PPP HH:mm', { locale: zhTW })}</div>
                  <div>訂單數量: {selectedBackup.orders_count} 筆</div>
                  <div>客戶數量: {selectedBackup.customers_count} 筆</div>
                </div>
              )}
              <div className="flex items-center space-x-2 pt-2">
                <Switch
                  id="clear-existing"
                  checked={clearExisting}
                  onCheckedChange={setClearExisting}
                />
                <Label htmlFor="clear-existing" className="cursor-pointer">
                  還原前先清除現有資料（會完全替換現有資料）
                </Label>
              </div>
              <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg">
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  {clearExisting 
                    ? '警告：這將刪除所有現有的訂單和客戶資料，並用備份資料替換。此操作無法復原！'
                    : '如果備份中的資料與現有資料有相同的 ID，將會更新現有資料。'
                  }
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring !== null}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreBackup}
              disabled={restoring !== null}
              className="gap-2"
            >
              {restoring ? (
                <>處理中...</>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  確認還原
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DataBackup;
