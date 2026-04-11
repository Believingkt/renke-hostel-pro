import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface CleanupRequest {
  retentionDays?: number; // Default: 30 days
  dryRun?: boolean; // If true, only report what would be deleted
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405,
      }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  try {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new HttpError(500, 'Backend not configured');
    }

    // Admin client used for storage + database operations.
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Authn/Authz: only allow super admins to execute.
    const userId = await requireSuperAdmin(req, supabaseUrl, supabaseAnonKey, supabaseAdmin);

    const { retentionDays = 30, dryRun = false }: CleanupRequest = await req
      .json()
      .catch(() => ({}));

    console.log(
      `[cleanup-old-backups] user=${userId} retention=${retentionDays} days dryRun=${dryRun}`
    );

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffIso = cutoffDate.toISOString();

    // Find old backups
    const { data: oldBackups, error: queryError } = await supabaseAdmin
      .from('backup_logs')
      .select('*')
      .lt('created_at', cutoffIso)
      .order('created_at', { ascending: true });

    if (queryError) {
      throw new Error(`Failed to query old backups: ${queryError.message}`);
    }

    if (!oldBackups || oldBackups.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No backups to clean up',
          deleted: 0,
          dryRun,
          retentionDays,
          cutoffDate: cutoffIso,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    if (dryRun) {
      // Just report what would be deleted
      const report = oldBackups.map((backup) => ({
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
          retentionDays,
          cutoffDate: cutoffIso,
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
        // Delete from storage
        const { error: storageError } = await supabaseAdmin.storage
          .from('backups')
          .remove([backup.file_path]);

        if (storageError) {
          errors.push(`Storage error for ${backup.file_path}: ${storageError.message}`);
          failedCount++;
          continue;
        }

        // Delete from database
        const { error: dbError } = await supabaseAdmin
          .from('backup_logs')
          .delete()
          .eq('id', backup.id);

        if (dbError) {
          errors.push(`Database error for ${backup.id}: ${dbError.message}`);
          failedCount++;
          continue;
        }

        deletedCount++;
        totalSpaceFreed += backup.file_size || 0;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Error for ${backup.id}: ${errorMessage}`);
        failedCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleaned up ${deletedCount} old backups`,
        deleted: deletedCount,
        failed: failedCount,
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
    const status = error instanceof HttpError ? error.status : 400;
    const message = error instanceof Error ? error.message : 'Unknown error occurred';

    console.error('[cleanup-old-backups] error:', message);

    return new Response(JSON.stringify({ success: false, error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    });
  }
});

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function requireSuperAdmin(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
  // Use a loose type here to avoid edge-runtime generic mismatches.
  supabaseAdmin: any
): Promise<string> {
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!authHeader) {
    throw new HttpError(401, 'Missing authorization');
  }

  // Validate JWT and obtain user via a non-admin client.
  const supabaseAuth = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
  const user = userData?.user;

  if (userError || !user) {
    throw new HttpError(401, 'Unauthorized');
  }

  const { data: roleRows, error: roleError } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);

  if (roleError) {
    console.error('[cleanup-old-backups] role lookup failed:', roleError);
    throw new HttpError(500, 'Authorization check failed');
  }

  const isSuperAdmin = (roleRows ?? []).some((r: { role: string }) => r.role === 'super_admin');
  if (!isSuperAdmin) {
    throw new HttpError(403, 'Forbidden');
  }

  return user.id;
}

