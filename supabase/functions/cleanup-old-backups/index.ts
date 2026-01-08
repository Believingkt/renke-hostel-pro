import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Allowed origins for CORS
const allowedOrigins = [
  'https://sensan.lovable.app',
  'https://dmafqwfynatdvnaeovhz.lovableproject.com',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

interface CleanupRequest {
  retentionDays?: number; // Default: 30 days
  dryRun?: boolean; // If true, only report what would be deleted
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { retentionDays = 30, dryRun = false }: CleanupRequest = await req.json().catch(() => ({}));

    console.log(`Starting backup cleanup: retention=${retentionDays} days, dryRun=${dryRun}`);

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffIso = cutoffDate.toISOString();

    console.log(`Cutoff date: ${cutoffIso}`);

    // Find old backups
    const { data: oldBackups, error: queryError } = await supabase
      .from('backup_logs')
      .select('*')
      .lt('created_at', cutoffIso)
      .order('created_at', { ascending: true });

    if (queryError) {
      throw new Error(`Failed to query old backups: ${queryError.message}`);
    }

    if (!oldBackups || oldBackups.length === 0) {
      console.log('No old backups found to clean up');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No backups to clean up',
          deleted: 0,
          dryRun,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    console.log(`Found ${oldBackups.length} old backups to clean up`);

    if (dryRun) {
      // Just report what would be deleted
      const report = oldBackups.map(backup => ({
        id: backup.id,
        created_at: backup.created_at,
        file_path: backup.file_path,
        file_size: backup.file_size,
        orders_count: backup.orders_count,
        customers_count: backup.customers_count,
      }));

      return new Response(
        JSON.stringify({
          success: true,
          message: `Would delete ${oldBackups.length} backups (dry run)`,
          dryRun: true,
          backups: report,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Actually delete the backups
    let deletedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    let totalSpaceFreed = 0;

    for (const backup of oldBackups) {
      try {
        console.log(`Deleting backup: ${backup.file_path}`);

        // Delete from storage
        const { error: storageError } = await supabase.storage
          .from('backups')
          .remove([backup.file_path]);

        if (storageError) {
          console.error(`Failed to delete file ${backup.file_path}:`, storageError);
          errors.push(`Storage error for ${backup.file_path}: ${storageError.message}`);
          failedCount++;
          continue;
        }

        // Delete from database
        const { error: dbError } = await supabase
          .from('backup_logs')
          .delete()
          .eq('id', backup.id);

        if (dbError) {
          console.error(`Failed to delete log ${backup.id}:`, dbError);
          errors.push(`Database error for ${backup.id}: ${dbError.message}`);
          failedCount++;
          continue;
        }

        deletedCount++;
        totalSpaceFreed += backup.file_size || 0;
        console.log(`Successfully deleted backup: ${backup.file_path}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error deleting backup ${backup.id}:`, error);
        errors.push(`Error for ${backup.id}: ${errorMessage}`);
        failedCount++;
      }
    }

    const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    console.log(`Cleanup complete: deleted=${deletedCount}, failed=${failedCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleaned up ${deletedCount} old backups`,
        deleted: deletedCount,
        failed: failedCount,
        spaceFreed: formatBytes(totalSpaceFreed),
        spaceFreedBytes: totalSpaceFreed,
        retentionDays,
        cutoffDate: cutoffIso,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Cleanup error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
