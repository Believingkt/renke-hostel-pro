import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BackupRequest {
  accommodationId: string;
  backupType: 'manual' | 'auto';
  backupMode?: 'full' | 'incremental';
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { accommodationId, backupType = 'manual', backupMode = 'full' }: BackupRequest = await req.json();

    if (!accommodationId) {
      throw new Error('Missing accommodationId');
    }

    console.log(`Starting ${backupMode} backup for accommodation: ${accommodationId}, type: ${backupType}`);

    // Get the last successful backup for incremental mode
    let lastBackupTime: string | null = null;
    let baseBackupId: string | null = null;
    
    if (backupMode === 'incremental') {
      const { data: lastBackup, error: lastBackupError } = await supabase
        .from('backup_logs')
        .select('created_at, id, backup_mode')
        .eq('accommodation_id', accommodationId)
        .eq('status', 'success')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (lastBackupError && lastBackupError.code !== 'PGRST116') {
        throw new Error(`Failed to fetch last backup: ${lastBackupError.message}`);
      }

      if (lastBackup) {
        lastBackupTime = lastBackup.created_at;
        // Find the base full backup
        if (lastBackup.backup_mode === 'full') {
          baseBackupId = lastBackup.id;
        } else {
          // If last backup was incremental, find its base
          const { data: baseBackup } = await supabase
            .from('backup_logs')
            .select('id')
            .eq('accommodation_id', accommodationId)
            .eq('backup_mode', 'full')
            .eq('status', 'success')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          if (baseBackup) {
            baseBackupId = baseBackup.id;
          }
        }
        console.log(`Incremental backup since: ${lastBackupTime}, base backup: ${baseBackupId}`);
      } else {
        console.log('No previous backup found, performing full backup');
        // No previous backup, fallback to full backup (already set by default)
      }
    }

    // Verify user has admin access to this accommodation
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('accommodation_id', accommodationId)
      .single();

    if (roleError || !roleData || !['super_admin', 'hotel_admin'].includes(roleData.role)) {
      throw new Error('Insufficient permissions');
    }

    // Fetch orders data (with incremental filter if applicable)
    let ordersQuery = supabase
      .from('orders')
      .select('*')
      .eq('accommodation_id', accommodationId);
    
    if (backupMode === 'incremental' && lastBackupTime) {
      ordersQuery = ordersQuery.gt('updated_at', lastBackupTime);
    }
    
    const { data: orders, error: ordersError } = await ordersQuery;

    if (ordersError) {
      throw new Error(`Failed to fetch orders: ${ordersError.message}`);
    }

    // Fetch customers data (with incremental filter if applicable)
    let customersQuery = supabase
      .from('customers')
      .select('*')
      .eq('accommodation_id', accommodationId);
    
    if (backupMode === 'incremental' && lastBackupTime) {
      customersQuery = customersQuery.gt('updated_at', lastBackupTime);
    }
    
    const { data: customers, error: customersError } = await customersQuery;

    if (customersError) {
      throw new Error(`Failed to fetch customers: ${customersError.message}`);
    }

    console.log(`Fetched ${orders?.length || 0} orders and ${customers?.length || 0} customers`);

    // Create backup data
    const backupData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      accommodationId,
      backupMode,
      incrementalSince: lastBackupTime,
      baseBackupId,
      data: {
        orders: orders || [],
        customers: customers || [],
      },
      metadata: {
        ordersCount: orders?.length || 0,
        customersCount: customers?.length || 0,
      }
    };

    const backupJson = JSON.stringify(backupData, null, 2);
    const uncompressedSize = new TextEncoder().encode(backupJson).length;
    
    // Compress the data using gzip
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(backupJson));
        controller.close();
      }
    });
    
    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    const compressedBlob = await new Response(compressedStream).blob();
    const compressedBuffer = await compressedBlob.arrayBuffer();
    const compressedSize = compressedBuffer.byteLength;

    console.log(`Compression: ${uncompressedSize} bytes -> ${compressedSize} bytes (${((1 - compressedSize / uncompressedSize) * 100).toFixed(1)}% reduction)`);

    // Create file path with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const modePrefix = backupMode === 'incremental' ? 'incremental' : 'full';
    const fileName = `backup_${modePrefix}_${accommodationId}_${timestamp}.json.gz`;
    const filePath = `${accommodationId}/${fileName}`;

    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('backups')
      .upload(filePath, compressedBuffer, {
        contentType: 'application/gzip',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Failed to upload backup: ${uploadError.message}`);
    }

    console.log(`Backup uploaded to: ${filePath}`);

    // Log backup in database
    const compressionRatio = parseFloat(((1 - compressedSize / uncompressedSize) * 100).toFixed(2));
    
    const { error: logError } = await supabase
      .from('backup_logs')
      .insert({
        accommodation_id: accommodationId,
        backup_type: backupType,
        backup_mode: backupMode,
        base_backup_id: baseBackupId,
        incremental_since: lastBackupTime,
        file_path: filePath,
        file_size: compressedSize,
        uncompressed_size: uncompressedSize,
        compression_ratio: compressionRatio,
        is_compressed: true,
        orders_count: orders?.length || 0,
        customers_count: customers?.length || 0,
        status: 'success',
        created_by: user.id,
      });

    if (logError) {
      console.error('Failed to log backup:', logError);
      // Don't fail the request if logging fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `${backupMode === 'incremental' ? 'Incremental' : 'Full'} backup created successfully`,
        backup: {
          fileName,
          filePath,
          backupMode,
          incrementalSince: lastBackupTime,
          ordersCount: orders?.length || 0,
          customersCount: customers?.length || 0,
          size: compressedSize,
          uncompressedSize: uncompressedSize,
          compressionRatio: ((1 - compressedSize / uncompressedSize) * 100).toFixed(1) + '%',
          timestamp: new Date().toISOString(),
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Backup error:', error);
    
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
